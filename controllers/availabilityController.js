import { Op } from "sequelize";
import db from "../models/index.js";

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
      booking.num_of_days ||
      (landInAcres > 0 ? Math.ceil(landInAcres / minAcresPerDay) : 1);

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
    const { pilot, copilot, drone_id, working_date } = req.body;

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

    const sortedDates = [...working_date]
      .map((d) => {
        const dt = new Date(d);
        dt.setUTCHours(0, 0, 0, 0);
        return dt;
      })
      .sort((a, b) => a - b);

    const results = [];

    for (const date of sortedDates) {
      const existing = await SprayingDailyLogs.findOne({
        where: { spraying_work_id: booking_id, working_date: date },
      });

      if (existing) {
        await existing.update({
          drone_id:         drone_id,
          pilot_user_id:    pilot    ?? existing.pilot_user_id,
          co_pilot_user_id: copilot  ?? existing.co_pilot_user_id,
          modified_on:      new Date(),
        });
        results.push({ date: toYMD(date), action: "updated" });
      } else {
        await SprayingDailyLogs.create({
          spraying_work_id: booking_id,
          drone_id:         drone_id,
          pilot_user_id:    pilot    || null,
          co_pilot_user_id: copilot  || null,
          working_date:     date,
          created_on:       new Date(),
          is_active:        true,
        });
        results.push({ date: toYMD(date), action: "created" });
      }
    }

    const order = await SprayingOrder.findOne({ where: { booking_id } });
    if (order) {
      const earliest = sortedDates[0];
      const latest   = sortedDates[sortedDates.length - 1];
      await order.update({
        end_date:    latest,
        num_of_days: sortedDates.length,
        ...(new Date(order.start_date) > earliest && {
          start_date: earliest,
        }),
      });
    }

    const existingAssignee = await SprayingWorkAssignee.findOne({
      where: { booking_id },
    });
    const assigneePayload = {
      booking_id,
      drone_id:         drone_id    || null,
      pilot_user_id:    pilot       || null,
      co_pilot_user_id: copilot     || null,
      is_pilot_confirm:   false,
      is_copilot_confirm: false,
    };
    if (existingAssignee) {
      await existingAssignee.update({
        ...assigneePayload,
        modified_on: new Date(),
      });
    } else {
      await SprayingWorkAssignee.create({
        ...assigneePayload,
        created_on: new Date(),
        is_active:  true,
      });
    }

    return res.status(200).json({
      message: "Work assigned successfully",
      result: results,
    });
  } catch (error) {
    console.error("Error in assignWork:", error);
    return res.status(500).json({ error: error.message });
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

    await log.update({
      drone_id,
      pilot_user_id:    drone.pilot_user_id    ?? log.pilot_user_id,
      co_pilot_user_id: drone.co_pilot_user_id ?? log.co_pilot_user_id,
      modified_on: new Date(),
    });

    const crewIds = [
      drone.pilot_user_id    ?? log.pilot_user_id,
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
      message:    "Drone updated for this working day",
      log_id:     Number(log_id),
      drone_id,
      drone_name: drone.name || `Drone #${drone_id}`,
      pilot:   resolveUser(drone.pilot_user_id    ?? log.pilot_user_id,    users, profiles),
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

    if (!log_id) {
      return res.status(400).json({ message: "log_id is required" });
    }

    const log = await SprayingDailyLogs.findOne({ where: { id: log_id } });
    if (!log) return res.status(404).json({ message: "Daily log not found" });

    /* Block deletion of verified logs unless admin forces it */
    if (log.is_verified && !force) {
      return res.status(409).json({
        message: "This log has already been verified by the pilot. Pass force=true to delete anyway.",
        is_verified: true,
      });
    }

    const booking_id = log.spraying_work_id;
    const deletedDate = toYMD(new Date(log.working_date));

    /* Hard-delete the log row */
    await log.destroy();

    /* Recalculate order dates from remaining logs */
    const remainingLogs = await SprayingDailyLogs.findAll({
      where: { spraying_work_id: booking_id, is_active: true },
      attributes: ["working_date"],
      order: [["working_date", "ASC"]],
      raw: true,
    });

    const order = await SprayingOrder.findOne({ where: { booking_id } });
    if (order) {
      if (remainingLogs.length === 0) {
        /* All logs removed — reset counts but keep start_date */
        await order.update({
          num_of_days: 0,
          end_date:    null,
        });
      } else {
        const earliest = remainingLogs[0].working_date;
        const latest   = remainingLogs[remainingLogs.length - 1].working_date;
        await order.update({
          num_of_days: remainingLogs.length,
          start_date:  earliest,
          end_date:    latest,
        });
      }
    }

    return res.status(200).json({
      message:      "Daily log deleted successfully",
      log_id:       Number(log_id),
      deleted_date: deletedDate,
      booking_id,
      remaining_days: remainingLogs.length,
    });
  } catch (error) {
    console.error("Error in deleteDailyLog:", error);
    return res.status(500).json({ error: error.message });
  }
};