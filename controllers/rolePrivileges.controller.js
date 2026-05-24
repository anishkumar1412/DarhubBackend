/**
 * Role-Privileges Controller
 * Manages which privileges are assigned to which roles (MASTER_ROLE_PRIVILAGE)
 *
 * Endpoints:
 *   GET    /api/admin/role-privileges/:role_id          — get all privileges for a role
 *   POST   /api/admin/role-privileges/:role_id/assign   — assign one privilege to a role
 *   POST   /api/admin/role-privileges/:role_id/sync     — replace ALL privileges for a role (bulk)
 *   DELETE /api/admin/role-privileges/:role_id/:priv_id — remove one privilege from a role
 */

import db from '../models/index.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const { MasterRole, MasterPrivilage, MasterRolePrivilage, sequelize } = db;

// ── GET /api/admin/role-privileges/:role_id ───────────────────────
export const getRolePrivileges = asyncHandler(async (req, res) => {
  const { role_id } = req.params;

  const role = await MasterRole.findByPk(role_id);
  if (!role) throw new ApiError(404, `Role ${role_id} not found`);

  const rolePrivs = await MasterRolePrivilage.findAll({ where: { role_id } });
  const privIds   = rolePrivs.map((rp) => rp.privilage_id);

  const privileges = privIds.length
    ? await MasterPrivilage.findAll({ where: { id: privIds }, order: [['privilage_name', 'ASC']] })
    : [];

  return res.status(200).json(
    new ApiResponse(200, {
      role: { id: role.id, role_name: role.role_name },
      privileges,
    }, 'Role privileges fetched successfully')
  );
});

// ── POST /api/admin/role-privileges/:role_id/assign ───────────────
// Body: { privilage_id }
export const assignPrivilegeToRole = asyncHandler(async (req, res) => {
  const { role_id } = req.params;
  const { privilage_id } = req.body;

  if (!privilage_id) throw new ApiError(400, 'privilage_id is required');

  const role = await MasterRole.findByPk(role_id);
  if (!role) throw new ApiError(404, `Role ${role_id} not found`);

  const priv = await MasterPrivilage.findByPk(privilage_id);
  if (!priv) throw new ApiError(404, `Privilege ${privilage_id} not found`);

  // Idempotent — don't error if already assigned
  const existing = await MasterRolePrivilage.findOne({
    where: { role_id, privilage_id },
  });
  if (existing) {
    return res.status(200).json(
      new ApiResponse(200, existing, 'Privilege was already assigned to this role')
    );
  }

  const mapping = await MasterRolePrivilage.create({
    role_id,
    privilage_id,
    created_by: req.admin?.id || null,
  });

  return res.status(201).json(
    new ApiResponse(201, mapping, 'Privilege assigned to role successfully')
  );
});

// ── POST /api/admin/role-privileges/:role_id/sync ─────────────────
// Body: { privilage_ids: [1, 2, 3] }
// Replaces the entire privilege set for the role atomically.
export const syncRolePrivileges = asyncHandler(async (req, res) => {
  const { role_id } = req.params;
  const { privilage_ids } = req.body;

  if (!Array.isArray(privilage_ids)) {
    throw new ApiError(400, 'privilage_ids must be an array');
  }

  const role = await MasterRole.findByPk(role_id);
  if (!role) throw new ApiError(404, `Role ${role_id} not found`);

  if (role.role_name === 'super_admin') {
    throw new ApiError(403, 'super_admin privileges cannot be managed via API');
  }

  // Validate all privilege IDs exist
  if (privilage_ids.length > 0) {
    const found = await MasterPrivilage.findAll({ where: { id: privilage_ids } });
    if (found.length !== privilage_ids.length) {
      const foundIds   = found.map((p) => p.id);
      const missingIds = privilage_ids.filter((id) => !foundIds.includes(id));
      throw new ApiError(400, `Privilege IDs not found: ${missingIds.join(', ')}`);
    }
  }

  await sequelize.transaction(async (t) => {
    // Remove all existing
    await MasterRolePrivilage.destroy({ where: { role_id }, transaction: t });

    // Re-create
    if (privilage_ids.length > 0) {
      const rows = privilage_ids.map((pid) => ({
        role_id,
        privilage_id: pid,
        created_by:   req.admin?.id || null,
      }));
      await MasterRolePrivilage.bulkCreate(rows, { transaction: t });
    }
  });

  return res.status(200).json(
    new ApiResponse(200, { role_id, privilage_ids }, 'Role privileges synced successfully')
  );
});

// ── DELETE /api/admin/role-privileges/:role_id/:priv_id ───────────
export const removePrivilegeFromRole = asyncHandler(async (req, res) => {
  const { role_id, priv_id } = req.params;

  const role = await MasterRole.findByPk(role_id);
  if (!role) throw new ApiError(404, `Role ${role_id} not found`);

  if (role.role_name === 'super_admin') {
    throw new ApiError(403, 'super_admin privileges cannot be managed via API');
  }

  const mapping = await MasterRolePrivilage.findOne({
    where: { role_id, privilage_id: priv_id },
  });
  if (!mapping) {
    throw new ApiError(404, `Privilege ${priv_id} is not assigned to role ${role_id}`);
  }

  await mapping.destroy();

  return res.status(200).json(
    new ApiResponse(200, null, 'Privilege removed from role successfully')
  );
});
