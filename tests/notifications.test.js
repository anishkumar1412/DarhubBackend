import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMessage, CLICK_ACTION, stringifyData, ttlSeconds, classifyFcmError, backoffSeconds, ANDROID_CHANNELS,
} from '../services/push/message.js';
import { TEMPLATES, renderNotification, formatDateRange, shortId, SUPPORTED_LANGUAGES } from '../services/notificationTemplates.js';
import { NotificationType } from '../utils/notificationTypes.js';

const notification = {
  id: '57dcca1c-7c26-46cc-aa55-6dacdacc406a', type: 'JOB_STARTED', category: 'booking', priority: 'high',
  title: 'Spraying has started', body: 'Body', data: { booking_id: 'b-1', screen: 'BOOKING', count: 3, skip: null }, expires_at: null,
};
const device = { fcm_token: 'tok_abcdefghijklmnopqrstuvwxyz' };

test('FCM data values are always strings and null/undefined are dropped', () => {
  assert.deepEqual(stringifyData({ a: 'x', n: 3, o: { k: 1 }, nil: null, u: undefined }), { a: 'x', n: '3', o: '{"k":1}' });
});

test('message: notification block + data the app needs to open the right screen', () => {
  const m = buildMessage(notification, device);
  assert.equal(m.token, device.fcm_token);
  assert.deepEqual(m.notification, { title: 'Spraying has started', body: 'Body' });
  assert.equal(m.data.type, 'JOB_STARTED');
  assert.equal(m.data.notification_id, notification.id);
  assert.equal(m.data.booking_id, 'b-1');
  assert.equal(m.data.count, '3');
  assert.equal(m.android.priority, 'high');
  assert.equal(m.android.notification.channelId, ANDROID_CHANNELS.booking);
  assert.equal(m.android.notification.tag, notification.id);
  assert.equal(m.android.notification.clickAction, CLICK_ACTION);
});

test('message: unknown category falls back to the system channel, normal priority is kept', () => {
  const m = buildMessage({ ...notification, category: 'weird', priority: 'normal' }, device);
  assert.equal(m.android.notification.channelId, ANDROID_CHANNELS.system);
  assert.equal(m.android.priority, 'normal');
});

test('ttl: 24h by default, until expiry when set, never negative, capped at 28 days', () => {
  const now = new Date('2026-10-31T00:00:00Z');
  assert.equal(ttlSeconds({ expires_at: null }, now), 86400);
  assert.equal(ttlSeconds({ expires_at: '2026-10-31T01:00:00Z' }, now), 3600);
  assert.equal(ttlSeconds({ expires_at: '2026-10-30T00:00:00Z' }, now), 0);
  assert.equal(ttlSeconds({ expires_at: '2027-10-31T00:00:00Z' }, now), 28 * 86400);
});

test('FCM errors: dead tokens are switched off, hiccups are retried, everything else gives up', () => {
  assert.equal(classifyFcmError('messaging/registration-token-not-registered').kind, 'invalid_token');
  assert.equal(classifyFcmError('messaging/invalid-registration-token').kind, 'invalid_token');
  assert.equal(classifyFcmError('messaging/invalid-argument', 'The registration token is not a valid FCM registration token').kind, 'invalid_token');
  assert.equal(classifyFcmError('messaging/invalid-argument', 'Invalid JSON payload').kind, 'fail');
  assert.equal(classifyFcmError('messaging/server-unavailable').kind, 'retry');
  assert.equal(classifyFcmError('messaging/internal-error').kind, 'retry');
  assert.equal(classifyFcmError('messaging/message-rate-exceeded').kind, 'retry');
  assert.equal(classifyFcmError('app/network-error').kind, 'retry');
  assert.equal(classifyFcmError('messaging/third-party-auth-error').kind, 'fail');
  assert.equal(classifyFcmError(undefined).kind, 'fail');
});

test('backoff doubles from 30s, caps at 1h and stays within 20% jitter', () => {
  assert.equal(backoffSeconds(1, () => 0), 30);
  assert.equal(backoffSeconds(2, () => 0), 60);
  assert.equal(backoffSeconds(3, () => 0), 120);
  assert.equal(backoffSeconds(30, () => 0), 3600);
  assert.equal(backoffSeconds(1, () => 1), 36);
});

const sampleVars = {
  booking_id: '3580accc-442d-44bb-8f05-9d9e195ad23f', crop: 'Maize', acres: 3, village: 'Moraiya', dates: '1 Nov – 2 Nov',
  pilot_name: 'Vikram Shinde', reason: 'Rain', needs_accept: true, title: 'Hello', body: 'World',
};

test('every template renders in every language with no missing variables', () => {
  for (const type of Object.keys(TEMPLATES)) {
    for (const lang of SUPPORTED_LANGUAGES) {
      const n = renderNotification(type, sampleVars, lang);
      assert.ok(n.title.length > 0 && n.body.length > 0, `${type}/${lang} is empty`);
      assert.ok(!/undefined|null|NaN|\[object/.test(n.title + n.body), `${type}/${lang} has a missing variable: ${n.title} / ${n.body}`);
      assert.ok(['booking', 'work', 'system'].includes(n.category));
      assert.ok(n.ttlHours > 0);
    }
  }
});

test('every NotificationType has a template (and no template is orphaned)', () => {
  assert.deepEqual(Object.keys(TEMPLATES).sort(), Object.values(NotificationType).sort());
});

test('unknown language falls back to English; unknown type is a programming error', () => {
  assert.equal(renderNotification('JOB_STARTED', sampleVars, 'fr').title, 'Spraying has started');
  assert.throws(() => renderNotification('NOPE', {}), /Unknown notification type/);
});

test('cancellations and schedule changes ignore the mute setting; ordinary updates do not', () => {
  for (const type of ['BOOKING_CANCELLED', 'WORK_CANCELLED', 'WORK_SCHEDULE_CHANGED', 'WORK_UNASSIGNED']) {
    assert.equal(renderNotification(type, sampleVars).critical, true, type);
  }
  for (const type of ['JOB_STARTED', 'PILOT_ASSIGNED', 'WORK_TODAY']) {
    assert.equal(renderNotification(type, sampleVars).critical, false, type);
  }
});

test('titles and bodies never exceed what the inbox columns hold', () => {
  const n = renderNotification('ADMIN_MESSAGE', { title: 'T'.repeat(500), body: 'B'.repeat(5000) });
  assert.equal(n.title.length, 200);
  assert.equal(n.body.length, 1000);
});

test('dates read like the apps write them; ids are shortened the same way', () => {
  assert.equal(formatDateRange(['2026-11-01']), '1 Nov');
  assert.equal(formatDateRange(['2026-11-02', '2026-11-01']), '1 Nov – 2 Nov');
  assert.equal(formatDateRange([]), '');
  assert.equal(shortId('3580accc-442d-44bb-8f05-9d9e195ad23f'), '#3580ACCC');
});
