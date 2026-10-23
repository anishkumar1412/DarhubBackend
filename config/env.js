import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Joi from 'joi';
import logger from '../utils/logger.js';

// Resolve .env relative to THIS file (config/env.js → project root). ENV_FILE points elsewhere, e.g. a test setup
// against a local database: ENV_FILE=.env.test node server.js
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const envPath    = process.env.ENV_FILE ? path.resolve(process.env.ENV_FILE) : path.resolve(__dirname, '../.env');

dotenv.config({ path: envPath });

const envSchema = Joi.object({
  // ── Database ──────────────────────────────────────────────────
  DB_HOST:     Joi.string().required(),
  DB_USER:     Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').optional(), // allowing empty just in case local dev has no pass
  DB_NAME:     Joi.string().required(),
  DB_PORT:     Joi.number().default(5432),
  DB_DIALECT:  Joi.string().valid('mysql', 'postgres', 'sqlite', 'mariadb', 'mssql').required(),
  DB_SSL:      Joi.boolean().default(true),   // false only for a local database without TLS (tests)

  // ── App ───────────────────────────────────────────────────────
  PORT:     Joi.number().default(5678),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  // OTPs are returned in API responses while the project is still in development/testing (on Render too).
  // GO-LIVE: set EXPOSE_OTP=false on the server, otherwise anyone can read the codes.
  EXPOSE_OTP: Joi.boolean().default(true),

  // ── JWT ───────────────────────────────────────────────────────
  JWT_SECRET:         Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().optional(),

  // ── Admin auth ────────────────────────────────────────────────
  ADMIN_TOKEN_EXPIRY:       Joi.string().default('8h'),
  ADMIN_PANEL_URL:          Joi.string().default('http://localhost:3001'),
  SUPER_ADMIN_EMAIL:        Joi.string().email().optional(),
  SUPER_ADMIN_NAME:         Joi.string().default('Super Admin'),
  ADMIN_SETUP_EXPIRY_HOURS: Joi.number().default(24),
  ADMIN_RESET_EXPIRY_HOURS: Joi.number().default(1),

  // ── Email / SMTP ─────────────────────────────────────────────
  SMTP_HOST:          Joi.string().optional(),
  SMTP_PORT:          Joi.number().default(587),
  SMTP_USER:          Joi.string().optional(),
  SMTP_PASS:          Joi.string().optional(),
  SMTP_SECURE:        Joi.boolean().optional(), // default: true only for port 465
  EMAIL_FROM_ADDRESS: Joi.string().optional(),
  EMAIL_FROM_NAME:    Joi.string().default('DARHUB Admin'),

  // ── OTP / SMS ────────────────────────────────────────────────
  // 'console' prints mobile OTPs to the server log (development only); 'none' = no SMS gateway is connected.
  SMS_PROVIDER:     Joi.string().valid('none', 'console').optional(),
  OTP_EXPIRY_SECONDS:          Joi.number().integer().min(60).max(3600).default(180),  // how long a code is valid
  OTP_RESEND_COOLDOWN_SECONDS: Joi.number().integer().min(10).max(600).default(30),    // wait before "Resend" (also the app's countdown)
  OTP_SEND_WINDOW_MINUTES:     Joi.number().integer().min(1).max(1440).default(15),    // window for the two send limits below
  OTP_MAX_SENDS_PER_IP:        Joi.number().integer().min(1).max(1000).default(5),     // codes one network may request per window
  OTP_MAX_SENDS_PER_TARGET:    Joi.number().integer().min(1).max(1000).default(5),     // codes one phone/email may receive per window
  OTP_MAX_VERIFY_ATTEMPTS:     Joi.number().integer().min(1).max(20).default(Number(process.env.MAX_OTP_ATTEMPTS) || 3), // wrong tries per code
  OTP_MAX_FAILED_VERIFIES:     Joi.number().integer().min(1).max(100).default(10),     // wrong tries per phone/email per window -> block
  OTP_BLOCK_MINUTES:           Joi.number().integer().min(1).max(1440).default(15),    // how long that block lasts

  // ── Redis (OTP limits, shared by every server instance) ──────
  // redis://[:password@]host:6379  or  rediss://... for TLS (managed Redis: Render Key Value, Upstash, ElastiCache)
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).optional(),
  // Namespace for every key, so several environments (dev / staging / production) can share one Redis safely
  REDIS_KEY_PREFIX: Joi.string().pattern(/^[\w:.-]{1,64}$/).optional(),

  // ── HTTP / platform ──────────────────────────────────────────
  TRUST_PROXY:    Joi.number().integer().min(0).default(1),   // number of reverse proxies in front (Render = 1)
  RATE_LIMIT_MAX: Joi.number().integer().min(10).default(1000), // requests per user/IP per 15 minutes
  CORS_ORIGINS:   Joi.string().allow('').optional(),          // extra allowed browser origins, comma separated
  DB_SYNC_ALTER:  Joi.boolean().optional(),                   // run `sync({ alter: true })` on boot (never by default in production)
  // Refuse booking requests without an Idempotency-Key header. Leave off until every app version in use sends one.
  IDEMPOTENCY_KEY_REQUIRED: Joi.boolean().default(false),

  // ── Cloudinary ───────────────────────────────────────────────
  CLOUD_SECRET: Joi.string().optional(),
  CLOUD_KEY:    Joi.string().optional(),
  CLOUD_NAME:   Joi.string().optional(),
}).unknown(true); // Allow other variables in .env

const { error, value: envVars } = envSchema.validate(process.env, { abortEarly: false });

if (error) {
  const errorMessage = error.details.map((detail) => detail.message).join(', ');
  if (logger && logger.error) {
      logger.error(`❌ Config validation error: ${errorMessage}`);
  } else {
      console.error(`❌ Config validation error: ${errorMessage}`);
  }
  process.exit(1);
}

const env = {
  // ── Database ──────────────────────────────────────────────────
  DB_HOST:     envVars.DB_HOST,
  DB_USER:     envVars.DB_USER,
  DB_PASSWORD: envVars.DB_PASSWORD,
  DB_NAME:     envVars.DB_NAME,
  DB_PORT:     envVars.DB_PORT,
  DB_DIALECT:  envVars.DB_DIALECT,
  DB_SSL:      envVars.DB_SSL,

  // ── App ───────────────────────────────────────────────────────
  PORT:     envVars.PORT,
  NODE_ENV: envVars.NODE_ENV,

  // ── JWT ───────────────────────────────────────────────────────
  JWT_SECRET:         envVars.JWT_SECRET,
  JWT_REFRESH_SECRET: envVars.JWT_REFRESH_SECRET,

  // ── Admin auth ────────────────────────────────────────────────
  ADMIN_TOKEN_EXPIRY:       envVars.ADMIN_TOKEN_EXPIRY,
  ADMIN_PANEL_URL:          envVars.ADMIN_PANEL_URL,
  SUPER_ADMIN_EMAIL:        envVars.SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_NAME:         envVars.SUPER_ADMIN_NAME,
  ADMIN_SETUP_EXPIRY_HOURS: envVars.ADMIN_SETUP_EXPIRY_HOURS,
  ADMIN_RESET_EXPIRY_HOURS: envVars.ADMIN_RESET_EXPIRY_HOURS,

  // ── Email / SMTP ─────────────────────────────────────────────
  SMTP_HOST:          envVars.SMTP_HOST,
  SMTP_PORT:          envVars.SMTP_PORT,
  SMTP_USER:          envVars.SMTP_USER,
  // Gmail shows app passwords as "abcd efgh ijkl mnop"; the spaces are not part of the password
  SMTP_PASS:          /(^|\.)gmail\.com$/i.test(envVars.SMTP_HOST || '') ? envVars.SMTP_PASS?.replace(/\s+/g, '') : envVars.SMTP_PASS,
  SMTP_SECURE:        envVars.SMTP_SECURE ?? envVars.SMTP_PORT === 465,
  EMAIL_FROM_ADDRESS: envVars.EMAIL_FROM_ADDRESS || envVars.SMTP_USER,
  EMAIL_FROM_NAME:    envVars.EMAIL_FROM_NAME,

  // ── OTP / SMS ────────────────────────────────────────────────
  // NODE_ENV=development, or EXPOSE_OTP=true on any server: the generated OTPs are returned in the API response (no
  // mailbox / SMS gateway needed; delivery is attempted in the background and its failure is ignored).
  // Otherwise (production, test): OTPs are only delivered by email / SMS and never appear in a response.
  EXPOSE_DEV_OTPS: envVars.NODE_ENV === 'development' || envVars.EXPOSE_OTP === true,
  SMS_PROVIDER:    envVars.SMS_PROVIDER ?? (envVars.NODE_ENV === 'production' && envVars.EXPOSE_OTP !== true ? 'none' : 'console'),
  OTP: {
    expirySeconds: envVars.OTP_EXPIRY_SECONDS,
    resendSeconds: envVars.OTP_RESEND_COOLDOWN_SECONDS,
    windowSeconds: envVars.OTP_SEND_WINDOW_MINUTES * 60,
    maxSendsPerIp: envVars.OTP_MAX_SENDS_PER_IP,
    maxSendsPerTarget: envVars.OTP_MAX_SENDS_PER_TARGET,
    maxVerifyAttempts: envVars.OTP_MAX_VERIFY_ATTEMPTS,
    maxFailedVerifies: envVars.OTP_MAX_FAILED_VERIFIES,
    blockSeconds: envVars.OTP_BLOCK_MINUTES * 60,
  },
  REDIS_URL: envVars.REDIS_URL,
  REDIS_KEY_PREFIX: envVars.REDIS_KEY_PREFIX || `darhub:${envVars.NODE_ENV}:`,

  // ── HTTP / platform ──────────────────────────────────────────
  TRUST_PROXY:    envVars.TRUST_PROXY,
  RATE_LIMIT_MAX: envVars.RATE_LIMIT_MAX,
  CORS_ORIGINS:   (envVars.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean),
  DB_SYNC_ALTER:  envVars.DB_SYNC_ALTER,
  IDEMPOTENCY_KEY_REQUIRED: envVars.IDEMPOTENCY_KEY_REQUIRED,

  // ── Cloudinary ───────────────────────────────────────────────
  CLOUD_SECRET: envVars.CLOUD_SECRET,
  CLOUD_KEY:    envVars.CLOUD_KEY,
  CLOUD_NAME:   envVars.CLOUD_NAME,
};

if (env.NODE_ENV === 'production' && env.EXPOSE_DEV_OTPS) {
  logger.warn('[OTP] EXPOSE_OTP is on: verification codes are returned in API responses. Set EXPOSE_OTP=false before going live.');
}

export default env;
