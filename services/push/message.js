/**
 * Turns an inbox row + a device into the message FCM receives, and turns FCM errors into decisions.
 * Pure functions (no database, no network): everything here is covered by tests/notifications.test.js.
 */

/** Android notification channels the apps create at start-up (one per category, so users can tune them in Settings). */
export const ANDROID_CHANNELS = {
  booking: 'darhub_booking',
  work: 'darhub_work',
  system: 'darhub_system',
};

/** Intent action both apps declare on MainActivity: tapping a notification shown by the system while the app is closed opens it with the `data` as extras. */
export const CLICK_ACTION = 'com.darhub.action.OPEN_NOTIFICATION';

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;       // FCM keeps an undelivered push this long when the phone is off
const MAX_TTL_SECONDS = 28 * 24 * 60 * 60;      // FCM's own maximum

/** FCM `data` values must all be strings. */
export const stringifyData = (data = {}) =>
  Object.fromEntries(
    Object.entries(data)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]),
  );

/** Seconds a push may wait for an offline phone: until the notification expires, otherwise 24 h. */
export const ttlSeconds = (notification, now = new Date()) => {
  if (!notification.expires_at) return DEFAULT_TTL_SECONDS;
  const left = Math.floor((new Date(notification.expires_at).getTime() - now.getTime()) / 1000);
  return Math.max(0, Math.min(left, MAX_TTL_SECONDS));
};

/**
 * The FCM message for one notification on one device.
 *  - `notification` makes Android show it even when the app is closed;
 *  - `data` is what the app reads to open the right screen (type, notification_id and the ids in notification.data).
 */
export const buildMessage = (notification, deviceToken, now = new Date()) => ({
  token: deviceToken.fcm_token,
  notification: { title: notification.title, body: notification.body },
  data: stringifyData({
    ...notification.data,
    type: notification.type,
    category: notification.category,
    notification_id: notification.id,
  }),
  android: {
    priority: notification.priority === 'normal' ? 'normal' : 'high',
    ttl: ttlSeconds(notification, now) * 1000,
    notification: {
      channelId: ANDROID_CHANNELS[notification.category] || ANDROID_CHANNELS.system,
      tag: notification.id,                      // a re-sent notification replaces itself instead of piling up
      clickAction: CLICK_ACTION,
    },
  },
});

// ── FCM error handling ────────────────────────────────────────────────────────

/** The device is gone (app uninstalled, token rotated): stop sending to it. */
const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-recipient',
  'messaging/mismatched-credential',             // token belongs to a different Firebase project
  'messaging/sender-id-mismatch',
]);

/** Trying again later can work: FCM or the network had a hiccup, or we sent too fast. */
const RETRYABLE_CODES = new Set([
  'messaging/internal-error',
  'messaging/server-unavailable',
  'messaging/unavailable',
  'messaging/message-rate-exceeded',
  'messaging/device-message-rate-exceeded',
  'messaging/topics-message-rate-exceeded',
  'messaging/quota-exceeded',
  'messaging/unknown-error',
  'app/network-error',
  'app/network-timeout',
]);

/**
 * @returns {{ kind: 'invalid_token' | 'retry' | 'fail' }}
 *  - invalid_token: switch the device off
 *  - retry:         try again later with backoff
 *  - fail:          retrying will not help (bad payload, bad credentials): record it and give up
 */
export const classifyFcmError = (code = '', message = '') => {
  if (INVALID_TOKEN_CODES.has(code)) return { kind: 'invalid_token' };
  // FCM reports a malformed token as a generic invalid-argument; the message says which argument
  if (code === 'messaging/invalid-argument' && /registration token/i.test(message)) return { kind: 'invalid_token' };
  if (RETRYABLE_CODES.has(code)) return { kind: 'retry' };
  return { kind: 'fail' };
};

/** Delay before attempt number `attempts + 1`: 30 s, 1 min, 2 min ... capped at 1 h, with up to 20% jitter. */
export const backoffSeconds = (attempts, random = Math.random) => {
  const base = Math.min(30 * 2 ** Math.max(0, attempts - 1), 3600);
  return Math.round(base * (1 + random() * 0.2));
};
