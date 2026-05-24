/**
 * Roles Routes
 * Base: /api/admin/roles
 *
 * All routes require JWT authentication.
 * Write operations require the "roles:manage" permission.
 */

import express from 'express';
import {
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
} from '../controllers/roles.controller.js';
import { authenticateAdmin, requirePermission } from '../middleware/adminAuth.middleware.js';

const rolesRouter = express.Router();

// All routes below require a valid admin JWT
rolesRouter.use(authenticateAdmin);

// GET  /api/admin/roles          — any authenticated admin can view
rolesRouter.get('/', getAllRoles);

// GET  /api/admin/roles/:id
rolesRouter.get('/:id', getRoleById);

// POST /api/admin/roles
rolesRouter.post('/', requirePermission('roles:manage'), createRole);

// PUT  /api/admin/roles/:id
rolesRouter.put('/:id', requirePermission('roles:manage'), updateRole);

// DELETE /api/admin/roles/:id
rolesRouter.delete('/:id', requirePermission('roles:manage'), deleteRole);

export default rolesRouter;
