import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';

import db from '../models/index.js';
import env from '../config/env.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  generateOneTimeToken,
  hashToken,
  buildSetupLink,
  buildResetLink,
} from '../utils/adminToken.util.js';
import {
  checkLoginRateLimit,
  incrementLoginFailure,
  resetLoginAttempts,
} from '../utils/adminRateLimiter.js';
import {
  sendAdminSetupEmail,
  sendPasswordResetEmail,
} from '../services/email.service.js';

const {
  User,
  AdminProfile,
  UserRole,
  MasterRole,
  MasterRolePrivilage,
  MasterPrivilage,
  sequelize,
} = db;

// ── helpers ────────────────────────────────────────────────────────

const loadPermissions = async (userId) => {
  const userRole = await UserRole.findOne({ where: { user_id: userId } });
  if (!userRole) return [];

  const rolePrivs = await MasterRolePrivilage.findAll({
    where: { role_id: userRole.role_id },
  });
  const privIds = rolePrivs.map((rp) => rp.privilage_id);
  if (!privIds.length) return [];

  const privs = await MasterPrivilage.findAll({ where: { id: privIds } });
  return privs.map((p) => p.privilage_name);
};

const loadRole = async (userId) => {
  const userRole = await UserRole.findOne({ where: { user_id: userId } });
  if (!userRole) return null;
  const role = await MasterRole.findByPk(userRole.role_id);
  return role?.role_name || null;
};

const signToken = (payload) =>
  jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.ADMIN_TOKEN_EXPIRY || '8h',
  });

// ─────────────────────────────────────────────────────────────────
// POST /api/admin/auth/login
// Flow: email + password → check rate limit → verify credentials
//       → load permissions → issue JWT
// ─────────────────────────────────────────────────────────────────
export const adminLoginController = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, 'Email and password are required.');
  }

  // Rate limit check
  const rlCheck = checkLoginRateLimit(email);
  if (rlCheck.blocked) {
    return res.status(429).json({ success: false, message: rlCheck.message });
  }

  // Find user
  const user = await User.findOne({ where: { email, user_type: 2 } });
  if (!user) {
    incrementLoginFailure(email);
    throw new ApiError(401, 'Invalid email or password.');
  }

  // Find admin profile
  const profile = await AdminProfile.findOne({ where: { user_id: user.id } });
  if (!profile) {
    incrementLoginFailure(email);
    throw new ApiError(401, 'Invalid email or password.');
  }

  if (!profile.is_verified || !user.password) {
    throw new ApiError(
      403,
      'Account not activated. Please check your email for the setup link.'
    );
  }

  // Password check
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    incrementLoginFailure(email);
    throw new ApiError(401, 'Invalid email or password.');
  }

  // Clear failed attempts
  resetLoginAttempts(email);

  // Load permissions & role
  const [permissions, role] = await Promise.all([
    loadPermissions(user.id),
    loadRole(user.id),
  ]);

  // Issue JWT
  const token = signToken({ id: user.id, email: user.email, user_type: 2 });

  // Update last_login
  await profile.update({ last_login: new Date() });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {
          token,
          admin: {
            id:          user.id,
            email:       user.email,
            full_name:   profile.full_name,
            role,
            permissions,
          },
        },
        'Login successful'
      )
    );
});

// ─────────────────────────────────────────────────────────────────
// POST /api/admin/auth/setup-password
// First-time password setup via setup link in email
// Body: { token, password, confirm_password }
// ─────────────────────────────────────────────────────────────────
export const setupPasswordController = asyncHandler(async (req, res) => {
  const { token, password, confirm_password } = req.body;

  if (!token || !password || !confirm_password) {
    throw new ApiError(400, 'token, password and confirm_password are required.');
  }
  if (password !== confirm_password) {
    throw new ApiError(400, 'Passwords do not match.');
  }
  if (password.length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters.');
  }

  const hashed = hashToken(token);
  const profile = await AdminProfile.findOne({
    where: {
      setup_token:            hashed,
      setup_token_expires_at: { [Op.gt]: new Date() },
    },
  });

  if (!profile) {
    throw new ApiError(
      400,
      'Invalid or expired setup link. Ask your admin to resend the invitation.'
    );
  }

  if (profile.is_verified) {
    throw new ApiError(400, 'Account already activated. Please login.');
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  // Update User password
  await User.update({ password: hashedPassword }, { where: { id: profile.user_id } });

  // Activate profile & clear token
  await profile.update({
    is_verified:            true,
    setup_token:            null,
    setup_token_expires_at: null,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, null, 'Password set successfully. You can now login.'));
});

// ─────────────────────────────────────────────────────────────────
// POST /api/admin/auth/forgot-password
// Sends a password reset email (rate limited)
// Body: { email }
// ─────────────────────────────────────────────────────────────────
export const forgotPasswordController = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) throw new ApiError(400, 'Email is required.');

  const user = await User.findOne({ where: { email, user_type: 2 } });
  const profile = user
    ? await AdminProfile.findOne({ where: { user_id: user.id } })
    : null;

  // Always return same message to prevent email enumeration
  if (user && profile && profile.is_verified) {
    const { raw, hashed } = generateOneTimeToken();
    const expiresAt = new Date(
      Date.now() + (env.ADMIN_RESET_EXPIRY_HOURS || 1) * 60 * 60 * 1000
    );

    await profile.update({
      setup_token:            hashed,
      setup_token_expires_at: expiresAt,
    });

    const resetLink = buildResetLink(raw);
    console.log(`[Admin] Reset link for ${email}:`, resetLink);

    await sendPasswordResetEmail(email, profile.full_name, resetLink);
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        'If that email is registered, a password reset link has been sent.'
      )
    );
});

// ─────────────────────────────────────────────────────────────────
// POST /api/admin/auth/reset-password
// Resets password via reset token from email
// Body: { token, password, confirm_password }
// ─────────────────────────────────────────────────────────────────
export const resetPasswordController = asyncHandler(async (req, res) => {
  const { token, password, confirm_password } = req.body;

  if (!token || !password || !confirm_password) {
    throw new ApiError(400, 'token, password and confirm_password are required.');
  }
  if (password !== confirm_password) {
    throw new ApiError(400, 'Passwords do not match.');
  }
  if (password.length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters.');
  }

  const hashed = hashToken(token);
  const profile = await AdminProfile.findOne({
    where: {
      setup_token:            hashed,
      setup_token_expires_at: { [Op.gt]: new Date() },
    },
  });

  if (!profile) {
    throw new ApiError(
      400,
      'Invalid or expired reset link. Please request a new one.'
    );
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  await User.update({ password: hashedPassword }, { where: { id: profile.user_id } });
  await profile.update({
    setup_token:            null,
    setup_token_expires_at: null,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        'Password reset successfully. Please login with your new password.'
      )
    );
});

// ─────────────────────────────────────────────────────────────────
// POST /api/admin/auth/create-admin  (protected — requires auth + permission)
// Creates a new admin account and sends setup email
// Body: { full_name, email, role_id }
// ─────────────────────────────────────────────────────────────────
export const createAdminController = asyncHandler(async (req, res) => {
  const { full_name, email, role_id } = req.body;

  if (!full_name || !email || !role_id) {
    throw new ApiError(400, 'full_name, email and role_id are required.');
  }

  // Check email not already used
  const existing = await User.findOne({ where: { email } });
  if (existing) {
    throw new ApiError(409, 'An account with this email already exists.');
  }

  // Validate role
  const role = await MasterRole.findByPk(role_id);
  if (!role) throw new ApiError(400, `role_id ${role_id} does not exist.`);

  // Prevent assigning super_admin via API
  if (role.role_name === 'super_admin') {
    throw new ApiError(403, 'The super_admin role cannot be assigned through this API.');
  }

  const { raw, hashed } = generateOneTimeToken();
  const expiresAt = new Date(
    Date.now() + (env.ADMIN_SETUP_EXPIRY_HOURS || 24) * 60 * 60 * 1000
  );

  await sequelize.transaction(async (t) => {
    // 1. Create User row (no password yet — set during setup)
    const user = await User.create(
      {
        email,
        password:     null,
        username:     full_name,
        mobile_number: null,
        is_superuser: false,
        user_type:    2, // 2 = admin
        created_by:   req.admin.id,
      },
      { transaction: t }
    );

    // 2. Create AdminProfile
    await AdminProfile.create(
      {
        user_id:                user.id,
        full_name,
        email,
        is_verified:            false,
        setup_token:            hashed,
        setup_token_expires_at: expiresAt,
        created_by:             req.admin.id,
      },
      { transaction: t }
    );

    // 3. Assign role
    await UserRole.create(
      { user_id: user.id, role_id, created_by: req.admin.id },
      { transaction: t }
    );
  });

  // Send setup email (after transaction commits — fire and forget on error)
  const setupLink = buildSetupLink(raw);
  console.log(`[Admin] Setup link for ${email}:`, setupLink);

  sendAdminSetupEmail(email, full_name, setupLink).catch((err) =>
    console.error('[Email] Failed to send setup email:', err.message)
  );

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { email, full_name, role: role.role_name },
        `Admin created. Setup email sent to ${email}.`
      )
    );
});

// ─────────────────────────────────────────────────────────────────
// GET /api/admin/auth/me  (protected)
// Returns current admin info from JWT
// ─────────────────────────────────────────────────────────────────
export const getMeController = asyncHandler(async (req, res) => {
  const profile = await AdminProfile.findOne({ where: { user_id: req.admin.id } });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        id:          req.admin.id,
        email:       req.admin.email,
        full_name:   profile?.full_name,
        role:        req.admin.role,
        permissions: req.admin.permissions,
      },
      'Session valid'
    )
  );
});
