/**
 * routes/droneStatus.routes.js
 *
 * Mount in server.js as:
 *   import droneStatusRouter from './routes/droneStatus.routes.js';
 *   app.use('/api/inventory', droneStatusRouter);
 *
 * Endpoints:
 * ──────────────────────────────────────────────────────────────────────────────
 *  GET    /api/inventory/pilots                 → active pilots (role=pilot, is_active=true)
 *  GET    /api/inventory/drone-status           → all drones with daily_status + pilot info
 *  GET    /api/inventory/drone-status/active    → drones with work scheduled today, tagged Active/Inactive
 *  PATCH  /api/inventory/drone-status/:id       → pilot toggles drone active for today
 *  POST   /api/inventory/drone-status/reset     → midnight reset (admin / cron)
 * ──────────────────────────────────────────────────────────────────────────────
 */

import express from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import {
  getAllDroneStatuses,
  getActiveDrones,
  updateDroneStatus,
  resetDailyStatus,
  getActivePilots,
} from "../controllers/droneStatus.controller.js";

const router = express.Router();

// Active pilots from USER table (role=pilot, is_active=true)
// Used by Accessories "Assigned Pilot" dropdown
router.get("/pilots", getActivePilots);

// All drones with their current daily_status
// Query ?status=true|false|all  ?search=  ?page=  ?limit=
router.get("/drone-status", getAllDroneStatuses);

// IMPORTANT: /active must be registered BEFORE /:id
// Drones with SPRAYING_DAILY_LOGS work scheduled for today, each tagged
// Active/Inactive via daily_status (used by the "Drones Active Today" page)
router.get("/drone-status/active", getActiveDrones);

// Pilot marks their drone active/inactive for today
// Body: { daily_status: true | false }
router.patch("/drone-status/:id", authenticate, updateDroneStatus);

// Nightly reset — call from cron or admin panel
// Resets all drones where daily_status_date < today
router.post("/drone-status/reset", authenticate, resetDailyStatus);

export default router;