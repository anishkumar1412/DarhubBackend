import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWorkingDays, findDaysOrderConflict, DEFAULT_ACRES_PER_DAY } from '../utils/workingDays.js';

// Bands as Postgres returns them (DECIMAL columns arrive as strings), with gaps 10 -> 11 and 20 -> 24
const bands = [
  { id: 1, min_acre: '1.00', max_acre: '5.00', working_days: 2 },
  { id: 2, min_acre: '6.00', max_acre: '10.00', working_days: 4 },
  { id: 3, min_acre: '11.00', max_acre: '20.00', working_days: 7 },
  { id: 4, min_acre: '24.00', max_acre: '36.00', working_days: 9 },
  { id: 5, min_acre: '46.00', max_acre: '70.00', working_days: 16 },
];

test('working days: an acreage inside a band uses that band, bounds included', () => {
  assert.deepEqual(resolveWorkingDays(1, bands), { days: 2, source: 'band', bandId: 1 });
  assert.equal(resolveWorkingDays(5, bands).days, 2);
  assert.equal(resolveWorkingDays(6, bands).days, 4);
  assert.equal(resolveWorkingDays(70, bands).days, 16);
});

test('working days: fractions and gaps between bands take the NEXT band up (they used to fall back to acres/5)', () => {
  assert.deepEqual(resolveWorkingDays(5.5, bands), { days: 4, source: 'next_band', bandId: 2 });
  assert.equal(resolveWorkingDays(10.5, bands).days, 7);
  assert.equal(resolveWorkingDays(22, bands).days, 9);
  assert.equal(resolveWorkingDays(40, bands).days, 16);
  assert.equal(resolveWorkingDays(0.5, bands).days, 2, 'below the smallest band');
});

test('working days: above the largest band is extrapolated and never drops below that band', () => {
  const at71 = resolveWorkingDays(71, bands);
  assert.equal(at71.source, 'extrapolated');
  assert.ok(at71.days >= 16, `71 acres gave ${at71.days} days, fewer than 70 acres`);
  assert.equal(resolveWorkingDays(140, bands).days, 32);
  assert.equal(resolveWorkingDays(1000, bands).days, Math.ceil((1000 * 16) / 70));
});

test('working days: never fewer days for more acres (monotonic over 0.25 .. 300 acres)', () => {
  let previous = 0;
  for (let acres = 0.25; acres <= 300; acres += 0.25) {
    const { days } = resolveWorkingDays(acres, bands);
    assert.ok(days >= previous, `${acres} acres -> ${days} days, but a smaller field got ${previous}`);
    previous = days;
  }
});

test('working days: a requested num_of_days only applies when no band exists; otherwise capacity default', () => {
  assert.equal(resolveWorkingDays(3, bands, { requestedDays: 1 }).days, 2, 'bands win over a requested length');
  assert.deepEqual(resolveWorkingDays(12, [], { requestedDays: 3 }), { days: 3, source: 'requested' });
  assert.deepEqual(resolveWorkingDays(12, []), { days: Math.ceil(12 / DEFAULT_ACRES_PER_DAY), source: 'default' });
  assert.equal(resolveWorkingDays(12, [], { requestedDays: 0 }).source, 'default');
});

test('working days: broken rows (min > max, non-integer days) are ignored', () => {
  const rows = [{ id: 9, min_acre: '10', max_acre: '1', working_days: 3 }, { id: 8, min_acre: '1', max_acre: '5', working_days: 2.5 }];
  assert.equal(resolveWorkingDays(3, rows).source, 'default');
});

test('band order check: a larger band may not take fewer days than a smaller one, and vice versa', () => {
  assert.match(findDaysOrderConflict({ min_acre: 24, max_acre: 36, working_days: 3 }, bands.filter((b) => b.id !== 4)),
    /cannot take fewer days \(3\) than the smaller band 11-20 acres \(7 days\)/);
  assert.match(findDaysOrderConflict({ min_acre: 1, max_acre: 5, working_days: 5 }, bands.filter((b) => b.id !== 1)),
    /cannot take more days \(5\) than the larger band 6-10 acres \(4 days\)/);
  assert.equal(findDaysOrderConflict({ min_acre: 71, max_acre: 90, working_days: 20 }, bands), null);
  assert.equal(findDaysOrderConflict({ min_acre: 21, max_acre: 23, working_days: 7 }, bands), null, 'equal days are fine');
});
