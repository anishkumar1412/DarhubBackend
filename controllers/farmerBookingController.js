import { createHash } from 'crypto';
import { Op } from 'sequelize';
import db from '../models/index.js';
import { OrderStatusEnum } from '../utils/enums.js';
import { updateOrderStatus } from '../utils/orderUtils.js';
import { respondWithError } from '../middleware/errorHandler.js';
import { toYMD, readDayData, getDayStatus } from '../utils/dateUtils.js';

const {
  SprayingOrder,
  SprayingOrderAddress,
  SprayingOrderTimeline,
  SprayingOrderExtras,
  SprayingWorkAssignee,
  SprayingDailyLogs,
  UserProfile,
  User,
  MasterCrop,
  Drone1,
  MasterState,
  MasterDistrict,
  MasterBlock,
} = db;

// ─────────────────────────────────────────────────────────────────────────────
//  MAPPING: internal OrderStatusEnum → frontend app status
//  The Android app understands: PENDING | UPCOMING | ONGOING | COMPLETED | CANCELLED
// ─────────────────────────────────────────────────────────────────────────────
const toAppStatus = (order_status) => {
  switch (order_status) {
    case OrderStatusEnum.ORDER_PLACED:
      return 'PENDING';
    case OrderStatusEnum.WAITING_FOR_CONFIRMATION:
      return 'PENDING';
    case OrderStatusEnum.ORDER_ACCEPTED:
      return 'UPCOMING';
    case OrderStatusEnum.ORDER_STARTED:
      return 'UPCOMING';
    case OrderStatusEnum.JOB_STARTED:
      return 'ONGOING';
    case OrderStatusEnum.JOB_ENDED:
      return 'ONGOING';
    case OrderStatusEnum.ORDER_COMPLETED:
      return 'COMPLETED';
    case OrderStatusEnum.WAITING_FOR_PAYMENT:
      return 'COMPLETED';
    case OrderStatusEnum.PAYMENT_SUCCESSFUL:
      return 'COMPLETED';
    case OrderStatusEnum.ORDER_CANCELLED:
      return 'CANCELLED';
    case OrderStatusEnum.ORDER_REJECTED:
      return 'CANCELLED';
    default:
      return 'PENDING';
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  MAPPING: internal OrderStatusEnum value → farmer-facing event_type
//  Used to build the timeline[] array the app renders.
// ─────────────────────────────────────────────────────────────────────────────
const statusToEventType = (order_status) => {
  switch (order_status) {
    case OrderStatusEnum.ORDER_PLACED:
    case OrderStatusEnum.WAITING_FOR_CONFIRMATION:
      return 'ORDER_RECEIVED';
    case OrderStatusEnum.ORDER_ACCEPTED:
      return 'PILOT_ASSIGNED';
    case OrderStatusEnum.ORDER_STARTED:
      return 'PILOT_ON_WAY';
    case OrderStatusEnum.JOB_STARTED:
      return 'PILOT_REACHED';
    case OrderStatusEnum.JOB_ENDED:
      return 'SPRAYING_STARTED';
    case OrderStatusEnum.ORDER_COMPLETED:
    case OrderStatusEnum.WAITING_FOR_PAYMENT:
    case OrderStatusEnum.PAYMENT_SUCCESSFUL:
      return 'SPRAYING_COMPLETED';
    case OrderStatusEnum.ORDER_CANCELLED:
    case OrderStatusEnum.ORDER_REJECTED:
      return 'ORDER_CANCELLED';
    default:
      return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  HELPER: format a Date → "11 May 2026, 11:20 AM"  (IST)
// ─────────────────────────────────────────────────────────────────────────────
const fmtDateTime = (date) => {
  if (!date) return null;
  return new Date(date).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
};

const fmtDate = (date) => {
  if (!date) return null;
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
};

// ─────────────────────────────────────────────────────────────────────────────
//  HELPER: build timeline[] from SprayingOrderTimeline rows
//  Deduplicates: if the same event_type appears multiple times, keep FIRST.
// ─────────────────────────────────────────────────────────────────────────────
const buildTimeline = (timelineRows) => {
  const seen = new Set();
  const result = [];
  for (const row of timelineRows) {
    const eventType = statusToEventType(row.order_status);
    if (!eventType || seen.has(eventType)) continue;
    seen.add(eventType);
    result.push({
      event: eventType,
      occurred_at: fmtDateTime(row.created_on),
      note: row.remarks || null,
    });
  }
  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
//  HELPER: build pilot object from assignee + UserProfile + User + Drone
// ─────────────────────────────────────────────────────────────────────────────
const buildPilotObject = async (assignee, extras) => {
  if (!assignee) return null;

  const [profile, user, drone, coProfile, coUser] = await Promise.all([
    UserProfile.findOne({ where: { user_id: assignee.pilot_user_id } }),
    User.findOne({ where: { id: assignee.pilot_user_id } }),
    assignee.drone_id ? Drone1.findOne({ where: { id: assignee.drone_id } }) : Promise.resolve(null),
    assignee.co_pilot_user_id ? UserProfile.findOne({ where: { user_id: assignee.co_pilot_user_id } }) : Promise.resolve(null),
    assignee.co_pilot_user_id ? User.findOne({ where: { id: assignee.co_pilot_user_id } }) : Promise.resolve(null),
  ]);

  const name = profile
    ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
    : `Pilot #${assignee.pilot_user_id}`;

  const coPilot = assignee.co_pilot_user_id && coUser
    ? {
        pilot_id: assignee.co_pilot_user_id,
        name: coProfile
          ? `${coProfile.first_name || ''} ${coProfile.last_name || ''}`.trim()
          : `Co-pilot #${assignee.co_pilot_user_id}`,
        phone_number: coUser.mobile_number || null,
      }
    : null;

  return {
    pilot_id: assignee.pilot_user_id,
    name,
    phone_number: user?.mobile_number || null,
    rating: extras?.pilot_rating ?? null,
    review_count: extras?.pilot_review_count ?? null,
    experience_years: extras?.pilot_experience_years ?? null,
    drone_id: assignee.drone_id || null,
    drone_name: drone?.name || drone?.model || null,
    drone_model: drone?.model || null,
    co_pilot: coPilot,
    eta_minutes: extras?.pilot_eta_minutes ?? null,
    distance_km: extras?.pilot_distance_km ?? null,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
//  HELPER: aggregate usage stats for COMPLETED jobs.
//  Priority: explicit extras.usage_* columns → fallback: parse daily logs JSON
// ─────────────────────────────────────────────────────────────────────────────
// A work value is a number ("40") when entered by hand, or free text ("Urea 50 Bottle (1 L)") when the pilot app
// lists products. Anything that is not a plain number counts as 0 in totals, never NaN.
const toNumber = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && /^\s*\d+(\.\d+)?\s*$/.test(String(v)) ? n : 0;
};

const buildUsage = (dailyLogs, totalAcres, extras) => {
  // ── Prefer explicit columns set by admin/pilot ──────────────────
  if (extras?.usage_total_acres_covered != null) {
    const covered = parseFloat(extras.usage_total_acres_covered);
    const coverage = totalAcres > 0
      ? Math.min(100, Math.round((covered / totalAcres) * 100))
      : 100;
    return {
      coverage_percentage:  coverage,
      total_acres_covered:  covered,
      fertilizer_used_kg:   parseFloat(extras.usage_fertilizer_kg  ?? 0),
      pesticide_used_ltr:   parseFloat(extras.usage_pesticide_ltr  ?? 0),
      water_used_ltr:       parseFloat(extras.usage_water_ltr      ?? 0),
    };
  }

  // ── Fallback: aggregate from the pilot's day logs ──
  let totalCoveredAcres = 0;
  let totalFertilizer = 0;
  let totalPesticide = 0;
  let totalWater = 0;

  for (const log of dailyLogs) {
    const data = readDayData(log);
    totalCoveredAcres += toNumber(data.completed_acres);
    totalFertilizer   += toNumber(data.fertilizer_used);
    totalPesticide    += toNumber(data.pesticide_used);
    totalWater        += toNumber(data.water_used);
  }

  const coverage = totalAcres > 0
    ? Math.min(100, Math.round((totalCoveredAcres / totalAcres) * 100))
    : 0;

  return {
    coverage_percentage:  coverage,
    total_acres_covered:  parseFloat(totalCoveredAcres.toFixed(2)),
    fertilizer_used_kg:   parseFloat(totalFertilizer.toFixed(2)),
    pesticide_used_ltr:   parseFloat(totalPesticide.toFixed(2)),
    water_used_ltr:       parseFloat(totalWater.toFixed(2)),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
//  HELPER: build daily_work_logs[] from SprayingDailyLogs rows
// ─────────────────────────────────────────────────────────────────────────────
const buildDailyWorkLogs = (dailyLogs) => {
  return dailyLogs
    .filter(log => log.working_date)
    .map((log, idx) => {
      const data = readDayData(log);
      const text = (v) => (v === undefined || v === null || v === '' ? null : String(v));
      return {
        day_number:       idx + 1,
        date:             fmtDate(log.working_date),
        date_ymd:         toYMD(log.working_date),
        day_status:       getDayStatus(log),
        acres_completed:  toNumber(data.completed_acres),
        started_at:       data.started_at ? fmtDateTime(data.started_at) : null,
        ended_at:         data.day_status === 'completed' && data.saved_at ? fmtDateTime(data.saved_at) : null,
        // what was used that day: exact text as entered, plus the number when it is one
        fertilizer_used:  text(data.fertilizer_used),
        fertilizer_kg:    toNumber(data.fertilizer_used) || null,
        pesticide_used:   text(data.pesticide_used),
        pesticide_ltr:    toNumber(data.pesticide_used) || null,
        water_used:       text(data.water_used),
        water_ltr:        toNumber(data.water_used) || null,
        notes:            text(data.notes),
      };
    });
};

// ─────────────────────────────────────────────────────────────────────────────
//  HELPER: the day-by-day schedule the farmer sees on the booking screen
//  (every scheduled date, with who/what is assigned and where each day stands)
// ─────────────────────────────────────────────────────────────────────────────
const DAY_STATUS_LABEL = {
  scheduled: 'Scheduled',
  confirmed: 'Pilot confirmed',
  started:   'In progress',
  completed: 'Completed',
  declined:  'Pilot declined - finding another pilot',
};

const buildSchedule = (dailyLogs, dronesById) =>
  dailyLogs
    .filter(log => log.working_date)
    .map((log, idx) => {
      const status = getDayStatus(log);
      const data = readDayData(log);
      const drone = log.drone_id ? dronesById[log.drone_id] : null;
      return {
        day_number:   idx + 1,
        date:         fmtDate(log.working_date),
        date_ymd:     toYMD(log.working_date),
        status,
        status_label: DAY_STATUS_LABEL[status],
        pilot_confirmed: log.is_pilot_confirmed === true,
        drone_name:   drone ? (drone.name || drone.model || null) : null,
        acres_completed: toNumber(data.completed_acres),
      };
    });

// ─────────────────────────────────────────────────────────────────────────────
//  HELPER: build the full booking detail response object
// ─────────────────────────────────────────────────────────────────────────────
const buildFullDetail = async (order) => {
  const bookingId  = order.booking_id;
  const appStatus  = toAppStatus(order.order_status);
  const totalAcres = order.land_in_acers || 0;

  // Parallel fetches
  const [
    address,
    assignee,
    timelineRows,
    extras,
    dailyLogs,
    crop,
    farmerProfile,
    farmerUser,
  ] = await Promise.all([
    SprayingOrderAddress.findOne({ where: { order_id: bookingId } }),
    SprayingWorkAssignee.findOne({
      where: { booking_id: bookingId },
      order: [['created_on', 'DESC']],
    }),
    SprayingOrderTimeline.findAll({
      where: { booking_id: bookingId },
      order: [['created_on', 'ASC']],
    }),
    SprayingOrderExtras.findOne({ where: { booking_id: bookingId } }),
    SprayingDailyLogs.findAll({
      where: { spraying_work_id: bookingId, is_active: true },
      order: [['working_date', 'ASC']],
    }),
    order.crop_type_id
      ? MasterCrop.findOne({ where: { id: order.crop_type_id } })
      : Promise.resolve(null),
    UserProfile.findOne({ where: { user_id: order.user_id || order.created_by } }),
    User.findOne({ where: { id: order.user_id || order.created_by } }),
  ]);

  // Location name resolution
  let locationStr = null;
  let fieldName   = null;
  let stateObj    = null;
  let districtObj = null;
  let blockObj    = null;
  if (address) {
    const [state, district, block] = await Promise.all([
      address.state    ? MasterState.findOne({ where: { id: address.state } })    : null,
      address.district ? MasterDistrict.findOne({ where: { id: address.district } }) : null,
      address.block    ? MasterBlock.findOne({ where: { id: address.block } })    : null,
    ]);
    stateObj    = state;
    districtObj = district;
    blockObj    = block;
    const village = address.village || '';
    const blockName = block?.block_name || '';
    fieldName   = village || blockName || address.address1 || 'Field';
    locationStr = `${fieldName} • ${totalAcres} Acres`;
  }

  const formattedAddress = address ? {
    state: address.state,
    district: address.district,
    block: address.block,
    state_name: stateObj?.state_name || null,
    district_name: districtObj?.district_name || null,
    block_name: blockObj?.block_name || null,
    village: address.village,
    lane1: address.lane1 || address.address1 || null,
    lane2: address.lane2 || address.address2 || null,
    address1: address.address1 || address.lane1 || null,
    address2: address.address2 || address.lane2 || null,
    pincode: address.pincode || null,
  } : null;

  // Timeline
  const timeline = buildTimeline(timelineRows);

  // Pilot
  const pilot = await buildPilotObject(assignee, extras);

  // Usage (COMPLETED only — prefer extras columns, fall back to daily logs)
  const usage = buildUsage(dailyLogs, totalAcres, extras);

  // Daily work logs
  const daily_work_logs = buildDailyWorkLogs(dailyLogs);

  // Day-by-day schedule (drone names resolved in one query)
  const droneIds = [...new Set(dailyLogs.map(l => l.drone_id).filter(Boolean))];
  const droneRows = droneIds.length ? await Drone1.findAll({ where: { id: droneIds } }) : [];
  const dronesById = Object.fromEntries(droneRows.map(d => [d.id, d]));
  const schedule = buildSchedule(dailyLogs, dronesById);

  const totalDays     = dailyLogs.length || order.num_of_days || 1;
  const completedDays = dailyLogs.filter(l => getDayStatus(l) === 'completed').length;
  const startedDays   = dailyLogs.filter(l => getDayStatus(l) === 'started').length;
  const progress = {
    total_days:     totalDays,
    completed_days: completedDays,
    in_progress_days: startedDays,
    percentage:     totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0,
  };

  const startYmd = dailyLogs.length ? toYMD(dailyLogs[0].working_date) : (order.start_date ? toYMD(order.start_date) : null);
  const endYmd   = dailyLogs.length ? toYMD(dailyLogs[dailyLogs.length - 1].working_date) : (order.end_date ? toYMD(order.end_date) : null);
  const dateRange = startYmd && endYmd
    ? (startYmd === endYmd ? fmtDate(startYmd) : `${fmtDate(startYmd)} - ${fmtDate(endYmd)}`)
    : null;

  // Formatted amounts
  const totalPrice = parseFloat(extras?.total_payable ?? order.total_price ?? 0);
  const totalAmountFormatted = `₹${totalPrice.toLocaleString('en-IN')}`;

  // Crop name for title
  const cropName   = crop?.name || 'Spraying';
  const serviceTitle = extras?.service_title || `${cropName} Spraying`;

  // Farmer info
  const farmerName    = farmerProfile
    ? `${farmerProfile.first_name || ''} ${farmerProfile.last_name || ''}`.trim()
    : null;
  const farmerPhone   = farmerUser?.mobile_number || null;
  const farmerBilling = extras?.farmer_billing_address || null;

  // Scheduled date / time (first scheduled working day wins over the originally requested date)
  const scheduledDate   = fmtDate(startYmd || order.start_date);
  const scheduledWindow = extras?.scheduled_time || null;

  // pilot_assignment_status / drone_assignment_status (PENDING only)
  // A pilot who declined every day is as good as no pilot: the admin is looking for another one
  const allDaysDeclined = dailyLogs.length > 0 && dailyLogs.every(l => getDayStatus(l) === 'declined');
  const hasAssignment = !!(assignee && assignee.pilot_user_id) && !allDaysDeclined;
  const pilotAssignmentStatus = appStatus === 'PENDING'
    ? (hasAssignment ? 'Pilot assigned - awaiting pilot confirmation' : 'Searching for Pilot...')
    : null;
  const droneAssignmentStatus = appStatus === 'PENDING'
    ? (hasAssignment && assignee.drone_id ? 'Drone assigned' : 'Drone will be assigned soon')
    : null;

  // live_snapshot (only non-null for ONGOING)
  const liveSnapshot = (appStatus === 'ONGOING' && extras)
    ? {
        progress_percentage:   extras.live_progress_percentage ?? null,
        est_completion_mins:   extras.live_est_completion_mins ?? null,
        area_completed_acres:  parseFloat(extras.live_area_completed_acres ?? 0),
        remaining_area_acres:  parseFloat(extras.live_remaining_area_acres ?? 0),
        drone_distance_m:      extras.live_drone_distance_m ?? null,
        drone_speed_kmh:       extras.live_drone_speed_kmh ?? null,
        drone_altitude_m:      extras.live_drone_altitude_m ?? null,
        last_updated_time:     extras.live_last_updated_time ?? null,
      }
    : null;

  // Payment object
  const payment = extras
    ? {
        invoice_no:             extras.invoice_no,
        invoice_date:           extras.invoice_date ? fmtDate(extras.invoice_date) : null,
        payment_date:           extras.payment_date ? fmtDate(extras.payment_date) : null,
        status_label:           extras.payment_status_label ?? (order.is_paid ? 'Paid in Full' : 'Pending'),
        method:                 extras.payment_method ?? (order.is_paid ? 'Online' : null),
        base_amount:            parseFloat(extras.base_amount ?? order.price ?? 0),
        discount_amount:        parseFloat(extras.discount_amount ?? order.discount ?? 0),
        total_payable:          parseFloat(extras.total_payable ?? order.total_price ?? 0),
        online_amount_paid:     parseFloat(extras.online_amount_paid ?? 0),
        online_txn_id:          extras.online_txn_id ?? order.transcation_id ?? null,
        cash_amount_paid:       parseFloat(extras.cash_amount_paid ?? 0),
        cash_confirmation_code: extras.cash_confirmation_code ?? null,
        refund_amount:          extras.refund_amount ? parseFloat(extras.refund_amount) : null,
        refund_status:          extras.refund_status ?? null,
      }
    : {
        invoice_no:             null,
        invoice_date:           null,
        payment_date:           null,
        status_label:           order.is_paid ? 'Paid in Full' : 'Pending',
        method:                 order.is_paid ? 'Online' : null,
        base_amount:            parseFloat(order.price ?? 0),
        discount_amount:        parseFloat(order.discount ?? 0),
        total_payable:          parseFloat(order.total_price ?? 0),
        online_amount_paid:     order.is_paid ? parseFloat(order.total_price ?? 0) : 0,
        online_txn_id:          order.transcation_id ?? null,
        cash_amount_paid:       0,
        cash_confirmation_code: null,
        refund_amount:          null,
        refund_status:          null,
      };

  // Service object
  const service = extras
    ? {
        sub_category:     extras.service_sub_category,
        spray_solution:   extras.spray_solution,
        application_rate: extras.application_rate,
        rate_per_acre:    parseFloat(extras.rate_per_acre ?? 0),
        duration_minutes: extras.service_duration_mins,
      }
    : {
        sub_category:     null,
        spray_solution:   null,
        application_rate: null,
        rate_per_acre:    crop ? parseFloat(crop.price_per_acre ?? 0) : 0,
        duration_minutes: null,
      };

  return {
    // ── Core ───────────────────────────────────────────────────────
    id:                      bookingId,
    booking_id:              bookingId,
    title:                   serviceTitle,
    status:                  appStatus,
    order_status:            order.order_status,
    booking_otp:             order.booking_otp || null,
    scheduled_date:          scheduledDate,
    scheduled_time_window:   scheduledWindow,
    created_at:              fmtDateTime(order.created_on),
    start_date:              startYmd || order.start_date,
    end_date:                endYmd || order.end_date,
    date_range:              dateRange,
    num_of_days:             totalDays,
    progress,
    schedule,
    location:                locationStr,
    total_price:             totalPrice,
    total_amount_formatted:  totalAmountFormatted,
    pilot_assignment_status: pilotAssignmentStatus,
    drone_assignment_status: droneAssignmentStatus,
    cancellation_reason:     extras?.cancellation_reason ?? null,
    farmer_rating:           extras?.farmer_rating ?? null,
    is_paid:                 order.is_paid || false,
    payment_status:          payment.status_label,
    address:                 formattedAddress,

    // ── Farm ──────────────────────────────────────────────────────
    farm: {
      field_name:    fieldName,
      area_name:     fieldName,
      total_acres:   totalAcres,
      land_in_acers: totalAcres,
      crop_name:     cropName,
      crop_type_id:  order.crop_type_id,
      address:       formattedAddress,
    },

    // ── Pilot (null when PENDING) ──────────────────────────────────
    pilot: appStatus === 'PENDING' ? null : pilot,

    // ── Payment ───────────────────────────────────────────────────
    payment,

    // ── Service ───────────────────────────────────────────────────
    service,

    // ── Timeline ──────────────────────────────────────────────────
    timeline,

    // ── Usage (running totals while ONGOING, final when COMPLETED) ──
    usage: (appStatus === 'COMPLETED' || appStatus === 'ONGOING') ? usage : null,

    // ── Live snapshot (ONGOING only) ─────────────────────────────
    live_snapshot: liveSnapshot,

    // ── Daily work logs (ONGOING + COMPLETED) ─────────────────────
    daily_work_logs: (appStatus === 'COMPLETED' || appStatus === 'ONGOING') ? daily_work_logs : null,

    // ── Farmer info (for invoice) ─────────────────────────────────
    farmer: {
      name:            farmerName,
      phone:           farmerPhone,
      billing_address: farmerBilling,
    },

    // ── Company info (for invoice footer) ─────────────────────────
    company: {
      support_phone: extras?.company_support_phone ?? process.env.COMPANY_SUPPORT_PHONE ?? null,
      support_email: extras?.company_support_email ?? process.env.COMPANY_SUPPORT_EMAIL ?? null,
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
//  Which bookings belong to the farmer: the ones booked for them (user_id) or by them (created_by).
//
//  This used to also include every account whose mobile number merely ENDED with the farmer's 10 digits. Mobile
//  numbers were not unique and could be changed without proof, so any farmer could see, cancel and reschedule
//  other people's bookings (on the dev database ~15 accounts could see one farmer's orders this way).
// ─────────────────────────────────────────────────────────────────────────────
// is_active: an order an admin deleted (a soft delete) is no longer the farmer's to see or change
const ownedBy = (farmerUserId) => ({
  is_active: true,
  [Op.or]: [{ user_id: farmerUserId }, { created_by: farmerUserId }],
});

const findOwnBooking = (booking_id, farmerUserId) =>
  SprayingOrder.findOne({ where: { booking_id, ...ownedBy(farmerUserId) } });

const STATUS_GROUPS = {
  PENDING:   [OrderStatusEnum.ORDER_PLACED, OrderStatusEnum.WAITING_FOR_CONFIRMATION],
  UPCOMING:  [OrderStatusEnum.ORDER_ACCEPTED, OrderStatusEnum.ORDER_STARTED],
  ONGOING:   [OrderStatusEnum.JOB_STARTED, OrderStatusEnum.JOB_ENDED],
  COMPLETED: [OrderStatusEnum.ORDER_COMPLETED, OrderStatusEnum.WAITING_FOR_PAYMENT, OrderStatusEnum.PAYMENT_SUCCESSFUL],
  CANCELLED: [OrderStatusEnum.ORDER_CANCELLED, OrderStatusEnum.ORDER_REJECTED],
};
STATUS_GROUPS.ORDER_COMPLETED = STATUS_GROUPS.COMPLETED;

/** rows -> { [row[key]]: row }, keeping the first row per key (callers sort so the first is the one wanted). */
const indexBy = (rows, key) => {
  const map = new Map();
  for (const row of rows) if (!map.has(row[key])) map.set(row[key], row);
  return map;
};
const groupBy = (rows, key) => {
  const map = new Map();
  for (const row of rows) (map.get(row[key]) || map.set(row[key], []).get(row[key])).push(row);
  return map;
};

// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/farmer/bookings?status=UPCOMING&page=1&limit=10
//
//  Returns a paginated list of bookings for the authenticated farmer.
//  `status` must be one of: PENDING | UPCOMING | ONGOING | COMPLETED | CANCELLED
//  Card-level fields only (enough to render the list adapter).
//
//  The related rows are loaded for the whole page at once (a fixed ~9 queries per page): it used to be ~8 queries
//  PER booking, with no upper limit on `limit`.
// ═════════════════════════════════════════════════════════════════════════════
export const getFarmerBookings = async (req, res) => {
  try {
    const farmer_user_id = req.user?.id;
    if (!farmer_user_id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { status, page, limit } = req.valid.query;   // limit is capped at 50 (validation/farmer.schemas.js)
    const offset = (page - 1) * limit;

    const whereClause = ownedBy(farmer_user_id);
    if (status && STATUS_GROUPS[status]) {
      whereClause.order_status = { [Op.in]: STATUS_GROUPS[status] };
    }

    const { count, rows: orders } = await SprayingOrder.findAndCountAll({
      where: whereClause,
      order: [['created_on', 'DESC']],
      limit,
      offset,
    });

    const bookingIds = orders.map((o) => o.booking_id);
    const cropIds = [...new Set(orders.map((o) => o.crop_type_id).filter(Boolean))];
    const none = Promise.resolve([]);

    const [extrasRows, assigneeRows, addressRows, cropRows, logRows, timelineRows] = bookingIds.length
      ? await Promise.all([
          SprayingOrderExtras.findAll({ where: { booking_id: bookingIds } }),
          SprayingWorkAssignee.findAll({ where: { booking_id: bookingIds }, order: [['created_on', 'DESC']] }),
          SprayingOrderAddress.findAll({ where: { order_id: bookingIds }, order: [['id', 'ASC']] }),
          cropIds.length ? MasterCrop.findAll({ where: { id: cropIds } }) : none,
          SprayingDailyLogs.findAll({
            where: { spraying_work_id: bookingIds, is_active: true },
            attributes: ['id', 'spraying_work_id', 'working_date', 'verification_comment', 'is_pilot_confirmed'],
            order: [['working_date', 'ASC']],
          }),
          SprayingOrderTimeline.findAll({
            where: { booking_id: bookingIds },
            attributes: ['booking_id', 'created_on'],
            order: [['created_on', 'DESC']],
          }),
        ])
      : [[], [], [], [], [], []];

    const extrasById = indexBy(extrasRows, 'booking_id');
    const assigneeById = indexBy(assigneeRows, 'booking_id');      // newest first -> latest assignee
    const addressById = indexBy(addressRows, 'order_id');
    const cropById = indexBy(cropRows, 'id');
    const logsById = groupBy(logRows, 'spraying_work_id');
    const lastEventById = indexBy(timelineRows, 'booking_id');      // newest first -> last status change

    const pilotIds = [...new Set([...assigneeById.values()].map((a) => a.pilot_user_id).filter(Boolean))];
    const droneIds = [...new Set([...assigneeById.values()].filter((a) => a.pilot_user_id && a.drone_id).map((a) => a.drone_id))];
    const [pilotProfiles, drones] = await Promise.all([
      pilotIds.length ? UserProfile.findAll({ where: { user_id: pilotIds } }) : none,
      droneIds.length ? Drone1.findAll({ where: { id: droneIds } }) : none,
    ]);
    const profileByUser = indexBy(pilotProfiles, 'user_id');
    const droneById = indexBy(drones, 'id');

    const cards = orders.map((order) => {
      const bookingId = order.booking_id;
      const appStatus = toAppStatus(order.order_status);
      const extras = extrasById.get(bookingId);
      const assignee = assigneeById.get(bookingId);
      const address = addressById.get(bookingId);
      const crop = cropById.get(order.crop_type_id);
      const cardLogs = logsById.get(bookingId) || [];
      const lastEvent = lastEventById.get(bookingId);

      const cardStart = cardLogs.length ? toYMD(cardLogs[0].working_date) : (order.start_date ? toYMD(order.start_date) : null);
      const cardEnd   = cardLogs.length ? toYMD(cardLogs[cardLogs.length - 1].working_date) : (order.end_date ? toYMD(order.end_date) : null);
      const cardTotal = cardLogs.length || order.num_of_days || 1;
      const cardDone  = cardLogs.filter(l => getDayStatus(l) === 'completed').length;

      // Pilot name
      let pilotName = 'To be assigned';
      let droneName = null;
      if (assignee?.pilot_user_id) {
        const pProfile = profileByUser.get(assignee.pilot_user_id);
        pilotName = pProfile
          ? `${pProfile.first_name || ''} ${pProfile.last_name || ''}`.trim()
          : `Pilot #${assignee.pilot_user_id}`;

        if (assignee.drone_id) {
          const drone = droneById.get(assignee.drone_id);
          droneName = drone?.name || drone?.model || null;
        }
      }

      // Location string
      let locationStr = null;
      if (address) {
        const village = address.village || address.address1 || 'Field';
        locationStr = `${village} • ${order.land_in_acers || 0} Acres`;
      }

      const totalPrice = parseFloat(extras?.total_payable ?? order.total_price ?? 0);
      const cropName   = crop?.name || 'Spraying';

      return {
        id:                    bookingId,
        booking_id:            bookingId,
        title:                 extras?.service_title || `${cropName} Spraying`,
        crop_name:             cropName,
        crop_type_id:          order.crop_type_id,
        status:                appStatus,
        order_status:          order.order_status,
        scheduled_date:        fmtDate(cardStart || order.start_date),
        scheduled_time_window: extras?.scheduled_time || null,
        num_of_days:           cardTotal,
        progress: {
          total_days:     cardTotal,
          completed_days: cardDone,
          percentage:     cardTotal > 0 ? Math.round((cardDone / cardTotal) * 100) : 0,
        },
        location:              locationStr,
        total_acres:           order.land_in_acers || 0,
        land_in_acers:         order.land_in_acers || 0,
        pilot_name:            pilotName,
        drone_name:            droneName,
        total_price:           totalPrice,
        total_amount_formatted: `₹${totalPrice.toLocaleString('en-IN')}`,
        is_paid:               order.is_paid || false,
        payment_status:        order.is_paid ? 'Paid' : 'Pending',
        booking_otp:           order.booking_otp || null,
        created_at:            fmtDateTime(order.created_on),
        // when the booking last changed status: shown as "Completed on ..." / "Cancelled on ..."
        status_updated_at:     fmtDateTime(lastEvent?.created_on),
        cancellation_reason:   extras?.cancellation_reason ?? null,
        start_date:            cardStart || order.start_date,
        end_date:              cardEnd || order.end_date,
        address: address ? {
          state: address.state,
          district: address.district,
          block: address.block,
          village: address.village,
          lane1: address.lane1 || address.address1 || null,
          lane2: address.lane2 || address.address2 || null,
          pincode: address.pincode || null,
        } : null,
      };
    });

    return res.status(200).json({
      success: true,
      page,
      limit,
      total: count,
      total_pages: Math.ceil(count / limit),
      data: cards,
    });
  } catch (error) {
    return respondWithError(req, res, error, 'getFarmerBookings');
  }
};

// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/farmer/bookings/:booking_id
//
//  Returns the full detail object for one booking.
//  The `status` field in the response determines which detail screen opens.
// ═════════════════════════════════════════════════════════════════════════════
export const getFarmerBookingDetail = async (req, res) => {
  try {
    const farmer_user_id = req.user?.id;
    if (!farmer_user_id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { booking_id } = req.valid.params;
    const order = await findOwnBooking(booking_id, farmer_user_id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const detail = await buildFullDetail(order);

    return res.status(200).json({ success: true, data: detail });
  } catch (error) {
    return respondWithError(req, res, error, 'getFarmerBookingDetail');
  }
};

// ═════════════════════════════════════════════════════════════════════════════
//  PATCH /api/farmer/bookings/:booking_id/rate
//
//  Farmer submits a 1–5 star rating for a COMPLETED booking.
// ═════════════════════════════════════════════════════════════════════════════
export const rateFarmerBooking = async (req, res) => {
  try {
    const farmer_user_id = req.user?.id;
    if (!farmer_user_id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { booking_id } = req.valid.params;
    const { rating } = req.body;                       // a whole number 1-5 (validation/farmer.schemas.js)

    const order = await findOwnBooking(booking_id, farmer_user_id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Only work that was actually done can be rated (a farmer can change the rating later)
    if (!STATUS_GROUPS.COMPLETED.includes(order.order_status)) {
      return res.status(400).json({ success: false, message: 'Only completed bookings can be rated' });
    }

    const [extras] = await SprayingOrderExtras.findOrCreate({
      where: { booking_id },
      defaults: { booking_id },
    });

    await extras.update({ farmer_rating: rating, modified_by: farmer_user_id, modified_on: new Date() });

    return res.status(200).json({ success: true, message: 'Rating submitted successfully' });
  } catch (error) {
    return respondWithError(req, res, error, 'rateFarmerBooking');
  }
};

// ═════════════════════════════════════════════════════════════════════════════
//  PATCH /api/farmer/bookings/:booking_id/extras  (Admin / pilot use)
//
//  Upsert the SprayingOrderExtras row for a booking.
//  Use this to set payment details, service info, pilot ratings, live snapshot,
//  and post-job usage stats (usage_total_acres_covered, usage_fertilizer_kg,
//  usage_pesticide_ltr, usage_water_ltr).
// ═════════════════════════════════════════════════════════════════════════════
// Columns an admin may NOT set through this endpoint (identity + audit columns).
const EXTRAS_PROTECTED = new Set([
  'booking_id', 'is_active', 'created_on', 'created_by', 'modified_on', 'modified_by', 'createdAt', 'updatedAt',
]);

export const upsertBookingExtras = async (req, res) => {
  try {
    const { booking_id } = req.valid.params;

    const order = await SprayingOrder.findOne({ where: { booking_id } });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Whitelist: only real, editable columns. This also stops a body from overwriting
    // booking_id and re-pointing the extras row at a different booking.
    const editable = Object.keys(SprayingOrderExtras.rawAttributes).filter((k) => !EXTRAS_PROTECTED.has(k));
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const unknown = Object.keys(body).filter((k) => !editable.includes(k));
    if (unknown.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Unknown or protected field(s): ${unknown.join(', ')}`,
        editable_fields: editable,
      });
    }
    if (Object.keys(body).length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update', editable_fields: editable });
    }

    const audit = { modified_by: req.admin?.id ?? null, modified_on: new Date() };

    const [extras, created] = await SprayingOrderExtras.findOrCreate({
      where: { booking_id },
      defaults: { booking_id, ...body, created_by: req.admin?.id ?? null },
    });

    if (!created) {
      await extras.update({ ...body, ...audit });
    }

    return res.status(200).json({
      success: true,
      message: created ? 'Extras created' : 'Extras updated',
      data: extras,
    });
  } catch (error) {
    return respondWithError(req, res, error, 'upsertBookingExtras');
  }
};

// ═════════════════════════════════════════════════════════════════════════════
//  POST /api/farmer/bookings/:booking_id/cancel
//
//  Farmer cancels a PENDING or UPCOMING booking.
//  Body: { cancellation_reason: "Bad Weather" }
// ═════════════════════════════════════════════════════════════════════════════
export const cancelFarmerBooking = async (req, res) => {
  try {
    const farmer_user_id = req.user?.id;
    if (!farmer_user_id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { booking_id } = req.valid.params;
    const { cancellation_reason } = req.body;          // optional, at most 500 characters

    const order = await findOwnBooking(booking_id, farmer_user_id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const cancellableStatuses = [
      OrderStatusEnum.ORDER_PLACED,
      OrderStatusEnum.WAITING_FOR_CONFIRMATION,
      OrderStatusEnum.ORDER_ACCEPTED,
      OrderStatusEnum.ORDER_STARTED,
    ];

    if (!cancellableStatuses.includes(order.order_status)) {
      return res.status(400).json({
        success: false,
        message: 'Only PENDING or UPCOMING bookings can be cancelled by the farmer',
      });
    }

    // Status, timeline, the pilot's days and the reason change together or not at all. The order row is locked and
    // re-read, so a pilot starting a day at the same moment cannot slip through and resurrect a cancelled booking.
    const outcome = await db.sequelize.transaction(async (t) => {
      const locked = await SprayingOrder.findOne({ where: { booking_id }, transaction: t, lock: t.LOCK.UPDATE });
      if (!locked || !cancellableStatuses.includes(locked.order_status)) {
        return { notCancellable: true };
      }

      await updateOrderStatus(booking_id, OrderStatusEnum.ORDER_CANCELLED, cancellation_reason || 'Cancelled by farmer', farmer_user_id, t);

      // Release the drone/pilot: cancelled days must not keep blocking the calendar
      await SprayingDailyLogs.update(
        { is_active: false, modified_on: new Date() },
        { where: { spraying_work_id: booking_id }, transaction: t }
      );

      // Persist cancellation reason in extras
      const [extras] = await SprayingOrderExtras.findOrCreate({
        where: { booking_id },
        defaults: { booking_id },
        transaction: t,
      });
      await extras.update({ cancellation_reason: cancellation_reason || null }, { transaction: t });
      return { ok: true };
    });

    if (outcome.notCancellable) {
      return res.status(409).json({ success: false, message: 'This booking can no longer be cancelled' });
    }

    return res.status(200).json({ success: true, message: 'Booking cancelled successfully' });
  } catch (error) {
    return respondWithError(req, res, error, 'cancelFarmerBooking');
  }
};

// ═════════════════════════════════════════════════════════════════════════════
//  PATCH /api/farmer/bookings/:booking_id/reschedule
//
//  Farmer reschedules an UPCOMING booking.
//  Body: { new_date: "2026-05-28", new_time_window: "10:00 AM - 12:00 PM" }
// ═════════════════════════════════════════════════════════════════════════════
export const rescheduleFarmerBooking = async (req, res) => {
  try {
    const farmer_user_id = req.user?.id;
    if (!farmer_user_id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { booking_id } = req.valid.params;
    // new_date: a calendar date, today or later in India, at most a year ahead; new_time_window: <= 50 characters
    const { new_date: newStart, new_time_window } = req.body;

    const order = await findOwnBooking(booking_id, farmer_user_id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const reschedulableStatuses = [
      OrderStatusEnum.WAITING_FOR_CONFIRMATION,
      OrderStatusEnum.ORDER_ACCEPTED,
      OrderStatusEnum.ORDER_STARTED,
    ];

    if (!reschedulableStatuses.includes(order.order_status)) {
      return res.status(400).json({
        success: false,
        message: 'Only bookings that have not started yet can be rescheduled',
      });
    }

    // Dates, the cleared schedule, the status and the time window change together or not at all
    const result = await db.sequelize.transaction(async (t) => {
      const locked = await SprayingOrder.findOne({ where: { booking_id }, transaction: t, lock: t.LOCK.UPDATE });
      if (!locked || !reschedulableStatuses.includes(locked.order_status)) {
        return { error: { status: 409, message: 'Only bookings that have not started yet can be rescheduled' } };
      }

      const logs = await SprayingDailyLogs.findAll({ where: { spraying_work_id: booking_id, is_active: true }, transaction: t });
      if (logs.some((l) => ['started', 'completed'].includes(getDayStatus(l)))) {
        return { error: { status: 400, message: 'Work has already started on this booking and cannot be rescheduled' } };
      }

      // New window keeps the same number of working days
      const days = Math.max(1, locked.num_of_days || logs.length || 1);
      const newEnd = new Date(newStart);
      newEnd.setUTCDate(newEnd.getUTCDate() + days - 1);

      await locked.update({
        start_date: newStart,
        end_date: newEnd,
        modified_by: farmer_user_id,
        modified_on: new Date(),
      }, { transaction: t });

      // The admin-assigned days no longer match the new dates: clear them so the
      // admin re-assigns, and send the booking back for confirmation.
      if (logs.length > 0) {
        await SprayingDailyLogs.destroy({ where: { spraying_work_id: booking_id }, transaction: t });
        await SprayingWorkAssignee.destroy({ where: { booking_id }, transaction: t });
      }
      if (locked.order_status !== OrderStatusEnum.WAITING_FOR_CONFIRMATION) {
        await updateOrderStatus(
          booking_id,
          OrderStatusEnum.WAITING_FOR_CONFIRMATION,
          `Rescheduled by farmer to ${toYMD(newStart)} - drone and pilot need to be assigned again`,
          farmer_user_id,
          t
        );
      }

      if (new_time_window) {
        const [extras] = await SprayingOrderExtras.findOrCreate({
          where: { booking_id },
          defaults: { booking_id },
          transaction: t,
        });
        await extras.update({ scheduled_time: new_time_window }, { transaction: t });
      }
      return { days, newEnd };
    });

    if (result.error) {
      return res.status(result.error.status).json({ success: false, message: result.error.message });
    }
    const { days, newEnd } = result;

    return res.status(200).json({
      success: true,
      message: 'Booking rescheduled successfully',
      data: {
        start_date: toYMD(newStart),
        end_date: toYMD(newEnd),
        num_of_days: days,
        status: toAppStatus(OrderStatusEnum.WAITING_FOR_CONFIRMATION),
      },
    });
  } catch (error) {
    return respondWithError(req, res, error, 'rescheduleFarmerBooking');
  }
};

// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/farmer/bookings/statuses
//
//  Returns the canonical list of booking status tabs the Android app renders.
//  Allows the UI to build tabs dynamically without hardcoding.
// ═════════════════════════════════════════════════════════════════════════════
export const getBookingStatuses = async (req, res) => {
  return res.status(200).json({
    success: true,
    data: [
      { key: 'PENDING',   label: 'Pending',   order: 1 },
      { key: 'UPCOMING',  label: 'Upcoming',  order: 2 },
      { key: 'ONGOING',   label: 'Ongoing',   order: 3 },
      { key: 'COMPLETED', label: 'Completed', order: 4 },
      { key: 'CANCELLED', label: 'Cancelled', order: 5 },
    ],
  });
};


// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/farmer/bookings/sync-version
//
//  Cheap change detector for the app's Orders screen (it polls this instead of re-downloading the list).
//  Returns an opaque `version` string: it changes whenever anything the booking list shows changes (a new booking,
//  a status change, a pilot/drone assignment, a reschedule, a day being completed or confirmed).
//  Only narrow columns are read, no joins and no related lookups, so a poll costs a handful of tiny indexed queries.
// ═════════════════════════════════════════════════════════════════════════════
export const getBookingsSyncVersion = async (req, res) => {
  try {
    const farmer_user_id = req.user?.id;
    if (!farmer_user_id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const orders = await SprayingOrder.findAll({
      where: ownedBy(farmer_user_id),
      attributes: ['booking_id', 'order_status', 'start_date', 'end_date', 'num_of_days', 'total_price', 'is_paid', 'modified_on'],
      order: [['booking_id', 'ASC']],
      raw: true,
    });

    const hash = createHash('sha1');
    hash.update(JSON.stringify(orders));

    if (orders.length) {
      const bookingIds = orders.map((o) => o.booking_id);
      const [timeline, assignees, logs, extras] = await Promise.all([
        SprayingOrderTimeline.count({ where: { booking_id: bookingIds } }),
        SprayingWorkAssignee.findAll({
          where: { booking_id: bookingIds },
          attributes: ['booking_id', 'pilot_user_id', 'drone_id', 'created_on'],
          order: [['booking_id', 'ASC'], ['created_on', 'ASC']],
          raw: true,
        }),
        SprayingDailyLogs.findAll({
          where: { spraying_work_id: bookingIds },
          attributes: ['id', 'is_active', 'working_date', 'verification_comment', 'is_pilot_confirmed'],
          order: [['id', 'ASC']],
          raw: true,
        }),
        SprayingOrderExtras.findAll({
          where: { booking_id: bookingIds },
          attributes: ['booking_id', 'modified_on', 'cancellation_reason'],
          order: [['booking_id', 'ASC']],
          raw: true,
        }),
      ]);
      hash.update(JSON.stringify([timeline, assignees, logs, extras]));
    }

    res.set('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, version: hash.digest('hex').slice(0, 16) });
  } catch (error) {
    return respondWithError(req, res, error, 'getBookingsSyncVersion');
  }
};
