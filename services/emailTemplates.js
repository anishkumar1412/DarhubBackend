// ── Base wrapper ─────────────────────────────────────────────────
const wrap = (content) => `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;
            background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
  <div style="background:#143d65;padding:20px 28px;">
    <h1 style="color:#fff;margin:0;font-size:20px;letter-spacing:0.5px;">DARHUB Admin</h1>
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
<a href="${href}"
   style="display:inline-block;background:#143d65;color:#fff;padding:11px 26px;
          border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0;">
  ${label}
</a>`;

// ── Templates ─────────────────────────────────────────────────────

export const adminSetupEmailTemplate = (fullName, setupLink, expiryHours = 24) =>
  wrap(`
    <h2 style="color:#0f172a;margin-top:0;">Welcome, ${fullName}!</h2>
    <p style="color:#374151;line-height:1.6;">
      You have been invited to the <strong>DARHUB Admin Panel</strong>.
      Click the button below to set your password and activate your account.
    </p>
    <p style="color:#dc2626;font-weight:600;">⏱ This link expires in ${expiryHours} hours.</p>
    ${btn(setupLink, 'Set Up My Account')}
    <p style="color:#6b7280;font-size:13px;margin-top:20px;">
      Or paste this link in your browser:<br/>
      <a href="${setupLink}" style="color:#2563eb;word-break:break-all;">${setupLink}</a>
    </p>
    <p style="color:#9ca3af;font-size:12px;">
      If you did not expect this invitation, you can safely ignore this email.
    </p>
  `);

export const adminPasswordResetEmailTemplate = (fullName, resetLink) =>
  wrap(`
    <h2 style="color:#0f172a;margin-top:0;">Password Reset Request</h2>
    <p style="color:#374151;line-height:1.6;">Hi <strong>${fullName}</strong>,</p>
    <p style="color:#374151;line-height:1.6;">
      We received a password reset request for your DARHUB admin account.
      Click the button below to set a new password.
    </p>
    <p style="color:#dc2626;font-weight:600;">⏱ This link expires in 1 hour.</p>
    ${btn(resetLink, 'Reset My Password')}
    <p style="color:#6b7280;font-size:13px;margin-top:20px;">
      Or paste this link in your browser:<br/>
      <a href="${resetLink}" style="color:#2563eb;word-break:break-all;">${resetLink}</a>
    </p>
    <p style="color:#9ca3af;font-size:12px;">
      If you did not request this, your account is safe — ignore this email.
    </p>
  `);
