import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

/**
 * The delivery worker against a real PostgreSQL, with a fake FCM that answers per token. It WRITES rows (a throwaway
 * user, its devices and notifications, all removed at the end), so it refuses to run against a remote database.
 *   ENV_FILE=.env.local node --test tests/integration/notificationDispatcher.integration.test.js
 */
const { default: db, syncPromise } = await import('../../models/index.js');
const { processPendingDeliveries } = await import('../../services/notificationDispatcher.js');
const { setPushProviderForTests } = await import('../../services/push/index.js');

const host = String(db.sequelize.config.host || '');
const local = ['127.0.0.1', 'localhost', '::1'].includes(host);
const skip = !local && 'refusing to write test rows to a remote database';

let user;
const tokens = {};
before(async () => {
  if (skip) return;
  await syncPromise;
  user = await db.User.create({ username: 'push-test', mobile_number: `99${Date.now()}`.slice(0, 10), user_type: 3 });
});
after(async () => {
  setPushProviderForTests(undefined);
  if (!skip) {
    await db.Notification.destroy({ where: { user_id: user.id } });
    await db.DeviceToken.destroy({ where: { user_id: user.id } });
    await db.User.destroy({ where: { id: user.id } });
  }
  await db.sequelize.close();
});

const queue = async (name, { expiresAt = null, attempts = 0 } = {}) => {
  const device = await db.DeviceToken.create({ user_id: user.id, app: 'farmer', fcm_token: `${name}_${Date.now()}_xxxxxxxxxxxxxxxxxxxx` });
  const n = await db.Notification.create({ user_id: user.id, type: 'JOB_STARTED', category: 'booking', title: name, body: 'b', expires_at: expiresAt });
  const d = await db.NotificationDelivery.create({ notification_id: n.id, device_token_id: device.id, attempts });
  tokens[name] = device.fcm_token;
  return { device, delivery: d };
};

/** A fake FCM: the token's prefix decides the answer. */
const fakeFcm = {
  name: 'fake',
  async send(messages) {
    return messages.map((m) => {
      const t = m.token;
      if (t.startsWith('ok_')) return { ok: true, messageId: 'projects/p/messages/1' };
      if (t.startsWith('dead_')) return { ok: false, errorCode: 'messaging/registration-token-not-registered', errorMessage: 'gone' };
      if (t.startsWith('flaky_')) return { ok: false, errorCode: 'messaging/server-unavailable', errorMessage: '503' };
      return { ok: false, errorCode: 'messaging/third-party-auth-error', errorMessage: 'bad key' };
    });
  },
};

test('worker records each outcome: sent, dead device, transient error, permanent error, expired', { skip }, async () => {
  setPushProviderForTests(fakeFcm);
  const ok = await queue('ok');
  const dead = await queue('dead');
  const flaky = await queue('flaky');
  const bad = await queue('bad');
  const stale = await queue('ok_expired', { expiresAt: new Date(Date.now() - 60_000) });

  await processPendingDeliveries();
  for (const x of [ok, dead, flaky, bad, stale]) await x.delivery.reload();
  await dead.device.reload();

  assert.equal(ok.delivery.status, 'sent');
  assert.equal(ok.delivery.fcm_message_id, 'projects/p/messages/1');
  assert.equal(ok.delivery.attempts, 1);

  assert.equal(dead.delivery.status, 'invalid_token');
  assert.equal(dead.device.is_active, false, 'a dead token must be switched off');

  assert.equal(flaky.delivery.status, 'pending', 'transient errors are retried');
  assert.ok(new Date(flaky.delivery.next_attempt_at) > new Date(Date.now() + 20_000), 'with a backoff delay');
  assert.equal(flaky.delivery.error_code, 'messaging/server-unavailable');

  assert.equal(bad.delivery.status, 'failed');
  assert.equal(bad.delivery.error_code, 'messaging/third-party-auth-error');

  assert.equal(stale.delivery.status, 'expired', 'a stale reminder is dropped, not sent');
});

test('a transient error is given up on after the maximum number of attempts', { skip }, async () => {
  setPushProviderForTests(fakeFcm);
  const flaky = await queue('flaky_max', { attempts: 4 });          // this run is attempt 5 = NOTIFICATION_MAX_ATTEMPTS
  await processPendingDeliveries();
  await flaky.delivery.reload();
  assert.equal(flaky.delivery.status, 'failed');
});

test('a worker that crashed mid-send does not strand its rows: an expired lease is taken over', { skip }, async () => {
  setPushProviderForTests(fakeFcm);
  const x = await queue('ok_crashed');
  await x.delivery.update({ status: 'sending', locked_until: new Date(Date.now() - 1000), attempts: 1 });
  await processPendingDeliveries();
  await x.delivery.reload();
  assert.equal(x.delivery.status, 'sent');
  assert.equal(x.delivery.attempts, 2);
});

test('a row another worker still holds (lease not expired) is left alone', { skip }, async () => {
  setPushProviderForTests(fakeFcm);
  const x = await queue('ok_held');
  await x.delivery.update({ status: 'sending', locked_until: new Date(Date.now() + 60_000), attempts: 1 });
  await processPendingDeliveries();
  await x.delivery.reload();
  assert.equal(x.delivery.status, 'sending');
});
