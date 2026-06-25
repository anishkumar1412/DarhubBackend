/**
 * routes/pilotMaintenanceRoutes.js
 *
 * Pilot-facing Maintenance Task Form API routes.
 * Mount in server.js as: app.use('/api/pilot/maintenance', pilotMaintenanceRouter)
 *
 * All routes require JWT authentication via the `authenticate` middleware.
 *
 * Route Summary:
 * ─────────────────────────────────────────────────────────────────────────────
 *   POST   /                          – Submit a new maintenance task
 *   POST   /draft                     – Save a draft maintenance task
 *   GET    /stats                     – Pilot's maintenance stats
 *   GET    /                          – List all tasks (paginated, filtered)
 *   GET    /:id                       – Get full task detail
 *   PUT    /:id                       – Update a draft task
 *   PATCH  /:id/submit                – Submit a draft → submitted
 *   DELETE /:id                       – Soft-delete a task
 *   POST   /:id/attachments           – Upload additional photos
 *   DELETE /:id/attachments/:aid      – Remove a specific attachment
 * ─────────────────────────────────────────────────────────────────────────────
 */

import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import upload from '../middleware/upload.js';

import {
  createMaintenanceTask,
  saveDraft,
  submitReport,
  getAllTasks,
  getTaskById,
  updateTask,
  deleteTask,
  getTaskStats,
  addAttachments,
  deleteAttachment,
} from '../controllers/pilotMaintenance.controller.js';

const router = express.Router();

// All routes require pilot JWT authentication
router.use(authenticate);

// Multer middleware for file uploads (max 10 files, 10MB each)
const uploadAttachments = upload.array('attachments', 10);

// ─── STATS (must be before /:id to avoid param collision) ─────────────────────
router.get('/stats', getTaskStats);

// ─── CREATE ───────────────────────────────────────────────────────────────────
router.post('/', uploadAttachments, createMaintenanceTask);

// ─── SAVE DRAFT ───────────────────────────────────────────────────────────────
router.post('/draft', uploadAttachments, saveDraft);

// ─── LIST ALL ─────────────────────────────────────────────────────────────────
router.get('/', getAllTasks);

// ─── GET BY ID ────────────────────────────────────────────────────────────────
router.get('/:id', getTaskById);

// ─── UPDATE DRAFT ─────────────────────────────────────────────────────────────
router.put('/:id', uploadAttachments, updateTask);

// ─── SUBMIT DRAFT ─────────────────────────────────────────────────────────────
router.patch('/:id/submit', submitReport);

// ─── DELETE ───────────────────────────────────────────────────────────────────
router.delete('/:id', deleteTask);

// ─── ATTACHMENTS ──────────────────────────────────────────────────────────────
router.post('/:id/attachments', uploadAttachments, addAttachments);
router.delete('/:id/attachments/:attachmentId', deleteAttachment);

export default router;
