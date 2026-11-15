import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderSchema, MAX_ORDER_ACRES } from '../validation/order.schemas.js';
import {
  personalProfileUpdateSchema, bookingListQuerySchema, rateBookingSchema, bookingParams, addressCreateSchema,
  bankCreateSchema, rescheduleBookingSchema, farmerEditSchema,
} from '../validation/farmer.schemas.js';
import { loginSchema, registrationIdentitySchema, sendOtpSchema, verifyOtpSchema } from '../validation/auth.schemas.js';
import { validate, parseOrThrow } from '../middleware/validate.js';
import { clampPage, clampLimit } from '../utils/pagination.js';
import { isPilotAccount, isFarmerAccount } from '../utils/roles.js';
import { refreshTokenMatches } from '../services/token.service.js';
import { todayIST } from '../utils/dateUtils.js';

const ok = (schema, input) => {
  const r = schema.safeParse(input);
  assert.ok(r.success, r.success ? '' : JSON.stringify(r.error.issues));
  return r.data;
};
// Compares without the keys whose value is undefined (an optional field that was not sent)
const defined = (obj) => JSON.parse(JSON.stringify(obj));
const problems = (schema, input) => {
  const r = schema.safeParse(input);
  assert.ok(!r.success, 'expected a validation failure');
  return Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]));
};
const daysFromToday = (n) => {
  const d = new Date(`${todayIST()}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// ── Orders ───────────────────────────────────────────────────────

test('create-order: what the farmer app sends is accepted and normalised', () => {
  const data = ok(createOrderSchema, {
    start_date: daysFromToday(2), crop_type_id: 3, land_in_acers: 2.5,
    price: 100, tax: 5, total_price: 105, discount: 0, user_id: 0,
    farmer_details: { name: 'Ravi', mobile: '9876543210', email: '' },
    address: { state: 1, district: 2, block: 3, village: 'Wagholi', address1: 'Plot 4', address2: null, pincode: null },
  });
  assert.equal(data.start_date.toISOString(), `${daysFromToday(2)}T00:00:00.000Z`);
  assert.equal(data.address.pincode, undefined);           // null means "not sent", not "invalid"
  assert.equal(data.address.address2, undefined);
});

test('create-order: the admin panel sends unpadded dates ("2026-10-5") and numbers as text', () => {
  const [y, m, d] = daysFromToday(3).split('-');
  const data = ok(createOrderSchema, {
    start_date: `${y}-${Number(m)}-${Number(d)}`, crop_type_id: '3', land_in_acers: '4', num_of_days: 1,
    address: { state: '1', district: 2, block: 3, village: '' },
  });
  assert.equal(data.start_date.toISOString().slice(0, 10), daysFromToday(3));
  assert.equal(data.crop_type_id, 3);
});

test('create-order: impossible values are refused instead of creating a broken booking', () => {
  const p = problems(createOrderSchema, {
    start_date: '2020-01-01', crop_type_id: 'abc', land_in_acers: MAX_ORDER_ACRES + 1, num_of_days: -5,
  });
  assert.match(p.start_date, /past/);
  assert.match(p.crop_type_id, /number/);
  assert.match(p.land_in_acers, /at most/);
  assert.match(p.num_of_days, /at least 1/);
  assert.match(p.address, /address is required/);
  assert.match(problems(createOrderSchema, { start_date: daysFromToday(400), crop_type_id: 1, land_in_acers: 1, address: { state: 1, district: 1, block: 1 } }).start_date, /365 days/);
  assert.match(problems(createOrderSchema, { start_date: daysFromToday(1), crop_type_id: 1, land_in_acers: 0, address: { state: 1, district: 1, block: 1 } }).land_in_acers, /greater than 0/);
});

// ── Farmer profile ───────────────────────────────────────────────

test('profile update: app (nested) and Postman (flat) bodies both work; values are normalised', () => {
  const nested = ok(personalProfileUpdateSchema, {
    personal_info: { first_name: '  Ram ', mobile_number: '+91 98765 43210', dob: '01/02/1990' },
    address_details: { state: 1, pincode: '411001' },
  });
  assert.equal(nested.personal.first_name, 'Ram');
  assert.equal(nested.personal.mobile_number, '9876543210');
  assert.equal(nested.personal.dob.toISOString(), '1990-02-01T00:00:00.000Z');
  assert.deepEqual(nested.address, { state: 1, pincode: '411001' });

  const flat = ok(personalProfileUpdateSchema, { email: ' Ram@Example.IN ' });
  assert.equal(flat.personal.email, 'ram@example.in');
});

test('profile update: bad e-mail, impossible birth date and foreign photo URLs are refused', () => {
  const p = problems(personalProfileUpdateSchema, { email: 'bad', dob: '31/02/1990', profile_image: 'https://evil.example/x.png' });
  assert.match(p['personal.email'], /Invalid email/);
  assert.match(p['personal.dob'], /not a real date/);
  assert.match(p['personal.profile_image'], /uploaded through the app/);
  assert.match(problems(personalProfileUpdateSchema, { address_details: { pincode: '012345' } })['address.pincode'], /6-digit/);
});

test('addresses and bank accounts: required fields, formats, "true" strings', () => {
  const p = problems(addressCreateSchema, { lane_1: ' ', state: 'x', pincode: '12' });
  assert.ok(p.lane_1 && p.state && p.district && p.block && p.village && p.pincode);

  const bank = ok(bankCreateSchema, { bank_name: 'SBI', acc_holder_name: 'Ravi', acc_number: '1234 5678 90', ifsc_code: 'sbin0001234', is_primary: 'true' });
  assert.deepEqual(bank, { bank_name: 'SBI', acc_holder_name: 'Ravi', acc_number: '1234567890', ifsc_code: 'SBIN0001234', is_primary: true });
  assert.match(problems(bankCreateSchema, { bank_name: 'SBI', acc_holder_name: 'R', acc_number: '12', ifsc_code: 'X' }).acc_number, /9 to 18/);
});

test('farmer-edit: user_id from a multipart form becomes a number (it used to be compared as text)', () => {
  assert.equal(ok(farmerEditSchema, { user_id: '42', password: '' }).user_id, 42);
  assert.equal(ok(farmerEditSchema, { password: '' }).password, undefined);
  assert.match(problems(farmerEditSchema, { password: 'short' }).password, /at least 8/);
});

// ── Bookings ─────────────────────────────────────────────────────

test('booking list: page/limit never break the query and limit is capped at 50', () => {
  assert.deepEqual(ok(bookingListQuerySchema, { page: 'abc', limit: '5000', status: 'upcoming' }), { page: 1, limit: 50, status: 'UPCOMING' });
  assert.deepEqual(defined(ok(bookingListQuerySchema, {})), { page: 1, limit: 10 });
  assert.deepEqual(defined(ok(bookingListQuerySchema, { page: '3', limit: '-4' })), { page: 3, limit: 10 });
});

test('rating is a whole number 1-5; booking ids must be UUIDs; reschedule date cannot be in the past', () => {
  assert.equal(ok(rateBookingSchema, { rating: '4' }).rating, 4);
  for (const bad of [0, 6, 3.7, 'abc', null]) assert.ok(!rateBookingSchema.safeParse({ rating: bad }).success, String(bad));
  assert.match(problems(bookingParams, { booking_id: 'statuses' }).booking_id, /not valid/);
  ok(bookingParams, { booking_id: '3f1c2a9e-8f7b-4c2d-9a51-0b6c1d2e3f40' });
  assert.match(problems(rescheduleBookingSchema, { new_date: '2001-01-01' }).new_date, /past/);
  assert.match(problems(rescheduleBookingSchema, { new_date: daysFromToday(1), new_time_window: 'x'.repeat(51) }).new_time_window, /50/);
});

// ── Auth ─────────────────────────────────────────────────────────

test('login: identifier from email / mobile_number (also numeric) / identifier', () => {
  assert.deepEqual(ok(loginSchema, { mobile_number: 9876543210, password: 'x' }), { identifier: '9876543210', password: 'x' });
  assert.deepEqual(ok(loginSchema, { email: ' a@b.in ', password: 'x' }), { identifier: 'a@b.in', password: 'x' });
  assert.ok(problems(loginSchema, { password: 'x' }).identifier);
  assert.ok(problems(loginSchema, { email: 'a@b.in' }).password);
});

test('registration: client-sent role / verification flags are dropped; empty optional e-mail is allowed for farmers', () => {
  const data = ok(registrationIdentitySchema({ emailRequired: false }), {
    first_name: 'A', last_name: 'B', email: '', mobile_number: '09876543210', password: 'secret123', dob: '', role: '10', isverifyEmail: 'true',
  });
  assert.deepEqual(defined(data), { first_name: 'A', last_name: 'B', mobile_number: '9876543210', password: 'secret123' });
  assert.match(problems(registrationIdentitySchema(), { first_name: 'A', last_name: 'B', mobile_number: '9876543210', password: 'secret123' }).email, /Email is required/);
});

test('OTP: one of email / mobile is required; codes are trimmed', () => {
  assert.match(problems(sendOtpSchema, {}).email, /Either email or mobile/);
  assert.equal(ok(verifyOtpSchema, { email: 'a@b.in', email_otp: ' 123456 ' }).email_otp, '123456');
});

// ── validate middleware ─────────────────────────────────────────

test('validate(): a failure is a 400 VALIDATION_ERROR listing every field; success replaces the body', () => {
  let status; let body;
  const res = { headersSent: false, set() {}, status(s) { status = s; return this; }, json(b) { body = b; return this; } };
  const req = { method: 'POST', originalUrl: '/x', body: { rating: 9 }, params: { booking_id: 'nope' }, query: {} };
  validate({ params: bookingParams, body: rateBookingSchema })(req, res, () => assert.fail('next() must not run'));
  assert.equal(status, 400);
  assert.equal(body.code, 'VALIDATION_ERROR');
  assert.deepEqual(body.errors.map((e) => e.field), ['params.booking_id']);

  const req2 = { body: { rating: '5', extra: 'dropped' }, params: {}, query: {} };
  let called = false;
  validate({ body: rateBookingSchema })(req2, res, () => { called = true; });
  assert.ok(called);
  assert.deepEqual(req2.body, { rating: 5 });

  assert.throws(() => parseOrThrow(rateBookingSchema, { rating: 0 }), (err) => err.statusCode === 400 && err.code === 'VALIDATION_ERROR');
});

// ── Pagination, roles, refresh tokens ───────────────────────────

test('pagination helpers: invalid -> defaults, never above the maximum', () => {
  assert.equal(clampPage('abc'), 1);
  assert.equal(clampPage('-2'), 1);
  assert.equal(clampPage('7'), 7);
  assert.equal(clampLimit(undefined, 20), 20);
  assert.equal(clampLimit('1000000', 20), 100);
  assert.equal(clampLimit('0', 20), 20);
});

test('roles: farmers (user_type 3) are no longer pilots; legacy pilot rows with type 1/3 still are', () => {
  assert.equal(isPilotAccount(3, ['farmer']), false);         // the old [2, 3] check let every farmer in
  assert.equal(isPilotAccount(3, []), false);
  assert.equal(isPilotAccount(3, ['pilot']), true);           // older pilot account stored with type 3
  assert.equal(isPilotAccount(2, ['pilot']), true);
  assert.equal(isFarmerAccount(1, []), true);                 // older farmer accounts have type 1
  assert.equal(isFarmerAccount(3, ['farmer']), true);
  assert.equal(isFarmerAccount(1, ['pilot']), false);
  assert.equal(isFarmerAccount(2, ['manager']), false);       // admins
});

test('refresh tokens: only the one last issued (and stored) works', () => {
  assert.equal(refreshTokenMatches({ refresh_token: 'abc.def' }, 'abc.def'), true);
  assert.equal(refreshTokenMatches({ refresh_token: 'abc.def' }, 'abc.xyz'), false);
  assert.equal(refreshTokenMatches({ refresh_token: null }, ''), false);      // cleared by a password change
  assert.equal(refreshTokenMatches({ refresh_token: 'abc' }, undefined), false);
});
