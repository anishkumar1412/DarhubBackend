import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { idempotent, stableStringify } from '../middleware/idempotency.js';
import { MemoryIdempotencyStore } from '../services/idempotency.service.js';

const KEY = '3f1c2b7e-9a51-4c7e-8d0b-5a6f1e2d3c4b';

/** A tiny app: POST /orders creates an "order" (counted), with a fake signed-in user from the x-user header. */
const makeApp = ({ store = new MemoryIdempotencyStore(), required = false, handler } = {}) => {
  const state = { created: 0, store };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.auth = { id: Number(req.get('x-user') || 1) }; next(); });
  app.post('/orders', idempotent({ store, required }), handler ?? (async (req, res) => {
    state.created += 1;
    res.status(201).json({ booking_id: `b-${state.created}`, acres: req.body.acres });
  }));
  return { app, state };
};

const withServer = async (app, fn) => {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn((body, headers = {}) => fetch(`${base}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, headers: r.headers, body: await r.json() })));
  } finally {
    server.close();
  }
};

test('idempotency: a retry with the same key replays the first response and creates nothing new', async () => {
  const { app, state } = makeApp();
  await withServer(app, async (post) => {
    const first = await post({ acres: 3 }, { 'Idempotency-Key': KEY });
    const again = await post({ acres: 3 }, { 'Idempotency-Key': KEY });
    assert.equal(first.status, 201);
    assert.equal(again.status, 201);
    assert.deepEqual(again.body, first.body);
    assert.equal(again.headers.get('idempotent-replayed'), 'true');
    assert.equal(first.headers.get('idempotent-replayed'), null);
    assert.equal(state.created, 1);
  });
});

test('idempotency: 10 simultaneous copies create exactly one order; the others replay it or are told to wait', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const { app, state } = makeApp({
    handler: async (req, res) => {
      state.created += 1;
      await gate;                                   // keep the first request "running" while the copies arrive
      res.status(201).json({ booking_id: 'only-one' });
    },
  });
  await withServer(app, async (post) => {
    const copies = Array.from({ length: 10 }, () => post({ acres: 3 }, { 'Idempotency-Key': KEY }));
    await new Promise((r) => setTimeout(r, 100));
    release();
    const results = await Promise.all(copies);
    assert.equal(state.created, 1);
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    const waiting = results.filter((r) => r.status === 409);
    assert.equal(waiting.length, 9);
    assert.equal(waiting[0].body.code, 'IDEMPOTENCY_REQUEST_IN_PROGRESS');
    assert.ok(Number(waiting[0].headers.get('retry-after')) >= 1);
    const replay = await post({ acres: 3 }, { 'Idempotency-Key': KEY });
    assert.equal(replay.body.booking_id, 'only-one');
  });
});

test('idempotency: the same key with a different body is refused (422), not silently replayed', async () => {
  const { app, state } = makeApp();
  await withServer(app, async (post) => {
    await post({ acres: 3 }, { 'Idempotency-Key': KEY });
    const other = await post({ acres: 30 }, { 'Idempotency-Key': KEY });
    assert.equal(other.status, 422);
    assert.equal(other.body.code, 'IDEMPOTENCY_KEY_REUSED');
    assert.equal(state.created, 1);
  });
});

test('idempotency: body key order does not matter; keys are per user', async () => {
  const { app, state } = makeApp();
  await withServer(app, async (post) => {
    await post({ acres: 3, crop: 1 }, { 'Idempotency-Key': KEY });
    const reordered = await post({ crop: 1, acres: 3 }, { 'Idempotency-Key': KEY });
    assert.equal(reordered.headers.get('idempotent-replayed'), 'true');
    const otherUser = await post({ acres: 3, crop: 1 }, { 'Idempotency-Key': KEY, 'x-user': '2' });
    assert.equal(otherUser.status, 201);
    assert.equal(otherUser.headers.get('idempotent-replayed'), null);
    assert.equal(state.created, 2);
  });
  assert.equal(stableStringify({ b: 1, a: [{ d: 2, c: 1 }] }), stableStringify({ a: [{ c: 1, d: 2 }], b: 1 }));
});

test('idempotency: 5xx and retryable 409 are not stored, so a retry with the same key runs again', async () => {
  let calls = 0;
  const { app } = makeApp({
    handler: (req, res) => {
      calls += 1;
      if (calls === 1) return res.status(503).json({ error: 'database down' });
      if (calls === 2) return res.status(409).json({ error: 'drone busy' });
      return res.status(201).json({ booking_id: 'third-time' });
    },
  });
  await withServer(app, async (post) => {
    assert.equal((await post({ acres: 3 }, { 'Idempotency-Key': KEY })).status, 503);
    assert.equal((await post({ acres: 3 }, { 'Idempotency-Key': KEY })).status, 409);
    const ok = await post({ acres: 3 }, { 'Idempotency-Key': KEY });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.booking_id, 'third-time');
  });
});

test('idempotency: a final 400 is stored and replayed for the identical request', async () => {
  let calls = 0;
  const { app } = makeApp({ handler: (req, res) => { calls += 1; res.status(400).json({ error: 'date in the past' }); } });
  await withServer(app, async (post) => {
    await post({ acres: 3 }, { 'Idempotency-Key': KEY });
    const again = await post({ acres: 3 }, { 'Idempotency-Key': KEY });
    assert.equal(again.status, 400);
    assert.equal(again.headers.get('idempotent-replayed'), 'true');
    assert.equal(calls, 1);
  });
});

test('idempotency: a handler that crashed releases the key; a request stuck past its lock can be taken over', async () => {
  let now = 1_000_000;
  const store = new MemoryIdempotencyStore({ now: () => now });
  const first = await store.claim({ userId: 1, scope: 's', key: KEY, requestHash: 'h', lockSeconds: 60, ttlSeconds: 86400 });
  assert.equal(first.outcome, 'new');
  assert.equal((await store.claim({ userId: 1, scope: 's', key: KEY, requestHash: 'h', lockSeconds: 60, ttlSeconds: 86400 })).outcome, 'in_progress');
  now += 61_000;                                   // the first attempt died without answering
  assert.equal((await store.claim({ userId: 1, scope: 's', key: KEY, requestHash: 'h', lockSeconds: 60, ttlSeconds: 86400 })).outcome, 'new');
  now += 86_400_000;                               // and after the TTL the key is free again
  assert.equal(await store.purgeExpired(), 1);

  const { app, state } = makeApp({
    store,
    handler: (req, res) => { state.created += 1; res.destroy(); },  // connection dropped, no response
  });
  await withServer(app, async (post) => {
    await post({ acres: 3 }, { 'Idempotency-Key': 'crash-key-1' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 50));
    await post({ acres: 3 }, { 'Idempotency-Key': 'crash-key-1' }).catch(() => {});
    assert.equal(state.created, 2, 'the retry ran instead of waiting 60 s for the lock');
  });
});

test('idempotency: invalid keys are refused; a missing key is allowed unless required', async () => {
  const { app, state } = makeApp();
  await withServer(app, async (post) => {
    const bad = await post({ acres: 3 }, { 'Idempotency-Key': 'short' });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'INVALID_IDEMPOTENCY_KEY');
    assert.equal((await post({ acres: 3 }, { 'Idempotency-Key': 'has spaces in it' })).status, 400);
    assert.equal((await post({ acres: 3 })).status, 201);
    assert.equal(state.created, 1);
  });
  const strict = makeApp({ required: true });
  await withServer(strict.app, async (post) => {
    const missing = await post({ acres: 3 });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.code, 'IDEMPOTENCY_KEY_REQUIRED');
  });
});

test('idempotency: a key store failure refuses the request instead of risking a duplicate', async () => {
  const broken = { claim: async () => { const e = new Error('connect ECONNREFUSED'); e.name = 'SequelizeConnectionRefusedError'; throw e; } };
  const { app, state } = makeApp({ store: broken });
  await withServer(app, async (post) => {
    const r = await post({ acres: 3 }, { 'Idempotency-Key': KEY });
    assert.equal(r.status, 503);
    assert.equal(state.created, 0);
  });
});
