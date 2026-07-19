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
import { authenticatePilot } from "../middleware/pilotAuth.middleware.js";

const pilotWorkRouter = express.Router();

// 1. Get all orders assigned to a pilot
pilotWorkRouter.get("/orders/:pilot_user_id", getPilotOrders);

// 2. Pilot confirms their availability for specific dates on a booking.
//    authenticatePilot is REQUIRED here — it reads pilot identity from
//    the signed JWT so no one can spoof another pilot's ID via the body.
pilotWorkRouter.post("/confirm-assignment", authenticatePilot, confirmAssignment);

// 3. Get detailed info about a specific order
pilotWorkRouter.get("/order-details/:booking_id", getPilotOrderDetails);

// 4. Start a working day
pilotWorkRouter.post("/start-day", startDay);

// 5. Update daily work details (fertilizer, pesticide, etc.)
pilotWorkRouter.post("/update-work", updatePilotWorkDetails);

// 6. Upload a field image for a specific daily log
pilotWorkRouter.post("/upload-field-image/:log_id", pilotUpload.single("land_image"), uploadFieldImage);

// 7. End the working day
pilotWorkRouter.post("/end-day", endDay);

// 8. Add a comment/note to an order
pilotWorkRouter.post("/add-comment", addPilotComment);

export default pilotWorkRouter;
