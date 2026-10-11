import express from 'express';
import { authenticateAdmin, requireAnyPermission } from '../middleware/adminAuth.middleware.js';
import { authenticateUser, requireFarmer } from '../middleware/access.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validation/common.js';
import {
  profileQuerySchema,
  addressCreateSchema, addressUpdateSchema, bankCreateSchema, bankUpdateSchema, upiSchema,
  bookingParams, bookingListQuerySchema, rateBookingSchema, cancelBookingSchema, rescheduleBookingSchema,
} from '../validation/farmer.schemas.js';
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
import {
  addFarmerAddress,
  updateFarmerAddress,
  deleteFarmerAddress,
  addBankAccount,
  updateBankAccount,
  deleteBankAccount,
  addUpi,
  updateUpi,
  deleteUpi,
} from '../controllers/farmerProfileManage.controller.js';

const farmerRouter = express.Router();

/**
 * PATCH /api/farmer/bookings/:booking_id/extras
 * ADMIN ONLY. Farmers must not be able to edit payment / pilot / usage data on a booking,
 * so this route requires an activated admin account with the orders:edit or payments:manage permission.
 * Body: any editable SprayingOrderExtras field (payment details, service info,
 * live snapshot, pilot ratings, post-job usage stats). Unknown fields are rejected.
 */
farmerRouter.patch(
  '/bookings/:booking_id/extras',
  authenticateAdmin,
  validate({ params: bookingParams }),
  requireAnyPermission('orders:edit', 'payments:manage'),
  upsertBookingExtras
);

// Every other route: a signed-in, active FARMER account. (This used to check only the token's signature, so a
// deactivated account kept working until its token expired, and pilots/admins could call farmer endpoints.)
// Registered after /extras above, which is for administrators.
farmerRouter.use(authenticateUser, requireFarmer);

const byId = validate({ params: idParam('id') });
const byBooking = validate({ params: bookingParams });

// ─────────────────────────────────────────────────────────────────────────────
//  Farmer Booking Routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/farmer/profile
 * Query param: ?tab=main|personal|farm|address|bank
 * Fetches dynamic profile details.
 */
farmerRouter.get('/profile', validate({ query: profileQuerySchema }), getFarmerProfile);

/**
 * PATCH /api/farmer/profile
 * Query param: ?tab=personal
 * Updates profile details based on the selected tab.
 */
farmerRouter.patch('/profile', validate({ query: profileQuerySchema }), updateFarmerProfile);

// ─────────────────────────────────────────────────────────────────────────────
//  Profile management (the logged-in farmer's own addresses, bank accounts, UPI)
// ─────────────────────────────────────────────────────────────────────────────

/** POST   /api/farmer/addresses            { lane_1, lane_2?, state, district, block, village, pincode, is_primary? } */
farmerRouter.post('/addresses', validate({ body: addressCreateSchema }), addFarmerAddress);
/** PATCH  /api/farmer/addresses/:id        any address field, or { is_primary: true } to make it the primary address */
farmerRouter.patch('/addresses/:id', byId, validate({ body: addressUpdateSchema }), updateFarmerAddress);
/** DELETE /api/farmer/addresses/:id */
farmerRouter.delete('/addresses/:id', byId, deleteFarmerAddress);

/** POST   /api/farmer/bank-accounts        { bank_name, acc_holder_name, acc_number, ifsc_code, is_primary? } */
farmerRouter.post('/bank-accounts', validate({ body: bankCreateSchema }), addBankAccount);
/** PATCH  /api/farmer/bank-accounts/:id    any bank field, or { is_primary: true } */
farmerRouter.patch('/bank-accounts/:id', byId, validate({ body: bankUpdateSchema }), updateBankAccount);
/** DELETE /api/farmer/bank-accounts/:id */
farmerRouter.delete('/bank-accounts/:id', byId, deleteBankAccount);

/** POST / PATCH / DELETE  /api/farmer/upi[/:id]    { upi_id } */
farmerRouter.post('/upi', validate({ body: upiSchema }), addUpi);
farmerRouter.patch('/upi/:id', byId, validate({ body: upiSchema }), updateUpi);
farmerRouter.delete('/upi/:id', byId, deleteUpi);

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
 *   limit   – records per page (default: 10, at most 50)
 *
 * Returns a paginated list of booking cards.
 */
farmerRouter.get('/bookings', validate({ query: bookingListQuerySchema }), getFarmerBookings);

/**
 * GET /api/farmer/bookings/:booking_id
 * Returns the full booking detail object.
 * The `status` field tells the app which detail screen to open.
 */
farmerRouter.get('/bookings/:booking_id', byBooking, getFarmerBookingDetail);

/**
 * PATCH /api/farmer/bookings/:booking_id/rate
 * Body: { rating: 1–5 (whole number) }
 * Farmer submits star rating after a COMPLETED booking (and can change it later).
 */
farmerRouter.patch('/bookings/:booking_id/rate', byBooking, validate({ body: rateBookingSchema }), rateFarmerBooking);

/**
 * POST /api/farmer/bookings/:booking_id/cancel
 * Body: { cancellation_reason: "Bad Weather" }
 * Farmer cancels a PENDING or UPCOMING booking.
 */
farmerRouter.post('/bookings/:booking_id/cancel', byBooking, validate({ body: cancelBookingSchema }), cancelFarmerBooking);

/**
 * PATCH /api/farmer/bookings/:booking_id/reschedule
 * Body: { new_date: "2026-05-28", new_time_window: "10:00 AM - 12:00 PM" }
 * Farmer reschedules an UPCOMING booking (opens RescheduleBookingFragment).
 */
farmerRouter.patch('/bookings/:booking_id/reschedule', byBooking, validate({ body: rescheduleBookingSchema }), rescheduleFarmerBooking);

export default farmerRouter;
