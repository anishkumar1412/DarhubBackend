/**
 * User-Roles Controller
 * Manages which role is assigned to which admin user (USER_ROLE)
 *
 * Endpoints:
 *   GET    /api/admin/user-roles/:user_id      — get role assigned to an admin
 *   POST   /api/admin/user-roles/assign        — assign (or replace) a role for an admin
 *   DELETE /api/admin/user-roles/:user_id      — remove role assignment from an admin
 *   GET    /api/admin/user-roles/role/:role_id — list all admins who have a given role
 */

import db from '../models/index.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const { User, AdminProfile, UserRole, MasterRole, MasterRolePrivilage, MasterPrivilage, sequelize } = db;

// ── GET /api/admin/user-roles/:user_id ────────────────────────────
export const getUserRole = asyncHandler(async (req, res) => {
  const { user_id } = req.params;

  const user = await User.findOne({ where: { id: user_id, user_type: 2 } });
  if (!user) throw new ApiError(404, `Admin user ${user_id} not found`);

  const userRole = await UserRole.findOne({ where: { user_id } });
  if (!userRole) {
    return res.status(200).json(
      new ApiResponse(200, { user_id: Number(user_id), role: null }, 'No role assigned')
    );
  }

  const role      = await MasterRole.findByPk(userRole.role_id);
  const rolePrivs = await MasterRolePrivilage.findAll({ where: { role_id: userRole.role_id } });
  const privIds   = rolePrivs.map((rp) => rp.privilage_id);
  const privileges = privIds.length
    ? await MasterPrivilage.findAll({ where: { id: privIds }, order: [['privilage_name', 'ASC']] })
    : [];

  return res.status(200).json(
    new ApiResponse(200, {
      user_id:    Number(user_id),
      email:      user.email,
      role: role
        ? {
            id:         role.id,
            role_name:  role.role_name,
            privileges: privileges.map((p) => ({
              id:             p.id,
              privilage_name: p.privilage_name,
            })),
          }
        : null,
    }, 'User role fetched successfully')
  );
});

// ── POST /api/admin/user-roles/assign ─────────────────────────────
// Body: { user_id, role_id }
// If the user already has a role, it is replaced (upsert behaviour).
export const assignUserRole = asyncHandler(async (req, res) => {
  const { user_id, role_id } = req.body;

  if (!user_id || !role_id) throw new ApiError(400, 'user_id and role_id are required');

  const user = await User.findOne({ where: { id: user_id, user_type: 2 } });
  if (!user) throw new ApiError(404, `Admin user ${user_id} not found`);

  const role = await MasterRole.findByPk(role_id);
  if (!role) throw new ApiError(404, `Role ${role_id} not found`);

  // Prevent assigning super_admin via this API
  if (role.role_name === 'super_admin') {
    throw new ApiError(403, 'The super_admin role cannot be assigned via API');
  }

  // Prevent changing super admin's own role
  const currentRole = await UserRole.findOne({ where: { user_id } });
  if (currentRole) {
    const existingRole = await MasterRole.findByPk(currentRole.role_id);
    if (existingRole?.role_name === 'super_admin') {
      throw new ApiError(403, "Cannot change the super admin's role");
    }
  }

  await sequelize.transaction(async (t) => {
    // Remove existing role assignment if any
    await UserRole.destroy({ where: { user_id }, transaction: t });
    // Assign new role
    await UserRole.create(
      { user_id, role_id, created_by: req.admin?.id || null },
      { transaction: t }
    );
  });

  return res.status(200).json(
    new ApiResponse(200, { user_id: Number(user_id), role_id: Number(role_id), role_name: role.role_name },
      'Role assigned to user successfully')
  );
});

// ── DELETE /api/admin/user-roles/:user_id ─────────────────────────
export const removeUserRole = asyncHandler(async (req, res) => {
  const { user_id } = req.params;

  const user = await User.findOne({ where: { id: user_id, user_type: 2 } });
  if (!user) throw new ApiError(404, `Admin user ${user_id} not found`);

  // Prevent removing the super admin's role
  const userRole = await UserRole.findOne({ where: { user_id } });
  if (userRole) {
    const role = await MasterRole.findByPk(userRole.role_id);
    if (role?.role_name === 'super_admin') {
      throw new ApiError(403, "Cannot remove the super admin's role");
    }
  }

  const deleted = await UserRole.destroy({ where: { user_id } });

  if (!deleted) {
    return res.status(200).json(
      new ApiResponse(200, null, 'No role was assigned to this user')
    );
  }

  return res.status(200).json(
    new ApiResponse(200, null, 'Role removed from user successfully')
  );
});

// ── GET /api/admin/user-roles/role/:role_id ───────────────────────
export const getUsersByRole = asyncHandler(async (req, res) => {
  const { role_id } = req.params;

  const role = await MasterRole.findByPk(role_id);
  if (!role) throw new ApiError(404, `Role ${role_id} not found`);

  const userRoles = await UserRole.findAll({ where: { role_id } });
  const userIds   = userRoles.map((ur) => ur.user_id);

  const users = userIds.length
    ? await User.findAll({
        where:      { id: userIds, user_type: 2 },
        attributes: ['id', 'email', 'username'],
      })
    : [];

  // Attach AdminProfile full_name
  const data = await Promise.all(
    users.map(async (u) => {
      const profile = await AdminProfile.findOne({ where: { user_id: u.id } });
      return {
        id:        u.id,
        email:     u.email,
        username:  u.username,
        full_name: profile?.full_name || null,
        is_verified: profile?.is_verified || false,
      };
    })
  );

  return res.status(200).json(
    new ApiResponse(200, {
      role:  { id: role.id, role_name: role.role_name },
      users: data,
    }, 'Users for role fetched successfully')
  );
});
