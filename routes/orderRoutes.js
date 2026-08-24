import express from "express";
import {
  getStates,
  getDistrictsByState,
  getBlocksByDistrict,
} from "../controllers/locationController.js";
import {
  createOrder,
  deleteOrderById,
  getOrders,
  updateWork,
  upload,
  verifyOrderOTP,
  resendOrderOTP,
} from "../controllers/Admin.controller.js";
import {
  filterOrders,
  getAllCropsForSelect,
  getOrderById,
  getOrdersByUserId,
  updateOrder,
  getAllOrderStatuses,
} from "../controllers/Booking.controller.js";
import {
  getCalendarAvailability,
  assignWork,
  updateDailyLogDrone,
  deleteDailyLog,
  getDroneAvailabilityForBooking,
} from "../controllers/availabilityController.js";
import { authenticate } from "../middleware/authMiddleware.js";

const orderRouter = express.Router();

// ── Orders ──────────────────────────────────────────────────────────
orderRouter.post("/create-order",             createOrder);
orderRouter.get("/get-order",                 getOrders);
orderRouter.get("/statuses",                  getAllOrderStatuses);
orderRouter.get("/getOrderById/:booking_id",  getOrderById);
orderRouter.get("/getOrderByUserId/:user_id", getOrdersByUserId);
orderRouter.post("/filter-orders",            filterOrders);
orderRouter.post("/filterOrder",              filterOrders);   // legacy alias
orderRouter.post("/updateOrder",              updateOrder);
orderRouter.post("/deleteOrder",              deleteOrderById);
orderRouter.post("/verify-otp",               verifyOrderOTP);
orderRouter.post("/resend-otp",               resendOrderOTP);

// ── Crops ────────────────────────────────────────────────────────────
orderRouter.get("/crops/list", getAllCropsForSelect);

// ── Availability & assignment ─────────────────────────────────────────
// Step 1 — open Assign or Edit modal
orderRouter.post("/calendar-availability", getCalendarAvailability);
orderRouter.post("/drone-availability", getDroneAvailabilityForBooking);

// Step 2a — New assignment (or add more dates to existing)
orderRouter.post("/assign-work/:booking_id", assignWork);

// Step 2b — Edit one specific day's drone (change drone mid-schedule)
orderRouter.patch("/daily-log/:log_id/drone", updateDailyLogDrone);

// Step 2c — Remove a specific working day from a booking
//   Body (optional): { force: true } to delete verified logs
orderRouter.delete("/daily-log/:log_id", deleteDailyLog);

// Step 3 — Field verification (upload photo, mark verified)
orderRouter.post(
  "/update-work/:id",
  authenticate,
  upload.single("land_image_name"),
  updateWork
);

export default orderRouter;