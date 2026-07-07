import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Joi from 'joi';
import logger from '../utils/logger.js';

// Resolve .env relative to THIS file (config/env.js → project root)
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const envPath    = path.resolve(__dirname, '../.env');

dotenv.config({ path: envPath });

const envSchema = Joi.object({
  // ── Database ──────────────────────────────────────────────────
  DB_HOST:     Joi.string().required(),
  DB_USER:     Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').optional(), // allowing empty just in case local dev has no pass
  DB_NAME:     Joi.string().required(),
  DB_PORT:     Joi.number().default(5432),
  DB_DIALECT:  Joi.string().valid('mysql', 'postgres', 'sqlite', 'mariadb', 'mssql').required(),

  // ── App ───────────────────────────────────────────────────────
  PORT:     Joi.number().default(5678),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),

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
  EMAIL_FROM_ADDRESS: Joi.string().optional(),
  EMAIL_FROM_NAME:    Joi.string().default('DARHUB Admin'),

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
  SMTP_PASS:          envVars.SMTP_PASS,
  EMAIL_FROM_ADDRESS: envVars.EMAIL_FROM_ADDRESS || envVars.SMTP_USER,
  EMAIL_FROM_NAME:    envVars.EMAIL_FROM_NAME,

  // ── Cloudinary ───────────────────────────────────────────────
  CLOUD_SECRET: envVars.CLOUD_SECRET,
  CLOUD_KEY:    envVars.CLOUD_KEY,
  CLOUD_NAME:   envVars.CLOUD_NAME,
};

export default env;
