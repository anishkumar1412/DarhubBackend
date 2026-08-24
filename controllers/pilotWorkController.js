import { Op } from 'sequelize';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import db from "../models/index.js";
import { OrderStatusEnum } from '../utils/enums.js';
import { updateOrderStatus } from '../utils/orderUtils.js';

const {
  SprayingOrder,
  SprayingDailyLogs,
  SprayingWorkAssignee,
  SprayingOrderComment,
  SprayingOrderAddress,
  UserProfile,
  MasterCrop,
} = db;

// ── Multer config for land_image uploads ──────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

export const pilotUpload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPG, JPEG, and PNG files are allowed"));
    }
    cb(null, true);
  },
});


// ═══════════════════════════════════════════════════════════════
//  1. GET /get-orders/:pilot_user_id
//  Fetch all orders assigned to a specific pilot
// ═══════════════════════════════════════════════════════════════
export const getPilotOrders = async (req, res) => {
  try {
    const { pilot_user_id } = req.params;

    if (!pilot_user_id) {
      return res.status(400).json({ success: false, message: "pilot_user_id is required." });
    }

    // Find all assignee records for this pilot
    const assignees = await SprayingWorkAssignee.findAll({
      where: { pilot_user_id },
      attributes: ["booking_id", "drone_id", "co_pilot_user_id"],
    });

    if (!assignees || assignees.length === 0) {
      return res.status(200).json({ success: true, orders: [], message: "No orders assigned to this pilot." });
    }

    const bookingIds = assignees.map(a => a.booking_id);

    // Fetch all orders for these booking_ids
    const orders = await SprayingOrder.findAll({
      where: { booking_id: { [Op.in]: bookingIds } },
    });

    // Fetch daily logs count for each order
    const ordersWithMeta = await Promise.all(
      orders.map(async (order) => {
        const dailyLogs = await SprayingDailyLogs.findAll({
          where: { spraying_work_id: order.booking_id },
          attributes: ["id", "working_date", "is_verified"],
        });

        const assignee = assignees.find(a => a.booking_id === order.booking_id);

        // Get address
        const address = await SprayingOrderAddress.findOne({
          where: { order_id: order.booking_id },
        });

        return {
          booking_id: order.booking_id,
          start_date: order.start_date,
          end_date: order.end_date,
          num_of_days: order.num_of_days,
          crop_type_id: order.crop_type_id,
          land_in_acers: order.land_in_acers,
          total_price: order.total_price,
          order_status: order.order_status,
          is_paid: order.is_paid,
          address: address ? {
            village: address.village,
            address1: address.address1,
          } : null,
          total_logs: dailyLogs.length,
          verified_logs: dailyLogs.filter(l => l.is_verified).length,
          drone_id: assignee?.drone_id,
        };
      })
    );

    res.status(200).json({ success: true, orders: ordersWithMeta });
  } catch (error) {
    console.error("Error fetching pilot orders:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};


// ═══════════════════════════════════════════════════════════════
//  2. POST /start-day
//  Pilot starts a new working day for an order.
//  If a daily log for this date already exists (admin pre-assigned it),
//  it just returns it. Otherwise it creates a new one.
// ═══════════════════════════════════════════════════════════════
export const startDay = async (req, res) => {
  try {
    const {
      booking_id,
      pilot_user_id,
      co_pilot_user_id,
      drone_id,
      working_date,   // YYYY-MM-DD
    } = req.body;

    if (!booking_id || !pilot_user_id || !working_date) {
      return res.status(400).json({ success: false, message: "booking_id, pilot_user_id, and working_date are required." });
    }

    // Verify the order exists
    const order = await SprayingOrder.findByPk(booking_id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    // Normalize date
    const dateObj = new Date(working_date);
    dateObj.setUTCHours(0, 0, 0, 0);

    // Check if a daily log already exists for this date
    let log = await SprayingDailyLogs.findOne({
      where: {
        spraying_work_id: booking_id,
        working_date: dateObj,
      },
    });

    if (log) {
      // Update pilot/copilot/drone if needed
      await log.update({
        pilot_user_id: pilot_user_id || log.pilot_user_id,
        co_pilot_user_id: co_pilot_user_id || log.co_pilot_user_id,
        drone_id: drone_id || log.drone_id,
        modified_on: new Date(),
      });
      return res.status(200).json({
        success: true,
        message: "Day already exists, updated pilot/drone info.",
        data: log,
        isNew: false,
      });
    }

    // Create new daily log
    log = await SprayingDailyLogs.create({
      spraying_work_id: booking_id,
      pilot_user_id,
      co_pilot_user_id: co_pilot_user_id || null,
      drone_id: drone_id || null,
      working_date: dateObj,
      is_verified: false,
      created_on: new Date(),
      is_active: true,
    });

    // Update order status to "in progress" if it was pending
    if (order.order_status === OrderStatusEnum.ORDER_PLACED || order.order_status === OrderStatusEnum.ORDER_ACCEPTED || order.order_status === OrderStatusEnum.WAITING_FOR_CONFIRMATION) {
      await updateOrderStatus(booking_id, OrderStatusEnum.ORDER_STARTED, "Pilot started the day", pilot_user_id);
    }

    res.status(201).json({
      success: true,
      message: "New working day started successfully.",
      data: log,
      isNew: true,
    });
  } catch (error) {
    console.error("Error starting day:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};


// ═══════════════════════════════════════════════════════════════
//  3. POST /update-work
//  Pilot updates daily work details (completed_acres, 
//  fertilizer_used, pesticide_used, water_used, notes).
//  These are stored as JSON in verification_comment since the
//  DB columns don't have those fields natively.
// ═══════════════════════════════════════════════════════════════
export const updatePilotWorkDetails = async (req, res) => {
  try {
    const {
      booking_id,
      working_date,
      completed_acres,
      fertilizer_used,
      pesticide_used,
      water_used,
      notes,
      start_time,
      end_time,
    } = req.body;

    if (!booking_id || !working_date) {
      return res.status(400).json({ success: false, message: "booking_id and working_date are required." });
    }

    // Verify order
    const order = await SprayingOrder.findByPk(booking_id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    // Normalize date
    const dateObj = new Date(working_date);
    dateObj.setUTCHours(0, 0, 0, 0);

    // Find the daily log
    const log = await SprayingDailyLogs.findOne({
      where: {
        spraying_work_id: booking_id,
        working_date: dateObj,
      },
    });

    if (!log) {
      return res.status(404).json({ success: false, message: "Daily log not found for this date. Start the day first." });
    }

    // Build work data JSON
    const workData = {
      completed_acres: completed_acres || null,
      fertilizer_used: fertilizer_used || null,
      pesticide_used: pesticide_used || null,
      water_used: water_used || null,
      notes: notes || null,
      start_time: start_time || null,
      end_time: end_time || null,
      updated_at: new Date().toISOString(),
    };

    // Merge with existing data if any
    let existingData = {};
    try {
      if (log.verification_comment) {
        existingData = JSON.parse(log.verification_comment);
      }
    } catch { /* not JSON, overwrite */ }

    const mergedData = { ...existingData, ...workData };

    await log.update({
      verification_comment: JSON.stringify(mergedData),
      modified_on: new Date(),
    });

    res.status(200).json({
      success: true,
      message: "Work details updated successfully.",
      data: {
        log_id: log.id,
        booking_id,
        working_date: log.working_date,
        work_details: mergedData,
      },
    });
  } catch (error) {
    console.error("Error updating pilot work details:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};


// ═══════════════════════════════════════════════════════════════
//  4. POST /upload-field-image/:log_id
//  Pilot uploads a field/land image for a specific daily log.
//  Uses multer middleware (pilotUpload.single('land_image'))
//  in the route definition.
// ═══════════════════════════════════════════════════════════════
export const uploadFieldImage = async (req, res) => {
  try {
    const { log_id } = req.params;
    const file = req.file;

    if (!log_id) {
      return res.status(400).json({ success: false, message: "log_id is required." });
    }

    if (!file) {
      return res.status(400).json({ success: false, message: "No image file provided." });
    }

    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: "File size must be less than 5 MB." });
    }

    const log = await SprayingDailyLogs.findByPk(log_id);
    if (!log) {
      return res.status(404).json({ success: false, message: "Daily log not found." });
    }

    await log.update({
      land_image_original_name: file.originalname,
      land_image_new_name: file.filename,
      land_image_url: `/uploads/${file.filename}`,
      modified_on: new Date(),
    });

    res.status(200).json({
      success: true,
      message: "Field image uploaded successfully.",
      data: {
        log_id: log.id,
        land_image_url: `/uploads/${file.filename}`,
      },
    });
  } catch (error) {
    console.error("Error uploading field image:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};


// ═══════════════════════════════════════════════════════════════
//  5. POST /end-day
//  Pilot marks a day as complete (saves final work data).
//  This does NOT mark it as verified — only admin can verify.
// ═══════════════════════════════════════════════════════════════
export const endDay = async (req, res) => {
  try {
    const {
      booking_id,
      working_date,
      completed_acres,
      fertilizer_used,
      pesticide_used,
      water_used,
      notes,
      start_time,
      end_time,
    } = req.body;

    if (!booking_id || !working_date) {
      return res.status(400).json({ success: false, message: "booking_id and working_date are required." });
    }

    // Normalize date
    const dateObj = new Date(working_date);
    dateObj.setUTCHours(0, 0, 0, 0);

    const log = await SprayingDailyLogs.findOne({
      where: {
        spraying_work_id: booking_id,
        working_date: dateObj,
      },
    });

    if (!log) {
      return res.status(404).json({ success: false, message: "Daily log not found for this date." });
    }

    // Build final day summary
    const dayData = {
      completed_acres: completed_acres || null,
      fertilizer_used: fertilizer_used || null,
      pesticide_used: pesticide_used || null,
      water_used: water_used || null,
      notes: notes || null,
      start_time: start_time || null,
      end_time: end_time || null,
      day_status: "completed",
      saved_at: new Date().toISOString(),
    };

    await log.update({
      verification_comment: JSON.stringify(dayData),
      modified_on: new Date(),
    });

    // Check if all days are done
    const allLogs = await SprayingDailyLogs.findAll({
      where: { spraying_work_id: booking_id },
    });

    const allDaysComplete = allLogs.every(l => {
      try {
        const data = JSON.parse(l.verification_comment || "{}");
        return data.day_status === "completed";
      } catch { return false; }
    });

    // If all days complete, update order status
    if (allDaysComplete && allLogs.length > 0) {
      const order = await SprayingOrder.findByPk(booking_id);
      if (order) {
        await updateOrderStatus(booking_id, OrderStatusEnum.ORDER_COMPLETED, "All days completed by pilot");
      }
    }

    res.status(200).json({
      success: true,
      message: "Day ended and saved successfully.",
      data: {
        log_id: log.id,
        booking_id,
        working_date: log.working_date,
        day_data: dayData,
        all_days_complete: allDaysComplete,
      },
    });
  } catch (error) {
    console.error("Error ending day:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};


// ═══════════════════════════════════════════════════════════════
//  6. POST /add-comment
//  Pilot adds a comment/note for an order (visible to admin).
// ═══════════════════════════════════════════════════════════════
export const addPilotComment = async (req, res) => {
  try {
    const {
      booking_id,
      pilot_user_id,
      comment,
      comment_type,  // e.g. "field_note", "issue", "progress_update"
      working_date,
    } = req.body;

    if (!booking_id || !comment || !pilot_user_id) {
      return res.status(400).json({ success: false, message: "booking_id, pilot_user_id, and comment are required." });
    }

    // Verify order exists
    const order = await SprayingOrder.findByPk(booking_id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    const newComment = await SprayingOrderComment.create({
      user_id: pilot_user_id,
      comment_type: comment_type || "pilot_note",
      comment,
      spraying_order_id: booking_id,
      working_date: working_date ? new Date(working_date) : new Date(),
      created_by: pilot_user_id,
      created_on: new Date(),
    });

    res.status(201).json({
      success: true,
      message: "Comment added successfully.",
      data: newComment,
    });
  } catch (error) {
    console.error("Error adding pilot comment:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};


// ═══════════════════════════════════════════════════════════════
//  7. POST /confirm-assignment
//
//  A pilot accepts specific working dates from their assigned booking.
//
//  ── Security ──────────────────────────────────────────────────
//  The pilot's identity (pilot_user_id) is read ONLY from
//  req.pilot.id, which is set by the authenticatePilot middleware
//  after verifying the signed JWT.  It is intentionally IGNORED
//  from the request body, so no malicious actor can accept another
//  pilot's booking by crafting a custom payload.
//
//  ── How it works ─────────────────────────────────────────────
//  Request body:
//    {
//      booking_id:      "uuid",                   // which order
//      accepted_dates:  ["2026-07-20", "2026-07-22"]  // dates pilot can do
//    }
//
//  For every SPRAYING_DAILY_LOGS row belonging to this booking
//  that was assigned to the calling pilot:
//    • If the log's working_date is in accepted_dates  → is_pilot_confirmed = true
//    • All other assigned-to-this-pilot dates are left  → null (not responded)
//      (they are NOT auto-rejected; the pilot can call again later)
//
//  The overall SprayingWorkAssignee row's is_pilot_confirm is set
//  to true only when the pilot has confirmed at least one date.
// ═══════════════════════════════════════════════════════════════
export const confirmAssignment = async (req, res) => {
  try {
    // ── 1. Identity comes from the verified JWT, never the body ──────
    const pilot_user_id = req.pilot?.id;

    if (!pilot_user_id) {
      return res.status(401).json({
        success: false,
        message: 'Pilot identity could not be determined. Please login again.',
      });
    }

    const { booking_id, accepted_dates } = req.body;

    // ── 2. Validate inputs ───────────────────────────────────────────
    if (!booking_id) {
      return res.status(400).json({
        success: false,
        message: 'booking_id is required.',
      });
    }

    if (!Array.isArray(accepted_dates)) {
      return res.status(400).json({
        success: false,
        message: 'accepted_dates must be an array of date strings (YYYY-MM-DD). Send an empty array [] if you accept no dates.',
      });
    }

    // ── 3. Verify the booking exists ─────────────────────────────────
    const order = await SprayingOrder.findByPk(booking_id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    // ── 4. Verify THIS pilot is actually assigned to this booking ────
    //      This is the second security layer: even if the JWT is valid,
    //      the pilot must appear in the assignee table for this booking.
    const assignee = await SprayingWorkAssignee.findOne({
      where: { booking_id, pilot_user_id },
    });

    if (!assignee) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this booking. Access denied.',
      });
    }

    // ── 5. Load all daily log rows for this booking assigned to pilot ─
    const pilotLogs = await SprayingDailyLogs.findAll({
      where: {
        spraying_work_id: booking_id,
        pilot_user_id,
      },
      order: [['working_date', 'ASC']],
    });

    if (pilotLogs.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No working dates found assigned to you for this booking. The admin may not have scheduled the work yet.',
      });
    }

    // ── 6. Normalize accepted_dates to UTC midnight strings ──────────
    //      e.g. "2026-07-20" → "2026-07-20" (compare with DB dates)
    const normalizedAccepted = new Set(
      accepted_dates.map(d => {
        const dt = new Date(d);
        if (isNaN(dt.getTime())) return null;
        // Normalize to YYYY-MM-DD UTC
        return dt.toISOString().slice(0, 10);
      }).filter(Boolean)
    );

    // ── 7. Validate that all accepted_dates actually belong to this pilot ─
    const assignedDatesSet = new Set(
      pilotLogs.map(l => new Date(l.working_date).toISOString().slice(0, 10))
    );

    const invalidDates = [...normalizedAccepted].filter(d => !assignedDatesSet.has(d));
    if (invalidDates.length > 0) {
      return res.status(400).json({
        success: false,
        message: `The following dates are not assigned to you for this booking: ${invalidDates.join(', ')}`,
        invalid_dates: invalidDates,
      });
    }

    // ── 8. Apply confirmation per date ───────────────────────────────
    const now = new Date();
    const results = { accepted: [], pending: [], already_confirmed: [], already_declined: [] };

    await Promise.all(
      pilotLogs.map(async log => {
        const logDate = new Date(log.working_date).toISOString().slice(0, 10);
        const wantsToAccept = normalizedAccepted.has(logDate);

        if (wantsToAccept) {
          // Mark as accepted regardless of previous state
          await log.update({
            is_pilot_confirmed: true,
            pilot_confirmed_at: now,
            modified_on: now,
          });
          results.accepted.push(logDate);
        } else {
          // Not in accepted list — leave untouched (null = not responded)
          // but track for the response summary
          if (log.is_pilot_confirmed === true)       results.already_confirmed.push(logDate);
          else if (log.is_pilot_confirmed === false)  results.already_declined.push(logDate);
          else                                        results.pending.push(logDate);
        }
      })
    );

    // ── 9. Update the assignee-level flag ────────────────────────────
    //      is_pilot_confirm on the assignee row = true if pilot has
    //      accepted at least one date overall.
    const hasAnyAccepted = pilotLogs.some(l => {
      const d = new Date(l.working_date).toISOString().slice(0, 10);
      return normalizedAccepted.has(d) || l.is_pilot_confirmed === true;
    });

    await assignee.update({
      is_pilot_confirm: hasAnyAccepted,
      modified_on: now,
    });

    // ── 10. Update order status if pilot confirmed ───────────────────
    if (hasAnyAccepted &&
        (order.order_status === OrderStatusEnum.WAITING_FOR_CONFIRMATION || order.order_status === OrderStatusEnum.ORDER_PLACED)) {
      await updateOrderStatus(booking_id, OrderStatusEnum.ORDER_ACCEPTED, "Pilot confirmed assignment", pilot_user_id);
    }

    // ── 11. Build summary of all dates for this pilot ────────────────
    // Re-fetch to get fresh state
    const updatedLogs = await SprayingDailyLogs.findAll({
      where: { spraying_work_id: booking_id, pilot_user_id },
      order: [['working_date', 'ASC']],
      attributes: ['id', 'working_date', 'is_pilot_confirmed', 'pilot_confirmed_at'],
    });

    const dateSummary = updatedLogs.map(l => ({
      log_id:             l.id,
      date:               new Date(l.working_date).toISOString().slice(0, 10),
      status:
        l.is_pilot_confirmed === true  ? 'accepted'  :
        l.is_pilot_confirmed === false ? 'declined'  :
                                         'pending',
      confirmed_at: l.pilot_confirmed_at || null,
    }));

    return res.status(200).json({
      success: true,
      message: results.accepted.length > 0
        ? `You have confirmed ${results.accepted.length} date(s) for booking ${booking_id}.`
        : 'No new dates were confirmed. Previously accepted dates remain unchanged.',
      booking_id,
      pilot_user_id,
      summary: {
        total_assigned:    pilotLogs.length,
        newly_accepted:    results.accepted.length,
        already_confirmed: results.already_confirmed.length,
        pending_response:  results.pending.length + results.already_declined.length,
      },
      dates: dateSummary,
    });

  } catch (error) {
    console.error('Error confirming pilot assignment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};



// ═══════════════════════════════════════════════════════════════
//  8. GET /order-details/:booking_id
//  Pilot gets full details of a specific order (same as admin
//  getOrderById but without admin-only metadata).
// ═══════════════════════════════════════════════════════════════
export const getPilotOrderDetails = async (req, res) => {
  try {
    const { booking_id } = req.params;

    const order = await SprayingOrder.findByPk(booking_id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    // Address
    const address = await SprayingOrderAddress.findOne({
      where: { order_id: booking_id },
    });

    // Daily logs with work data
    const dailyLogs = await SprayingDailyLogs.findAll({
      where: { spraying_work_id: booking_id },
      order: [["working_date", "ASC"]],
    });

    const logsWithDetails = dailyLogs.map(log => {
      let workData = {};
      try {
        if (log.verification_comment) {
          workData = JSON.parse(log.verification_comment);
        }
      } catch { /* ignore */ }

      return {
        id: log.id,
        working_date: log.working_date,
        drone_id: log.drone_id,
        pilot_user_id: log.pilot_user_id,
        co_pilot_user_id: log.co_pilot_user_id,
        is_verified: log.is_verified,
        verified_on: log.verified_on,
        land_image_url: log.land_image_url,
        work_details: workData,
      };
    });

    // Comments
    const comments = await SprayingOrderComment.findAll({
      where: { spraying_order_id: booking_id },
      order: [["created_on", "DESC"]],
    });

    // Assignee
    const assignee = await SprayingWorkAssignee.findOne({
      where: { booking_id },
    });

    res.status(200).json({
      success: true,
      order: {
        booking_id: order.booking_id,
        start_date: order.start_date,
        end_date: order.end_date,
        num_of_days: order.num_of_days,
        crop_type_id: order.crop_type_id,
        land_in_acers: order.land_in_acers,
        price: order.price,
        total_price: order.total_price,
        order_status: order.order_status,
        is_paid: order.is_paid,
      },
      address: address || null,
      daily_logs: logsWithDetails,
      comments: comments || [],
      assignee: assignee ? {
        drone_id: assignee.drone_id,
        pilot_user_id: assignee.pilot_user_id,
        co_pilot_user_id: assignee.co_pilot_user_id,
        is_pilot_confirm: assignee.is_pilot_confirm,
        is_copilot_confirm: assignee.is_copilot_confirm,
      } : null,
    });
  } catch (error) {
    console.error("Error fetching pilot order details:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};
