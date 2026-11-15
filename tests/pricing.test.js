import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePrice, roundMoney, sameDayBookingClosed, sameDayBookingProblem, SAME_DAY_BOOKING_CUTOFF } from '../utils/pricing.js';

// IST = UTC+5:30, so 09:29 UTC is 14:59 IST and 09:30 UTC is 15:00 IST.
const at = (iso) => new Date(iso);

test('price: rate x acres, 5% tax on top, total = price + tax - discount (paise rounding)', () => {
  assert.deepEqual(calculatePrice(380, 3), { price: 1140, tax: 57, discount: 0, total_price: 1197 });
  assert.deepEqual(calculatePrice(350, 8), { price: 2800, tax: 140, discount: 0, total_price: 2940 });
  assert.equal(calculatePrice(333.33, 1.5).total_price, roundMoney(499.995 + roundMoney(499.995 * 0.05)));
});

test('price: missing or zero rate never produces NaN', () => {
  assert.equal(calculatePrice(null, 5).total_price, 0);
  assert.equal(calculatePrice(undefined, 5).price, 0);
});

test('same-day cutoff is decided on India time, not the server or phone clock', () => {
  assert.equal(SAME_DAY_BOOKING_CUTOFF, '15:00');
  assert.equal(sameDayBookingClosed(at('2026-10-31T09:29:00Z')), false);   // 14:59 IST
  assert.equal(sameDayBookingClosed(at('2026-10-31T09:30:00Z')), true);    // 15:00 IST
  assert.equal(sameDayBookingClosed(at('2026-10-31T20:00:00Z')), false);   // 01:30 IST next day: a new booking day
});

test('same-day cutoff only blocks today, never a later date', () => {
  const now = at('2026-10-31T10:00:00Z');                                   // 15:30 IST
  assert.match(sameDayBookingProblem(new Date('2026-10-31T00:00:00Z'), now), /closes at 15:00/);
  assert.equal(sameDayBookingProblem(new Date('2026-11-01T00:00:00Z'), now), null);
  assert.equal(sameDayBookingProblem(new Date('2026-10-31T00:00:00Z'), at('2026-10-31T05:00:00Z')), null);  // 10:30 IST
});
