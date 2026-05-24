import crypto from 'crypto';
import env from '../config/env.js';

/**
 * One-time setup / reset token
 *   raw   → goes in the email link
 *   hashed → stored in DB (SHA-256)
 */
export const generateOneTimeToken = () => {
  const raw    = crypto.randomBytes(32).toString('hex'); // 64-char hex
  const hashed = hashToken(raw);
  return { raw, hashed };
};

/**
 * SHA-256 hash — never store raw tokens in DB
 */
export const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

/**
 * Build the setup-password link for a new admin
 */
export const buildSetupLink = (rawToken) =>
  `${env.ADMIN_PANEL_URL}/setup-password?token=${rawToken}`;

/**
 * Build the password-reset link
 */
export const buildResetLink = (rawToken) =>
  `${env.ADMIN_PANEL_URL}/reset-password?token=${rawToken}`;
