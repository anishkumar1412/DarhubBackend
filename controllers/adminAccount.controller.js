/**
 * Admin Password & Profile Controller
 *
 * Endpoints (all protected — require JWT):
 *   POST  /api/admin/account/change-password    — change own password (old + new)
 *   PUT   /api/admin/account/profile            — update own full_name
 *   GET   /api/admin/account/admins             — list all admin users (requires admins:view)
 *   GET   /api/admin/account/admins/:id         — get a specific admin's details
 *   DELETE /api/admin/account/admins/:id        — soft-delete an admin (requires admins:delete)
 *   POST  /api/admin/account/admins/:id/resend-setup  — resend setup email to unverified admin
 */

import bcrypt from 'bcryptjs';
import db from '../models/index.js';
import env from '../config/env.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { generateOneTimeToken, buildSetupLink } from '../utils/adminToken.util.js';
import { sendAdminSetupEmail } from '../services/email.service.js';

const { User, AdminProfile, UserRole, MasterRole } = db;

// ── POST /api/admin/account/change-password ───────────────────────
// Body: { current_password, new_password, confirm_password }
export const changePasswordController = asyncHandler(async (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;

  if (!current_password || !new_password || !confirm_password) {
    throw new ApiError(400, 'current_password, new_password, and confirm_password are required');
  }
  if (new_password !== confirm_password) {
    throw new ApiError(400, 'new_password and confirm_password do not match');
  }
  if (new_password.length < 8) {
    throw new ApiError(400, 'New password must be at least 8 characters');
  }
  if (current_password === new_password) {
    throw new ApiError(400, 'New password must be different from the current password');
  }

  const user = await User.findByPk(req.admin.id);
  if (!user) throw new ApiError(404, 'Admin user not found');

  const isMatch = await bcrypt.compare(current_password, user.password || '');
  if (!isMatch) throw new ApiError(401, 'Current password is incorrect');

  const hashed = await bcrypt.hash(new_password, 12);
  await user.update({ password: hashed });

  return res.status(200).json(
    new ApiResponse(200, null, 'Password changed successfully')
  );
});

// ── PUT /api/admin/account/profile ────────────────────────────────
// Body: { full_name }
export const updateOwnProfile = asyncHandler(async (req, res) => {
  const { full_name } = req.body;

  if (!full_name?.trim()) throw new ApiError(400, 'full_name is required');

  const profile = await AdminProfile.findOne({ where: { user_id: req.admin.id } });
  if (!profile) throw new ApiError(404, 'Admin profile not found');

  await profile.update({ full_name: full_name.trim(), updated_by: req.admin.id });

  // Keep username in User table in sync
  await User.update({ username: full_name.trim() }, { where: { id: req.admin.id } });

  return res.status(200).json(
    new ApiResponse(200, { full_name: profile.full_name }, 'Profile updated successfully')
  );
});

// ── GET /api/admin/account/admins ─────────────────────────────────
export const listAdmins = asyncHandler(async (req, res) => {
  const users = await User.findAll({
    where: { user_type: 2 },
    attributes: ['id', 'email', 'username', 'createdAt'],
    order: [['createdAt', 'DESC']],
  });

  const data = await Promise.all(
    users.map(async (u) => {
      const profile = await AdminProfile.findOne({ where: { user_id: u.id } });
      const userRole = await UserRole.findOne({ where: { user_id: u.id } });
      const role = userRole ? await MasterRole.findByPk(userRole.role_id) : null;

      return {
        id: u.id,
        email: u.email,
        full_name: profile?.full_name || u.username,
        role: role?.role_name || null,
        is_verified: profile?.is_verified || false,
        last_login: profile?.last_login || null,
        createdAt: u.createdAt,
      };
    })
  );

  return res.status(200).json(new ApiResponse(200, data, 'Admin list fetched successfully'));
});

// ── GET /api/admin/account/admins/:id ─────────────────────────────
export const getAdminById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findOne({
    where: { id, user_type: 2 },
    attributes: ['id', 'email', 'username', 'createdAt'],
  });
  if (!user) throw new ApiError(404, `Admin user ${id} not found`);

  const profile = await AdminProfile.findOne({ where: { user_id: id } });
  const userRole = await UserRole.findOne({ where: { user_id: id } });
  const role = userRole ? await MasterRole.findByPk(userRole.role_id) : null;

  return res.status(200).json(
    new ApiResponse(200, {
      id: user.id,
      email: user.email,
      full_name: profile?.full_name || user.username,
      role: role ? { id: role.id, role_name: role.role_name } : null,
      is_verified: profile?.is_verified || false,
      last_login: profile?.last_login || null,
      createdAt: user.createdAt,
    }, 'Admin fetched successfully')
  );
});

// ── DELETE /api/admin/account/admins/:id ─────────────────────────
export const deleteAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (Number(id) === req.admin.id) {
    throw new ApiError(400, 'You cannot delete your own account');
  }

  const user = await User.findOne({ where: { id, user_type: 2 } });
  if (!user) throw new ApiError(404, `Admin user ${id} not found`);

  // Prevent deleting the super admin
  const userRole = await UserRole.findOne({ where: { user_id: id } });
  if (userRole) {
    const role = await MasterRole.findByPk(userRole.role_id);
    if (role?.role_name === 'super_admin') {
      throw new ApiError(403, 'The super admin account cannot be deleted');
    }
  }

  // Remove role, profile, then user
  await UserRole.destroy({ where: { user_id: id } });
  await AdminProfile.destroy({ where: { user_id: id } });
  await user.destroy();

  return res.status(200).json(new ApiResponse(200, null, 'Admin account deleted successfully'));
});

// ── POST /api/admin/account/admins/:id/resend-setup ───────────────
// Re-generate a setup token and resend the invitation email
export const resendSetupEmail = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findOne({ where: { id, user_type: 2 } });
  if (!user) throw new ApiError(404, `Admin user ${id} not found`);

  const profile = await AdminProfile.findOne({ where: { user_id: id } });
  if (!profile) throw new ApiError(404, 'Admin profile not found');

  if (profile.is_verified) {
    throw new ApiError(400, 'This admin account is already active. Use forgot-password instead.');
  }

  const { raw, hashed } = generateOneTimeToken();
  const expiresAt = new Date(
    Date.now() + (env.ADMIN_SETUP_EXPIRY_HOURS || 24) * 60 * 60 * 1000
  );

  await profile.update({
    setup_token: hashed,
    setup_token_expires_at: expiresAt,
  });

  const setupLink = buildSetupLink(raw);
  console.log(`[Admin] Resent setup link for ${user.email}:`, setupLink);

  sendAdminSetupEmail(user.email, profile.full_name, setupLink).catch((err) =>
    console.error('[Email] Failed to resend setup email:', err.message)
  );

  return res.status(200).json(
    new ApiResponse(200, { email: user.email }, `Setup email resent to ${user.email}`)
  );
});
