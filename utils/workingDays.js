/**
 * How many working days a booking of N acres takes, from the admin's acreage bands (MASTER_WORKING_DAYS).
 *
 * Bands are inclusive ranges such as 1-5 = 2 days, 6-10 = 4 days. Real input does not always land inside one:
 *  - fractional acres (5.5) fall between 5 and 6, and admins leave gaps (20 -> 24) between bands;
 *    those take the NEXT band up (never fewer days than a smaller field would get);
 *  - acres above the largest band are extrapolated from that band's days-per-acre, rounded up, and never fewer
 *    than the band itself (70 acres = 16 days, so 71 acres is not 15);
 *  - with no band at all, a default drone capacity of DEFAULT_ACRES_PER_DAY is used.
 * Only an administrator's num_of_days is honoured, and only when no band applies: the Farmer app never chooses
 * the length of its own booking.
 */
export const DEFAULT_ACRES_PER_DAY = 5;

const toBand = (row) => ({
  id: row.id,
  min: Number(row.min_acre),
  max: Number(row.max_acre),
  days: Number(row.working_days),
});

const usable = (b) => Number.isFinite(b.min) && Number.isFinite(b.max) && Number.isInteger(b.days) && b.days > 0 && b.min <= b.max;

/**
 * @param {number} acres                  > 0
 * @param {Array}  rows                   active MASTER_WORKING_DAYS rows ({ min_acre, max_acre, working_days })
 * @param {object} [opts]
 * @param {number} [opts.requestedDays]   num_of_days sent by an administrator
 * @returns {{ days: number, source: 'band'|'next_band'|'extrapolated'|'requested'|'default', bandId?: number }}
 */
export const resolveWorkingDays = (acres, rows = [], { requestedDays } = {}) => {
  const bands = rows.map(toBand).filter(usable).sort((a, b) => a.min - b.min || a.max - b.max);

  const exact = bands.find((b) => acres >= b.min && acres <= b.max);
  if (exact) return { days: exact.days, source: 'band', bandId: exact.id };

  const next = bands.find((b) => b.min > acres);
  if (next) return { days: next.days, source: 'next_band', bandId: next.id };

  const top = bands.reduce((best, b) => (!best || b.max > best.max ? b : best), null);
  if (top && top.max > 0) {
    const days = Math.max(top.days, Math.ceil((acres * top.days) / top.max));
    return { days, source: 'extrapolated', bandId: top.id };
  }

  if (Number.isInteger(requestedDays) && requestedDays > 0) return { days: requestedDays, source: 'requested' };
  return { days: Math.max(1, Math.ceil(acres / DEFAULT_ACRES_PER_DAY)), source: 'default' };
};

/**
 * Checks a band the admin is about to save against the other active bands: a larger field must never be given
 * fewer days than a smaller one. Returns an error message, or null when the band is consistent.
 * (Overlaps are checked separately by the controller.)
 */
export const findDaysOrderConflict = (candidate, otherRows = []) => {
  const c = toBand(candidate);
  const others = otherRows.map(toBand).filter(usable);
  // Name the nearest offending band: that is the one the admin is most likely comparing against
  const smaller = others.filter((o) => o.max < c.min && o.days > c.days).sort((a, b) => b.max - a.max)[0];
  if (smaller) {
    return `${c.min}-${c.max} acres cannot take fewer days (${c.days}) than the smaller band ${smaller.min}-${smaller.max} acres (${smaller.days} days).`;
  }
  const larger = others.filter((o) => o.min > c.max && o.days < c.days).sort((a, b) => a.min - b.min)[0];
  if (larger) {
    return `${c.min}-${c.max} acres cannot take more days (${c.days}) than the larger band ${larger.min}-${larger.max} acres (${larger.days} days).`;
  }
  return null;
};
