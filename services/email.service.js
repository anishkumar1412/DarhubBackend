import nodemailer from 'nodemailer';
import env from '../config/env.js';
import {
  adminSetupEmailTemplate,
  adminPasswordResetEmailTemplate,
} from './emailTemplates.js';

// ── Transporter singleton ─────────────────────────────────────────
let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host:   env.SMTP_HOST,
    port:   env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  return transporter;
};

/**
 * Verify SMTP connection on server start.
 * Logs a warning if the config is missing — won't crash the server.
 */
export const verifyEmailConnection = async () => {
  if (!env.SMTP_HOST || !env.SMTP_USER) {
    console.warn(
      '⚠️  [Email] SMTP config missing. Admin setup/reset emails will not be sent.'
    );
    return;
  }
  try {
    await getTransporter().verify();
    console.log('✅ [Email] SMTP connection verified.');
  } catch (err) {
    console.warn('⚠️  [Email] SMTP connection failed:', err.message);
  }
};

// ── Core send helper ──────────────────────────────────────────────
const sendEmail = async ({ to, subject, html }) => {
  if (!env.SMTP_HOST || !env.SMTP_USER) {
    // Dev fallback: log the email content so you can copy the link
    console.log('\n📧 [Dev Email] ─────────────────────────────────');
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log('HTML content omitted — check the link logged above.');
    console.log('────────────────────────────────────────────────\n');
    return;
  }

  await getTransporter().sendMail({
    from:    `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM_ADDRESS}>`,
    to,
    subject,
    html,
    text: html.replace(/<[^>]+>/g, ''),
  });
};

// ── Public helpers ────────────────────────────────────────────────

export const sendAdminSetupEmail = (to, fullName, setupLink) =>
  sendEmail({
    to,
    subject: 'Set up your DARHUB admin account',
    html:    adminSetupEmailTemplate(fullName, setupLink, env.ADMIN_SETUP_EXPIRY_HOURS),
  });

export const sendPasswordResetEmail = (to, fullName, resetLink) =>
  sendEmail({
    to,
    subject: 'Password reset request — DARHUB Admin',
    html:    adminPasswordResetEmailTemplate(fullName, resetLink),
  });