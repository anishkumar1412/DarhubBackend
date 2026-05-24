import express from 'express';
import {
  adminLoginController,
  setupPasswordController,
  forgotPasswordController,
  resetPasswordController,
  createAdminController,
  getMeController,
} from '../controllers/adminAuth.controller.js';
import { authenticateAdmin, requirePermission } from '../middleware/adminAuth.middleware.js';
import { adminForgotPasswordRateLimiter } from '../utils/adminRateLimiter.js';

const adminAuthRouter = express.Router();

// ── Public routes ─────────────────────────────────────────────────
// No auth required

// POST /api/admin/auth/login
adminAuthRouter.post('/login', adminLoginController);

// POST /api/admin/auth/setup-password  (first-time, link from email)
adminAuthRouter.post('/setup-password', setupPasswordController);

// POST /api/admin/auth/forgot-password  (rate limited)
adminAuthRouter.post('/forgot-password', adminForgotPasswordRateLimiter, forgotPasswordController);

// POST /api/admin/auth/reset-password  (link from email)
adminAuthRouter.post('/reset-password', resetPasswordController);

// ── Protected routes (JWT required) ──────────────────────────────

// GET /api/admin/auth/me
adminAuthRouter.get('/me', authenticateAdmin, getMeController);

// POST /api/admin/auth/create-admin  (requires "admins:create" permission)
adminAuthRouter.post(
  '/create-admin',
  authenticateAdmin,
  requirePermission('admins:create'),
  createAdminController
);

export default adminAuthRouter;
