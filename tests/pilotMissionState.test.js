import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveStates } from '../utils/pilotMissionState.js';
import { getDayStatus } from '../utils/dateUtils.js';

// A daily log as the database holds it: the day lifecycle lives in is_pilot_confirmed + the JSON in verification_comment
const log = (day, extra = {}) => {
  const base = {
    scheduled: { is_pilot_confirmed: null },
    confirmed: { is_pilot_confirmed: true },
    started: { is_pilot_confirmed: true, verification_comment: JSON.stringify({ day_status: 'started' }) },
    completed: { is_pilot_confirmed: true, verification_comment: JSON.stringify({ day_status: 'completed' }) },
    declined: { is_pilot_confirmed: false, verification_comment: JSON.stringify({ declined_at: '2026-10-01T00:00:00Z' }) },
  }[day];
  return { ...base, ...extra };
};

const states = (orderStatus, ...days) => {
  const logs = days.map((d) => (typeof d === 'string' ? log(d) : d));
  return deriveStates({ order_status: orderStatus }, logs.map(getDayStatus), logs);
};

test('a day that needs an answer is a new request, not an order yet', () => {
  assert.deepEqual(states('ORDER_PLACED', 'scheduled', 'scheduled'), { request_status: 'PENDING', mission_state: null });
});

test('all days accepted -> upcoming order', () => {
  assert.deepEqual(states('ORDER_ACCEPTED', 'confirmed', 'confirmed'), { request_status: 'ACCEPTED', mission_state: 'UPCOMING' });
});

test('a running day makes the order ACTIVE', () => {
  assert.deepEqual(states('JOB_STARTED', 'started', 'confirmed'), { request_status: 'ACCEPTED', mission_state: 'ACTIVE' });
});

test('REGRESSION: admin adds a new day to an accepted booking -> the accepted days stay visible and startable', () => {
  // before the fix mission_state was null here, so the order vanished from the pilot's Orders screen
  assert.deepEqual(states('WAITING_FOR_CONFIRMATION', 'confirmed', 'scheduled'), { request_status: 'PENDING', mission_state: 'UPCOMING' });
});

test('REGRESSION: a day is running while a new unanswered day is added -> still ACTIVE so the pilot can end it', () => {
  assert.deepEqual(states('JOB_STARTED', 'started', 'scheduled'), { request_status: 'PENDING', mission_state: 'ACTIVE' });
});

test('all accepted days finished but a new day is waiting -> not finished yet', () => {
  assert.deepEqual(states('JOB_ENDED', 'completed', 'scheduled'), { request_status: 'PENDING', mission_state: 'UPCOMING' });
});

test('all days finished -> waiting for verification, then completed once verified', () => {
  assert.deepEqual(states('ORDER_COMPLETED', 'completed', 'completed'), { request_status: 'ACCEPTED', mission_state: 'PENDING_VERIFICATION' });
  assert.deepEqual(
    states('ORDER_COMPLETED', log('completed', { is_verified: true }), log('completed', { is_verified: true })),
    { request_status: 'ACCEPTED', mission_state: 'COMPLETED' }
  );
});

test('declining every day -> DECLINED with no mission', () => {
  assert.deepEqual(states('WAITING_FOR_CONFIRMATION', 'declined', 'declined'), { request_status: 'DECLINED', mission_state: null });
});

test('a cancelled booking is cancelled for the pilot whatever the days say', () => {
  assert.deepEqual(states('ORDER_CANCELLED', 'confirmed'), { request_status: 'CANCELLED', mission_state: 'CANCELLED' });
});
