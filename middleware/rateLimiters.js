import jwt from 'jsonwebtoken';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const WINDOW_MS = 15 * 60 * 1000;

/**
 * Signed-in traffic is counted per user (their verified token), everything else per client IP.
 * Counting the apps' traffic per IP would let a few pilots on one mobile-carrier address (or one office
 * Wi-Fi) lock each other out.
 */
export const rateLimitKey = (req) => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const { id } = jwt.verify(header.slice(7), process.env.JWT_SECRET);
      if (id) return `user:${id}`;
    } catch { /* unsigned/expired token: fall back to the IP */ }
  }
  return ipKeyGenerator(req.ip);
};

const tooManyRequests = (message) => (req, res, next, options) => {
  const retryAfter = Math.ceil(options.windowMs / 1000);
  res.set('Retry-After', String(res.getHeader('Retry-After') || retryAfter));
  res.status(429).json({ success: false, code: 'RATE_LIMITED', message, error: message });
};

/** Whole API: generous, because the apps call several endpoints on every screen. */
export const createApiLimiter = (limit) => rateLimit({
  windowMs: WINDOW_MS,
  limit,
  keyGenerator: rateLimitKey,
  skip: (req) => req.method === 'OPTIONS',
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyRequests('Too many requests. Please wait a few minutes and try again.'),
});

/** Sign-in, OTP and password flows: strict, per IP. This is what stops password guessing and OTP/email spam. */
export const createAuthLimiter = (limit = 30) => rateLimit({
  windowMs: WINDOW_MS,
  limit,
  skip: (req) => req.method === 'OPTIONS',
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyRequests('Too many attempts. Please wait 15 minutes and try again.'),
});
