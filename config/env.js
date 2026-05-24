import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve .env relative to THIS file (config/env.js → project root)
// This works regardless of which directory nodemon/node is launched from.
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const envPath    = path.resolve(__dirname, '../.env');

dotenv.config({ path: envPath });

// Validate the critical DB dialect early so the error is obvious
if (!process.env.DB_DIALECT) {
  console.error(
    '❌ [env] DB_DIALECT is not set. Check your .env file at:', envPath
  );
  process.exit(1);
}

const env = {
  // ── Database ──────────────────────────────────────────────────
  DB_HOST:     process.env.DB_HOST,
  DB_USER:     process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_NAME:     process.env.DB_NAME,
  DB_PORT:     process.env.DB_PORT,
  DB_DIALECT:  process.env.DB_DIALECT,

  // ── App ───────────────────────────────────────────────────────
  PORT:     process.env.PORT     || 5678,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // ── JWT ───────────────────────────────────────────────────────
  JWT_SECRET:         process.env.JWT_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,

  // ── Admin auth ────────────────────────────────────────────────
  ADMIN_TOKEN_EXPIRY:       process.env.ADMIN_TOKEN_EXPIRY       || '8h',
  ADMIN_PANEL_URL:          process.env.ADMIN_PANEL_URL          || 'http://localhost:3001',
  SUPER_ADMIN_EMAIL:        process.env.SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_NAME:         process.env.SUPER_ADMIN_NAME         || 'Super Admin',
  ADMIN_SETUP_EXPIRY_HOURS: Number(process.env.ADMIN_SETUP_EXPIRY_HOURS) || 24,
  ADMIN_RESET_EXPIRY_HOURS: Number(process.env.ADMIN_RESET_EXPIRY_HOURS) || 1,

  // ── Email / SMTP ─────────────────────────────────────────────
  SMTP_HOST:          process.env.SMTP_HOST,
  SMTP_PORT:          Number(process.env.SMTP_PORT) || 587,
  SMTP_USER:          process.env.SMTP_USER,
  SMTP_PASS:          process.env.SMTP_PASS,
  EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER,
  EMAIL_FROM_NAME:    process.env.EMAIL_FROM_NAME    || 'DARHUB Admin',

  // ── Cloudinary ───────────────────────────────────────────────
  CLOUD_SECRET: process.env.CLOUD_SECRET,
  CLOUD_KEY:    process.env.CLOUD_KEY,
  CLOUD_NAME:   process.env.CLOUD_NAME,
};

export default env;
