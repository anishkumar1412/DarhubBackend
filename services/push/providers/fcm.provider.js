/**
 * Firebase Cloud Messaging through the Admin SDK (HTTP v1 API under the hood).
 *
 * Credentials: a service-account key from Firebase console -> Project settings -> Service accounts, given as
 *   FCM_SERVICE_ACCOUNT_JSON  the JSON itself, or the same JSON base64-encoded (convenient for hosting dashboards)
 *   FCM_SERVICE_ACCOUNT_FILE  path to the JSON file (also read from GOOGLE_APPLICATION_CREDENTIALS)
 * The key is a secret: keep it out of git and out of the apps.
 */
import fs from 'node:fs';
import env from '../../../config/env.js';
import logger from '../../../utils/logger.js';

let messagingPromise = null;

const readServiceAccount = () => {
  let raw = env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw && env.FCM_SERVICE_ACCOUNT_FILE) raw = fs.readFileSync(env.FCM_SERVICE_ACCOUNT_FILE, 'utf8');
  if (!raw) throw new Error('FCM is not configured: set FCM_SERVICE_ACCOUNT_JSON or FCM_SERVICE_ACCOUNT_FILE');
  raw = raw.trim();
  if (!raw.startsWith('{')) raw = Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(raw);
};

/** Initialised once, on first use (so development without a key never loads the SDK). */
const getMessaging = () => {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const { initializeApp, cert } = await import('firebase-admin/app');
      const { getMessaging: messagingOf } = await import('firebase-admin/messaging');
      const account = readServiceAccount();
      const app = initializeApp({ credential: cert(account) }, 'darhub-push');
      logger.info(`[push:fcm] connected to Firebase project "${account.project_id}"`);
      return messagingOf(app);
    })().catch((err) => {
      messagingPromise = null;                    // let the next attempt try again (a fixed config needs no restart)
      throw err;
    });
  }
  return messagingPromise;
};

export const fcmProvider = {
  name: 'fcm',
  /** Sends up to 500 messages in one call; returns one result per message, in order. */
  async send(messages) {
    const messaging = await getMessaging();
    const batch = await messaging.sendEach(messages);
    return batch.responses.map((r) => (r.success
      ? { ok: true, messageId: r.messageId }
      : { ok: false, errorCode: r.error?.code || 'messaging/unknown-error', errorMessage: String(r.error?.message || '').slice(0, 500) }));
  },
};
