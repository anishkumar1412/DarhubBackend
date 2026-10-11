import { Op } from "sequelize";
import db from "../models/index.js";
import { OrderStatusEnum } from "../utils/enums.js";
import { updateOrderStatus } from "../utils/orderUtils.js";
import { lockKeys } from "../utils/locks.js";
import { respondWithError } from "../middleware/errorHandler.js";
import { parseDateOnly, todayIST, getDayStatus, readDayData, stripDecline } from "../utils/dateUtils.js";

const {
  User,
  UserProfile,
  Drone1,
  DroneAddress,
  MasterState,
  MasterDistrict,
  MasterBlock,
  SprayingOrder,
  SprayingOrderAddress,
  SprayingDailyLogs,
  SprayingWorkAssignee,
} = db;

/* ─────────────────────────────────────────────────────────
   UTIL — always use UTC so a DB midnight date stored as
   "2026-04-19T00:00:00Z" never becomes Apr 18 in UTC-5.
───────────────────────────────────────────────────────── */
const toYMD = (d) => {
  const dt = new Date(d);
  return [
    dt.getUTCFullYear(),
    String(dt.getUTCMonth() + 1).padStart(2, "0"),
    String(dt.getUTCDate()).padStart(2, "0"),
  ].join("-");
};

/* ─────────────────────────────────────────────────────────
   UTIL — build { id, full_name, mobile_number } from a
   pre-fetched users[] + profiles[] array (no extra DB hit).
───────────────────────────────────────────────────────── */
const resolveUser = (userId, users, profiles) => {
  if (!userId) return null;
  const u = users.find((x) => x.id === userId);
  if (!u) return null;
  const p = profiles.find((x) => x.user_id === userId);
  return {
    id: u.id,
    full_name:
      [p?.first_name, p?.last_name].filter(Boolean).join(" ") ||
      u.username ||
      `User #${u.id}`,
    mobile_number: u.mobile_number || null,
  };
};

/* ═══════════════════════════════════════════════════════════
   getCalendarAvailability
   POST /order/calendar-availability
   Body: { booking_id }

   Returns EVERYTHING the frontend needs in one call:
   ┌─────────────────────────────────────────────────────┐
   │ calendar_data[ymd] = {                              │
   │   available_drones: [ { id, name, acres_per_day,   │
   │                          pilot, copilot, … } ],     │
   │   blocked: true | false                             │
   │ }                                                   │
   │ existing_assignments[ymd] = {                       │
   │   log_id, drone_id, drone_name, pilot, copilot,    │
   │   is_verified                                       │
   │ }                                                   │
   └─────────────────────────────────────────────────────┘
   "blocked" = true means NO local drone is free that day
   — the frontend greys out and disables those dates.
═══════════════════════════════════════════════════════════ */
export const getCalendarAvailability = async (req, res) => {
  try {
    const { booking_id } = req.body;
    if (!booking_id)
      return res.status(400).json({ message: "booking_id is required" });

    /* 1. Booking */
    const booking = await SprayingOrder.findOne({
      where: { booking_id },
      attributes: [
        "booking_id",
        "start_date",
        "end_date",
        "num_of_days",
        "land_in_acers",
        "crop_type_id",
      ],
      raw: true,
    });
    if (!booking)
      return res.status(404).json({ message: "Booking not found" });

    /* 2. Booking address */
    const bookingAddr = await SprayingOrderAddress.findOne({
      where: { order_id: booking_id },
      attributes: ["state", "district", "block", "village"],
      raw: true,
    });
    if (!bookingAddr)
      return res
        .status(404)
        .json({ message: "Booking address not found — cannot filter drones by location" });

    /* 3. Location names (parallel) */
    const [stateObj, districtObj, blockObj] = await Promise.all([
      MasterState.findOne({
        where: { id: bookingAddr.state },
        attributes: ["state_name"],
        raw: true,
      }),
      MasterDistrict.findOne({
        where: { id: bookingAddr.district },
        attributes: ["district_name"],
        raw: true,
      }),
      MasterBlock.findOne({
        where: { id: bookingAddr.block },
        attributes: ["block_name"],
        raw: true,
      }),
    ]);

    const location = {
      state: bookingAddr.state,
      district: bookingAddr.district,
      block: bookingAddr.block,
      state_name: stateObj?.state_name || null,
      district_name: districtObj?.district_name || null,
      block_name: blockObj?.block_name || null,
    };

    /* 4. Drones in this block */
    const localDroneAddrs = await DroneAddress.findAll({
      where: {
        state: bookingAddr.state,
        district: bookingAddr.district,
        block: bookingAddr.block,
        is_active: true,
      },
      attributes: ["drone_id"],
      raw: true,
    });
    const localDroneIds = [
      ...new Set(localDroneAddrs.map((a) => a.drone_id)),
    ];

    if (localDroneIds.length === 0) {
      return res.status(200).json({
        success: true,
        booking,
        location,
        estimated_days: booking.num_of_days || 1,
        local_drones: [],
        calendar_data: {},
        existing_assignments: {},
        is_already_assigned: false,
        no_drones_message: `No drones registered in ${location.block_name || "this block"}, ${location.district_name || "this district"}`,
      });
    }

    /* 5. Drone records */
    const droneRecords = await Drone1.findAll({
      where: { id: localDroneIds, is_active: true },
      attributes: [
        "id",
        "name",
        "model",
        "acres_per_day",
        "pilot_user_id",
        "co_pilot_user_id",
      ],
      raw: true,
    });

    /* 6. Batch-fetch all drone crew users in ONE query */
    const droneUserIds = [
      ...new Set(
        droneRecords.flatMap((d) =>
          [d.pilot_user_id, d.co_pilot_user_id].filter(Boolean)
        )
      ),
    ];

    const [droneUsers, droneProfiles] = await Promise.all([
      droneUserIds.length
        ? User.findAll({
          where: { id: droneUserIds },
          attributes: ["id", "username", "mobile_number"],
          raw: true,
        })
        : Promise.resolve([]),
      droneUserIds.length
        ? UserProfile.findAll({
          where: { user_id: droneUserIds },
          attributes: ["user_id", "first_name", "last_name"],
          raw: true,
        })
        : Promise.resolve([]),
    ]);

    /* Build drone objects with crew */
    const dronesWithCrew = droneRecords.map((d) => ({
      id: d.id,
      name: d.name || `Drone #${d.id}`,
      model: d.model || null,
      acres_per_day: d.acres_per_day || 5,
      pilot: resolveUser(d.pilot_user_id, droneUsers, droneProfiles),
      copilot: resolveUser(d.co_pilot_user_id, droneUsers, droneProfiles),
    }));

    /* 7. Date window: booking start_date → +90 days */
    const windowStart = booking.start_date
      ? new Date(booking.start_date)
      : new Date();
    windowStart.setUTCHours(0, 0, 0, 0);
    const windowEnd = new Date(windowStart);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 90);

    /* 8. Busy logs in window for OTHER bookings */
    const busyLogs = await SprayingDailyLogs.findAll({
      where: {
        working_date: { [Op.between]: [windowStart, windowEnd] },
        spraying_work_id: { [Op.ne]: booking_id },
        is_active: true,
      },
      attributes: ["working_date", "drone_id"],
      raw: true,
    });

    /* busyDronesByDate[ymd] = Set of drone IDs busy that day */
    const busyDronesByDate = {};
    busyLogs.forEach((log) => {
      if (!log.drone_id) return;
      if (!localDroneIds.includes(log.drone_id)) return;
      const ymd = toYMD(new Date(log.working_date));
      if (!busyDronesByDate[ymd]) busyDronesByDate[ymd] = new Set();
      busyDronesByDate[ymd].add(log.drone_id);
    });

    /* 9. Existing logs for THIS booking */
    const existingLogs = await SprayingDailyLogs.findAll({
      where: { spraying_work_id: booking_id },
      attributes: [
        "id",
        "working_date",
        "drone_id",
        "pilot_user_id",
        "co_pilot_user_id",
        "is_verified",
      ],
      order: [["working_date", "ASC"]],
      raw: true,
    });

    /* Batch-fetch users from existing logs */
    const logUserIds = [
      ...new Set(
        existingLogs.flatMap((l) =>
          [l.pilot_user_id, l.co_pilot_user_id].filter(Boolean)
        )
      ),
    ];
    const allNeededUserIds = [
      ...new Set([...droneUserIds, ...logUserIds]),
    ];
    const allUsers =
      allNeededUserIds.length === droneUserIds.length
        ? droneUsers
        : await User.findAll({
          where: { id: allNeededUserIds },
          attributes: ["id", "username", "mobile_number"],
          raw: true,
        });
    const allProfiles =
      allNeededUserIds.length === droneUserIds.length
        ? droneProfiles
        : await UserProfile.findAll({
          where: { user_id: allNeededUserIds },
          attributes: ["user_id", "first_name", "last_name"],
          raw: true,
        });

    /* Build existing_assignments map */
    const existingAssignments = {};
    for (const log of existingLogs) {
      const ymd = toYMD(new Date(log.working_date));
      const drone = dronesWithCrew.find((d) => d.id === log.drone_id);
      existingAssignments[ymd] = {
        log_id: log.id,
        drone_id: log.drone_id,
        drone_name:
          drone?.name ||
          (log.drone_id ? `Drone #${log.drone_id}` : null),
        drone: drone || null,
        pilot: resolveUser(log.pilot_user_id, allUsers, allProfiles),
        copilot: resolveUser(
          log.co_pilot_user_id,
          allUsers,
          allProfiles
        ),
        is_verified: log.is_verified || false,
      };
    }

    /* 10. Build calendar_data for each day in window */
    const landInAcres = booking.land_in_acers || 0;
    const calendarData = {};
    const cursor = new Date(windowStart);

    while (cursor <= windowEnd) {
      const ymd = toYMD(cursor);
      const busyOnDate = busyDronesByDate[ymd] || new Set();

      const availableDrones = dronesWithCrew
        .filter((d) => !busyOnDate.has(d.id))
        .map((d) => ({
          ...d,
          estimated_days:
            landInAcres > 0
              ? Math.ceil(landInAcres / d.acres_per_day)
              : booking.num_of_days || 1,
        }));

      calendarData[ymd] = {
        available_drones: availableDrones,
        blocked: availableDrones.length === 0,
        total_drones_in_block: dronesWithCrew.length,
      };
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    /* 11. Global estimated_days */
    const minAcresPerDay =
      dronesWithCrew.length > 0
        ? Math.min(...dronesWithCrew.map((d) => d.acres_per_day))
        : 5;
    const globalEstimated =
      landInAcres > 0
        ? Math.ceil(landInAcres / minAcresPerDay)
        : booking.num_of_days || 1;

    return res.status(200).json({
      success: true,
      booking,
      location,
      estimated_days: globalEstimated,
      local_drones: dronesWithCrew,
      calendar_data: calendarData,
      existing_assignments: existingAssignments,
      is_already_assigned: existingLogs.length > 0,
      window_start: toYMD(windowStart),
      window_end: toYMD(windowEnd),
    });
  } catch (error) {
    console.error("Error in getCalendarAvailability:", error);
    return res.status(500).json({ error: error.message });
  }
};

/* ═══════════════════════════════════════════════════════════
   assignWork
   POST /order/assign-work/:booking_id
   Body: { pilot, copilot, drone_id, working_date: string[] }
═══════════════════════════════════════════════════════════ */
export const assignWork = async (req, res) => {
  try {
    const { booking_id } = req.params;
    let { pilot, copilot, drone_id, working_date } = req.body;

    if (
      !booking_id ||
      !drone_id ||
      !Array.isArray(working_date) ||
      working_date.length === 0
    ) {
      return res
        .status(400)
        .json({ message: "booking_id, drone_id and working_date[] are required" });
    }
    if (working_date.length > 62) {
      return res.status(400).json({ message: "At most 62 working dates can be assigned in one request" });
    }
    const reply = (status, body) => ({ status, body });

    const outcome = await db.sequelize.transaction(async (t) => {
      const order = await SprayingOrder.findOne({ where: { booking_id }, transaction: t, lock: t.LOCK.UPDATE });
      if (!order) return reply(404, { message: "Booking not found" });

      const closedStatuses = [
        OrderStatusEnum.ORDER_CANCELLED,
        OrderStatusEnum.ORDER_REJECTED,
        OrderStatusEnum.ORDER_COMPLETED,
        OrderStatusEnum.WAITING_FOR_PAYMENT,
        OrderStatusEnum.PAYMENT_SUCCESSFUL,
      ];
      if (closedStatuses.includes(order.order_status)) {
        return reply(409, {
          message: `Work cannot be assigned to a booking in status ${order.order_status}`,
        });
      }

      const droneDetails = await Drone1.findByPk(drone_id, { transaction: t });
      if (!droneDetails) return reply(404, { message: "Drone not found" });

      // Fallback: if pilot or copilot is not provided, take them from the drone's crew
      if (!pilot) pilot = droneDetails.pilot_user_id;
      if (!copilot) copilot = droneDetails.co_pilot_user_id;
      if (!pilot) {
        return reply(400, {
          message: "This drone has no pilot assigned. Attach a pilot to the drone or pass `pilot`.",
        });
      }

      const pilotUser = await User.findByPk(pilot, { attributes: ["id", "is_active"], transaction: t });
      if (!pilotUser || pilotUser.is_active === false) {
        return reply(400, { message: "The selected pilot does not exist or is deactivated." });
      }

      // Normalise dates -> unique UTC-midnight calendar dates, sorted
      const parsed = working_date.map((d) => ({ raw: d, date: parseDateOnly(d) }));
      const badDate = parsed.find((x) => !x.date);
      if (badDate) {
        return reply(400, {
          message: `Invalid working_date: ${JSON.stringify(badDate.raw)}. Use YYYY-MM-DD.`,
        });
      }
      const uniqueByYmd = new Map(parsed.map((x) => [toYMD(x.date), x.date]));
      const sortedDates = [...uniqueByYmd.values()].sort((a, b) => a - b);

      // Two admins assigning the same drone or pilot to different bookings at the same moment would both see it as
      // free. These locks make the second wait until the first has committed, then see the clash below.
      await lockKeys(db.sequelize, t, sortedDates.flatMap((d) => [`drone:${drone_id}:${toYMD(d)}`, `pilot:${pilot}:${toYMD(d)}`]));

      // Existing logs of THIS booking for those dates
      const existingLogs = await SprayingDailyLogs.findAll({
        where: { spraying_work_id: booking_id, working_date: { [Op.in]: sortedDates } },
        transaction: t,
      });
      const existingByYmd = new Map(existingLogs.map((l) => [toYMD(l.working_date), l]));

      // No scheduling into the past (dates already on this booking are allowed through)
      const today = todayIST();
      const pastDates = sortedDates
        .map(toYMD)
        .filter((ymd) => ymd < today && !existingByYmd.has(ymd));
      if (pastDates.length > 0) {
        return reply(400, {
          message: `Cannot schedule work on past dates: ${pastDates.join(", ")}`,
          past_dates: pastDates,
        });
      }

      // Conflict check: same drone or same pilot already booked for another order on those dates
      const conflicts = await SprayingDailyLogs.findAll({
        where: {
          spraying_work_id: { [Op.ne]: booking_id },
          working_date: { [Op.in]: sortedDates },
          is_active: true,
          [Op.or]: [{ drone_id }, { pilot_user_id: pilot }],
        },
        attributes: ["working_date", "drone_id", "pilot_user_id", "spraying_work_id"],
        raw: true,
        transaction: t,
      });
      if (conflicts.length > 0) {
        return reply(409, {
          message: "Drone or pilot is already booked on some of these dates",
          conflicts: conflicts.map((c) => ({
            date: toYMD(c.working_date),
            reason: c.drone_id === Number(drone_id) ? "drone_busy" : "pilot_busy",
            other_booking_id: c.spraying_work_id,
          })),
        });
      }

      const results = [];
      for (const date of sortedDates) {
        const ymd = toYMD(date);
        const existing = existingByYmd.get(ymd);

        if (existing) {
          // A day the pilot already started/finished is frozen
          if (["started", "completed"].includes(getDayStatus(existing))) {
            results.push({ date: ymd, action: "locked", reason: `day already ${getDayStatus(existing)}` });
            continue;
          }

          // A different pilot must confirm; so must the same pilot again if they had declined the day
          // (assigning a declined day is a fresh request)
          const pilotChanged = existing.pilot_user_id !== Number(pilot);
          const wasDeclined = getDayStatus(existing) === "declined";
          await existing.update({
            drone_id,
            pilot_user_id: pilot,
            co_pilot_user_id: copilot ?? existing.co_pilot_user_id,
            is_active: true,
            ...((pilotChanged || wasDeclined) && { is_pilot_confirmed: null, pilot_confirmed_at: null }),
            ...(readDayData(existing).declined_at && {
              verification_comment: JSON.stringify(stripDecline(readDayData(existing))),
            }),
            modified_on: new Date(),
          }, { transaction: t });
          results.push({ date: ymd, action: "updated" });
        } else {
          await SprayingDailyLogs.create({
            spraying_work_id: booking_id,
            drone_id,
            pilot_user_id: pilot,
            co_pilot_user_id: copilot || null,
            working_date: date,
            created_on: new Date(),
            is_active: true,
          }, { transaction: t });
          results.push({ date: ymd, action: "created" });
        }
      }

      // Order dates always reflect ALL scheduled days, not only the ones in this call
      const allLogs = await SprayingDailyLogs.findAll({
        where: { spraying_work_id: booking_id, is_active: true },
        order: [["working_date", "ASC"]],
        transaction: t,
      });
      if (allLogs.length > 0) {
        await order.update({
          start_date: allLogs[0].working_date,
          end_date: allLogs[allLogs.length - 1].working_date,
          num_of_days: allLogs.length,
        }, { transaction: t });
      }

      // Assignee row (confirmation flag derives from the logs, never blindly reset)
      const pilotLogs = allLogs.filter((l) => l.pilot_user_id === Number(pilot));
      const existingAssignee =
        (await SprayingWorkAssignee.findOne({ where: { booking_id, pilot_user_id: pilot }, transaction: t })) ||
        (await SprayingWorkAssignee.findOne({ where: { booking_id }, transaction: t }));
      const assigneePayload = {
        booking_id,
        drone_id: drone_id || null,
        pilot_user_id: pilot,
        co_pilot_user_id: copilot || null,
        is_pilot_confirm: pilotLogs.some((l) => l.is_pilot_confirmed === true),
      };
      if (existingAssignee) {
        await existingAssignee.update({
          ...assigneePayload,
          ...(existingAssignee.pilot_user_id !== Number(pilot) && { is_copilot_confirm: false }),
          modified_on: new Date(),
        }, { transaction: t });
      } else {
        await SprayingWorkAssignee.create({
          ...assigneePayload,
          is_copilot_confirm: false,
          created_on: new Date(),
          is_active: true,
        }, { transaction: t });
      }

      // New/changed days need the pilot's confirmation again
      const needsConfirmation = allLogs.some((l) => l.is_pilot_confirmed !== true);
      if (
        needsConfirmation &&
        [OrderStatusEnum.ORDER_ACCEPTED, OrderStatusEnum.ORDER_STARTED].includes(order.order_status)
      ) {
        await updateOrderStatus(
          booking_id,
          OrderStatusEnum.WAITING_FOR_CONFIRMATION,
          "Work schedule changed - waiting for pilot confirmation",
          req.auth?.id ?? null,
          t
        );
      }


      return reply(200, {
        message: "Work assigned successfully",
        result: results,
        pilot_user_id: Number(pilot),
        co_pilot_user_id: copilot ? Number(copilot) : null,
        drone_id: Number(drone_id),
        start_date: allLogs.length ? toYMD(allLogs[0].working_date) : null,
        end_date: allLogs.length ? toYMD(allLogs[allLogs.length - 1].working_date) : null,
        num_of_days: allLogs.length,
      });
    });
    return res.status(outcome.status).json(outcome.body);
  } catch (error) {
    return respondWithError(req, res, error, "assignWork");
  }
};

/* ═══════════════════════════════════════════════════════════
   updateDailyLogDrone  (NEW)
   PATCH /order/daily-log/:log_id/drone
   Body: { drone_id }
═══════════════════════════════════════════════════════════ */
export const updateDailyLogDrone = async (req, res) => {
  try {
    const { log_id } = req.params;
    const { drone_id } = req.body;

    if (!log_id || !drone_id) {
      return res
        .status(400)
        .json({ message: "log_id and drone_id are required" });
    }

    const log = await SprayingDailyLogs.findOne({ where: { id: log_id } });
    if (!log) return res.status(404).json({ message: "Daily log not found" });

    const drone = await Drone1.findOne({
      where: { id: drone_id },
      attributes: ["id", "name", "pilot_user_id", "co_pilot_user_id"],
      raw: true,
    });
    if (!drone) return res.status(404).json({ message: "Drone not found" });

    if (["started", "completed"].includes(getDayStatus(log))) {
      return res.status(409).json({
        message: `This working day is already ${getDayStatus(log)}; the drone cannot be changed.`,
      });
    }

    const newPilot = drone.pilot_user_id ?? log.pilot_user_id;
    const clash = await SprayingDailyLogs.findOne({
      where: {
        id: { [Op.ne]: log.id },
        working_date: log.working_date,
        is_active: true,
        [Op.or]: [{ drone_id }, ...(newPilot ? [{ pilot_user_id: newPilot }] : [])],
      },
      attributes: ["id"],
      raw: true,
    });
    if (clash) {
      return res.status(409).json({
        message: "That drone or its pilot is already booked on this date",
      });
    }

    const pilotChanged = newPilot !== log.pilot_user_id;
    await log.update({
      drone_id,
      pilot_user_id: newPilot,
      co_pilot_user_id: drone.co_pilot_user_id ?? log.co_pilot_user_id,
      ...(pilotChanged && { is_pilot_confirmed: null, pilot_confirmed_at: null }),
      ...(pilotChanged && readDayData(log).declined_at && {
        verification_comment: JSON.stringify(stripDecline(readDayData(log))),
      }),
      modified_on: new Date(),
    });

    const crewIds = [
      drone.pilot_user_id ?? log.pilot_user_id,
      drone.co_pilot_user_id ?? log.co_pilot_user_id,
    ].filter(Boolean);

    const [users, profiles] = await Promise.all([
      crewIds.length
        ? User.findAll({
          where: { id: crewIds },
          attributes: ["id", "username", "mobile_number"],
          raw: true,
        })
        : Promise.resolve([]),
      crewIds.length
        ? UserProfile.findAll({
          where: { user_id: crewIds },
          attributes: ["user_id", "first_name", "last_name"],
          raw: true,
        })
        : Promise.resolve([]),
    ]);

    return res.status(200).json({
      message: "Drone updated for this working day",
      log_id: Number(log_id),
      drone_id,
      drone_name: drone.name || `Drone #${drone_id}`,
      pilot: resolveUser(drone.pilot_user_id ?? log.pilot_user_id, users, profiles),
      copilot: resolveUser(drone.co_pilot_user_id ?? log.co_pilot_user_id, users, profiles),
    });
  } catch (error) {
    console.error("Error in updateDailyLogDrone:", error);
    return res.status(500).json({ error: error.message });
  }
};

/* ═══════════════════════════════════════════════════════════
   deleteDailyLog  (NEW)
   DELETE /order/daily-log/:log_id
   
   Removes a single working-day log from a booking.
   Also recalculates num_of_days + end_date on the parent order.
   Will NOT delete a log that is already verified (is_verified=true)
   unless force=true is passed in the body.
═══════════════════════════════════════════════════════════ */
export const deleteDailyLog = async (req, res) => {
  try {
    const { log_id } = req.params;
    const { force = false } = req.body || {};

    if (!Number.isInteger(Number(log_id))) {
      return res.status(400).json({ message: "log_id is required" });
    }

    const outcome = await db.sequelize.transaction(async (t) => {
      const log = await SprayingDailyLogs.findByPk(log_id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!log) return { status: 404, body: { message: "Daily log not found" } };

      // A day the pilot is working on right now is never removed: it would delete the work in progress
      const dayStatus = getDayStatus(log);
      if (dayStatus === "started") {
        return { status: 409, body: { message: "This working day is in progress. Wait for the pilot to end it." } };
      }

      /* A finished day is the record of work done (and of what is owed): only with force=true */
      if ((log.is_verified || dayStatus === "completed") && !force) {
        return {
          status: 409,
          body: {
            message: "This working day has already been completed by the pilot. Pass force=true to delete it anyway.",
            is_verified: log.is_verified === true,
          },
        };
      }

      const booking_id = log.spraying_work_id;
      const deletedDate = toYMD(new Date(log.working_date));
      await log.destroy({ transaction: t });

      /* Recalculate order dates from remaining logs */
      const remainingLogs = await SprayingDailyLogs.findAll({
        where: { spraying_work_id: booking_id, is_active: true },
        attributes: ["working_date"],
        order: [["working_date", "ASC"]],
        raw: true,
        transaction: t,
      });

      const order = await SprayingOrder.findOne({ where: { booking_id }, transaction: t, lock: t.LOCK.UPDATE });
      if (order) {
        if (remainingLogs.length === 0) {
          /* All logs removed — reset counts but keep start_date */
          await order.update({ num_of_days: 0, end_date: null }, { transaction: t });
        } else {
          await order.update({
            num_of_days: remainingLogs.length,
            start_date: remainingLogs[0].working_date,
            end_date: remainingLogs[remainingLogs.length - 1].working_date,
          }, { transaction: t });
        }

        await db.SprayingOrderTimeline.create({
          booking_id,
          order_status: order.order_status,
          remarks: `Working day ${deletedDate} removed by admin${force && dayStatus === "completed" ? " (it had been completed)" : ""}`,
          created_by: req.auth?.id ?? null,
        }, { transaction: t });
      }

      return {
        status: 200,
        body: {
          message: "Daily log deleted successfully",
          log_id: Number(log_id),
          deleted_date: deletedDate,
          booking_id,
          remaining_days: remainingLogs.length,
        },
      };
    });

    return res.status(outcome.status).json(outcome.body);
  } catch (error) {
    return respondWithError(req, res, error, "deleteDailyLog");
  }
};

export const getDroneAvailabilityForBooking = async (req, res) => {
  try {
    const { state, district, block } = req.body;

    if (!state || !district || !block) {
      return res.status(400).json({ message: "state, district, and block are required" });
    }

    // 1. Drones in this location
    const localDroneAddrs = await DroneAddress.findAll({
      where: { state, district, block, is_active: true },
      attributes: ["drone_id"],
      raw: true,
    });

    const localDroneIds = [...new Set(localDroneAddrs.map((a) => a.drone_id))];

    if (localDroneIds.length === 0) {
      return res.status(200).json({
        success: true,
        calendar_data: {},
        total_drones: 0,
        message: "No drones available in this location"
      });
    }

    // 2. Date window: today -> +30 days
    const windowStart = new Date();
    windowStart.setUTCHours(0, 0, 0, 0);
    const windowEnd = new Date(windowStart);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 30);

    // 3. Busy logs in window
    const busyLogs = await SprayingDailyLogs.findAll({
      where: {
        working_date: { [Op.between]: [windowStart, windowEnd] },
        drone_id: { [Op.in]: localDroneIds },
        is_active: true,
      },
      attributes: ["working_date", "drone_id"],
      raw: true,
    });

    const busyDronesByDate = {};
    busyLogs.forEach((log) => {
      const ymd = toYMD(new Date(log.working_date));
      if (!busyDronesByDate[ymd]) busyDronesByDate[ymd] = new Set();
      busyDronesByDate[ymd].add(log.drone_id);
    });

    const calendar_data = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date(windowStart);
      d.setUTCDate(d.getUTCDate() + i);
      const ymd = toYMD(d);

      const busyCount = busyDronesByDate[ymd] ? busyDronesByDate[ymd].size : 0;
      const blocked = busyCount >= localDroneIds.length;

      calendar_data[ymd] = {
        blocked,
        available_count: Math.max(0, localDroneIds.length - busyCount),
        total_drones: localDroneIds.length
      };
    }

    return res.status(200).json({
      success: true,
      calendar_data,
      total_drones: localDroneIds.length
    });

  } catch (error) {
    console.error("Error in getDroneAvailabilityForBooking:", error);
    return res.status(500).json({ error: error.message });
  }
};