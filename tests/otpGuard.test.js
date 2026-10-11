import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, RedisStore } from '../services/rateStore.js';
import { createOtpGuard, hashOtp } from '../services/otpGuard.js';

const policy = {
  expirySeconds: 180, resendSeconds: 30, windowSeconds: 900,
  maxSendsPerIp: 5, maxSendsPerTarget: 5, maxVerifyAttempts: 3, maxFailedVerifies: 4, blockSeconds: 900,
};

// The same rules must hold on the in-memory store and on real Redis (skipped when no local Redis runs)
const redisUrl = process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6379';
const stores = [['memory', async () => new MemoryStore()]];
const redisProbe = new RedisStore(redisUrl);
const redisUp = await redisProbe.ping().catch(() => false);
await redisProbe.close();
if (redisUp) {
  stores.push(['redis', async () => {
    // own namespace per test, given at construction (the Lua command captures the prefix when it is defined)
    const store = new RedisStore(redisUrl, { keyPrefix: `darhub-test:${process.pid}:${Math.random().toString(36).slice(2)}:` });
    await store.ping();
    return store;
  }]);
}

for (const [name, makeStore] of stores) {
  test(`[${name}] resend is refused until the cooldown has passed, with the exact seconds left`, async () => {
    const store = await makeStore();
    try {
    const guard = createOtpGuard({ store, policy });
    const first = await guard.beforeSend({ ip: '1.1.1.1', mobile: '9000000001' });
    assert.equal(first.ok, true);
    assert.equal(first.resendAfterSeconds, 30);
    const again = await guard.beforeSend({ ip: '1.1.1.1', mobile: '9000000001' });
    assert.equal(again.ok, false);
    assert.equal(again.code, 'OTP_COOLDOWN');
    assert.ok(again.retryAfter > 0 && again.retryAfter <= 30);
    } finally {
      await store.close();
    }
  });

  test(`[${name}] a failed delivery releases the cooldown so the person can retry at once`, async () => {
    const store = await makeStore();
    try {
    const guard = createOtpGuard({ store, policy });
    const first = await guard.beforeSend({ ip: '1.1.1.2', mobile: '9000000002' });
    await first.release();
    assert.equal((await guard.beforeSend({ ip: '1.1.1.2', mobile: '9000000002' })).ok, true);
    } finally {
      await store.close();
    }
  });

  test(`[${name}] one network may request at most 5 codes per window`, async () => {
    const store = await makeStore();
    try {
    const guard = createOtpGuard({ store, policy });
    for (let i = 0; i < 5; i++) {
      assert.equal((await guard.beforeSend({ ip: '2.2.2.2', mobile: `90000001${i}0` })).ok, true, `send ${i + 1}`);
    }
    const sixth = await guard.beforeSend({ ip: '2.2.2.2', mobile: '9000000199' });
    assert.equal(sixth.code, 'OTP_IP_LIMIT');
    assert.ok(sixth.retryAfter > 0 && sixth.retryAfter <= 900);
    // another network is not affected
    assert.equal((await guard.beforeSend({ ip: '3.3.3.3', mobile: '9000000299' })).ok, true);
    } finally {
      await store.close();
    }
  });

  test(`[${name}] one phone number may receive at most 5 codes per window, whatever the IP`, async () => {
    const store = await makeStore();
    try {
    const guard = createOtpGuard({ store, policy: { ...policy, resendSeconds: 10 } });
    for (let i = 0; i < 5; i++) {
      const r = await guard.beforeSend({ ip: `4.4.4.${i}`, mobile: '9000000300' });
      assert.equal(r.ok, true, `send ${i + 1}`);
      await r.release();            // pretend the cooldown passed
    }
    assert.equal((await guard.beforeSend({ ip: '4.4.4.99', mobile: '9000000300' })).code, 'OTP_TARGET_LIMIT');
    } finally {
      await store.close();
    }
  });

  test(`[${name}] repeated wrong codes block the number for sending and verifying`, async () => {
    const store = await makeStore();
    try {
    const guard = createOtpGuard({ store, policy });
    const who = { mobile: '9000000400' };
    for (let i = 1; i < policy.maxFailedVerifies; i++) assert.equal((await guard.failedVerify(who)).blocked, false);
    const last = await guard.failedVerify(who);
    assert.equal(last.blocked, true);
    assert.ok(last.retryAfter > 0);
    assert.equal((await guard.beforeVerify(who)).code, 'OTP_BLOCKED');
    assert.equal((await guard.beforeSend({ ip: '5.5.5.5', ...who })).code, 'OTP_BLOCKED');
    } finally {
      await store.close();
    }
  });

  test(`[${name}] a correct code clears the wrong-try history`, async () => {
    const store = await makeStore();
    try {
    const guard = createOtpGuard({ store, policy });
    const who = { email: 'a@b.in' };
    for (let i = 1; i < policy.maxFailedVerifies; i++) await guard.failedVerify(who);
    await guard.succeededVerify(who);
    assert.equal((await guard.failedVerify(who)).blocked, false);
    } finally {
      await store.close();
    }
  });
}

test('codes are stored as an HMAC, never as the code', () => {
  const stored = hashOtp('482913', 'secret');
  assert.equal(stored.length, 64);
  assert.notEqual(stored, '482913');
  assert.equal(hashOtp(' 482913 ', 'secret'), stored);           // typed with spaces still matches
  assert.notEqual(hashOtp('482913', 'other-secret'), stored);    // useless without the server secret
});

test(`Redis available for these tests: ${redisUp}`, () => {});
