import { Op } from 'sequelize';
import db from '../models/index.js';
import { OrderStatusEnum, PILOT_STARTABLE_ORDER_STATUSES } from '../utils/enums.js';
import { respondWithError } from '../middleware/errorHandler.js';
import { updateOrderStatus } from '../utils/orderUtils.js';
import { getDayStatus, readDayData, stripDecline, toYMD, todayIST } from '../utils/dateUtils.js';
import { CLOSED_ORDER_STATUSES, deriveStates } from '../utils/pilotMissionState.js';
import { withLocationNames } from './farmerProfile.controller.js';

const {
  SprayingOrder,
  SprayingOrderAddress,
  SprayingOrderTimeline,
  SprayingOrderComment,
  SprayingDailyLogs,
  SprayingWorkAssignee,
  MasterCrop,
  Drone1,
  User,
  UserProfile,
} = db;


const fullName = (profile, fallback = null) => {
  const name = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : '';
  return name || fallback;
};

/**
 * Builds the assignment objects for a pilot. `logsByBooking` holds ONLY this pilot's active daily logs.
 */
const buildAssignments = async (pilotId, logsByBooking, { detail = false } = {}) => {
  const bookingIds = Object.keys(logsByBooking);
  if (bookingIds.length === 0) return [];

  const allOrders = await SprayingOrder.findAll({
    where: { booking_id: { [Op.in]: bookingIds } },
    order: [['start_date', 'ASC']],
  });

  // A cancelled booking deactivates its days (to free the drone/pilot), but the pilot must still see it as cancelled.
  // For every other booking only active days count.
  const visibleLogs = {};
  for (const order of allOrders) {
    const all = logsByBooking[order.booking_id];
    const kept = CLOSED_ORDER_STATUSES.includes(order.order_status) ? all : all.filter((l) => l.is_active);
    if (kept.length > 0) visibleLogs[order.booking_id] = kept;
  }
  const orders = allOrders.filter((o) => visibleLogs[o.booking_id]);
  logsByBooking = visibleLogs;

  const allLogs = Object.values(logsByBooking).flat();
  const droneIds = [...new Set(allLogs.map((l) => l.drone_id).filter(Boolean))];
  const coPilotIds = [...new Set(allLogs.map((l) => l.co_pilot_user_id).filter(Boolean))];
  const farmerIds = [...new Set(orders.map((o) => o.user_id || o.created_by).filter(Boolean))];
  const cropIds = [...new Set(orders.map((o) => o.crop_type_id).filter(Boolean))];
  const peopleIds = [...new Set([...coPilotIds, ...farmerIds])];

  const [addresses, drones, crops, users, profiles] = await Promise.all([
    SprayingOrderAddress.findAll({ where: { order_id: { [Op.in]: bookingIds } } }),
    droneIds.length ? Drone1.findAll({ where: { id: droneIds } }) : [],
    cropIds.length ? MasterCrop.findAll({ where: { id: cropIds } }) : [],
    peopleIds.length ? User.findAll({ where: { id: peopleIds }, attributes: ['id', 'mobile_number'] }) : [],
    peopleIds.length ? UserProfile.findAll({ where: { user_id: peopleIds } }) : [],
  ]);
  const toNamed = await withLocationNames(addresses);

  const byId = (rows, key = 'id') => Object.fromEntries(rows.map((r) => [r[key], r]));
  const addressByOrder = byId(addresses, 'order_id');
  const droneById = byId(drones);
  const cropById = byId(crops);
  const userById = byId(users);
  const profileByUser = byId(profiles, 'user_id');

  const timelineByOrder = {};
  if (detail) {
    const rows = await SprayingOrderTimeline.findAll({
      where: { booking_id: { [Op.in]: bookingIds } },
      order: [['created_on', 'ASC']],
    });
    for (const r of rows) (timelineByOrder[r.booking_id] ||= []).push({
      status: r.order_status, remarks: r.remarks || null, at: r.created_on,
    });
  }

  const today = todayIST();

  return orders.map((order) => {
    const logs = logsByBooking[order.booking_id];
    const dayStatuses = logs.map(getDayStatus);
    const { request_status, mission_state } = deriveStates(order, dayStatuses, logs);
    const closed = CLOSED_ORDER_STATUSES.includes(order.order_status);
    // mirrors the rule start-day enforces, so the app never offers a start the server would refuse
    const orderAllowsStart = PILOT_STARTABLE_ORDER_STATUSES.includes(order.order_status);

    const addr = addressByOrder[order.booking_id];
    const named = addr ? toNamed(addr) : null;
    const address = addr
      ? {
          lane_1: addr.lane1 || addr.address1 || null,
          lane_2: addr.lane2 || addr.address2 || null,
          village: addr.village || null,
          pincode: addr.pincode || null,
          state_name: named?.state_name || null,
          district_name: named?.district_name || null,
          block_name: named?.block_name || null,
          full: [addr.lane1 || addr.address1, addr.village, named?.block_name, named?.district_name, named?.state_name, addr.pincode]
            .filter(Boolean).join(', '),
        }
      : null;

    const farmerId = order.user_id || order.created_by;
    const farmerPhone = userById[farmerId]?.mobile_number || null;
    const drone = droneById[logs[0]?.drone_id];
    const coPilotId = logs[0]?.co_pilot_user_id;

    const days = logs.map((log, idx) => {
      const status = dayStatuses[idx];
      const data = readDayData(log);
      const date = toYMD(log.working_date);
      const day = {
        log_id: log.id,
        day_number: idx + 1,
        date,
        day_status: status,                     // scheduled | confirmed | started | completed | declined
        is_today: date === today,
        can_start: orderAllowsStart && status === 'confirmed' && date <= today,
        can_end: !closed && status === 'started',
        drone_id: log.drone_id,
        acres_completed: parseFloat(data.completed_acres || 0),
        started_at: data.started_at || null,
        ended_at: data.day_status === 'completed' ? (data.saved_at || null) : null,
        decline_reason: status === 'declined' ? (data.decline_reason || null) : null,
        is_verified: log.is_verified === true,
      };
      if (detail) {
        day.work_details = {
          completed_acres: data.completed_acres ?? null,
          fertilizer_used: data.fertilizer_used ?? null,
          pesticide_used: data.pesticide_used ?? null,
          water_used: data.water_used ?? null,
          notes: data.notes ?? null,
          start_time: data.start_time ?? null,
          end_time: data.end_time ?? null,
        };
        day.land_image_url = log.land_image_url || null;
      }
      return day;
    });

    const count = (...statuses) => dayStatuses.filter((s) => statuses.includes(s)).length;

    const item = {
      booking_id: order.booking_id,
      order_status: order.order_status,
      request_status,
      mission_state,
      crop_name: cropById[order.crop_type_id]?.name || null,
      land_in_acers: order.land_in_acers,
      total_price: order.total_price,
      is_paid: order.is_paid === true,
      start_date: days.length ? days[0].date : null,
      end_date: days.length ? days[days.length - 1].date : null,
      num_of_days: days.length,
      farmer: {
        name: fullName(profileByUser[farmerId], 'Farmer'),
        // contact details are only shared once the pilot has accepted the work
        phone: request_status === 'ACCEPTED' ? farmerPhone : null,
      },
      address,
      drone: drone ? { id: drone.id, name: drone.name || null, model: drone.model || null } : null,
      co_pilot: coPilotId
        ? { id: coPilotId, name: fullName(profileByUser[coPilotId], null), phone: userById[coPilotId]?.mobile_number || null }
        : null,
      decline_reason: request_status === 'DECLINED' ? (days.find((d) => d.decline_reason)?.decline_reason || null) : null,
      counts: {
        total_days: days.length,
        pending_days: count('scheduled'),
        confirmed_days: count('confirmed'),
        started_days: count('started'),
        completed_days: count('completed'),
        declined_days: count('declined'),
      },
      days,
    };
    if (detail) item.timeline = timelineByOrder[order.booking_id] || [];
    return item;
  });
};

const loadPilotLogs = async (pilotId, bookingId = null) => {
  // active or not: buildAssignments decides which days still count (see there)
  const logs = await SprayingDailyLogs.findAll({
    where: { pilot_user_id: pilotId, ...(bookingId && { spraying_work_id: bookingId }) },
    order: [['working_date', 'ASC']],
  });
  const grouped = {};
  for (const log of logs) (grouped[log.spraying_work_id] ||= []).push(log);
  return grouped;
};

// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/pilot/work/assignments?request_status=PENDING|ACCEPTED|DECLINED|CANCELLED
//                                 &mission_state=UPCOMING|ACTIVE|PENDING_VERIFICATION|COMPLETED|CANCELLED
//  Every booking assigned to the logged-in pilot. The pilot is taken from the token.
// ═════════════════════════════════════════════════════════════════════════════
export const getMyAssignments = async (req, res) => {
  try {
    const assignments = await buildAssignments(req.pilot.id, await loadPilotLogs(req.pilot.id));

    const wantedRequest = req.query.request_status?.toString().toUpperCase();
    const wantedMission = req.query.mission_state?.toString().toUpperCase();
    const data = assignments.filter(
      (a) => (!wantedRequest || a.request_status === wantedRequest) && (!wantedMission || a.mission_state === wantedMission)
    );

    return res.status(200).json({ success: true, total: data.length, assignments: data });
  } catch (error) {
    return respondWithError(req, res, error, 'getMyAssignments');
  }
};

// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/pilot/work/assignments/:booking_id
//  One assigned booking with per-day work details and the order timeline.
// ═════════════════════════════════════════════════════════════════════════════
export const getMyAssignmentDetail = async (req, res) => {
  try {
    const { booking_id } = req.params;
    const [assignment] = await buildAssignments(req.pilot.id, await loadPilotLogs(req.pilot.id, booking_id), { detail: true });
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'This booking is not assigned to you.' });
    }
    return res.status(200).json({ success: true, assignment });
  } catch (error) {
    return respondWithError(req, res, error, 'getMyAssignmentDetail');
  }
};

// ═════════════════════════════════════════════════════════════════════════════
//  POST /api/pilot/work/reject-assignment
//  Body: { booking_id, reason, dates?: ["YYYY-MM-DD"] }
//
//  The pilot declines the booking (all of their days that have not started, or only `dates`).
//  A reason is required. The admin sees the reason in the order timeline and comments and
//  re-assigns; the farmer's booking goes back to "searching for pilot".
// ═════════════════════════════════════════════════════════════════════════════
export const rejectAssignment = async (req, res) => {
  try {
    const pilotId = req.pilot.id;
    const { booking_id, dates } = req.body || {};
    const reason = String(req.body?.reason ?? '').trim();

    if (!booking_id) return res.status(400).json({ success: false, message: 'booking_id is required.' });
    if (reason.length < 3) return res.status(400).json({ success: false, message: 'Please give a reason (at least 3 characters).' });
    if (reason.length > 500) return res.status(400).json({ success: false, message: 'The reason must be 500 characters or fewer.' });
    if (dates !== undefined && !Array.isArray(dates)) {
      return res.status(400).json({ success: false, message: 'dates must be an array of YYYY-MM-DD strings.' });
    }

    const order = await SprayingOrder.findByPk(booking_id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    if (CLOSED_ORDER_STATUSES.includes(order.order_status)) {
      return res.status(409).json({ success: false, message: `This booking is ${order.order_status} and can no longer be declined.` });
    }

    const logs = await SprayingDailyLogs.findAll({
      where: { spraying_work_id: booking_id, pilot_user_id: pilotId, is_active: true },
      order: [['working_date', 'ASC']],
    });
    if (logs.length === 0) return res.status(403).json({ success: false, message: 'This booking is not assigned to you.' });

    let selected = logs;
    if (dates) {
      const wanted = new Set(dates.map(String));
      selected = logs.filter((l) => wanted.has(toYMD(l.working_date)));
      if (selected.length !== wanted.size) {
        return res.status(400).json({ success: false, message: 'Some dates are not assigned to you for this booking.' });
      }
    }

    // Work that already started/finished cannot be declined
    const rejectable = selected.filter((l) => ['scheduled', 'confirmed', 'declined'].includes(getDayStatus(l)));
    if (rejectable.length === 0) {
      return res.status(409).json({ success: false, message: 'These days have already started or finished and cannot be declined.' });
    }

    const now = new Date();
    const declinedDates = rejectable.map((l) => toYMD(l.working_date));

    // Every write of the decline succeeds together or none does
    await db.sequelize.transaction(async (t) => {
      for (const log of rejectable) {
        await log.update({
          is_pilot_confirmed: false,
          pilot_confirmed_at: null,
          verification_comment: JSON.stringify({ ...readDayData(log), declined_at: now.toISOString(), decline_reason: reason }),
          modified_on: now,
        }, { transaction: t });
      }

      // Assignee flag + (only if nothing at all is left accepted) send the order back for re-assignment
      const fresh = await SprayingDailyLogs.findAll({
        where: { spraying_work_id: booking_id, pilot_user_id: pilotId, is_active: true },
        transaction: t,
      });
      const stillAccepted = fresh.some((l) => ['confirmed', 'started', 'completed'].includes(getDayStatus(l)));
      const assignee = await SprayingWorkAssignee.findOne({ where: { booking_id, pilot_user_id: pilotId }, transaction: t });
      if (assignee) await assignee.update({ is_pilot_confirm: stillAccepted, modified_on: now }, { transaction: t });

      if (
        !stillAccepted &&
        [OrderStatusEnum.ORDER_ACCEPTED, OrderStatusEnum.ORDER_STARTED, OrderStatusEnum.WAITING_FOR_CONFIRMATION].includes(order.order_status)
      ) {
        await updateOrderStatus(booking_id, OrderStatusEnum.WAITING_FOR_CONFIRMATION, `Pilot declined: ${reason}`, pilotId, t);
      } else {
        await SprayingOrderTimeline.create({
          booking_id,
          order_status: order.order_status,
          remarks: `Pilot declined ${declinedDates.join(', ')}: ${reason}`,
          created_by: pilotId,
        }, { transaction: t });
      }

      // Visible to the admin next to the other order comments
      await SprayingOrderComment.create({
        user_id: pilotId,
        comment_type: 'pilot_declined',
        comment: reason,
        spraying_order_id: booking_id,
        working_date: rejectable[0].working_date,
        created_by: pilotId,
        created_on: now,
      }, { transaction: t });
    });

    const current = await SprayingOrder.findByPk(booking_id);
    return res.status(200).json({
      success: true,
      message: 'You have declined this booking.',
      data: { booking_id, declined_dates: declinedDates, reason, order_status: current.order_status },
    });
  } catch (error) {
    return respondWithError(req, res, error, 'rejectAssignment');
  }
};
