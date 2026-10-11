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
import { authenticateAdmin } from "../middleware/adminAuth.middleware.js";
import { authenticateUser, requireSelfOrAdmin, scopeBodyToCaller } from "../middleware/access.js";

const orderRouter = express.Router();

// Who may call what
//  • farmer (own data) or admin:  creating/confirming an order, own order lists, availability, crop & status lists
//  • admin only:                  everything that reads or changes other people's orders or the work schedule
// Every route here used to be callable by anyone without logging in.
const asUser = authenticateUser;
const asAdmin = authenticateAdmin;

// ── Orders: farmer or admin ──────────────────────────────────────────
orderRouter.post("/create-order",             asUser, createOrder);
orderRouter.get("/statuses",                  asUser, getAllOrderStatuses);
orderRouter.post("/filterOrder",              asUser, scopeBodyToCaller, filterOrders);      // farmers only ever see their own
orderRouter.get("/getOrderByUserId/:user_id", asUser, requireSelfOrAdmin("user_id"), getOrdersByUserId);
orderRouter.post("/verify-otp",               asUser, verifyOrderOTP);
orderRouter.post("/resend-otp",               asUser, resendOrderOTP);

// ── Orders: admin only ───────────────────────────────────────────────
orderRouter.get("/get-order",                 asAdmin, getOrders);
orderRouter.get("/getOrderById/:booking_id",  asAdmin, getOrderById);
orderRouter.post("/filter-orders",            asAdmin, filterOrders);
orderRouter.post("/updateOrder",              asAdmin, updateOrder);
orderRouter.post("/deleteOrder",              asAdmin, deleteOrderById);

// ── Crops ────────────────────────────────────────────────────────────
orderRouter.get("/crops/list", asUser, getAllCropsForSelect);

// ── Availability & assignment ─────────────────────────────────────────
// Step 1 — open Assign or Edit modal
orderRouter.post("/calendar-availability", asAdmin, getCalendarAvailability);
orderRouter.post("/drone-availability", asUser, getDroneAvailabilityForBooking);

// Step 2a — New assignment (or add more dates to existing)
orderRouter.post("/assign-work/:booking_id", asAdmin, assignWork);

// Step 2b — Edit one specific day's drone (change drone mid-schedule)
orderRouter.patch("/daily-log/:log_id/drone", asAdmin, updateDailyLogDrone);

// Step 2c — Remove a specific working day from a booking
//   Body (optional): { force: true } to delete verified logs
orderRouter.delete("/daily-log/:log_id", asAdmin, deleteDailyLog);

// Step 3 — Field verification (upload photo, mark verified)
orderRouter.post(
  "/update-work/:id",
  asAdmin,
  upload.single("land_image_name"),
  updateWork
);

export default orderRouter;