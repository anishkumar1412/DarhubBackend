/**
 * Privileges Routes
 * Base: /api/admin/privileges
 *
 * All routes require JWT authentication.
 * Write operations require the "roles:manage" permission.
 */

import express from 'express';
import {
  getAllPrivileges,
  getPrivilegeById,
  createPrivilege,
  updatePrivilege,
  deletePrivilege,
} from '../controllers/privileges.controller.js';
import { authenticateAdmin, requirePermission } from '../middleware/adminAuth.middleware.js';

const privilegesRouter = express.Router();

privilegesRouter.use(authenticateAdmin);

// GET  /api/admin/privileges
privilegesRouter.get('/', getAllPrivileges);

// GET  /api/admin/privileges/:id
privilegesRouter.get('/:id', getPrivilegeById);

// POST /api/admin/privileges
privilegesRouter.post('/', requirePermission('roles:manage'), createPrivilege);

// PUT  /api/admin/privileges/:id
privilegesRouter.put('/:id', requirePermission('roles:manage'), updatePrivilege);

// DELETE /api/admin/privileges/:id
privilegesRouter.delete('/:id', requirePermission('roles:manage'), deletePrivilege);

export default privilegesRouter;
