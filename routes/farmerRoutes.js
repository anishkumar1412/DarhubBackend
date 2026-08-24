import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import {
  getFarmerBookings,
  getFarmerBookingDetail,
  rateFarmerBooking,
  upsertBookingExtras,
  cancelFarmerBooking,
  rescheduleFarmerBooking,
  getBookingStatuses,
} from '../controllers/farmerBookingController.js';
import { getFarmerProfile, updateFarmerProfile } from '../controllers/farmerProfile.controller.js';

const farmerRouter = express.Router();

// All routes require the farmer to be authenticated via JWT
farmerRouter.use(authenticate);

// ─────────────────────────────────────────────────────────────────────────────
//  Farmer Booking Routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/farmer/profile
 * Query param: ?tab=main|personal|farm|address|bank
 * Fetches dynamic profile details.
 */
farmerRouter.get('/profile', getFarmerProfile);

/**
 * PATCH /api/farmer/profile
 * Query param: ?tab=personal
 * Updates profile details based on the selected tab.
 */
farmerRouter.patch('/profile', updateFarmerProfile);

// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/farmer/bookings/statuses
 * Returns the canonical tab list: PENDING, UPCOMING, ONGOING, COMPLETED, CANCELLED.
 * ⚠️  Must be registered BEFORE /:booking_id to avoid "statuses" being parsed as a UUID.
 */
farmerRouter.get('/bookings/statuses', getBookingStatuses);

/**
 * GET /api/farmer/bookings
 * Query params:
 *   status  – PENDING | UPCOMING | ONGOING | COMPLETED | CANCELLED  (optional — omit for all)
 *   page    – page number (default: 1)
 *   limit   – records per page (default: 10)
 *
 * Returns a paginated list of booking cards.
 */
farmerRouter.get('/bookings', getFarmerBookings);

/**
 * GET /api/farmer/bookings/:booking_id
 * Returns the full booking detail object.
 * The `status` field tells the app which detail screen to open.
 */
farmerRouter.get('/bookings/:booking_id', getFarmerBookingDetail);

/**
 * PATCH /api/farmer/bookings/:booking_id/rate
 * Body: { rating: 1–5 }
 * Farmer submits star rating after a COMPLETED booking.
 */
farmerRouter.patch('/bookings/:booking_id/rate', rateFarmerBooking);

/**
 * POST /api/farmer/bookings/:booking_id/cancel
 * Body: { cancellation_reason: "Bad Weather" }
 * Farmer cancels a PENDING or UPCOMING booking.
 */
farmerRouter.post('/bookings/:booking_id/cancel', cancelFarmerBooking);

/**
 * PATCH /api/farmer/bookings/:booking_id/reschedule
 * Body: { new_date: "2026-05-28", new_time_window: "10:00 AM - 12:00 PM" }
 * Farmer reschedules an UPCOMING booking (opens RescheduleBookingFragment).
 */
farmerRouter.patch('/bookings/:booking_id/reschedule', rescheduleFarmerBooking);

/**
 * PATCH /api/farmer/bookings/:booking_id/extras
 * Body: any fields from SprayingOrderExtras model
 * Used by admin/pilot-side to set payment details, service info,
 * live snapshot, pilot ratings, and post-job usage stats.
 */
farmerRouter.patch('/bookings/:booking_id/extras', upsertBookingExtras);

export default farmerRouter;
