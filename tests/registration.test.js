import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmail, isValidEmail, normalizeMobile, validatePassword, parseDob, buildAddresses, parseAddressInput,
} from '../services/registration.service.js';

test('emails are compared lower-cased and any real domain is accepted (not only .com)', () => {
  assert.equal(normalizeEmail('  Ravi.Kumar@Example.IN '), 'ravi.kumar@example.in');
  for (const ok of ['a@b.in', 'a@b.co.in', 'a.b+c@sub.example.org']) assert.ok(isValidEmail(normalizeEmail(ok)), ok);
  for (const bad of ['', 'a@b', 'a b@c.com', '@c.com', 'a@.com']) assert.ok(!isValidEmail(normalizeEmail(bad)), bad);
});

test('mobile numbers: +91 / 91 / 0 prefixes are removed, longer input is rejected instead of cut', () => {
  assert.equal(normalizeMobile('98765 43210'), '9876543210');
  assert.equal(normalizeMobile('+91 98765 43210'), '9876543210');
  assert.equal(normalizeMobile('919876543210'), '9876543210');
  assert.equal(normalizeMobile('09876543210'), '9876543210');
  assert.equal(normalizeMobile('12345678901234'), null);   // used to be silently truncated to the last 10 digits
  assert.equal(normalizeMobile('98765'), null);
  assert.equal(normalizeMobile(null), null);
});

test('password policy: 8+ characters, and not longer than bcrypt reads (72 bytes)', () => {
  assert.equal(validatePassword('Secret123'), null);
  assert.match(validatePassword('short'), /at least 8/);
  assert.match(validatePassword(''), /required/);
  assert.match(validatePassword('x'.repeat(73)), /72/);
});

test('date of birth: dd/mm/yyyy or ISO, real dates only, never in the future', () => {
  assert.equal(parseDob('15/08/1990').value.toISOString().slice(0, 10), '1990-08-15');
  assert.equal(parseDob('1990-08-15').value.toISOString().slice(0, 10), '1990-08-15');
  assert.equal(parseDob('').value, null);
  assert.ok(parseDob('31/02/1990').error);
  assert.ok(parseDob('hello').error);
  assert.ok(parseDob('01/01/2999').error);
  assert.ok(parseDob('01/01/1800').error);
});

// A tiny in-memory stand-in for the location tables
const models = (() => {
  const make = (rows) => ({ findByPk: async (id) => rows.find((r) => r.id === id) || null });
  return {
    MasterState: make([{ id: 1 }, { id: 2 }]),
    MasterDistrict: make([{ id: 10, state_id: 1 }, { id: 20, state_id: 2 }]),
    MasterBlock: make([{ id: 100, district_id: 10 }, { id: 200, district_id: 20 }]),
  };
})();

const addr = (over = {}) => ({ state: 1, district: 10, block: 100, village: 'Hingna', pincode: '440016', lane1: 'Main Road', ...over });

test('a consistent address passes and is normalised, exactly one primary', async () => {
  const rows = await buildAddresses(models, [addr({ is_primary: 'true' }), addr({ is_primary: true })]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.is_primary), [true, false]);
  assert.equal(rows[0].lane_1, 'Main Road');
  assert.equal((await buildAddresses(models, [addr()]))[0].is_primary, true);
});

test('addresses that would store junk are refused instead of filled with placeholders', async () => {
  await assert.rejects(buildAddresses(models, [addr({ pincode: '000000' })]), /pincode/);
  await assert.rejects(buildAddresses(models, [addr({ pincode: '' })]), /pincode/);
  await assert.rejects(buildAddresses(models, [addr({ village: '' })]), /village/);
  await assert.rejects(buildAddresses(models, [addr({ state: 'abc' })]), /state is required/);
  await assert.rejects(buildAddresses(models, [addr({ state: 99 })]), /not a valid state/);
  await assert.rejects(buildAddresses(models, [addr({ district: 20 })]), /district does not belong/);
  await assert.rejects(buildAddresses(models, [addr({ block: 200 })]), /block does not belong/);
});

test('no address at all is allowed (nothing is invented)', async () => {
  assert.deepEqual(await buildAddresses(models, []), []);
  assert.deepEqual(parseAddressInput({}), []);
  assert.equal(parseAddressInput({ address: JSON.stringify([addr()]) }).length, 1);
  assert.throws(() => parseAddressInput({ address: '{not json' }), /not valid JSON/);
});

test('duplicate check looks for every spelling of a stored mobile number', async () => {
  const { findDuplicate } = await import('../services/registration.service.js');
  let seen;
  const User = { findOne: async ({ where }) => { seen = where; return null; } };
  await findDuplicate({ User }, { email: null, mobile: '9798297100' });
  const spellings = Object.getOwnPropertySymbols(seen.mobile_number).map((sym) => seen.mobile_number[sym]);
  assert.deepEqual(spellings[0], ['9798297100', '09798297100', '919798297100', '+919798297100']);
});

test('verification proof: a given e-mail must be verified; a farmer without e-mail needs the mobile verified', async () => {
  const { verificationProblem } = await import('../services/registration.service.js');
  const none = { email: false, mobile: false };
  // with an e-mail
  assert.equal(verificationProblem({ email: 'a@b.in' }, { email: true, mobile: false }), null);   // e-mail only (no SMS gateway)
  assert.equal(verificationProblem({ email: 'a@b.in' }, { email: true, mobile: true }), null);
  assert.match(verificationProblem({ email: 'a@b.in' }, { email: false, mobile: true }), /email/);  // cannot claim someone's address
  assert.match(verificationProblem({ email: 'a@b.in' }, none), /email/);
  // without an e-mail
  assert.equal(verificationProblem({ email: null }, { email: false, mobile: true }), null);
  assert.match(verificationProblem({ email: null }, none), /mobile number/);
});
