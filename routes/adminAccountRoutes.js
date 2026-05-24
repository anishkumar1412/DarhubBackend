/**
 * Admin Account Routes
 * Base: /api/admin/account
 *
 * Covers:
 *   - change-password (own)
 *   - update profile (own)
 *   - list / view / delete other admins
 *   - resend setup email
 */

import express from 'express';
import {
  changePasswordController,
  updateOwnProfile,
  listAdmins,
  getAdminById,
  deleteAdmin,
  resendSetupEmail,
} from '../controllers/adminAccount.controller.js';
import { authenticateAdmin, requirePermission } from '../middleware/adminAuth.middleware.js';

const adminAccountRouter = express.Router();

adminAccountRouter.use(authenticateAdmin);

// ── Own account ───────────────────────────────────────────────────

// POST /api/admin/account/change-password
adminAccountRouter.post('/change-password', changePasswordController);

// PUT  /api/admin/account/profile
adminAccountRouter.put('/profile', updateOwnProfile);

// ── Admin management ──────────────────────────────────────────────

// GET  /api/admin/account/admins
adminAccountRouter.get('/admins', requirePermission('admins:view'), listAdmins);

// GET  /api/admin/account/admins/:id
adminAccountRouter.get('/admins/:id', requirePermission('admins:view'), getAdminById);

// DELETE /api/admin/account/admins/:id
adminAccountRouter.delete('/admins/:id', requirePermission('admins:delete'), deleteAdmin);

// POST /api/admin/account/admins/:id/resend-setup
adminAccountRouter.post(
  '/admins/:id/resend-setup',
  requirePermission('admins:create'),
  resendSetupEmail
);

export default adminAccountRouter;
