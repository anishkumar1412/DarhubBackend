/**
 * Role-Privileges Routes
 * Base: /api/admin/role-privileges
 *
 * All routes require JWT + roles:manage permission.
 */

import express from 'express';
import {
  getRolePrivileges,
  assignPrivilegeToRole,
  syncRolePrivileges,
  removePrivilegeFromRole,
} from '../controllers/rolePrivileges.controller.js';
import { authenticateAdmin, requirePermission } from '../middleware/adminAuth.middleware.js';

const rolePrivilegesRouter = express.Router();

rolePrivilegesRouter.use(authenticateAdmin);

// GET    /api/admin/role-privileges/:role_id
rolePrivilegesRouter.get('/:role_id', getRolePrivileges);

// POST   /api/admin/role-privileges/:role_id/assign   — { privilage_id }
rolePrivilegesRouter.post(
  '/:role_id/assign',
  requirePermission('roles:manage'),
  assignPrivilegeToRole
);

// POST   /api/admin/role-privileges/:role_id/sync     — { privilage_ids: [] }
rolePrivilegesRouter.post(
  '/:role_id/sync',
  requirePermission('roles:manage'),
  syncRolePrivileges
);

// DELETE /api/admin/role-privileges/:role_id/:priv_id
rolePrivilegesRouter.delete(
  '/:role_id/:priv_id',
  requirePermission('roles:manage'),
  removePrivilegeFromRole
);

export default rolePrivilegesRouter;
