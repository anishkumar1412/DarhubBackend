import { Op } from 'sequelize';
import db from '../models/index.js';
import { OrderStatusEnum } from '../utils/enums.js';

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

  const [profile, user, drone] = await Promise.all([
    UserProfile.findOne({ where: { user_id: assignee.pilot_user_id } }),
    User.findOne({ where: { id: assignee.pilot_user_id } }),
    assignee.drone_id ? Drone1.findOne({ where: { id: assignee.drone_id } }) : Promise.resolve(null),
  ]);

  const name = profile
    ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
    : `Pilot #${assignee.pilot_user_id}`;

  return {
    pilot_id: assignee.pilot_user_id,
    name,
    phone_number: user?.mobile_number || null,
    rating: extras?.pilot_rating ?? null,
    review_count: extras?.pilot_review_count ?? null,
    experience_years: extras?.pilot_experience_years ?? null,
    drone_name: drone?.name || drone?.model || null,
    eta_minutes: extras?.pilot_eta_minutes ?? null,
    distance_km: extras?.pilot_distance_km ?? null,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
//  HELPER: aggregate usage stats for COMPLETED jobs.
//  Priority: explicit extras.usage_* columns → fallback: parse daily logs JSON
// ─────────────────────────────────────────────────────────────────────────────
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

  // ── Fallback: aggregate from SprayingDailyLogs.verification_comment ──
  let totalCoveredAcres = 0;
  let totalFertilizer = 0;
  let totalPesticide = 0;
  let totalWater = 0;

  for (const log of dailyLogs) {
    try {
      const data = log.verification_comment ? JSON.parse(log.verification_comment) : {};
      totalCoveredAcres += parseFloat(data.completed_acres || 0);
      totalFertilizer   += parseFloat(data.fertilizer_used || 0);
      totalPesticide    += parseFloat(data.pesticide_used  || 0);
      totalWater        += parseFloat(data.water_used      || 0);
    } catch { /* malformed JSON — skip */ }
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
      let completed_acres = 0;
      try {
        const data = log.verification_comment ? JSON.parse(log.verification_comment) : {};
        completed_acres = parseFloat(data.completed_acres || 0);
      } catch { /* skip */ }

      return {
        day_number:       idx + 1,
        date:             fmtDate(log.working_date),
        acres_completed:  completed_acres,
      };
    });
};

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
      where: { spraying_work_id: bookingId },
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

  // Scheduled date / time
  const scheduledDate   = fmtDate(order.start_date);
  const scheduledWindow = extras?.scheduled_time || null;

  // pilot_assignment_status / drone_assignment_status (PENDING only)
  const pilotAssignmentStatus = appStatus === 'PENDING' ? 'Searching for Pilot...' : null;
  const droneAssignmentStatus = appStatus === 'PENDING' ? 'Drone will be assigned soon' : null;

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
    start_date:              order.start_date,
    end_date:                order.end_date,
    num_of_days:             order.num_of_days || 1,
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

    // ── Usage (COMPLETED only — 0s otherwise) ────────────────────
    usage: appStatus === 'COMPLETED' ? usage : null,

    // ── Live snapshot (ONGOING only) ─────────────────────────────
    live_snapshot: liveSnapshot,

    // ── Daily work logs (COMPLETED only) ─────────────────────────
    daily_work_logs: appStatus === 'COMPLETED' ? daily_work_logs : null,

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
//  HELPER: retrieve all user IDs associated with this farmer (e.g. by mobile number)
//  Guarantees farmer sees all bookings associated with their account/phone number
//  while strictly preventing access to any other farmer's bookings.
// ─────────────────────────────────────────────────────────────────────────────
const getFarmerUserIds = async (farmer_user_id) => {
  const ids = [farmer_user_id];
  try {
    const farmerUser = await User.findByPk(farmer_user_id);
    if (farmerUser?.mobile_number) {
      const cleanMobile = farmerUser.mobile_number.toString().replace(/\D/g, '').slice(-10);
      if (cleanMobile) {
        const matched = await User.findAll({
          where: {
            mobile_number: { [Op.like]: `%${cleanMobile}` },
          },
          attributes: ['id'],
        });
        matched.forEach((u) => {
          if (!ids.includes(u.id)) ids.push(u.id);
        });
      }
    }
  } catch (err) {
    console.error('getFarmerUserIds error:', err);
  }
  return ids;
};

// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/farmer/bookings?status=UPCOMING&page=1&limit=10
//
//  Returns a paginated list of bookings for the authenticated farmer.
//  `status` must be one of: PENDING | UPCOMING | ONGOING | COMPLETED | CANCELLED
//  Card-level fields only (enough to render the list adapter).
// ═════════════════════════════════════════════════════════════════════════════
export const getFarmerBookings = async (req, res) => {
  try {
    const farmer_user_id = req.user?.id;
    if (!farmer_user_id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { status } = req.query;
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);
    const offset = (page - 1) * limit;

    const statusMap = {
      PENDING:   [OrderStatusEnum.ORDER_PLACED, OrderStatusEnum.WAITING_FOR_CONFIRMATION],
      UPCOMING:  [OrderStatusEnum.ORDER_ACCEPTED, OrderStatusEnum.ORDER_STARTED],
      ONGOING:   [OrderStatusEnum.JOB_STARTED, OrderStatusEnum.JOB_ENDED],
      COMPLETED: [OrderStatusEnum.ORDER_COMPLETED, OrderStatusEnum.WAITING_FOR_PAYMENT, OrderStatusEnum.PAYMENT_SUCCESSFUL],
      ORDER_COMPLETED: [OrderStatusEnum.ORDER_COMPLETED, OrderStatusEnum.WAITING_FOR_PAYMENT, OrderStatusEnum.PAYMENT_SUCCESSFUL],
      CANCELLED: [OrderStatusEnum.ORDER_CANCELLED, OrderStatusEnum.ORDER_REJECTED],
    };

    const farmerUserIds = await getFarmerUserIds(farmer_user_id);

    const whereClause = {
      [Op.or]: [
        { user_id: { [Op.in]: farmerUserIds } },
        { created_by: { [Op.in]: farmerUserIds } },
      ],
    };

    if (status && statusMap[status.toUpperCase()]) {
      whereClause.order_status = { [Op.in]: statusMap[status.toUpperCase()] };
    }

    const { count, rows: orders } = await SprayingOrder.findAndCountAll({
      where: whereClause,
      order: [['created_on', 'DESC']],
      limit,
      offset,
    });

    const cards = await Promise.all(
      orders.map(async (order) => {
        const bookingId = order.booking_id;
        const appStatus = toAppStatus(order.order_status);

        // Parallel fetch of only what's needed for the list card
        const [extras, assignee, address, crop] = await Promise.all([
          SprayingOrderExtras.findOne({ where: { booking_id: bookingId } }),
          SprayingWorkAssignee.findOne({
            where: { booking_id: bookingId },
            order: [['created_on', 'DESC']],
          }),
          SprayingOrderAddress.findOne({ where: { order_id: bookingId } }),
          order.crop_type_id
            ? MasterCrop.findOne({ where: { id: order.crop_type_id } })
            : Promise.resolve(null),
        ]);

        // Pilot name
        let pilotName = 'To be assigned';
        let droneName = null;
        if (assignee?.pilot_user_id) {
          const pProfile = await UserProfile.findOne({ where: { user_id: assignee.pilot_user_id } });
          pilotName = pProfile
            ? `${pProfile.first_name || ''} ${pProfile.last_name || ''}`.trim()
            : `Pilot #${assignee.pilot_user_id}`;

          if (assignee.drone_id) {
            const drone = await Drone1.findOne({ where: { id: assignee.drone_id } });
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
          scheduled_date:        fmtDate(order.start_date),
          scheduled_time_window: extras?.scheduled_time || null,
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
          start_date:            order.start_date,
          end_date:              order.end_date,
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
      })
    );

    return res.status(200).json({
      success: true,
      page,
      limit,
      total: count,
      total_pages: Math.ceil(count / limit),
      data: cards,
    });
  } catch (error) {
    console.error('getFarmerBookings error:', error);
    return res.status(500).json({ success: false, error: error.message });
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

    const { booking_id } = req.params;
    if (!booking_id) {
      return res.status(400).json({ success: false, message: 'booking_id is required' });
    }

    const farmerUserIds = await getFarmerUserIds(farmer_user_id);

    const order = await SprayingOrder.findOne({
      where: {
        booking_id,
        [Op.or]: [
          { user_id: { [Op.in]: farmerUserIds } },
          { created_by: { [Op.in]: farmerUserIds } },
        ],
      },
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const detail = await buildFullDetail(order);

    return res.status(200).json({ success: true, data: detail });
  } catch (error) {
    console.error('getFarmerBookingDetail error:', error);
    return res.status(500).json({ success: false, error: error.message });
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

    const { booking_id } = req.params;
    const { rating } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    const farmerUserIds = await getFarmerUserIds(farmer_user_id);

    const order = await SprayingOrder.findOne({
      where: {
        booking_id,
        [Op.or]: [
          { user_id: { [Op.in]: farmerUserIds } },
          { created_by: { [Op.in]: farmerUserIds } },
        ],
      },
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const [extras] = await SprayingOrderExtras.findOrCreate({
      where: { booking_id },
      defaults: { booking_id },
    });

    await extras.update({ farmer_rating: rating });

    return res.status(200).json({ success: true, message: 'Rating submitted successfully' });
  } catch (error) {
    console.error('rateFarmerBooking error:', error);
    return res.status(500).json({ success: false, error: error.message });
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
export const upsertBookingExtras = async (req, res) => {
  try {
    const { booking_id } = req.params;
    if (!booking_id) {
      return res.status(400).json({ success: false, message: 'booking_id is required' });
    }

    const order = await SprayingOrder.findByPk(booking_id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const [extras, created] = await SprayingOrderExtras.findOrCreate({
      where: { booking_id },
      defaults: { booking_id, ...req.body },
    });

    if (!created) {
      await extras.update(req.body);
    }

    return res.status(200).json({
      success: true,
      message: created ? 'Extras created' : 'Extras updated',
      data: extras,
    });
  } catch (error) {
    console.error('upsertBookingExtras error:', error);
    return res.status(500).json({ success: false, error: error.message });
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

    const { booking_id } = req.params;
    const { cancellation_reason } = req.body;

    const farmerUserIds = await getFarmerUserIds(farmer_user_id);

    const order = await SprayingOrder.findOne({
      where: {
        booking_id,
        [Op.or]: [
          { user_id: { [Op.in]: farmerUserIds } },
          { created_by: { [Op.in]: farmerUserIds } },
        ],
      },
    });

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

    // Update order status
    await order.update({ order_status: OrderStatusEnum.ORDER_CANCELLED });

    // Record timeline event
    await SprayingOrderTimeline.create({
      booking_id,
      order_status: OrderStatusEnum.ORDER_CANCELLED,
      remarks: cancellation_reason || 'Cancelled by farmer',
      created_by: farmer_user_id,
      created_on: new Date(),
    });

    // Persist cancellation reason in extras
    const [extras] = await SprayingOrderExtras.findOrCreate({
      where: { booking_id },
      defaults: { booking_id },
    });
    await extras.update({ cancellation_reason: cancellation_reason || null });

    return res.status(200).json({ success: true, message: 'Booking cancelled successfully' });
  } catch (error) {
    console.error('cancelFarmerBooking error:', error);
    return res.status(500).json({ success: false, error: error.message });
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

    const { booking_id } = req.params;
    const { new_date, new_time_window } = req.body;

    if (!new_date) {
      return res.status(400).json({ success: false, message: 'new_date is required' });
    }

    const farmerUserIds = await getFarmerUserIds(farmer_user_id);

    const order = await SprayingOrder.findOne({
      where: {
        booking_id,
        [Op.or]: [
          { user_id: { [Op.in]: farmerUserIds } },
          { created_by: { [Op.in]: farmerUserIds } },
        ],
      },
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const reschedulableStatuses = [
      OrderStatusEnum.ORDER_ACCEPTED,
      OrderStatusEnum.ORDER_STARTED,
    ];

    if (!reschedulableStatuses.includes(order.order_status)) {
      return res.status(400).json({
        success: false,
        message: 'Only UPCOMING bookings can be rescheduled',
      });
    }

    await order.update({
      start_date: new Date(new_date),
      modified_by: farmer_user_id,
      modified_on: new Date(),
    });

    if (new_time_window) {
      const [extras] = await SprayingOrderExtras.findOrCreate({
        where: { booking_id },
        defaults: { booking_id },
      });
      await extras.update({ scheduled_time: new_time_window });
    }

    return res.status(200).json({ success: true, message: 'Booking rescheduled successfully' });
  } catch (error) {
    console.error('rescheduleFarmerBooking error:', error);
    return res.status(500).json({ success: false, error: error.message });
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
