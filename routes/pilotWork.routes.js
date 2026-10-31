import express from "express";
import {
  getPilotOrders,
  startDay,
  updatePilotWorkDetails,
  uploadFieldImage,
  endDay,
  addPilotComment,
  confirmAssignment,
  getPilotOrderDetails,
  pilotUpload
} from "../controllers/pilotWorkController.js";
import {
  getMyAssignments,
  getMyAssignmentDetail,
  rejectAssignment,
} from "../controllers/pilotAssignments.controller.js";
import { authenticatePilot } from "../middleware/pilotAuth.middleware.js";

const pilotWorkRouter = express.Router();

// Every pilot endpoint needs the pilot's login token. The pilot is always the token's user:
// no endpoint trusts a pilot id sent in the URL/body, and each one checks the work belongs to that pilot.
pilotWorkRouter.use(authenticatePilot);

// ── Assigned bookings ("requests" + "orders") ─────────────────────────────────
// 1. All bookings assigned to the logged-in pilot (filter: ?request_status= &mission_state=)
pilotWorkRouter.get("/assignments", getMyAssignments);

// 2. One assigned booking with per-day work details and timeline
pilotWorkRouter.get("/assignments/:booking_id", getMyAssignmentDetail);

// 3. Accept: body { booking_id, accepted_dates: [...] } or { booking_id, accept_all: true }
pilotWorkRouter.post("/confirm-assignment", confirmAssignment);

// 4. Decline with a reason: body { booking_id, reason, dates?: [...] }
pilotWorkRouter.post("/reject-assignment", rejectAssignment);

// ── Doing the work ───────────────────────────────────────────────────────────
// 5. Start a working day
pilotWorkRouter.post("/start-day", startDay);

// 6. Update daily work details (fertilizer, pesticide, etc.)
pilotWorkRouter.post("/update-work", updatePilotWorkDetails);

// 7. Upload a field image for a specific daily log
pilotWorkRouter.post("/upload-field-image/:log_id", pilotUpload.single("land_image"), uploadFieldImage);

// 8. End the working day
pilotWorkRouter.post("/end-day", endDay);

// 9. Add a comment/note to an order
pilotWorkRouter.post("/add-comment", addPilotComment);

// ── Older read endpoints (kept; now restricted to the logged-in pilot) ───────
pilotWorkRouter.get("/orders/:pilot_user_id", getPilotOrders);
pilotWorkRouter.get("/order-details/:booking_id", getPilotOrderDetails);

export default pilotWorkRouter;
