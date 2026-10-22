import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRegistration, isUnclaimedAccount } from '../services/registration.service.js';

// A walk-in farmer's placeholder: made by administrator 7, never verified, never signed in
const placeholder = (extra = {}) => ({
  id: 50, user_type: 3, email: null, mobile_number: '9876500001', isEmailVerify: false, isMobileVerify: false,
  refresh_token: null, created_by: 7, ...extra,
});
// A person who registered themselves
const realAccount = (extra = {}) => ({
  id: 60, user_type: 3, email: 'ravi@example.com', mobile_number: '9876500002', isEmailVerify: true, isMobileVerify: true,
  refresh_token: 'tok', created_by: 60, ...extra,
});
const identity = { email: 'ravi@example.com', mobile: '9876500001' };
const proven = { email: true, mobile: true };

const refusal = (fn) => { try { fn(); } catch (e) { return e; } assert.fail('expected a refusal'); };

test('nobody uses the details: a new account is created', () => {
  assert.deepEqual(evaluateRegistration([], identity, proven, 3), { action: 'create' });
});

test('a placeholder made by an administrator can be claimed; real, self-made or unknown accounts cannot', () => {
  assert.equal(isUnclaimedAccount(placeholder()), true);
  assert.equal(isUnclaimedAccount(realAccount()), false);
  assert.equal(isUnclaimedAccount(placeholder({ isMobileVerify: true })), false);      // verified by its owner
  assert.equal(isUnclaimedAccount(placeholder({ refresh_token: 'x' })), false);        // someone has signed in
  assert.equal(isUnclaimedAccount(placeholder({ created_by: 50 })), false);            // made by the person themselves
  assert.equal(isUnclaimedAccount(placeholder({ created_by: null })), false);          // creator unknown: be careful
  assert.equal(isUnclaimedAccount(placeholder({ user_type: 2 })), false);              // pilots and admins are never placeholders
});

test('claiming needs proof of every detail that matched the placeholder', () => {
  const ok = evaluateRegistration([placeholder()], identity, proven, 3);
  assert.equal(ok.action, 'claim');
  assert.equal(ok.existing.id, 50);

  // matched by mobile, but only the e-mail was verified: the bookings must not go to whoever typed the number
  const err = refusal(() => evaluateRegistration([placeholder()], identity, { email: true, mobile: false }, 3));
  assert.equal(err.statusCode, 409);
  assert.equal(err.code, 'CLAIM_NEEDS_VERIFICATION');
  assert.match(err.message, /mobile number/);
});

test('a real account is refused with a message that says what to do and which detail matched', () => {
  const byEmail = refusal(() => evaluateRegistration([realAccount()], { email: 'ravi@example.com', mobile: '9000000000' }, proven, 3));
  assert.equal(byEmail.code, 'ALREADY_EXISTS');
  assert.equal(byEmail.field, 'email');
  assert.match(byEmail.message, /already exists with this email address.*log in/i);

  const byMobile = refusal(() => evaluateRegistration([realAccount()], { email: null, mobile: '9876500002' }, proven, 3));
  assert.equal(byMobile.field, 'mobile');
  assert.match(byMobile.message, /already exists with this mobile number/i);
});

test('details spread over two accounts, or a pilot sign-up on a farmer placeholder, are refused', () => {
  assert.equal(refusal(() => evaluateRegistration([placeholder(), realAccount()], { email: 'ravi@example.com', mobile: '9876500001' }, proven, 3)).code, 'ALREADY_EXISTS');
  assert.equal(refusal(() => evaluateRegistration([placeholder()], identity, proven, 2)).code, 'ALREADY_EXISTS');
});
