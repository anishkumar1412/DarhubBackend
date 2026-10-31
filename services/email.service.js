import nodemailer from 'nodemailer';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import {
  adminSetupEmailTemplate,
  adminPasswordResetEmailTemplate,
  otpEmailTemplate,
} from './emailTemplates.js';

const isProduction = env.NODE_ENV === 'production';

/** True when enough SMTP settings exist to actually send mail. */
export const isEmailConfigured = () => Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);

/**
 * A failed send, classified so callers can answer sensibly without parsing nodemailer messages.
 * `code` is one of EMAIL_NOT_CONFIGURED | EMAIL_AUTH_FAILED | EMAIL_CONNECTION_FAILED | EMAIL_REJECTED | EMAIL_FAILED.
 */
export class EmailError extends Error {
  constructor(code, message, { cause } = {}) {
    super(message);
    this.name = 'EmailError';
    this.code = code;
    this.cause = cause;
  }
}

// ── Transporter singleton ─────────────────────────────────────────
let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host:   env.SMTP_HOST,
    port:   env.SMTP_PORT,
    secure: env.SMTP_SECURE,                 // implicit TLS (465)
    requireTLS: !env.SMTP_SECURE,            // STARTTLS (587) is mandatory: never send credentials in clear text
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    tls: { minVersion: 'TLSv1.2' },

    // Reuse connections instead of a new TLS handshake + login per e-mail (and stay under provider login limits)
    pool: true,
    maxConnections: 3,
    maxMessages: 100,

    // Without these a blocked/black-holed SMTP port hangs for minutes, and with it the request that sent the mail
    connectionTimeout: 8_000,
    greetingTimeout:   8_000,
    socketTimeout:     15_000,
  });

  return transporter;
};

// ── Error handling ────────────────────────────────────────────────

const TRANSIENT_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'ECONNECTION', 'ESOCKET', 'EDNS', 'ECONNREFUSED', 'EAI_AGAIN']);

/** Network hiccups and temporary (4xx) SMTP answers are worth one more try; bad credentials or a rejected address are not. */
const isTransient = (err) =>
  TRANSIENT_CODES.has(err?.code) || (err?.responseCode >= 400 && err?.responseCode < 500);

const classify = (err) => {
  if (err?.code === 'EAUTH' || err?.responseCode === 535) {
    return new EmailError(
      'EMAIL_AUTH_FAILED',
      'The mail server rejected the SMTP username/password. For Gmail use a 16-character App Password (2-Step Verification must be on), not the account password.',
      { cause: err }
    );
  }
  if (err?.code === 'EENVELOPE' || (err?.responseCode >= 500 && err?.responseCode < 600)) {
    return new EmailError('EMAIL_REJECTED', `The mail server refused the message: ${err.response || err.message}`, { cause: err });
  }
  if (TRANSIENT_CODES.has(err?.code)) {
    return new EmailError(
      'EMAIL_CONNECTION_FAILED',
      `Could not reach the mail server ${env.SMTP_HOST}:${env.SMTP_PORT} (${err.code}). ` +
      'If this only happens once deployed, the hosting provider is probably blocking outbound SMTP ' +
      '(Render, for example, blocks ports 25/465/587 on free instances): use a paid instance or an e-mail API provider.',
      { cause: err }
    );
  }
  return new EmailError('EMAIL_FAILED', err?.message || 'The email could not be sent.', { cause: err });
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Startup check ─────────────────────────────────────────────────

/**
 * Verify SMTP on server start. Never throws and never blocks the server from starting:
 * an e-mail outage must not take the API down.
 */
export const verifyEmailConnection = async () => {
  if (!isEmailConfigured()) {
    logger.warn(
      `[Email] SMTP is not configured (SMTP_HOST, SMTP_USER, SMTP_PASS). ${
        isProduction ? 'Emails cannot be sent: invitations, password resets and OTPs will fail.' : 'Emails will be printed to the console instead.'
      }`
    );
    return false;
  }
  if (isProduction && /localhost|127\.0\.0\.1/.test(env.ADMIN_PANEL_URL)) {
    logger.warn(`[Email] ADMIN_PANEL_URL is "${env.ADMIN_PANEL_URL}" in production: links in emails will not work for recipients.`);
  }
  try {
    await getTransporter().verify();
    logger.info(`[Email] SMTP connection verified (${env.SMTP_HOST}:${env.SMTP_PORT}).`);
    return true;
  } catch (err) {
    logger.warn(`[Email] SMTP verification failed: ${classify(err).message}`);
    return false;
  }
};

// ── Core send helper ──────────────────────────────────────────────

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
const MAX_ATTEMPTS = 2;

/**
 * Sends one message. Resolves with { messageId } or throws an [EmailError].
 * `text` is the plain-text alternative (spam filters penalise HTML-only mail).
 */
const sendEmail = async ({ to, subject, html, text }) => {
  if (typeof to !== 'string' || !EMAIL_RE.test(to.trim())) {
    throw new EmailError('EMAIL_REJECTED', 'The recipient email address is not valid.');
  }
  const recipient = to.trim();

  if (!isEmailConfigured()) {
    if (isProduction) {
      // Pretending to succeed here would tell the user "email sent" while nothing was sent.
      throw new EmailError('EMAIL_NOT_CONFIGURED', 'Email is not configured on this server.');
    }
    logger.info(`\n📧 [Dev Email] ─────────────────────────────────\nTo:      ${recipient}\nSubject: ${subject}\n\n${text}\n────────────────────────────────────────────────`);
    return { messageId: 'dev-console' };
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const info = await getTransporter().sendMail({
        from: { name: env.EMAIL_FROM_NAME, address: env.EMAIL_FROM_ADDRESS },
        to: recipient,
        subject,
        html,
        text,
      });
      if (info.rejected?.length) {
        throw Object.assign(new Error(`Recipient rejected: ${info.rejected.join(', ')}`), { code: 'EENVELOPE' });
      }
      return { messageId: info.messageId };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS && isTransient(err)) {
        logger.warn(`[Email] Attempt ${attempt} to send "${subject}" failed (${err.code || err.responseCode}); retrying.`);
        await sleep(750 * attempt);
        continue;
      }
      break;
    }
  }

  const failure = classify(lastError);
  // The recipient and subject only: bodies hold one-time links/codes and must never reach the logs.
  logger.error(`[Email] Could not send "${subject}" to ${recipient}: [${failure.code}] ${failure.message}`);
  throw failure;
};

// ── Public helpers ────────────────────────────────────────────────

export const sendAdminSetupEmail = (to, fullName, setupLink) => {
  const { html, text } = adminSetupEmailTemplate(fullName, setupLink, env.ADMIN_SETUP_EXPIRY_HOURS);
  return sendEmail({ to, subject: 'Set up your DARHUB admin account', html, text });
};

export const sendPasswordResetEmail = (to, fullName, resetLink) => {
  const { html, text } = adminPasswordResetEmailTemplate(fullName, resetLink, env.ADMIN_RESET_EXPIRY_HOURS);
  return sendEmail({ to, subject: 'Password reset request — DARHUB Admin', html, text });
};

export const sendOtpEmail = (to, otp, expiryMinutes = 3) => {
  const { html, text } = otpEmailTemplate(otp, expiryMinutes);
  return sendEmail({ to, subject: 'Your DARHUB verification code', html, text });
};
