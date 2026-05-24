/**
 * adminRateLimiter.js  — in-memory rate limiter (no Redis required)
 *
 * Uses a plain Map.  For multi-process / cluster deployments switch to Redis.
 */

const MAX_LOGIN_ATTEMPTS   = 5;
const LOGIN_LOCKOUT_MS     = 15 * 60 * 1000; // 15 minutes

const MAX_FORGOT_ATTEMPTS  = 3;
const FORGOT_WINDOW_MS     = 60 * 60 * 1000; // 1 hour

// Map<email, { count, resetAt }>
const loginStore  = new Map();
const forgotStore = new Map();

// ── helpers ──────────────────────────────────────────────────────

const getEntry = (store, key) => {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.resetAt) {
    store.delete(key);
    return null;
  }
  return entry;
};

const increment = (store, key, windowMs) => {
  const existing = getEntry(store, key);
  if (existing) {
    existing.count += 1;
    return existing.count;
  }
  store.set(key, { count: 1, resetAt: Date.now() + windowMs });
  return 1;
};

// ── Login ─────────────────────────────────────────────────────────

export const checkLoginRateLimit = (email) => {
  const entry = getEntry(loginStore, email);
  if (entry && entry.count >= MAX_LOGIN_ATTEMPTS) {
    const remainingMs = entry.resetAt - Date.now();
    const minutes     = Math.ceil(remainingMs / 60000);
    return {
      blocked: true,
      message: `Too many failed login attempts. Try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`,
    };
  }
  return { blocked: false };
};

export const incrementLoginFailure = (email) => {
  increment(loginStore, email, LOGIN_LOCKOUT_MS);
};

export const resetLoginAttempts = (email) => {
  loginStore.delete(email);
};

// ── Forgot password ──────────────────────────────────────────────

export const checkForgotRateLimit = (email) => {
  const entry = getEntry(forgotStore, email);
  if (entry && entry.count >= MAX_FORGOT_ATTEMPTS) {
    const remainingMs = entry.resetAt - Date.now();
    const minutes     = Math.ceil(remainingMs / 60000);
    return {
      blocked: true,
      message: `Too many password reset requests. Try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`,
    };
  }
  increment(forgotStore, email, FORGOT_WINDOW_MS);
  return { blocked: false };
};

// ── Express middlewares ───────────────────────────────────────────

export const adminLoginRateLimiter = (req, res, next) => {
  const { email } = req.body;
  if (!email) return next();

  const check = checkLoginRateLimit(email);
  if (check.blocked) {
    return res.status(429).json({ success: false, message: check.message });
  }
  next();
};

export const adminForgotPasswordRateLimiter = (req, res, next) => {
  const { email } = req.body;
  if (!email) return next();

  const check = checkForgotRateLimit(email);
  if (check.blocked) {
    return res.status(429).json({ success: false, message: check.message });
  }
  next();
};
