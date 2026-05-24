/**
 * Roles Controller
 * CRUD for MASTER_ROLE
 *
 * Endpoints:
 *   GET    /api/admin/roles              — list all roles
 *   GET    /api/admin/roles/:id          — get one role (with its privileges)
 *   POST   /api/admin/roles              — create role
 *   PUT    /api/admin/roles/:id          — update role
 *   DELETE /api/admin/roles/:id          — delete role (blocks if users assigned)
 */

import db from '../models/index.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const { MasterRole, MasterRolePrivilage, MasterPrivilage, UserRole } = db;

// ── GET /api/admin/roles ──────────────────────────────────────────
export const getAllRoles = asyncHandler(async (req, res) => {
  const roles = await MasterRole.findAll({
    order: [['createdAt', 'ASC']],
  });

  // Attach privilege count to each role
  const data = await Promise.all(
    roles.map(async (role) => {
      const privCount = await MasterRolePrivilage.count({
        where: { role_id: role.id },
      });
      const userCount = await UserRole.count({ where: { role_id: role.id } });
      return {
        id:             role.id,
        role_name:      role.role_name,
        role_desc:      role.role_desc,
        privilege_count: privCount,
        user_count:     userCount,
        createdAt:      role.createdAt,
        updatedAt:      role.updatedAt,
      };
    })
  );

  return res.status(200).json(new ApiResponse(200, data, 'Roles fetched successfully'));
});

// ── GET /api/admin/roles/:id ──────────────────────────────────────
export const getRoleById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const role = await MasterRole.findByPk(id);
  if (!role) throw new ApiError(404, `Role with id ${id} not found`);

  // Load full privilege list for this role
  const rolePrivs = await MasterRolePrivilage.findAll({ where: { role_id: id } });
  const privIds   = rolePrivs.map((rp) => rp.privilage_id);
  const privileges = privIds.length
    ? await MasterPrivilage.findAll({ where: { id: privIds } })
    : [];

  return res.status(200).json(
    new ApiResponse(200, {
      id:         role.id,
      role_name:  role.role_name,
      role_desc:  role.role_desc,
      privileges: privileges.map((p) => ({
        id:             p.id,
        privilage_name: p.privilage_name,
        privilage_desc: p.privilage_desc,
      })),
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    }, 'Role fetched successfully')
  );
});

// ── POST /api/admin/roles ─────────────────────────────────────────
export const createRole = asyncHandler(async (req, res) => {
  const { role_name, role_desc } = req.body;

  if (!role_name?.trim()) throw new ApiError(400, 'role_name is required');

  const slug = role_name.trim().toLowerCase().replace(/\s+/g, '_');

  const existing = await MasterRole.findOne({ where: { role_name: slug } });
  if (existing) throw new ApiError(409, `Role "${slug}" already exists`);

  const role = await MasterRole.create({
    role_name:  slug,
    role_desc:  role_desc?.trim() || null,
    created_by: req.admin?.id || null,
  });

  return res.status(201).json(new ApiResponse(201, role, 'Role created successfully'));
});

// ── PUT /api/admin/roles/:id ──────────────────────────────────────
export const updateRole = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role_name, role_desc } = req.body;

  const role = await MasterRole.findByPk(id);
  if (!role) throw new ApiError(404, `Role with id ${id} not found`);

  // Protect the super_admin role from being renamed
  if (role.role_name === 'super_admin') {
    throw new ApiError(403, 'The super_admin role cannot be modified');
  }

  const updates = {};
  if (role_name?.trim()) {
    const slug = role_name.trim().toLowerCase().replace(/\s+/g, '_');
    const conflict = await MasterRole.findOne({ where: { role_name: slug } });
    if (conflict && conflict.id !== role.id) {
      throw new ApiError(409, `Role name "${slug}" is already taken`);
    }
    updates.role_name = slug;
  }
  if (role_desc !== undefined) updates.role_desc = role_desc?.trim() || null;
  if (req.admin?.id)           updates.updated_by = req.admin.id;

  await role.update(updates);

  return res.status(200).json(new ApiResponse(200, role, 'Role updated successfully'));
});

// ── DELETE /api/admin/roles/:id ───────────────────────────────────
export const deleteRole = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const role = await MasterRole.findByPk(id);
  if (!role) throw new ApiError(404, `Role with id ${id} not found`);

  if (role.role_name === 'super_admin') {
    throw new ApiError(403, 'The super_admin role cannot be deleted');
  }

  // Block deletion if any users are still assigned this role
  const userCount = await UserRole.count({ where: { role_id: id } });
  if (userCount > 0) {
    throw new ApiError(
      409,
      `Cannot delete: ${userCount} user(s) are still assigned this role. Reassign them first.`
    );
  }

  // Remove all role-privilege mappings first
  await MasterRolePrivilage.destroy({ where: { role_id: id } });
  await role.destroy();

  return res.status(200).json(new ApiResponse(200, null, 'Role deleted successfully'));
});
