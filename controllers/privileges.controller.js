/**
 * Privileges Controller
 * CRUD for MASTER_PRIVILAGE
 *
 * Endpoints:
 *   GET    /api/admin/privileges         — list all privileges
 *   GET    /api/admin/privileges/:id     — get one privilege
 *   POST   /api/admin/privileges         — create privilege
 *   PUT    /api/admin/privileges/:id     — update privilege
 *   DELETE /api/admin/privileges/:id     — delete (blocks if assigned to roles)
 */

import db from '../models/index.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const { MasterPrivilage, MasterRolePrivilage } = db;

// ── GET /api/admin/privileges ─────────────────────────────────────
export const getAllPrivileges = asyncHandler(async (req, res) => {
  const privileges = await MasterPrivilage.findAll({
    order: [['privilage_name', 'ASC']],
  });

  return res.status(200).json(
    new ApiResponse(200, privileges, 'Privileges fetched successfully')
  );
});

// ── GET /api/admin/privileges/:id ─────────────────────────────────
export const getPrivilegeById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const priv = await MasterPrivilage.findByPk(id);
  if (!priv) throw new ApiError(404, `Privilege with id ${id} not found`);

  // Which roles have this privilege?
  const rolePrivs = await MasterRolePrivilage.findAll({ where: { privilage_id: id } });

  return res.status(200).json(
    new ApiResponse(200, {
      ...priv.toJSON(),
      assigned_to_role_ids: rolePrivs.map((rp) => rp.role_id),
    }, 'Privilege fetched successfully')
  );
});

// ── POST /api/admin/privileges ────────────────────────────────────
export const createPrivilege = asyncHandler(async (req, res) => {
  const { privilage_name, privilage_desc } = req.body;

  if (!privilage_name?.trim()) throw new ApiError(400, 'privilage_name is required');

  // Normalise: lowercase, colons allowed e.g. "users:view"
  const name = privilage_name.trim().toLowerCase().replace(/\s+/g, '_');

  const existing = await MasterPrivilage.findOne({ where: { privilage_name: name } });
  if (existing) throw new ApiError(409, `Privilege "${name}" already exists`);

  const priv = await MasterPrivilage.create({
    privilage_name: name,
    privilage_desc: privilage_desc?.trim() || null,
    created_by:     req.admin?.id || null,
  });

  return res.status(201).json(new ApiResponse(201, priv, 'Privilege created successfully'));
});

// ── PUT /api/admin/privileges/:id ─────────────────────────────────
export const updatePrivilege = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { privilage_name, privilage_desc } = req.body;

  const priv = await MasterPrivilage.findByPk(id);
  if (!priv) throw new ApiError(404, `Privilege with id ${id} not found`);

  const updates = {};

  if (privilage_name?.trim()) {
    const name = privilage_name.trim().toLowerCase().replace(/\s+/g, '_');
    const conflict = await MasterPrivilage.findOne({ where: { privilage_name: name } });
    if (conflict && conflict.id !== priv.id) {
      throw new ApiError(409, `Privilege name "${name}" is already taken`);
    }
    updates.privilage_name = name;
  }
  if (privilage_desc !== undefined) updates.privilage_desc = privilage_desc?.trim() || null;
  if (req.admin?.id)                updates.updated_by     = req.admin.id;

  await priv.update(updates);

  return res.status(200).json(new ApiResponse(200, priv, 'Privilege updated successfully'));
});

// ── DELETE /api/admin/privileges/:id ─────────────────────────────
export const deletePrivilege = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const priv = await MasterPrivilage.findByPk(id);
  if (!priv) throw new ApiError(404, `Privilege with id ${id} not found`);

  const assignedCount = await MasterRolePrivilage.count({ where: { privilage_id: id } });
  if (assignedCount > 0) {
    throw new ApiError(
      409,
      `Cannot delete: this privilege is assigned to ${assignedCount} role(s). Remove those assignments first.`
    );
  }

  await priv.destroy();

  return res.status(200).json(new ApiResponse(200, null, 'Privilege deleted successfully'));
});
