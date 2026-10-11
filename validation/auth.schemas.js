import { z, text, optional, email, mobile, password, dob } from './common.js';

// ── POST /api/login ──────────────────────────────────────────────
// The password policy is not applied here: accounts created before it existed may have shorter passwords.
export const loginSchema = z.object({
  email: z.any().optional(),
  mobile_number: z.any().optional(),
  identifier: z.any().optional(),
  password: z.string({ required_error: 'Email/Mobile and password are required', invalid_type_error: 'Password must be text' })
    .min(1, 'Email/Mobile and password are required')
    .max(200, 'Password is too long'),
}).transform((body, ctx) => {
  const raw = [body.email, body.mobile_number, body.identifier].find((v) => typeof v === 'string' && v.trim() !== '')
    ?? (typeof body.mobile_number === 'number' ? String(body.mobile_number) : undefined);
  if (!raw) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['identifier'], message: 'Email/Mobile and password are required' });
    return z.NEVER;
  }
  const identifier = raw.trim();
  if (identifier.length > 254) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['identifier'], message: 'Email/Mobile is too long' });
    return z.NEVER;
  }
  return { identifier, password: body.password };
});

// ── POST /api/otp/send-otp, /api/otp/verify-otp ──────────────────
const otpTargets = {
  email: optional(email()),
  mobile_number: optional(mobile()),
};
const atLeastOne = (body) => Boolean(body.email || body.mobile_number);
const ONE_REQUIRED = { message: 'Either email or mobile number must be provided', path: ['email'] };

export const sendOtpSchema = z.object({
  ...otpTargets,
  purpose: z.string().trim().max(30).optional(),
}).refine(atLeastOne, ONE_REQUIRED);

const otpCode = (label) => z.preprocess(
  (v) => (v === undefined || v === null || v === '' ? undefined : String(v).trim()),
  z.string().max(10, `${label} is not valid`).optional(),
);

export const verifyOtpSchema = z.object({
  ...otpTargets,
  email_otp: otpCode('Email OTP'),
  mobile_otp: otpCode('Mobile OTP'),
}).refine(atLeastOne, ONE_REQUIRED);

// ── Registration (farmer, pilot) ─────────────────────────────────
// Verification flags in the body (isverifyEmail, isMobileVerify, role) are not read: unknown fields are dropped.
export const registrationIdentitySchema = ({ emailRequired = true } = {}) => z.object({
  first_name: text('First name', { max: 60 }),
  last_name: text('Last name', { max: 60 }),
  email: emailRequired ? email() : optional(email()),
  mobile_number: mobile(),
  password: password(),
  dob: dob(),
});
