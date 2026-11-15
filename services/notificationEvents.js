/**
 * The business events that notify people. Each function says WHO is told WHAT and hands it to notifyUsers();
 * the controllers only call these, so the rules live in one place.
 *
 * All of them take the caller's `transaction`: the notification is written together with the change that caused it
 * (see services/notification.service.js) and none of them ever throws.
 */
import db from '../models/index.js';
import logger from '../utils/logger.js';
import { OrderStatusEnum } from '../utils/enums.js';
import { NotificationType as T } from '../utils/notificationTypes.js';
import { toYMD, todayIST, parseDateOnly, getDayStatus } from '../utils/dateUtils.js';
import { notifyUsers } from './notification.service.js';
import { formatDateRange } from './notificationTemplates.js';

const { Op } = db;

const farmerIdOf = (order) => order.user_id || order.created_by || null;

const fullName = (profile) => [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || 'Your pilot';

/** Everything the texts need about a booking, read once. */
const loadContext = async (order, transaction) => {
  const [crop, address, logs] = await Promise.all([
    order.crop_type_id ? db.MasterCrop.findByPk(order.crop_type_id, { attributes: ['name'], transaction }) : null,
    db.SprayingOrderAddress.findOne({ where: { order_id: order.booking_id }, attributes: ['village'], transaction }),
    db.SprayingDailyLogs.findAll({ where: { spraying_work_id: order.booking_id }, order: [['working_date', 'ASC']], transaction }),
  ]);
  const activeLogs = logs.filter((l) => l.is_active);
  const dates = (activeLogs.length ? activeLogs : logs).map((l) => toYMD(l.working_date));
  return {
    logs,
    pilotIds: [...new Set(logs.flatMap((l) => [l.pilot_user_id, l.co_pilot_user_id]).filter(Boolean))],
    vars: {
      booking_id: order.booking_id,
      crop: crop?.name || 'crop',
      acres: Number(order.land_in_acers) || 0,
      village: address?.village || 'your area',
      dates: formatDateRange(dates.length ? dates : [toYMD(order.start_date), toYMD(order.end_date)]),
    },
  };
};

const withoutActor = (ids, actorId) => ids.filter((id) => id && id !== actorId);

/**
 * Called by updateOrderStatus every time an order really changes status. `eventId` (the timeline row) makes the
 * notification unique per status change, so a retried request can never notify twice.
 */
export const onOrderStatusChanged = async ({ order, status, eventId, actorId = null, reason = null, transaction = null }) => {
  try {
    const farmerId = farmerIdOf(order);
    const toFarmer = {
      [OrderStatusEnum.ORDER_ACCEPTED]: T.BOOKING_ACCEPTED,
      [OrderStatusEnum.JOB_STARTED]: T.JOB_STARTED,
      [OrderStatusEnum.JOB_ENDED]: T.DAY_COMPLETED,
      [OrderStatusEnum.ORDER_COMPLETED]: T.JOB_COMPLETED,
      [OrderStatusEnum.ORDER_CANCELLED]: T.BOOKING_CANCELLED,
      [OrderStatusEnum.ORDER_REJECTED]: T.BOOKING_CANCELLED,
    }[status];
    const cancelled = status === OrderStatusEnum.ORDER_CANCELLED || status === OrderStatusEnum.ORDER_REJECTED;
    if (!toFarmer) return;

    const ctx = await loadContext(order, transaction);
    const key = (type) => `${type}:${eventId || `${order.booking_id}:${status}`}`;

    // Never tell people about what they just did themselves
    if (farmerId && farmerId !== actorId) {
      await notifyUsers({ userIds: [farmerId], type: toFarmer, vars: { ...ctx.vars, reason }, dedupeKey: key(toFarmer), transaction });
    }
    if (cancelled) {
      await notifyUsers({ userIds: withoutActor(ctx.pilotIds, actorId), type: T.WORK_CANCELLED, vars: ctx.vars, dedupeKey: key(T.WORK_CANCELLED), transaction });
    }
  } catch (err) {
    logger.error(`[notifications] onOrderStatusChanged failed: ${err.message}`);
  }
};

/** An admin booked on the farmer's behalf. */
export const onBookingCreatedByAdmin = async ({ order, actorId, transaction }) => {
  try {
    const farmerId = farmerIdOf(order);
    if (!farmerId || farmerId === actorId) return;
    const ctx = await loadContext(order, transaction);
    await notifyUsers({ userIds: [farmerId], type: T.BOOKING_CONFIRMED, vars: ctx.vars, dedupeKey: `${T.BOOKING_CONFIRMED}:${order.booking_id}`, transaction });
  } catch (err) {
    logger.error(`[notifications] onBookingCreatedByAdmin failed: ${err.message}`);
  }
};

/** The admin assigned work: the pilot(s) get the new days, the farmer learns who is coming. */
export const onWorkAssigned = async ({ order, pilotId, coPilotId = null, newDates = [], actorId = null, transaction }) => {
  try {
    if (!newDates.length) return;
    const ctx = await loadContext(order, transaction);
    const dates = formatDateRange(newDates);
    const dayKey = [...newDates].sort().join(',');

    const crew = withoutActor([pilotId, coPilotId], actorId);
    await notifyUsers({
      userIds: crew, type: T.WORK_ASSIGNED, vars: { ...ctx.vars, dates },
      dedupeKey: `${T.WORK_ASSIGNED}:${order.booking_id}:${dayKey}`, transaction,
    });

    const farmerId = farmerIdOf(order);
    if (farmerId && farmerId !== actorId) {
      const profile = await db.UserProfile.findOne({ where: { user_id: pilotId }, attributes: ['first_name', 'last_name'], transaction });
      await notifyUsers({
        userIds: [farmerId], type: T.PILOT_ASSIGNED, vars: { ...ctx.vars, dates, pilot_name: fullName(profile) },
        dedupeKey: `${T.PILOT_ASSIGNED}:${order.booking_id}:${pilotId}:${dayKey}`, transaction,
      });
    }
  } catch (err) {
    logger.error(`[notifications] onWorkAssigned failed: ${err.message}`);
  }
};

/** The farmer rescheduled: the work was released, so the pilots are told they are off the booking. */
export const onWorkUnassigned = async ({ order, pilotIds, actorId = null, transaction }) => {
  try {
    const recipients = withoutActor([...new Set(pilotIds)], actorId);
    if (!recipients.length) return;
    await notifyUsers({
      userIds: recipients, type: T.WORK_UNASSIGNED, vars: { booking_id: order.booking_id },
      dedupeKey: `${T.WORK_UNASSIGNED}:${order.booking_id}:${new Date(order.start_date).getTime()}`, transaction,
    });
  } catch (err) {
    logger.error(`[notifications] onWorkUnassigned failed: ${err.message}`);
  }
};

/**
 * The 07:00 (India) reminder: every pilot with a working day today that is not finished gets one notification
 * per booking. The dedupe key includes the date, so running it twice (two instances, a restart) sends it once.
 */
export const sendWorkTodayReminders = async () => {
  const today = todayIST();
  const logs = await db.SprayingDailyLogs.findAll({
    where: { working_date: parseDateOnly(today), is_active: true, pilot_user_id: { [Op.ne]: null } },
  });
  let sent = 0;
  for (const log of logs) {
    const status = getDayStatus(log);
    if (!['scheduled', 'confirmed'].includes(status)) continue;
    const order = await db.SprayingOrder.findByPk(log.spraying_work_id);
    if (!order || [OrderStatusEnum.ORDER_CANCELLED, OrderStatusEnum.ORDER_REJECTED, OrderStatusEnum.ORDER_COMPLETED].includes(order.order_status)) continue;
    const ctx = await loadContext(order, null);
    sent += await notifyUsers({
      userIds: [log.pilot_user_id], type: T.WORK_TODAY,
      vars: { ...ctx.vars, needs_accept: status === 'scheduled' },
      dedupeKey: `${T.WORK_TODAY}:${log.id}:${today}`,
    });
  }
  return sent;
};
