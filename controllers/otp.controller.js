import { randomInt, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';
import { Op, fn, col, where as sqlWhere } from 'sequelize';
import db from '../models/index.js';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { respondWithError } from '../middleware/errorHandler.js';
import { sendOtpEmail } from '../services/email.service.js';
import { isSmsConfigured, sendOtpSms } from '../services/sms.service.js';
import { findDuplicate } from '../services/registration.service.js';
import { sendOtpSchema, verifyOtpSchema } from '../validation/auth.schemas.js';
import { getRateStore } from '../services/rateStore.js';
import { createOtpGuard, hashOtp } from '../services/otpGuard.js';

const { OtpVerification, User } = db;

const policy = env.OTP;
// The guard (and with it the Redis connection) is created on the first OTP request
let guardInstance = null;
const guard = new Proxy({}, { get: (_, name) => (guardInstance ||= createOtpGuard({ store: getRateStore(), policy }))[name] });

/** Kept for callers that show the validity in minutes (e-mail text). */
export const OTP_EXPIRY_MINUTES = Math.round(policy.expirySeconds / 60);

// crypto.randomInt, not Math.random(): one-time codes must not be predictable
const generateOtp = () => randomInt(100000, 1000000).toString();

/** Compares a typed code with the stored HMAC (or, for rows written before hashing, the plain code). */
const codeMatches = (stored, typed) => {
  if (!stored || !typed) return false;
  const expected = stored.length === 64 ? stored : hashOtp(stored);   // 64 hex chars = already hashed
  const left = Buffer.from(expected);
  const right = Buffer.from(hashOtp(typed));
  return left.length === right.length && timingSafeEqual(left, right);
};

const fail = (res, status, message, extra = {}) => {
  if (extra.retry_after_seconds) res.set('Retry-After', String(extra.retry_after_seconds));
  return res.status(status).json({ success: false, error: message, message, ...extra });
};

/** A refusal from the guard, in the response shape the apps read. */
const refused = (res, r) =>
  fail(res, r.status, r.message, {
    code: r.code,
    retry_after_seconds: r.retryAfter,
    ...(r.resendAfterSeconds !== undefined && { resend_after_seconds: r.resendAfterSeconds }),
  });

/**
 * Which identifiers were sent, normalised and validated (zod: validation/auth.schemas.js). Returns the clean body
 * plus { email, mobile }, or { error } with the first problem, answered in the shape the apps already read.
 */
const readTargets = (schema, body) => {
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Validation failed' };
  return { ...parsed.data, email: parsed.data.email || null, mobile: parsed.data.mobile_number || null };
};

const targetFilter = ({ email, mobile }) => {
  const filters = [];
  if (email) filters.push(sqlWhere(fn('lower', col('email')), email));
  if (mobile) filters.push({ mobile_number: mobile });
  return { [Op.and]: filters };
};

const creatorIdFrom = (req) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    return decoded.id || decoded.userId || null;
  } catch {
    return null; // optional, only used for auditing
  }
};

// ═══════════════════════════════════════════════════════════════
//  GET /api/otp/settings
//  What the apps need to draw the OTP screen before anything is sent.
// ═══════════════════════════════════════════════════════════════
export const getOtpSettings = (req, res) =>
  res.status(200).json({
    success: true,
    otp_length: 6,
    expires_in_seconds: policy.expirySeconds,
    resend_after_seconds: policy.resendSeconds,
    max_sends_per_window: Math.min(policy.maxSendsPerIp, policy.maxSendsPerTarget),
    window_minutes: Math.round(policy.windowSeconds / 60),
    max_verify_attempts: policy.maxVerifyAttempts,
    mobile_otp_available: isSmsConfigured(),
  });

// ═══════════════════════════════════════════════════════════════
//  POST /api/otp/send-otp   { email?, mobile_number?, purpose? }   (also used to RESEND)
// ═══════════════════════════════════════════════════════════════
export const sendOtp = async (req, res) => {
  try {
    const body = readTargets(sendOtpSchema, req.body);
    if (body.error) return fail(res, 400, body.error, { code: 'VALIDATION_ERROR' });
    const { email, mobile } = body;

    // A mobile code is only created when an SMS can really be delivered. Pretending ("OTP sent") when no gateway
    // is connected leaves the person waiting for a text that will never arrive.
    const smsAvailable = isSmsConfigured();
    if (!email && !smsAvailable) {
      return fail(res, 503, 'Verifying a mobile number by SMS is not available right now. Please sign up with an email address instead.', { code: 'SMS_UNAVAILABLE' });
    }

    // Only registration needs the account NOT to exist yet
    const isRegistration = !body.purpose || body.purpose === 'registration';
    if (isRegistration) {
      const duplicate = await findDuplicate({ User }, { email, mobile });
      if (duplicate) return fail(res, 409, duplicate, { code: 'ALREADY_EXISTS' });
    }

    // Blocks, cooldown and the per-IP / per-recipient limits (Redis)
    const gate = await guard.beforeSend({ ip: req.ip, email, mobile });
    if (!gate.ok) return refused(res, gate);

    const emailOtp = email ? generateOtp() : null;
    const mobileOtp = mobile && smsAvailable ? generateOtp() : null;

    // A new code replaces the previous ones for these identifiers: only the latest code works
    const row = await db.sequelize.transaction(async (t) => {
      await OtpVerification.update(
        { expires_at: new Date(), modified_on: new Date() },
        { where: { ...targetFilter({ email, mobile }), expires_at: { [Op.gt]: new Date() }, is_email_verified: false, is_mobile_verified: false }, transaction: t }
      );
      return OtpVerification.create({
        email,
        mobile_number: mobile,
        email_otp: emailOtp ? hashOtp(emailOtp) : null,
        mobile_otp: mobileOtp ? hashOtp(mobileOtp) : null,
        expires_at: new Date(Date.now() + policy.expirySeconds * 1000),
        is_email_verified: false,
        is_mobile_verified: false,
        created_by: creatorIdFrom(req),
      }, { transaction: t });
    });

    try {
      if (emailOtp) await sendOtpEmail(email, emailOtp, OTP_EXPIRY_MINUTES);
      if (mobileOtp) await sendOtpSms(mobile, mobileOtp, OTP_EXPIRY_MINUTES);
    } catch (deliveryError) {
      // The code can never reach the person: remove it and let them retry at once (no cooldown)
      await row.destroy().catch(() => {});
      await gate.release().catch(() => {});
      logger.error(`sendOtp: delivery failed (${deliveryError.code || deliveryError.name}): ${deliveryError.message}`);
      return fail(res, 503, 'We could not send the verification code right now. Please try again in a few minutes.', { code: 'OTP_DELIVERY_FAILED' });
    }

    const channels = [emailOtp && 'email', mobileOtp && 'mobile number'].filter(Boolean).join(' and ');
    return res.status(200).json({
      success: true,
      message: `OTP sent successfully to ${channels}.`,
      // Which codes the person must enter: the app shows only the boxes that apply
      email_otp_required: Boolean(emailOtp),
      mobile_otp_required: Boolean(mobileOtp),
      expires_in_seconds: policy.expirySeconds,
      // The app shows "Resend" after exactly this many seconds (OTP_RESEND_COOLDOWN_SECONDS)
      resend_after_seconds: gate.resendAfterSeconds,
      sends_remaining: gate.sendsRemaining,
      dev_otps: env.EXPOSE_DEV_OTPS ? { email_otp: emailOtp, mobile_otp: mobileOtp } : undefined,
    });
  } catch (error) {
    return respondWithError(req, res, error, 'sendOtp');
  }
};

// ═══════════════════════════════════════════════════════════════
//  POST /api/otp/verify-otp   { email?, mobile_number?, email_otp?, mobile_otp? }
// ═══════════════════════════════════════════════════════════════
export const verifyOtp = async (req, res) => {
  try {
    const body = readTargets(verifyOtpSchema, req.body);          // email_otp / mobile_otp come back trimmed
    if (body.error) return fail(res, 400, body.error, { code: 'VALIDATION_ERROR' });
    const { email, mobile } = body;

    const gate = await guard.beforeVerify({ email, mobile });
    if (!gate.ok) return refused(res, gate);

    // The latest code issued for exactly these details (send and verify must use the same email/mobile)
    const record = await OtpVerification.findOne({
      where: targetFilter({ email, mobile }),
      order: [['created_on', 'DESC']],
    });
    if (!record) {
      return fail(res, 400, 'No code was requested for these details. Tap "Send OTP" first (or again, if you changed your email or mobile number).', { code: 'OTP_NOT_FOUND' });
    }
    if (record.attempts >= policy.maxVerifyAttempts) {
      return fail(res, 400, 'Too many wrong attempts for this code. Please request a new code.', { code: 'OTP_ATTEMPTS_EXCEEDED', attempts_remaining: 0 });
    }
    if (new Date() > new Date(record.expires_at)) {
      return fail(res, 400, 'This code has expired. Please request a new code.', { code: 'OTP_EXPIRED' });
    }

    const wrongCode = async (which) => {
      await record.increment('attempts');
      await record.reload();
      const lock = await guard.failedVerify({ email, mobile });
      if (lock.blocked) {
        return fail(res, 429, lock.message, { code: 'OTP_BLOCKED', retry_after_seconds: lock.retryAfter });
      }
      const remaining = Math.max(0, policy.maxVerifyAttempts - record.attempts);
      return remaining === 0
        ? fail(res, 400, 'Too many wrong attempts for this code. Please request a new code.', { code: 'OTP_ATTEMPTS_EXCEEDED', attempts_remaining: 0 })
        : fail(res, 400, `Incorrect ${which} OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`, { code: 'OTP_INVALID', attempts_remaining: remaining });
    };

    let emailVerified = false;
    let mobileVerified = false;

    if (email) {
      if (!record.email_otp) return fail(res, 400, 'No email code was requested for these details.', { code: 'OTP_NOT_FOUND' });
      if (!body.email_otp) return fail(res, 400, 'Email OTP is required.', { code: 'VALIDATION_ERROR' });
      if (!codeMatches(record.email_otp, body.email_otp)) return wrongCode('email');
      emailVerified = true;
    }

    // A mobile code exists only when an SMS was really sent; without one the mobile number simply stays unverified
    if (mobile && record.mobile_otp) {
      if (!body.mobile_otp) return fail(res, 400, 'Mobile OTP is required.', { code: 'VALIDATION_ERROR' });
      if (!codeMatches(record.mobile_otp, body.mobile_otp)) return wrongCode('mobile');
      mobileVerified = true;
    }

    if (!emailVerified && !mobileVerified) {
      return fail(res, 400, 'Nothing to verify: no code was issued for the details provided.', { code: 'OTP_NOT_FOUND' });
    }

    await record.update({
      ...(emailVerified && { is_email_verified: true }),
      ...(mobileVerified && { is_mobile_verified: true }),
      modified_on: new Date(),
    });
    await guard.succeededVerify({ email, mobile });

    const message = emailVerified && mobileVerified ? 'Both verified successfully.'
      : emailVerified ? 'Email is verified successfully.' : 'Mobile is verified successfully.';
    return res.status(200).json({ success: true, message, isEmailVerify: emailVerified, isMobileVerify: mobileVerified });
  } catch (error) {
    return respondWithError(req, res, error, 'verifyOtp');
  }
};
