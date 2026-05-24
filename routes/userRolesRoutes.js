/**
 * User-Roles Routes
 * Base: /api/admin/user-roles
 */

import express from 'express';
import {
  getUserRole,
  assignUserRole,
  removeUserRole,
  getUsersByRole,
} from '../controllers/userRoles.controller.js';
import { authenticateAdmin, requirePermission } from '../middleware/adminAuth.middleware.js';

const userRolesRouter = express.Router();

userRolesRouter.use(authenticateAdmin);

// GET  /api/admin/user-roles/role/:role_id   — must be before /:user_id to avoid route clash
userRolesRouter.get('/role/:role_id', getUsersByRole);

// GET  /api/admin/user-roles/:user_id
userRolesRouter.get('/:user_id', getUserRole);

// POST /api/admin/user-roles/assign         — { user_id, role_id }
userRolesRouter.post('/assign', requirePermission('admins:create'), assignUserRole);

// DELETE /api/admin/user-roles/:user_id
userRolesRouter.delete('/:user_id', requirePermission('admins:create'), removeUserRole);

export default userRolesRouter;
