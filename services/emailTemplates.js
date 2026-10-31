// ── Escaping ─────────────────────────────────────────────────────
// Everything that ends up inside the HTML (names typed by an admin, links) goes through these, so a name such as
// `<script>` or `"><a href=evil>` can never change the structure of the e-mail.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Only http(s) links are allowed in a button/href; anything else (javascript:, data:) becomes "#". */
const safeUrl = (url) => {
  try {
    const u = new URL(String(url));
    return u.protocol === 'http:' || u.protocol === 'https:' ? escapeHtml(u.toString()) : '#';
  } catch {
    return '#';
  }
};

// ── Base wrapper ─────────────────────────────────────────────────
const wrap = (content, title = 'DARHUB') => `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;
            background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
  <div style="background:#143d65;padding:20px 28px;">
    <h1 style="color:#fff;margin:0;font-size:20px;letter-spacing:0.5px;">${escapeHtml(title)}</h1>
  </div>
  <div style="padding:28px;">
    ${content}
  </div>
  <div style="background:#f9fafb;padding:14px 28px;border-top:1px solid #e5e7eb;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">
      This is an automated message. Do not reply to this email.
    </p>
  </div>
</div>`;

const btn = (href, label) => `
<a href="${safeUrl(href)}"
   style="display:inline-block;background:#143d65;color:#fff;padding:11px 26px;
          border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0;">
  ${escapeHtml(label)}
</a>`;

const hours = (n) => `${n} hour${Number(n) === 1 ? '' : 's'}`;

// ── Templates ─────────────────────────────────────────────────────
// Each template returns { html, text }: the plain-text part is written out (not stripped from the HTML) so the
// links stay readable in clients that do not render HTML.

export const adminSetupEmailTemplate = (fullName, setupLink, expiryHours = 24) => ({
  html: wrap(`
    <h2 style="color:#0f172a;margin-top:0;">Welcome, ${escapeHtml(fullName)}!</h2>
    <p style="color:#374151;line-height:1.6;">
      You have been invited to the <strong>DARHUB Admin Panel</strong>.
      Click the button below to set your password and activate your account.
    </p>
    <p style="color:#dc2626;font-weight:600;">⏱ This link expires in ${escapeHtml(hours(expiryHours))}.</p>
    ${btn(setupLink, 'Set Up My Account')}
    <p style="color:#6b7280;font-size:13px;margin-top:20px;">
      Or paste this link in your browser:<br/>
      <a href="${safeUrl(setupLink)}" style="color:#2563eb;word-break:break-all;">${escapeHtml(setupLink)}</a>
    </p>
    <p style="color:#9ca3af;font-size:12px;">
      If you did not expect this invitation, you can safely ignore this email.
    </p>
  `, 'DARHUB Admin'),
  text: [
    `Welcome, ${fullName}!`,
    '',
    'You have been invited to the DARHUB Admin Panel.',
    'Open this link to set your password and activate your account:',
    setupLink,
    '',
    `This link expires in ${hours(expiryHours)}.`,
    'If you did not expect this invitation, you can safely ignore this email.',
  ].join('\n'),
});

export const adminPasswordResetEmailTemplate = (fullName, resetLink, expiryHours = 1) => ({
  html: wrap(`
    <h2 style="color:#0f172a;margin-top:0;">Password Reset Request</h2>
    <p style="color:#374151;line-height:1.6;">Hi <strong>${escapeHtml(fullName)}</strong>,</p>
    <p style="color:#374151;line-height:1.6;">
      We received a password reset request for your DARHUB admin account.
      Click the button below to set a new password.
    </p>
    <p style="color:#dc2626;font-weight:600;">⏱ This link expires in ${escapeHtml(hours(expiryHours))}.</p>
    ${btn(resetLink, 'Reset My Password')}
    <p style="color:#6b7280;font-size:13px;margin-top:20px;">
      Or paste this link in your browser:<br/>
      <a href="${safeUrl(resetLink)}" style="color:#2563eb;word-break:break-all;">${escapeHtml(resetLink)}</a>
    </p>
    <p style="color:#9ca3af;font-size:12px;">
      If you did not request this, your account is safe — ignore this email.
    </p>
  `, 'DARHUB Admin'),
  text: [
    `Hi ${fullName},`,
    '',
    'We received a password reset request for your DARHUB admin account.',
    'Open this link to set a new password:',
    resetLink,
    '',
    `This link expires in ${hours(expiryHours)}.`,
    'If you did not request this, your account is safe — ignore this email.',
  ].join('\n'),
});

export const otpEmailTemplate = (otp, expiryMinutes = 3) => ({
  html: wrap(`
    <h2 style="color:#0f172a;margin-top:0;">Your verification code</h2>
    <p style="color:#374151;line-height:1.6;">Use this code to verify your email address:</p>
    <p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#143d65;margin:16px 0;">${escapeHtml(otp)}</p>
    <p style="color:#dc2626;font-weight:600;">⏱ This code is valid for ${escapeHtml(expiryMinutes)} minutes.</p>
    <p style="color:#9ca3af;font-size:12px;">
      Never share this code with anyone. DARHUB will never ask you for it. If you did not request it, ignore this email.
    </p>
  `, 'DARHUB'),
  text: [
    `Your DARHUB verification code is: ${otp}`,
    '',
    `It is valid for ${expiryMinutes} minutes.`,
    'Never share this code with anyone. If you did not request it, ignore this email.',
  ].join('\n'),
});
