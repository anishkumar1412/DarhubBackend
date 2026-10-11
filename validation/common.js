import { z } from 'zod';
import {
  normalizeEmail, isValidEmail, normalizeMobile, validatePassword, parseDob,
} from '../services/registration.service.js';
import { parseDateOnly, todayIST, toYMD, addDaysUTC } from '../utils/dateUtils.js';
import { clampPage, clampLimit } from '../utils/pagination.js';

/**
 * Building blocks for request validation. Every field helper:
 *  - accepts what the apps really send (multipart forms send everything as text, so numbers and booleans arrive
 *    as strings, and an empty form field arrives as ""),
 *  - returns the clean, normalised value (trimmed text, 10-digit mobile, lower-cased e-mail, Date objects),
 *  - fails with a message a farmer or pilot can act on.
 */

// "" and null mean "not sent" for optional fields (an empty multipart field, or a JSON null)
const blank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const unlessBlank = (fn) => (v) => (blank(v) ? undefined : fn(v));

// ── Text ─────────────────────────────────────────────────────────

export const text = (label, { max = 255, min = 1 } = {}) =>
  z.preprocess(
    unlessBlank((v) => (typeof v === 'number' ? String(v) : v)),
    z.string({ required_error: `${label} is required`, invalid_type_error: `${label} must be text` })
      .trim()
      .min(min, min > 1 ? `${label} must be at least ${min} characters` : `${label} is required`)
      .max(max, `${label} must be ${max} characters or fewer`),
  );

/**
 * Optional field: absent, null and "" all mean "not sent" (zod's own `.optional()` only accepts undefined, so a
 * JSON null or an empty form field would otherwise be reported as missing).
 */
export const optional = (schema) => z.preprocess((v) => (blank(v) ? undefined : v), schema.optional());

export const optionalText = (label, opts) => optional(text(label, opts));

// ── Numbers ──────────────────────────────────────────────────────

/** Positive whole number (a database id). Accepts "12" as well as 12. */
export const id = (label) =>
  z.preprocess(
    unlessBlank((v) => (typeof v === 'string' ? Number(v.trim()) : v)),
    z.number({ required_error: `${label} is required`, invalid_type_error: `${label} must be a number` })
      .int(`${label} must be a whole number`)
      .positive(`${label} is not valid`),
  );

export const number = (label, { min, max, positive = false } = {}) => {
  let schema = z.number({ required_error: `${label} is required`, invalid_type_error: `${label} must be a number` })
    .finite(`${label} must be a number`);
  if (positive) schema = schema.positive(`${label} must be greater than 0`);
  if (min !== undefined) schema = schema.min(min, `${label} must be at least ${min}`);
  if (max !== undefined) schema = schema.max(max, `${label} must be at most ${max}`);
  return z.preprocess(unlessBlank((v) => (typeof v === 'string' ? Number(v.trim()) : v)), schema);
};

export const integer = (label, { min, max } = {}) => {
  let schema = z.number({ required_error: `${label} is required`, invalid_type_error: `${label} must be a number` })
    .int(`${label} must be a whole number`);
  if (min !== undefined) schema = schema.min(min, `${label} must be at least ${min}`);
  if (max !== undefined) schema = schema.max(max, `${label} must be at most ${max}`);
  return z.preprocess(unlessBlank((v) => (typeof v === 'string' ? Number(v.trim()) : v)), schema);
};

/** true / false, also as the strings "true" / "false" (multipart forms). */
export const booleanish = (label) =>
  z.preprocess(
    unlessBlank((v) => (v === 'true' ? true : v === 'false' ? false : v)),
    z.boolean({ invalid_type_error: `${label} must be true or false` }),
  );

// ── Identity ─────────────────────────────────────────────────────

export const EMAIL_MESSAGE = 'Invalid email format. Enter a valid email address, e.g. name@example.com';
export const MOBILE_MESSAGE = 'Mobile number must be exactly 10 digits';

export const email = () =>
  z.preprocess(
    unlessBlank((v) => (typeof v === 'string' ? normalizeEmail(v) : v)),
    z.string({ required_error: 'Email is required', invalid_type_error: EMAIL_MESSAGE }).refine(isValidEmail, EMAIL_MESSAGE),
  );

/** Normalised to the 10 digits that are stored ("+91 98765 43210" -> "9876543210"). */
export const mobile = (label = 'Mobile number') =>
  z.preprocess(
    unlessBlank((v) => (typeof v === 'string' || typeof v === 'number' ? normalizeMobile(v) ?? 'invalid' : v)),
    z.string({ required_error: `${label} is required`, invalid_type_error: MOBILE_MESSAGE })
      .regex(/^\d{10}$/, label === 'Mobile number' ? MOBILE_MESSAGE : `${label} must be exactly 10 digits`),
  );

export const password = () =>
  z.string({ required_error: 'Password is required', invalid_type_error: 'Password is required' })
    .superRefine((value, ctx) => {
      const problem = validatePassword(value);
      if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
    });

/** dd/mm/yyyy or yyyy-mm-dd, a real date, not in the future. Returns a Date (or undefined when not sent). */
export const dob = () =>
  z.any().transform((value, ctx) => {
    if (blank(value)) return undefined;
    const parsed = parseDob(value);
    if (parsed.error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: parsed.error });
      return z.NEVER;
    }
    return parsed.value;
  });

// ── Addresses / banking ──────────────────────────────────────────

export const pincode = () =>
  z.preprocess(
    unlessBlank((v) => String(v).trim()),
    z.string({ required_error: 'pincode is required' }).regex(/^[1-9]\d{5}$/, 'pincode must be a valid 6-digit pincode'),
  );

export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const ifsc = () =>
  z.preprocess(
    unlessBlank((v) => String(v).trim().toUpperCase()),
    z.string({ required_error: 'ifsc_code is required' }).regex(IFSC_RE, 'ifsc_code is invalid (e.g. SBIN0001234)'),
  );

export const accountNumber = () =>
  z.preprocess(
    unlessBlank((v) => String(v).replace(/\s+/g, '')),
    z.string({ required_error: 'acc_number is required' }).regex(/^\d{9,18}$/, 'acc_number must be 9 to 18 digits'),
  );

export const upiId = () =>
  z.preprocess(
    unlessBlank((v) => String(v).trim()),
    z.string({ required_error: 'upi_id is required' })
      .max(100, 'upi_id is too long')
      .regex(/^[\w.-]{2,}@[a-zA-Z][\w.-]*$/, 'upi_id is invalid (e.g. name@bank)'),
  );

// ── Dates ────────────────────────────────────────────────────────

// The admin panel sends "2026-10-5"; pad it to "2026-10-05" so it is read as a calendar date, not a local instant
const padYmd = (v) => {
  if (typeof v !== 'string') return v;
  const m = v.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : v.trim();
};

/**
 * A booking date: a real calendar date (UTC midnight), not before today in India and at most `maxDaysAhead` days
 * ahead. Returns a Date.
 */
export const bookingDate = (label, { maxDaysAhead = 365 } = {}) =>
  z.any().transform((value, ctx) => {
    if (blank(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is required` });
      return z.NEVER;
    }
    const date = parseDateOnly(padYmd(value));
    if (!date) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a valid date (YYYY-MM-DD)` });
      return z.NEVER;
    }
    const today = todayIST();
    if (toYMD(date) < today) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} cannot be in the past` });
      return z.NEVER;
    }
    if (toYMD(date) > toYMD(addDaysUTC(new Date(`${today}T00:00:00.000Z`), maxDaysAhead))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} cannot be more than ${maxDaysAhead} days ahead` });
      return z.NEVER;
    }
    return date;
  });

// ── URL parameters ───────────────────────────────────────────────

export const idParam = (name = 'id', label = name) => z.object({ [name]: id(label) });

export const uuidParam = (name = 'booking_id', label = name) =>
  z.object({ [name]: z.string().trim().uuid(`${label} is not valid`) });

// ── Pagination ───────────────────────────────────────────────────

/** Lenient on purpose (older clients send odd values): see utils/pagination.js. */
export const pagination = ({ defaultLimit = 10, maxLimit = 100 } = {}) => z.object({
  page: z.any().transform(clampPage),
  limit: z.any().transform((v) => clampLimit(v, defaultLimit, maxLimit)),
});

export { z };
