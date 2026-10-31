/**
 * The delivery worker: takes `pending` rows from NOTIFICATION_DELIVERY, sends them through the push provider and
 * records what happened.
 *
 * Safe with any number of instances: rows are claimed with `FOR UPDATE SKIP LOCKED`, so two workers never take the
 * same row, and a claim carries a lease (locked_until) so a worker that crashes mid-send does not strand its rows -
 * after the lease expires another worker picks them up.
 *
 * Outcomes per message:
 *   sent           FCM accepted it
 *   invalid_token  FCM says the device is gone: the delivery is closed and the DEVICE_TOKEN is switched off
 *   pending again  transient error (FCM/network hiccup): retried with exponential backoff
 *   failed         retries used up, or an error retrying cannot fix (bad payload / credentials)
 *   expired        the notification passed its expires_at before it could be sent (stale reminder): dropped
 */
import db from '../models/index.js';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { getPushProvider } from './push/index.js';
import { buildMessage, classifyFcmError, backoffSeconds } from './push/message.js';

const LEASE_SECONDS = 120;
const MAX_BATCHES_PER_RUN = 10;

let running = false;
let kickTimer = null;

/** Claims up to `limit` due rows and returns their ids. Attempts are counted at claim time, so a crash also uses one up. */
const claim = async (limit) => {
  const [rows] = await db.sequelize.query(
    `UPDATE "NOTIFICATION_DELIVERY" d
        SET status = 'sending',
            attempts = d.attempts + 1,
            locked_until = now() + (:lease || ' seconds')::interval,
            modified_on = now()
      WHERE d.id IN (
        SELECT id FROM "NOTIFICATION_DELIVERY"
         WHERE (status = 'pending' AND next_attempt_at <= now())
            OR (status = 'sending' AND locked_until < now())
         ORDER BY next_attempt_at, id
         LIMIT :limit
         FOR UPDATE SKIP LOCKED)
      RETURNING d.id`,
    { replacements: { limit, lease: String(LEASE_SECONDS) } },
  );
  return rows.map((r) => r.id);
};

const finish = (delivery, fields) => delivery.update({ ...fields, locked_until: null, modified_on: new Date() });

/** Sends one claimed batch. Returns how many rows it handled. */
const sendBatch = async (ids, provider) => {
  const deliveries = await db.NotificationDelivery.findAll({
    where: { id: ids },
    include: [{ model: db.Notification, as: 'notification' }, { model: db.DeviceToken, as: 'device' }],
  });

  const toSend = [];
  const now = new Date();
  for (const d of deliveries) {
    if (!d.notification || !d.device) { await finish(d, { status: 'failed', error_code: 'missing-record' }); continue; }
    if (d.notification.expires_at && new Date(d.notification.expires_at) < now) { await finish(d, { status: 'expired' }); continue; }
    if (!d.device.is_active) { await finish(d, { status: 'invalid_token', error_code: 'device-inactive' }); continue; }
    toSend.push(d);
  }
  if (!toSend.length) return deliveries.length;

  let results;
  try {
    results = await provider.send(toSend.map((d) => buildMessage(d.notification, d.device, now)));
  } catch (err) {
    // The whole call failed (network down, key missing): every row in the batch is retried later with backoff
    logger.error(`[push] batch of ${toSend.length} failed: ${err.code || ''} ${err.message}`);
    results = toSend.map(() => ({ ok: false, errorCode: err.code || 'app/network-error', errorMessage: err.message }));
  }

  for (let i = 0; i < toSend.length; i += 1) {
    const d = toSend[i];
    const r = results[i] || { ok: false, errorCode: 'messaging/unknown-error' };
    if (r.ok) {
      await finish(d, { status: 'sent', sent_at: new Date(), fcm_message_id: r.messageId || null, error_code: null, error_message: null });
      continue;
    }

    const { kind } = classifyFcmError(r.errorCode, r.errorMessage);
    const error = { error_code: String(r.errorCode || '').slice(0, 80), error_message: String(r.errorMessage || '').slice(0, 500) };

    if (kind === 'invalid_token') {
      await finish(d, { status: 'invalid_token', ...error });
      await d.device.update({ is_active: false, last_failure_at: new Date(), last_failure_reason: error.error_code, modified_on: new Date() });
    } else if (kind === 'retry' && d.attempts < env.NOTIFICATIONS.maxAttempts) {
      await finish(d, { status: 'pending', next_attempt_at: new Date(Date.now() + backoffSeconds(d.attempts) * 1000), ...error });
    } else {
      await finish(d, { status: 'failed', ...error });
      await d.device.increment('failure_count');
    }
  }
  return deliveries.length;
};

/** Sends everything that is due (in batches). Returns the number of deliveries handled. */
export const processPendingDeliveries = async () => {
  const provider = getPushProvider();
  if (!provider || running) return 0;
  running = true;
  let handled = 0;
  try {
    for (let i = 0; i < MAX_BATCHES_PER_RUN; i += 1) {
      const ids = await claim(env.NOTIFICATIONS.batchSize);
      if (!ids.length) break;
      handled += await sendBatch(ids, provider);
      if (ids.length < env.NOTIFICATIONS.batchSize) break;
    }
  } catch (err) {
    logger.error(`[push] worker run failed: ${err.message}`);
  } finally {
    running = false;
  }
  return handled;
};

/** "Something was just queued": run soon, merging several kicks into one run. */
export const kickDispatcher = () => {
  if (kickTimer) return;
  kickTimer = setTimeout(() => { kickTimer = null; processPendingDeliveries(); }, 150);
  kickTimer.unref?.();
};

let pollTimer = null;
/** The safety net: also runs every few seconds, which retries backed-off rows and recovers from missed kicks. */
export const startDispatcher = () => {
  if (pollTimer || !env.NOTIFICATIONS.workerEnabled || !getPushProvider()) return false;
  pollTimer = setInterval(processPendingDeliveries, env.NOTIFICATIONS.pollSeconds * 1000);
  pollTimer.unref?.();
  logger.info(`[push] delivery worker started (provider: ${getPushProvider().name}, every ${env.NOTIFICATIONS.pollSeconds}s)`);
  return true;
};

export const stopDispatcher = () => {
  if (pollTimer) clearInterval(pollTimer);
  if (kickTimer) clearTimeout(kickTimer);
  pollTimer = kickTimer = null;
};
