/**
 * Creating notifications. This is the only entry point the rest of the backend uses:
 *
 *     await notifyUsers({ userIds, type: NotificationType.PILOT_ASSIGNED, vars: {...}, transaction: t });
 *
 * What it does, in the caller's transaction:
 *   1. renders the text in each person's language,
 *   2. writes the inbox row (NOTIFICATION) - always, so the in-app list is complete even if push is muted/off,
 *   3. writes one outbox row (NOTIFICATION_DELIVERY) per active device, unless the person muted the category,
 *   4. after the transaction commits, wakes the delivery worker so the push goes out within moments.
 * Because 2-3 are in the caller's transaction, a notification exists if and only if the change that caused it was
 * committed (transactional outbox). A failure here is contained in a savepoint and never breaks the business action.
 */
import db from '../models/index.js';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { renderNotification, DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './notificationTemplates.js';
import { isPushEnabled } from './push/index.js';
import { kickDispatcher } from './notificationDispatcher.js';

/** Language of a person: the locale their newest active device reported (falls back to English). */
const languageOf = (devices) => {
  const newest = [...devices].sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at))[0];
  const code = String(newest?.locale || '').slice(0, 2).toLowerCase();
  return SUPPORTED_LANGUAGES.includes(code) ? code : DEFAULT_LANGUAGE;
};

const createForUsers = async ({ userIds, type, vars, dedupeKey, transaction }) => {
  const ids = [...new Set(userIds.filter((id) => Number.isInteger(Number(id))).map(Number))];
  if (!ids.length) return [];

  const [devices, muted] = await Promise.all([
    db.DeviceToken.findAll({ where: { user_id: ids, is_active: true }, transaction, raw: true }),
    db.NotificationPreference.findAll({ where: { user_id: ids, push_enabled: false }, transaction, raw: true }),
  ]);
  const devicesByUser = new Map();
  for (const d of devices) (devicesByUser.get(d.user_id) || devicesByUser.set(d.user_id, []).get(d.user_id)).push(d);
  const mutedBy = new Map();
  for (const m of muted) (mutedBy.get(m.user_id) || mutedBy.set(m.user_id, new Set()).get(m.user_id)).add(m.category);

  const created = [];
  const deliveries = [];
  for (const userId of ids) {
    const userDevices = devicesByUser.get(userId) || [];
    const rendered = renderNotification(type, vars, languageOf(userDevices));
    const row = {
      user_id: userId,
      type,
      category: rendered.category,
      title: rendered.title,
      body: rendered.body,
      data: rendered.data,
      priority: rendered.priority,
      dedupe_key: dedupeKey ? `${dedupeKey}`.slice(0, 160) : null,
      expires_at: new Date(Date.now() + rendered.ttlHours * 3600 * 1000),
    };

    let notification;
    if (row.dedupe_key) {
      // The same event must not notify the same person twice (a retried request, a cron that runs again)
      const [found, wasCreated] = await db.Notification.findOrCreate({
        where: { user_id: userId, dedupe_key: row.dedupe_key }, defaults: row, transaction,
      });
      if (!wasCreated) continue;
      notification = found;
    } else {
      notification = await db.Notification.create(row, { transaction });
    }
    created.push(notification);

    const wantsPush = rendered.critical || !mutedBy.get(userId)?.has(rendered.category);
    if (wantsPush) {
      for (const device of userDevices) deliveries.push({ notification_id: notification.id, device_token_id: device.id });
    }
  }

  if (deliveries.length && isPushEnabled()) {
    await db.NotificationDelivery.bulkCreate(deliveries, { transaction, ignoreDuplicates: true });
  }
  return { created, queued: isPushEnabled() ? deliveries.length : 0 };
};

/**
 * Notifies people. Never throws: a notification problem is logged and the caller carries on.
 * @param {{ userIds: number[], type: string, vars?: object, dedupeKey?: string, transaction?: import('sequelize').Transaction }} args
 */
export const notifyUsers = async ({ userIds, type, vars = {}, dedupeKey = null, transaction = null }) => {
  try {
    // A savepoint inside the caller's transaction: if anything below fails, only the notification work is undone.
    // (A failed statement would otherwise poison the whole PostgreSQL transaction.)
    const result = await db.sequelize.transaction({ transaction }, (t) =>
      createForUsers({ userIds, type, vars, dedupeKey: dedupeKey, transaction: t }));

    if (result.queued > 0 && env.NOTIFICATIONS.workerEnabled) {
      if (transaction) transaction.afterCommit(() => kickDispatcher());
      else kickDispatcher();
    }
    return result.created?.length ?? 0;
  } catch (err) {
    logger.error(`[notifications] could not create ${type} notification: ${err.message}`);
    return 0;
  }
};
