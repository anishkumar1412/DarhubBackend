import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret';
const { createApiLimiter, createAuthLimiter, rateLimitKey } = await import('../middleware/rateLimiters.js');

const start = (configure, { trustProxy = false } = {}) =>
  new Promise((resolve) => {
    const app = express();
    app.set('trust proxy', trustProxy);
    configure(app);
    const server = app.listen(0, () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });

const tokenFor = (id) => jwt.sign({ id }, process.env.JWT_SECRET);

test('signed-in users are counted separately, even from the same IP', async () => {
  const { server, url } = await start((app) => {
    app.use(createApiLimiter(3));
    app.get('/x', (req, res) => res.json({ ok: true }));
  });
  try {
    const hit = (token) => fetch(`${url}/x`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.status);
    for (let i = 0; i < 3; i++) assert.equal(await hit(tokenFor(1)), 200);
    assert.equal(await hit(tokenFor(1)), 429);        // pilot 1 is limited ...
    assert.equal(await hit(tokenFor(2)), 200);        // ... pilot 2 on the same IP is not
  } finally { server.close(); }
});

test('a 429 is JSON with a retry hint', async () => {
  const { server, url } = await start((app) => {
    app.use(createApiLimiter(1));
    app.get('/x', (req, res) => res.json({ ok: true }));
  });
  try {
    await fetch(`${url}/x`);
    const res = await fetch(`${url}/x`);
    assert.equal(res.status, 429);
    assert.match(res.headers.get('content-type'), /json/);
    assert.ok(Number(res.headers.get('retry-after')) > 0);
    const body = await res.json();
    assert.equal(body.code, 'RATE_LIMITED');
    assert.equal(body.success, false);
  } finally { server.close(); }
});

test('behind a proxy, clients are told apart by X-Forwarded-For (trust proxy)', async () => {
  const { server, url } = await start((app) => {
    app.use(createAuthLimiter(1));
    app.post('/login', (req, res) => res.json({ ok: true }));
  }, { trustProxy: 1 });
  try {
    const hit = (ip) => fetch(`${url}/login`, { method: 'POST', headers: { 'X-Forwarded-For': ip } }).then((r) => r.status);
    assert.equal(await hit('203.0.113.7'), 200);
    assert.equal(await hit('203.0.113.7'), 429);
    assert.equal(await hit('198.51.100.9'), 200);     // a different client is not affected
  } finally { server.close(); }
});

test('a forged or expired token cannot be used to dodge the limit: it falls back to the IP', () => {
  const req = { headers: { authorization: 'Bearer not-a-real-token' }, ip: '203.0.113.7' };
  assert.equal(rateLimitKey(req), '203.0.113.7');
  const forged = jwt.sign({ id: 5 }, 'another-secret');
  assert.equal(rateLimitKey({ headers: { authorization: `Bearer ${forged}` }, ip: '203.0.113.7' }), '203.0.113.7');
});
