/**
 * Date helpers for booking / working-day logic.
 *
 * Convention used across the order flow:
 *   - A "working date" is a calendar date, stored as UTC midnight
 *     (e.g. 2026-10-04T00:00:00.000Z) in the DATE columns.
 *   - "Today" is always the calendar date in India (Asia/Kolkata), because that is
 *     where farmers and pilots are, regardless of the server's timezone.
 */

export const IST_TIMEZONE = 'Asia/Kolkata';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Date -> "YYYY-MM-DD" using its UTC calendar date (the storage convention). */
export const toYMD = (d) => {
  const dt = new Date(d);
  return [
    dt.getUTCFullYear(),
    String(dt.getUTCMonth() + 1).padStart(2, '0'),
    String(dt.getUTCDate()).padStart(2, '0'),
  ].join('-');
};

/** Today's calendar date in India as "YYYY-MM-DD". */
export const todayIST = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

/**
 * Parse a client-supplied date into a UTC-midnight Date, or null when invalid.
 *   "2026-10-04"                 -> 2026-10-04T00:00Z  (used as-is)
 *   "2026-10-04T00:00:00.000Z"   -> 2026-10-04T00:00Z  (already a stored working date)
 *   any other instant            -> the calendar date of that instant in India
 */
export const parseDateOnly = (input) => {
  if (input === null || input === undefined || input === '') return null;

  if (typeof input === 'string' && YMD_RE.test(input.trim())) {
    const d = new Date(`${input.trim()}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) || toYMD(d) !== input.trim() ? null : d;
  }

  const dt = new Date(input);
  if (Number.isNaN(dt.getTime())) return null;

  const isUtcMidnight =
    dt.getUTCHours() === 0 && dt.getUTCMinutes() === 0 &&
    dt.getUTCSeconds() === 0 && dt.getUTCMilliseconds() === 0;

  return new Date(`${isUtcMidnight ? toYMD(dt) : todayIST(dt)}T00:00:00.000Z`);
};

/** Add whole days to a UTC-midnight date without touching the local timezone. */
export const addDaysUTC = (date, days) => {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

/** Safely read the JSON blob the pilot flow keeps in SPRAYING_DAILY_LOGS.verification_comment. */
export const readDayData = (log) => {
  try {
    const parsed = log?.verification_comment ? JSON.parse(log.verification_comment) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

/** Day lifecycle shown to pilot / farmer: scheduled -> confirmed -> started -> completed (or declined by the pilot). */
export const getDayStatus = (log) => {
  const data = readDayData(log);
  if (data.day_status === 'completed') return 'completed';
  if (data.day_status === 'started') return 'started';
  if (log?.is_pilot_confirmed === true) return 'confirmed';
  if (log?.is_pilot_confirmed === false && data.declined_at) return 'declined';
  return 'scheduled';
};

/** Removes the "pilot declined" markers from a day's JSON (used when the day is re-requested or accepted after all). */
export const stripDecline = (data) => {
  const { declined_at, decline_reason, ...rest } = data || {};
  return rest;
};
