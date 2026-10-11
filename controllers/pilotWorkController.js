import { Op } from 'sequelize';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import db from "../models/index.js";
import { fileURLToPath } from 'url';
import { OrderStatusEnum, PILOT_STARTABLE_ORDER_STATUSES } from '../utils/enums.js';
import { updateOrderStatus } from '../utils/orderUtils.js';
import { ApiError } from '../utils/apiError.js';
import { respondWithError } from '../middleware/errorHandler.js';
import { parseDateOnly, todayIST, toYMD, readDayData, getDayStatus, stripDecline } from '../utils/dateUtils.js';
import fs from 'fs';

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
// Absolute path (the same folder server.js serves at /uploads), so uploads never depend on the working directory.
const UPLOAD_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

export const pilotUpload = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new ApiError(400, "Only JPG, JPEG, and PNG files are allowed"));
    }
    cb(null, true);
  },
});


const WORK_FIELDS = [
  "completed_acres",
  "fertilizer_used",
  "pesticide_used",
  "water_used",
  "notes",
  "start_time",
  "end_time",
];

const MAX_TEXT_LENGTH = 2000;
const MAX_ACRES_PER_DAY = 10000;

/**
 * Validates and picks only the work fields the pilot actually sent (0 is a valid value; undefined/null/"" are ignored).
 * Returns { fields } or { error } with a message the pilot can read.
 */
const parseWorkFields = (body = {}) => {
  const fields = {};
  for (const key of WORK_FIELDS) {
    const v = body[key];
    if (v === undefined || v === null || v === "") continue;

    if (key === "completed_acres") {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > MAX_ACRES_PER_DAY) {
        return { error: "completed_acres must be a number between 0 and 10000." };
      }
      fields[key] = n;
    } else if (typeof v === "number" && Number.isFinite(v)) {
      fields[key] = v;
    } else if (typeof v === "string") {
      if (v.length > MAX_TEXT_LENGTH) {
        return { error: `${key} must be ${MAX_TEXT_LENGTH} characters or fewer.` };
      }
      fields[key] = v;
    } else {
      return { error: `${key} has an invalid value.` };
    }
  }
  return { fields };
};

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
    if (Number(pilot_user_id) !== req.pilot.id) {
      return res.status(403).json({ success: false, message: "You can only view your own orders." });
    }

    // Orders are found through the daily logs, which carry the per-date assignment
    const myLogs = await SprayingDailyLogs.findAll({
      where: { pilot_user_id, is_active: true },
      order: [["working_date", "ASC"]],
    });

    if (myLogs.length === 0) {
      return res.status(200).json({ success: true, orders: [], message: "No orders assigned to this pilot." });
    }

    const bookingIds = [...new Set(myLogs.map((l) => l.spraying_work_id))];

    const orders = await SprayingOrder.findAll({
      where: { booking_id: { [Op.in]: bookingIds } },
      order: [["start_date", "ASC"]],
    });

    const today = todayIST();

    const ordersWithMeta = await Promise.all(
      orders.map(async (order) => {
        const logs = myLogs.filter((l) => l.spraying_work_id === order.booking_id);

        const address = await SprayingOrderAddress.findOne({
          where: { order_id: order.booking_id },
        });

        const working_days = logs.map((l, idx) => {
          const date = toYMD(l.working_date);
          const day_status = getDayStatus(l);
          return {
            log_id: l.id,
            day_number: idx + 1,
            date,
            drone_id: l.drone_id,
            is_pilot_confirmed: l.is_pilot_confirmed === true,
            day_status,                       // scheduled | confirmed | started | completed
            is_today: date === today,
            can_start: day_status === "confirmed" && date <= today,
          };
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
            lane1: address.lane1,
            lane2: address.lane2,
            pincode: address.pincode,
          } : null,
          total_logs: logs.length,
          verified_logs: logs.filter(l => l.is_verified).length,
          pending_confirmation: working_days.filter(d => !d.is_pilot_confirmed).length,
          drone_id: logs[0]?.drone_id ?? null,
          co_pilot_user_id: logs[0]?.co_pilot_user_id ?? null,
          working_days,
        };
      })
    );

    res.status(200).json({ success: true, orders: ordersWithMeta });
  } catch (error) {
    return respondWithError(req, res, error, "getPilotOrders");
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
    // The pilot is whoever is logged in; a pilot_user_id in the body is never trusted.
    const pilot_user_id = req.pilot.id;
    const { booking_id, working_date } = req.body;
    if (req.body.pilot_user_id !== undefined && Number(req.body.pilot_user_id) !== pilot_user_id) {
      return res.status(403).json({ success: false, message: "pilot_user_id does not match the logged-in pilot." });
    }

    if (!booking_id || !working_date) {
      return res.status(400).json({ success: false, message: "booking_id and working_date are required." });
    }

    const dateObj = parseDateOnly(working_date);
    if (!dateObj) {
      return res.status(400).json({ success: false, message: "working_date must be a valid date (YYYY-MM-DD)." });
    }
    const ymd = toYMD(dateObj);

    const order = await SprayingOrder.findByPk(booking_id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    // The day must have been scheduled by the admin for this pilot
    const log = await SprayingDailyLogs.findOne({
      where: { spraying_work_id: booking_id, working_date: dateObj, is_active: true },
    });
    if (!log) {
      return res.status(404).json({
        success: false,
        message: `No work is scheduled for ${ymd} on this booking. Ask the admin to assign this date.`,
      });
    }
    if (log.pilot_user_id !== Number(pilot_user_id)) {
      return res.status(403).json({ success: false, message: "This working day is not assigned to you." });
    }

    // Order must be accepted by the pilot and still running
    if (!PILOT_STARTABLE_ORDER_STATUSES.includes(order.order_status)) {
      return res.status(409).json({
        success: false,
        message: `Cannot start work while the order is ${order.order_status}.`,
        order_status: order.order_status,
      });
    }
    if (log.is_pilot_confirmed !== true) {
      return res.status(409).json({
        success: false,
        message: "Accept this working day (confirm-assignment) before starting it.",
      });
    }

    // Cannot start a day in the future (India date)
    if (ymd > todayIST()) {
      return res.status(409).json({
        success: false,
        message: `${ymd} is in the future. You can only start today's work or a missed earlier day.`,
      });
    }

    // The day and the order status change together or not at all. The row is locked and re-read so a double tap
    // (or two devices) cannot start the same day twice or overwrite its start time.
    const outcome = await db.sequelize.transaction(async (t) => {
      // Lock the order first and re-check its status: a farmer cancelling at this very moment must win, otherwise
      // the status below would turn a cancelled booking back into a running one.
      const lockedOrder = await SprayingOrder.findByPk(booking_id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!lockedOrder || !PILOT_STARTABLE_ORDER_STATUSES.includes(lockedOrder.order_status)) {
        return { state: "order_closed", order_status: lockedOrder?.order_status };
      }

      const locked = await SprayingDailyLogs.findByPk(log.id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!locked.is_active) return { state: "order_closed", order_status: lockedOrder.order_status };
      const current = getDayStatus(locked);
      if (current === "completed") return { state: "completed" };
      if (current === "started") return { state: "already_started", log: locked };

      const now = new Date();
      await locked.update({
        verification_comment: JSON.stringify({
          ...readDayData(locked),
          day_status: "started",
          started_at: now.toISOString(),
        }),
        modified_on: now,
      }, { transaction: t });

      const allLogs = await SprayingDailyLogs.findAll({
        where: { spraying_work_id: booking_id, is_active: true },
        order: [["working_date", "ASC"]],
        attributes: ["id"],
        transaction: t,
      });
      const dayNumber = allLogs.findIndex((l) => l.id === locked.id) + 1;
      await updateOrderStatus(
        booking_id,
        OrderStatusEnum.JOB_STARTED,
        `Pilot started working day ${dayNumber} of ${allLogs.length} (${ymd})`,
        Number(pilot_user_id),
        t
      );
      return { state: "started", log: locked, dayNumber };
    });

    if (outcome.state === "order_closed") {
      return res.status(409).json({
        success: false,
        message: `Cannot start work while the order is ${outcome.order_status}.`,
        order_status: outcome.order_status,
      });
    }
    if (outcome.state === "completed") {
      return res.status(409).json({ success: false, message: "This working day is already completed." });
    }
    if (outcome.state === "already_started") {
      return res.status(200).json({
        success: true,
        message: "Day already started.",
        data: outcome.log,
        isNew: false,
        day_status: "started",
        order_status: order.order_status,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Working day started successfully.",
      data: outcome.log,
      isNew: true,
      day_status: "started",
      day_number: outcome.dayNumber,
      order_status: OrderStatusEnum.JOB_STARTED,
    });
  } catch (error) {
    return respondWithError(req, res, error, "startDay");
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
    const { booking_id, working_date } = req.body;

    if (!booking_id || !working_date) {
      return res.status(400).json({ success: false, message: "booking_id and working_date are required." });
    }

    const dateObj = parseDateOnly(working_date);
    if (!dateObj) {
      return res.status(400).json({ success: false, message: "working_date must be a valid date (YYYY-MM-DD)." });
    }

    const order = await SprayingOrder.findByPk(booking_id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    const log = await SprayingDailyLogs.findOne({
      where: { spraying_work_id: booking_id, working_date: dateObj, is_active: true },
    });
    if (!log) {
      return res.status(404).json({ success: false, message: "Daily log not found for this date." });
    }

    if (log.pilot_user_id !== req.pilot.id) {
      return res.status(403).json({ success: false, message: "This working day is not assigned to you." });
    }

    if (getDayStatus(log) !== "started") {
      return res.status(409).json({
        success: false,
        message: "Start the day first (day must be in progress to update work details).",
        day_status: getDayStatus(log),
      });
    }

    const parsed = parseWorkFields(req.body);
    if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });

    const mergedData = {
      ...readDayData(log),
      ...parsed.fields,
      updated_at: new Date().toISOString(),
    };

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
    return respondWithError(req, res, error, "updatePilotWorkDetails");
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

    const log = Number.isInteger(Number(log_id)) ? await SprayingDailyLogs.findByPk(log_id) : null;
    if (!log || log.pilot_user_id !== req.pilot.id) {
      // multer has already stored the file: do not keep an upload that was refused
      fs.unlink(file.path, () => {});
      return res.status(log ? 403 : 404).json({
        success: false,
        message: log ? "This working day is not assigned to you." : "Daily log not found.",
      });
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
    if (req.file?.path) fs.unlink(req.file.path, () => {}); // do not keep an upload whose record failed to save
    return respondWithError(req, res, error, "uploadFieldImage");
  }
};


// ═══════════════════════════════════════════════════════════════
//  5. POST /end-day
//  Pilot marks a day as complete (saves final work data).
//  This does NOT mark it as verified — only admin can verify.
// ═══════════════════════════════════════════════════════════════
export const endDay = async (req, res) => {
  try {
    const { booking_id, working_date } = req.body;

    if (!booking_id || !working_date) {
      return res.status(400).json({ success: false, message: "booking_id and working_date are required." });
    }

    const dateObj = parseDateOnly(working_date);
    if (!dateObj) {
      return res.status(400).json({ success: false, message: "working_date must be a valid date (YYYY-MM-DD)." });
    }

    const log = await SprayingDailyLogs.findOne({
      where: { spraying_work_id: booking_id, working_date: dateObj, is_active: true },
    });
    if (!log) {
      return res.status(404).json({ success: false, message: "Daily log not found for this date." });
    }

    if (log.pilot_user_id !== req.pilot.id) {
      return res.status(403).json({ success: false, message: "This working day is not assigned to you." });
    }

    const previousStatus = getDayStatus(log);
    if (!["started", "completed"].includes(previousStatus)) {
      return res.status(409).json({
        success: false,
        message: "Start the day before ending it.",
        day_status: previousStatus,
      });
    }

    const parsed = parseWorkFields(req.body);
    if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });

    // Saving the day and moving the order status are one unit; the row is locked so a double tap cannot
    // end the same day twice.
    const result = await db.sequelize.transaction(async (t) => {
      const locked = await SprayingDailyLogs.findByPk(log.id, { transaction: t, lock: t.LOCK.UPDATE });
      const before = getDayStatus(locked);
      if (!["started", "completed"].includes(before)) return { notStarted: before };

      // Final day summary: keep everything saved so far, add what was sent now
      const now = new Date();
      const dayData = {
        ...readDayData(locked),
        ...parsed.fields,
        day_status: "completed",
        saved_at: now.toISOString(),
      };
      await locked.update({
        verification_comment: JSON.stringify(dayData),
        modified_on: now,
      }, { transaction: t });

      // Whole job done only when every scheduled day is completed
      const allLogs = await SprayingDailyLogs.findAll({
        where: { spraying_work_id: booking_id, is_active: true },
        transaction: t,
      });
      const allDaysComplete =
        allLogs.length > 0 && allLogs.every((l) => getDayStatus(l) === "completed");

      // Status moves only the first time this day is ended
      let orderStatus;
      if (before === "started") {
        orderStatus = allDaysComplete ? OrderStatusEnum.ORDER_COMPLETED : OrderStatusEnum.JOB_ENDED;
        await updateOrderStatus(
          booking_id,
          orderStatus,
          allDaysComplete ? "All days completed by pilot" : `Pilot ended working day ${toYMD(dateObj)}`,
          locked.pilot_user_id,
          t
        );
      }
      return { log: locked, dayData, allDaysComplete, orderStatus };
    });

    if (result.notStarted) {
      return res.status(409).json({
        success: false,
        message: "Start the day before ending it.",
        day_status: result.notStarted,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Day ended and saved successfully.",
      data: {
        log_id: result.log.id,
        booking_id,
        working_date: result.log.working_date,
        day_data: result.dayData,
        all_days_complete: result.allDaysComplete,
        order_status: result.orderStatus,
      },
    });
  } catch (error) {
    return respondWithError(req, res, error, "endDay");
  }
};


// ═══════════════════════════════════════════════════════════════
//  6. POST /add-comment
//  Pilot adds a comment/note for an order (visible to admin).
// ═══════════════════════════════════════════════════════════════
export const addPilotComment = async (req, res) => {
  try {
    const pilot_user_id = req.pilot.id;
    const {
      booking_id,
      comment,
      comment_type,  // e.g. "field_note", "issue", "progress_update"
      working_date,
    } = req.body;

    const text = typeof comment === "string" ? comment.trim() : "";
    if (!booking_id || !text) {
      return res.status(400).json({ success: false, message: "booking_id and comment are required." });
    }
    if (text.length > 1000) {
      return res.status(400).json({ success: false, message: "The comment must be 1000 characters or fewer." });
    }
    const commentDate = working_date ? parseDateOnly(working_date) : new Date();
    if (!commentDate) {
      return res.status(400).json({ success: false, message: "working_date must be a valid date (YYYY-MM-DD)." });
    }

    const assigned = await SprayingDailyLogs.findOne({ where: { spraying_work_id: booking_id, pilot_user_id } });
    if (!assigned) {
      return res.status(403).json({ success: false, message: "This booking is not assigned to you." });
    }

    // Verify order exists
    const order = await SprayingOrder.findByPk(booking_id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    const newComment = await SprayingOrderComment.create({
      user_id: pilot_user_id,
      comment_type: String(comment_type || "pilot_note").slice(0, 50),
      comment: text,
      spraying_order_id: booking_id,
      working_date: commentDate,
      created_by: pilot_user_id,
      created_on: new Date(),
    });

    res.status(201).json({
      success: true,
      message: "Comment added successfully.",
      data: newComment,
    });
  } catch (error) {
    return respondWithError(req, res, error, "addPilotComment");
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

    const { booking_id, accepted_dates, accept_all } = req.body;

    // ── 2. Validate inputs ───────────────────────────────────────────
    if (!booking_id) {
      return res.status(400).json({
        success: false,
        message: 'booking_id is required.',
      });
    }

    if (accept_all !== true && !Array.isArray(accepted_dates)) {
      return res.status(400).json({
        success: false,
        message: 'accepted_dates must be an array of date strings (YYYY-MM-DD), or send accept_all: true. Send an empty array [] if you accept no dates.',
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

    // ── 3b. Closed bookings can no longer be accepted ────────────────
    const closedStatuses = [
      OrderStatusEnum.ORDER_CANCELLED,
      OrderStatusEnum.ORDER_REJECTED,
      OrderStatusEnum.ORDER_COMPLETED,
      OrderStatusEnum.WAITING_FOR_PAYMENT,
      OrderStatusEnum.PAYMENT_SUCCESSFUL,
    ];
    if (closedStatuses.includes(order.order_status)) {
      return res.status(409).json({
        success: false,
        message: `This booking is ${order.order_status} and can no longer be accepted.`,
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
        is_active: true,
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
    // accept_all: every day assigned to this pilot that is still open (not started/finished)
    const datesToAccept = accept_all === true
      ? pilotLogs.filter(l => ['scheduled', 'confirmed', 'declined'].includes(getDayStatus(l))).map(l => toYMD(l.working_date))
      : accepted_dates;

    const parsedAccepted = datesToAccept.map(d => ({ raw: d, date: parseDateOnly(d) }));
    const badAccepted = parsedAccepted.find(x => !x.date);
    if (badAccepted) {
      return res.status(400).json({
        success: false,
        message: `Invalid date in accepted_dates: ${JSON.stringify(badAccepted.raw)}. Use YYYY-MM-DD.`,
      });
    }
    const normalizedAccepted = new Set(parsedAccepted.map(x => toYMD(x.date)));

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

    // ── 8-10. Apply confirmation per date, assignee flag and order status as ONE unit ─
    const now = new Date();
    const results = { accepted: [], pending: [], already_confirmed: [], already_declined: [] };

    const closedNow = await db.sequelize.transaction(async (t) => {
      // Re-check under a lock: the booking may have been cancelled while this request was in flight
      const lockedOrder = await SprayingOrder.findByPk(booking_id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!lockedOrder || closedStatuses.includes(lockedOrder.order_status)) return lockedOrder?.order_status || 'MISSING';
      order.order_status = lockedOrder.order_status;

      for (const log of pilotLogs) {
        const logDate = new Date(log.working_date).toISOString().slice(0, 10);

        if (normalizedAccepted.has(logDate)) {
          // Mark as accepted regardless of previous state;
          // accepting a day the pilot declined earlier removes the "declined" markers
          const dayData = readDayData(log);
          await log.update({
            is_pilot_confirmed: true,
            pilot_confirmed_at: now,
            ...(dayData.declined_at && { verification_comment: JSON.stringify(stripDecline(dayData)) }),
            modified_on: now,
          }, { transaction: t });
          results.accepted.push(logDate);
        } else if (log.is_pilot_confirmed === true) results.already_confirmed.push(logDate);
        else if (log.is_pilot_confirmed === false) results.already_declined.push(logDate);
        else results.pending.push(logDate);
      }

      // is_pilot_confirm on the assignee row = true if the pilot has accepted at least one date overall
      const hasAnyAccepted = results.accepted.length > 0 || results.already_confirmed.length > 0;
      await assignee.update({ is_pilot_confirm: hasAnyAccepted, modified_on: now }, { transaction: t });

      if (hasAnyAccepted &&
          (order.order_status === OrderStatusEnum.WAITING_FOR_CONFIRMATION || order.order_status === OrderStatusEnum.ORDER_PLACED)) {
        await updateOrderStatus(booking_id, OrderStatusEnum.ORDER_ACCEPTED, "Pilot confirmed assignment", pilot_user_id, t);
      }
      return null;
    });

    if (closedNow) {
      return res.status(409).json({
        success: false,
        message: `This booking is ${closedNow} and can no longer be accepted.`,
      });
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
    return respondWithError(req, res, error, 'confirmAssignment');
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

    const assigned = await SprayingDailyLogs.findOne({ where: { spraying_work_id: booking_id, pilot_user_id: req.pilot.id } });
    if (!assigned) {
      return res.status(403).json({ success: false, message: "This booking is not assigned to you." });
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
    return respondWithError(req, res, error, "getPilotOrderDetails");
  }
};
