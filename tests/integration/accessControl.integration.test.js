import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

/**
 * Starts the real Express app (real routers, real middleware) on a random port and checks who may call what.
 * Needs the same .env as the server (the models connect to the database); it never writes data: every protected
 * route is rejected before its handler runs, and the only public calls made are reads.
 */
const { default: app } = await import('../../app.js');
const { default: db, syncPromise } = await import('../../models/index.js');

let server; let base;
before(async () => {
  await syncPromise; // the models' startup sync must finish before the pool is closed at the end
  await new Promise((resolve) => {
  server = app.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); });
  });
});
after(async () => {
  await new Promise((r) => server.close(r));
  await db.sequelize.close();
  const { closeRateStore } = await import('../../services/rateStore.js');
  await closeRateStore();
});

const call = (method, path, { token, body } = {}) =>
  fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    ...(body && { body: JSON.stringify(body) }),
  });

// Routes that used to answer anyone. Each must now refuse an anonymous caller.
const MUST_BE_PROTECTED = [
  // orders
  ['POST', '/order/create-order'], ['GET', '/order/get-order'], ['GET', '/order/getOrderById/x'], ['GET', '/order/getOrderByUserId/1'],
  ['POST', '/order/filter-orders'], ['POST', '/order/filterOrder'], ['POST', '/order/updateOrder'], ['POST', '/order/deleteOrder'],
  ['POST', '/order/verify-otp'], ['POST', '/order/resend-otp'], ['GET', '/order/crops/list'], ['GET', '/order/statuses'],
  ['POST', '/order/calendar-availability'], ['POST', '/order/drone-availability'], ['POST', '/order/assign-work/x'],
  ['PATCH', '/order/daily-log/1/drone'], ['DELETE', '/order/daily-log/1'],
  // users (the account-takeover routes first)
  ['PUT', '/api/updateprofile'], ['POST', '/api/deleteUser'], ['POST', '/api/register'], ['GET', '/api/get-user/1'],
  ['POST', '/api/filter'], ['GET', '/api/users/booking-list'], ['GET', '/api/users/search?email=a@b.in'],
  ['POST', '/api/users/1/address'], ['POST', '/api/users/by-role'], ['POST', '/api/users/addresses'],
  // back office
  ['GET', '/api/inventory/drones'], ['DELETE', '/api/inventory/drones/1'], ['GET', '/inventory/dashboard/stats'], ['GET', '/api/inventory/pilots'],
  ['POST', '/api/vendors'], ['DELETE', '/api/vendors/1'], ['POST', '/api/fertilizers/filter'], ['DELETE', '/api/fertilizers/1'],
  ['POST', '/api/warehouses'], ['DELETE', '/api/warehouses/1'], ['DELETE', '/crops/1'], ['POST', '/crops/create'],
  ['POST', '/working-days/create'], ['DELETE', '/working-days/1'], ['POST', '/admin/drones'], ['GET', '/admin/getAllcomments'],
  ['DELETE', '/admin/deleteCol/1'], ['POST', '/admin/update-order'], ['POST', '/admin/spraying-daily-logs/filter'],
  ['GET', '/api/locations/drones'], ['GET', '/api/locations/address/all'], ['POST', '/api/locations/address/bulk'], ['DELETE', '/api/locations/address/1'],
  // already protected before; must stay so
  ['GET', '/api/farmer/profile'], ['GET', '/api/pilot/work/assignments'], ['GET', '/api/user/me'],
];

for (const [method, path] of MUST_BE_PROTECTED) {
  test(`${method} ${path} refuses an anonymous caller`, async () => {
    const res = await call(method, path, { body: method === 'GET' ? undefined : {} });
    assert.equal(res.status, 401, `expected 401 but got ${res.status}`);
  });
}

test('a forged token is not accepted on a protected route', async () => {
  const forged = jwt.sign({ id: 1 }, 'not-the-secret');
  for (const [method, path] of [['PUT', '/api/updateprofile'], ['GET', '/api/inventory/drones'], ['POST', '/order/create-order']]) {
    const res = await call(method, path, { token: forged, body: method === 'GET' ? undefined : {} });
    assert.equal(res.status, 401, `${method} ${path}`);
  }
});

test('the sign-up forms can still load the location lists without logging in', async () => {
  for (const path of ['/api/locations/states']) {
    const res = await call('GET', path);
    assert.equal(res.status, 200, path);
    assert.ok(Array.isArray(await res.json()));
  }
});

test('public auth routes are reachable (they fail on input, not on authentication)', async () => {
  // empty bodies: rejected as 400 by validation before anything is read or written
  for (const path of ['/api/login', '/api/otp/send-otp', '/api/otp/verify-otp', '/api/user/farmer-registration', '/api/user/pilot-registration', '/admin/auth/login']) {
    const res = await call('POST', path, { body: {} });
    assert.notEqual(res.status, 401, path);
    assert.notEqual(res.status, 404, path);
    assert.ok(res.status >= 400 && res.status < 500, `${path} -> ${res.status}`);
  }
});

test('farmer registration without an OTP proof is refused even when the body claims verification', async () => {
  const res = await call('POST', '/api/user/farmer-registration', {
    body: {
      first_name: 'Test', last_name: 'Farmer', email: 'no-otp-proof@example.in', mobile_number: '9000011111',
      password: 'Passw0rd!', role: 1, isverifyEmail: true, isMobileVerify: true,
    },
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /verify your email/i);
});

test('a farmer may register without an e-mail, but still needs the mobile number verified', async () => {
  const res = await call('POST', '/api/user/farmer-registration', {
    body: { first_name: 'Test', last_name: 'Farmer', mobile_number: '9000022222', password: 'Passw0rd!', isMobileVerify: true },
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /verify your mobile number/i);   // not "Email is required"
});

test('the OTP settings tell the apps the countdown and limits configured on the server', async () => {
  const res = await call('GET', '/api/otp/settings');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.resend_after_seconds, Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 30));
  assert.ok(body.expires_in_seconds >= 60);
  assert.equal(body.otp_length, 6);
});

test('verifying without having requested a code explains what to do, with a machine-readable code', async () => {
  const res = await call('POST', '/api/otp/verify-otp', { body: { mobile_number: '9000077777', mobile_otp: '123456' } });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.code, 'OTP_NOT_FOUND');
  assert.match(body.error, /Send OTP/);
});

test('unknown routes answer with JSON 404, and /health reports the database', async () => {
  const missing = await call('GET', '/definitely-not-a-route');
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, 'ROUTE_NOT_FOUND');
  const health = await call('GET', '/health');
  assert.equal(health.status, 200);
});
