import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { sendTextbeeSms, toE164 } from '../services/textbee.service.js';

const cfg = { apiKey: 'key-123', baseUrl: 'https://api.textbee.dev', countryCode: '+91' };
const reply = (status, body) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test('toE164: national, prefixed and international forms', () => {
  assert.equal(toE164('9876543210'), '+919876543210');
  assert.equal(toE164('09876543210'), '+919876543210');
  assert.equal(toE164('919876543210'), '+919876543210');
  assert.equal(toE164('+919876543210'), '+919876543210');
  assert.equal(toE164('9876543210', '+44'), '+449876543210');
  assert.throws(() => toE164('12345'), { code: 'SMS_INVALID_NUMBER' });
});

test('textbee: sends the documented request and returns the batch id', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return { status: 201, ok: true, json: async () => ({ data: { success: true, smsBatchId: 'b-1' } }) }; };
  const out = await sendTextbeeSms('9876543210', 'Your code is 123456', { ...cfg, deviceId: 'dev-9' }, fetchImpl);
  assert.equal(out.batchId, 'b-1');
  assert.equal(seen.url, 'https://api.textbee.dev/api/v1/gateway/send-sms');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers['x-api-key'], 'key-123');
  assert.deepEqual(JSON.parse(seen.init.body), { recipients: ['+919876543210'], message: 'Your code is 123456', deviceId: 'dev-9' });
});

test('textbee: deviceId is omitted when not configured; trailing slash in base URL is fine', async () => {
  let body, url;
  await sendTextbeeSms('9876543210', 'hi', { ...cfg, baseUrl: 'https://api.textbee.dev/' }, async (u, init) => { url = u; body = JSON.parse(init.body); return { status: 200, ok: true, json: async () => ({ data: { success: true } }) }; });
  assert.equal('deviceId' in body, false);
  assert.equal(url, 'https://api.textbee.dev/api/v1/gateway/send-sms');
});

test('textbee: failures are classified', async () => {
  await assert.rejects(sendTextbeeSms('9876543210', 'x', cfg, reply(401, { message: 'bad key' })), { code: 'SMS_GATEWAY_AUTH' });
  await assert.rejects(sendTextbeeSms('9876543210', 'x', cfg, reply(403, {})), { code: 'SMS_GATEWAY_AUTH' });
  await assert.rejects(sendTextbeeSms('9876543210', 'x', cfg, reply(429, {})), { code: 'SMS_GATEWAY_RATE_LIMITED' });
  await assert.rejects(sendTextbeeSms('9876543210', 'x', cfg, reply(500, { message: 'boom' })), { code: 'SMS_GATEWAY_FAILED', message: /boom/ });
  await assert.rejects(sendTextbeeSms('9876543210', 'x', cfg, reply(200, { data: { success: false }, message: 'no device' })), { code: 'SMS_GATEWAY_FAILED' });
  await assert.rejects(sendTextbeeSms('9876543210', 'x', cfg, async () => { throw Object.assign(new Error('x'), { name: 'TimeoutError' }); }), { code: 'SMS_GATEWAY_TIMEOUT' });
  await assert.rejects(sendTextbeeSms('9876543210', 'x', cfg, async () => { throw new Error('ECONNRESET'); }), { code: 'SMS_GATEWAY_FAILED' });
  await assert.rejects(sendTextbeeSms('9876543210', 'x', { baseUrl: cfg.baseUrl }), { code: 'SMS_NOT_CONFIGURED' });
});

test('textbee: really times out against a server that never answers', async () => {
  const server = http.createServer(() => {});               // accepts, never replies
  await new Promise((r) => server.listen(0, r));
  try {
    await assert.rejects(
      sendTextbeeSms('9876543210', 'x', { ...cfg, baseUrl: `http://127.0.0.1:${server.address().port}`, timeoutMs: 300 }),
      { code: 'SMS_GATEWAY_TIMEOUT' });
  } finally { server.closeAllConnections?.(); server.close(); }
});

test('sendOtpSms with SMS_PROVIDER=textbee posts the OTP text to the gateway (fake TextBee server)', async () => {
  const received = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      received.push({ url: req.url, key: req.headers['x-api-key'], body: JSON.parse(raw) });
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: { success: true, smsBatchId: 'fake-batch' } }));
    });
  });
  await new Promise((r) => server.listen(0, r));
  // env is read at import time, so the module is loaded in a child process with the settings under test
  const script = `import('${new URL('../services/sms.service.js', import.meta.url).href}').then(async m => { await m.sendOtpSms('9876543210', '654321', 3); process.exit(0); }).catch(e => { console.error(e.code, e.message); process.exit(1); })`;
  const { spawn } = await import('node:child_process');
  const child = await new Promise((resolve) => {
    {
      const p = spawn(process.execPath, ['--input-type=module', '-e', script], {
        env: { ...process.env, DB_HOST: 'x', DB_USER: 'x', DB_NAME: 'x', DB_DIALECT: 'postgres', JWT_SECRET: 'x', NODE_ENV: 'test',
          SMS_PROVIDER: 'textbee', TEXTBEE_API_KEY: 'k-live', TEXTBEE_BASE_URL: `http://127.0.0.1:${server.address().port}` },
      });
      let err = ''; p.stderr.on('data', (d) => { err += d; });
      p.on('close', (code) => resolve({ code, err }));
    }
  });
  server.close();
  assert.equal(child.code, 0, child.err);
  assert.equal(received.length, 1);
  assert.equal(received[0].url, '/api/v1/gateway/send-sms');
  assert.equal(received[0].key, 'k-live');
  assert.deepEqual(received[0].body.recipients, ['+919876543210']);
  assert.match(received[0].body.message, /654321/);
});
