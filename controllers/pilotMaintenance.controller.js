/**
 * controllers/pilotMaintenance.controller.js
 *
 * Pilot-facing Maintenance Task Form API.
 * Powers the "Maintenance Task Form" UI for pilots to create,
 * save as draft, and submit maintenance reports for drones.
 *
 * Tables: PILOT_MAINTENANCE_TASK, PILOT_MAINTENANCE_CHECKLIST,
 *         PILOT_MAINTENANCE_ATTACHMENT
 */

import db from '../models/index.js';
import { uploadToCloudinary } from '../middleware/upload.js';

const {
  PilotMaintenanceTask,
  PilotMaintenanceChecklist,
  PilotMaintenanceAttachment,
  Drone1,
  User,
  UserProfile,
  SalesOrder,
  Op,
  sequelize,
} = db;

// ─── Health score weight map ──────────────────────────────────────────────────
const STATUS_SCORE = {
  'Good': 100,
  'Updated': 100,
  'Wear & Tear': 70,
  'Damaged': 30,
  'Needs Replacement': 0,
};

/**
 * Calculate health score from an array of checklist items.
 * health_score = ROUND(AVG(component scores))
 * @param {Array} checklistItems - array of { actual_status } objects
 * @returns {number} 0–100
 */
const calculateHealthScore = (checklistItems) => {
  if (!checklistItems || checklistItems.length === 0) return 0;
  const total = checklistItems.reduce((sum, item) => {
    const score = STATUS_SCORE[item.actual_status] ?? 0;
    return sum + score;
  }, 0);
  return Math.round(total / checklistItems.length);
};

/**
 * Generate a unique task reference.
 * Format: MNT-TASK-{timestamp}
 */
const generateTaskRef = () => `MNT-TASK-${Date.now()}`;

/**
 * Default checklist components matching the UI design.
 * Used when no checklist is provided (pre-populate the form).
 */
const DEFAULT_CHECKLIST = [
  { component: 'Airframe & Structure', component_description: 'Check frame, arms, landing gear', expected_status: 'Good' },
  { component: 'Propulsion System', component_description: 'Motors, ESCs, wires', expected_status: 'Good' },
  { component: 'Propellers', component_description: 'Check for wear, cracks, balance', expected_status: 'Good' },
  { component: 'Spray System', component_description: 'Tanks, nozzles, pump, pipes', expected_status: 'Good' },
  { component: 'Battery Health', component_description: 'Voltage, cycles, performance', expected_status: 'Good' },
  { component: 'Electronics & Sensors', component_description: 'GPS, IMU, Radar, FPV', expected_status: 'Good' },
  { component: 'Firmware & Calibration', component_description: 'Check firmware & calibrate', expected_status: 'Updated' },
  { component: 'General Condition', component_description: 'Overall cleanliness & appearance', expected_status: 'Good' },
];

// ─── HELPER: build full task with associations ────────────────────────────────

const getFullTask = async (taskId) => {
  return PilotMaintenanceTask.findOne({
    where: { id: taskId, is_active: true },
    include: [
      {
        model: PilotMaintenanceChecklist,
        as: 'checklist',
        where: { is_active: true },
        required: false,
      },
      {
        model: PilotMaintenanceAttachment,
        as: 'attachments',
        where: { is_active: true },
        required: false,
      },
      {
        model: User,
        as: 'pilotUser',
        attributes: ['id', 'email', 'username'],
      },
      {
        model: User,
        as: 'engineerUser',
        attributes: ['id', 'email', 'username'],
      },
    ],
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// 1. CREATE MAINTENANCE TASK (Submit directly)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/pilot/maintenance
 *
 * Body (JSON or multipart):
 *   - drone_id (required)
 *   - maintenance_type, task_name, scheduled_date, actual_date
 *   - engineer_id
 *   - overall_status
 *   - engineer_notes
 *   - checklist[] (array of { component, component_description, expected_status, actual_status, remarks })
 *   - total_flight_time, total_flights
 *
 * Files: attachments (multipart field "attachments", max 10 MB each)
 */
export const createMaintenanceTask = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const pilotId = req.user?.id;
    if (!pilotId) {
      await transaction.rollback();
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const { drone_id, checklist } = req.body;

    if (!drone_id) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'drone_id is required.' });
    }

    // Validate drone exists
    const drone = await Drone1.findByPk(drone_id);
    if (!drone) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Drone not found.' });
    }

    // Validate engineer exists (if provided)
    if (req.body.engineer_id) {
      const engineer = await User.findByPk(req.body.engineer_id);
      if (!engineer) {
        await transaction.rollback();
        return res.status(404).json({ success: false, message: 'Engineer user not found.' });
      }
    }

    // Parse checklist
    let checklistItems = [];
    if (typeof checklist === 'string') {
      try { checklistItems = JSON.parse(checklist); } catch { checklistItems = []; }
    } else if (Array.isArray(checklist)) {
      checklistItems = checklist;
    }

    // Use defaults if no checklist provided
    if (checklistItems.length === 0) {
      checklistItems = DEFAULT_CHECKLIST.map((item) => ({ ...item, actual_status: 'Good', remarks: '' }));
    }

    // Calculate health score from checklist
    const healthScore = calculateHealthScore(checklistItems);

    // Fetch last maintenance date
    const lastTask = await PilotMaintenanceTask.findOne({
      where: { drone_id: parseInt(drone_id), is_active: true, form_status: 'submitted' },
      order: [['actual_date', 'DESC']],
    });
    const lastMaintenanceDate = lastTask ? lastTask.actual_date : null;

    // Create the task
    const task = await PilotMaintenanceTask.create(
      {
        task_ref: generateTaskRef(),
        drone_id: parseInt(drone_id),
        drone_code: drone.name || `DRN-${drone.id}`,
        drone_name: drone.model || null,
        drone_model: drone.model || null,
        drone_status: req.body.drone_status || 'Active',
        total_flight_time: req.body.total_flight_time || null,
        total_flights: req.body.total_flights ? parseInt(req.body.total_flights) : null,
        last_maintenance_date: lastMaintenanceDate,
        health_score: healthScore,
        pilot_id: pilotId,
        maintenance_type: req.body.maintenance_type || 'Scheduled Maintenance',
        task_name: req.body.task_name || 'Routine Inspection',
        scheduled_date: req.body.scheduled_date || null,
        actual_date: req.body.actual_date || new Date().toISOString().slice(0, 10),
        engineer_id: req.body.engineer_id ? parseInt(req.body.engineer_id) : null,
        overall_status: req.body.overall_status || null,
        engineer_notes: req.body.engineer_notes || null,
        form_status: 'submitted',
        is_active: true,
        created_on: new Date(),
        created_by: pilotId,
      },
      { transaction }
    );

    // Bulk create checklist items
    const checklistRows = checklistItems.map((item) => ({
      task_id: task.id,
      component: item.component,
      component_description: item.component_description || null,
      expected_status: item.expected_status || 'Good',
      actual_status: item.actual_status || 'Good',
      remarks: item.remarks || null,
      is_active: true,
      created_on: new Date(),
      created_by: pilotId,
    }));
    await PilotMaintenanceChecklist.bulkCreate(checklistRows, { transaction });

    // Upload attachments to Cloudinary (if files present)
    if (req.files && req.files.length > 0) {
      const attachmentRows = [];
      for (const file of req.files) {
        const result = await uploadToCloudinary(file.buffer, 'pilot-maintenance');
        attachmentRows.push({
          task_id: task.id,
          file_url: result.secure_url,
          file_name: file.originalname,
          file_size: file.size,
          is_active: true,
          created_on: new Date(),
          created_by: pilotId,
        });
      }
      await PilotMaintenanceAttachment.bulkCreate(attachmentRows, { transaction });
    }

    // ── Create SalesOrder if Complaint Raised ──
    if (String(req.body.raise_complaint).toLowerCase() === 'true') {
      const salesOrderNo = `SO-${Date.now()}`;
      await SalesOrder.create(
        {
          sales_order_no: salesOrderNo,
          customer_id: pilotId,
          maintenance_task_id: task.id,
          order_date: new Date().toISOString().slice(0, 10),
          status: 'Pending',
          total_amount: req.body.total_amount ? parseFloat(req.body.total_amount) : 0,
          is_active: true,
          created_by: pilotId,
          created_on: new Date(),
        },
        { transaction }
      );
    }

    await transaction.commit();

    // Fetch full task with associations
    const fullTask = await getFullTask(task.id);

    return res.status(201).json({
      success: true,
      data: fullTask,
      message: 'Maintenance task submitted successfully.',
    });
  } catch (err) {
    await transaction.rollback();
    console.error('createMaintenanceTask error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2. SAVE DRAFT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/pilot/maintenance/draft
 *
 * Same payload as createMaintenanceTask but sets form_status = 'draft'.
 */
export const saveDraft = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const pilotId = req.user?.id;
    if (!pilotId) {
      await transaction.rollback();
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const { drone_id, checklist } = req.body;

    if (!drone_id) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'drone_id is required.' });
    }

    // Validate drone exists
    const drone = await Drone1.findByPk(drone_id);
    if (!drone) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Drone not found.' });
    }

    // Validate engineer exists (if provided)
    if (req.body.engineer_id) {
      const engineer = await User.findByPk(req.body.engineer_id);
      if (!engineer) {
        await transaction.rollback();
        return res.status(404).json({ success: false, message: 'Engineer user not found.' });
      }
    }

    // Parse checklist
    let checklistItems = [];
    if (typeof checklist === 'string') {
      try { checklistItems = JSON.parse(checklist); } catch { checklistItems = []; }
    } else if (Array.isArray(checklist)) {
      checklistItems = checklist;
    }

    // Calculate health score (may be partial for drafts)
    const healthScore = calculateHealthScore(
      checklistItems.length > 0 ? checklistItems : DEFAULT_CHECKLIST
    );

    // Fetch last maintenance date
    const lastTask = await PilotMaintenanceTask.findOne({
      where: { drone_id: parseInt(drone_id), is_active: true, form_status: 'submitted' },
      order: [['actual_date', 'DESC']],
    });
    const lastMaintenanceDate = lastTask ? lastTask.actual_date : null;

    // Create the task as draft
    const task = await PilotMaintenanceTask.create(
      {
        task_ref: generateTaskRef(),
        drone_id: parseInt(drone_id),
        drone_code: drone.name || `DRN-${drone.id}`,
        drone_name: drone.model || null,
        drone_model: drone.model || null,
        drone_status: req.body.drone_status || 'Active',
        total_flight_time: req.body.total_flight_time || null,
        total_flights: req.body.total_flights ? parseInt(req.body.total_flights) : null,
        last_maintenance_date: lastMaintenanceDate,
        health_score: healthScore,
        pilot_id: pilotId,
        maintenance_type: req.body.maintenance_type || 'Scheduled Maintenance',
        task_name: req.body.task_name || 'Routine Inspection',
        scheduled_date: req.body.scheduled_date || null,
        actual_date: req.body.actual_date || new Date().toISOString().slice(0, 10),
        engineer_id: req.body.engineer_id ? parseInt(req.body.engineer_id) : null,
        overall_status: req.body.overall_status || null,
        engineer_notes: req.body.engineer_notes || null,
        form_status: 'draft',
        is_active: true,
        created_on: new Date(),
        created_by: pilotId,
      },
      { transaction }
    );

    // Bulk create checklist items (even partial for draft)
    if (checklistItems.length > 0) {
      const checklistRows = checklistItems.map((item) => ({
        task_id: task.id,
        component: item.component,
        component_description: item.component_description || null,
        expected_status: item.expected_status || 'Good',
        actual_status: item.actual_status || 'Good',
        remarks: item.remarks || null,
        is_active: true,
        created_on: new Date(),
        created_by: pilotId,
      }));
      await PilotMaintenanceChecklist.bulkCreate(checklistRows, { transaction });
    }

    // Upload attachments to Cloudinary (if files present)
    if (req.files && req.files.length > 0) {
      const attachmentRows = [];
      for (const file of req.files) {
        const result = await uploadToCloudinary(file.buffer, 'pilot-maintenance');
        attachmentRows.push({
          task_id: task.id,
          file_url: result.secure_url,
          file_name: file.originalname,
          file_size: file.size,
          is_active: true,
          created_on: new Date(),
          created_by: pilotId,
        });
      }
      await PilotMaintenanceAttachment.bulkCreate(attachmentRows, { transaction });
    }

    await transaction.commit();

    const fullTask = await getFullTask(task.id);

    return res.status(201).json({
      success: true,
      data: fullTask,
      message: 'Draft saved successfully.',
    });
  } catch (err) {
    await transaction.rollback();
    console.error('saveDraft error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3. SUBMIT REPORT (draft → submitted)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * PATCH /api/pilot/maintenance/:id/submit
 *
 * Transitions a draft to submitted status.
 * Recalculates health score from current checklist.
 */
export const submitReport = async (req, res) => {
  try {
    const pilotId = req.user?.id;
    const { id } = req.params;

    const task = await PilotMaintenanceTask.findOne({
      where: { id, pilot_id: pilotId, is_active: true },
      include: [{ model: PilotMaintenanceChecklist, as: 'checklist', where: { is_active: true }, required: false }],
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Maintenance task not found.' });
    }

    if (task.form_status === 'submitted') {
      return res.status(400).json({ success: false, message: 'Task is already submitted.' });
    }

    // Validate required fields before submission
    if (!task.overall_status) {
      return res.status(400).json({
        success: false,
        message: 'Overall maintenance status is required before submission.',
      });
    }

    // Recalculate health score
    const healthScore = calculateHealthScore(task.checklist || []);

    await task.update({
      form_status: 'submitted',
      health_score: healthScore,
      actual_date: task.actual_date || new Date().toISOString().slice(0, 10),
      modified_on: new Date(),
      modified_by: pilotId,
    });

    const fullTask = await getFullTask(task.id);

    return res.status(200).json({
      success: true,
      data: fullTask,
      message: 'Maintenance report submitted successfully.',
    });
  } catch (err) {
    console.error('submitReport error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 4. GET ALL TASKS (for logged-in pilot)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/pilot/maintenance
 *
 * Query params: search, form_status, overall_status, maintenance_type, page, limit
 * Returns only tasks belonging to the logged-in pilot.
 */
export const getAllTasks = async (req, res) => {
  try {
    const pilotId = req.user?.id;
    const {
      search = '',
      form_status = '',
      overall_status = '',
      maintenance_type = '',
      page = 1,
      limit = 20,
    } = req.query;

    const where = { pilot_id: pilotId, is_active: true };
    const andConditions = [];

    if (search) {
      andConditions.push({
        [Op.or]: [
          { task_ref: { [Op.like]: `%${search}%` } },
          { drone_code: { [Op.like]: `%${search}%` } },
          { drone_name: { [Op.like]: `%${search}%` } },
          { drone_model: { [Op.like]: `%${search}%` } },
        ],
      });
    }

    if (form_status) andConditions.push({ form_status });
    if (overall_status) andConditions.push({ overall_status });
    if (maintenance_type) andConditions.push({ maintenance_type });

    if (andConditions.length) where[Op.and] = andConditions;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await PilotMaintenanceTask.findAndCountAll({
      where,
      include: [
        {
          model: PilotMaintenanceChecklist,
          as: 'checklist',
          where: { is_active: true },
          required: false,
        },
        {
          model: PilotMaintenanceAttachment,
          as: 'attachments',
          where: { is_active: true },
          required: false,
        },
        {
          model: User,
          as: 'pilotUser',
          attributes: ['id', 'email', 'username'],
        },
        {
          model: User,
          as: 'engineerUser',
          attributes: ['id', 'email', 'username'],
        },
      ],
      order: [['created_on', 'DESC']],
      limit: parseInt(limit),
      offset,
      distinct: true,
    });

    return res.status(200).json({
      success: true,
      data: rows,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / parseInt(limit)),
    });
  } catch (err) {
    console.error('getAllTasks error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5. GET TASK BY ID
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/pilot/maintenance/:id
 *
 * Full task detail with checklist + attachments + pilot info + engineer info.
 */
export const getTaskById = async (req, res) => {
  try {
    const pilotId = req.user?.id;
    const { id } = req.params;

    const task = await PilotMaintenanceTask.findOne({
      where: { id, pilot_id: pilotId, is_active: true },
      include: [
        {
          model: PilotMaintenanceChecklist,
          as: 'checklist',
          where: { is_active: true },
          required: false,
        },
        {
          model: PilotMaintenanceAttachment,
          as: 'attachments',
          where: { is_active: true },
          required: false,
        },
        {
          model: User,
          as: 'pilotUser',
          attributes: ['id', 'email', 'username'],
        },
        {
          model: User,
          as: 'engineerUser',
          attributes: ['id', 'email', 'username'],
        },
      ],
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Maintenance task not found.' });
    }

    return res.status(200).json({ success: true, data: task });
  } catch (err) {
    console.error('getTaskById error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 6. UPDATE TASK (only drafts can be edited)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * PUT /api/pilot/maintenance/:id
 *
 * Body: same as create. Replaces checklist items entirely.
 * Only tasks with form_status='draft' can be updated.
 */
export const updateTask = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const pilotId = req.user?.id;
    const { id } = req.params;

    const task = await PilotMaintenanceTask.findOne({
      where: { id, pilot_id: pilotId, is_active: true },
    });

    if (!task) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Maintenance task not found.' });
    }

    if (task.form_status === 'submitted') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Submitted tasks cannot be edited. Only drafts can be updated.',
      });
    }

    // Validate engineer exists (if provided)
    if (req.body.engineer_id) {
      const engineer = await User.findByPk(req.body.engineer_id);
      if (!engineer) {
        await transaction.rollback();
        return res.status(404).json({ success: false, message: 'Engineer user not found.' });
      }
    }

    // Parse checklist
    const { checklist } = req.body;
    let checklistItems = [];
    if (typeof checklist === 'string') {
      try { checklistItems = JSON.parse(checklist); } catch { checklistItems = []; }
    } else if (Array.isArray(checklist)) {
      checklistItems = checklist;
    }

    // Calculate new health score if checklist provided
    let healthScore = task.health_score;
    if (checklistItems.length > 0) {
      healthScore = calculateHealthScore(checklistItems);
    }

    // Allowed update fields
    const allowedFields = [
      'drone_status', 'total_flight_time', 'total_flights',
      'maintenance_type', 'task_name', 'scheduled_date', 'actual_date',
      'engineer_id', 'overall_status', 'engineer_notes'
    ];

    const updates = {
      health_score: healthScore,
      modified_on: new Date(),
      modified_by: pilotId,
    };

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    // Parse integer fields
    if (updates.total_flights) updates.total_flights = parseInt(updates.total_flights);
    if (updates.engineer_id) updates.engineer_id = parseInt(updates.engineer_id);

    await task.update(updates, { transaction });

    // Replace checklist items if provided
    if (checklistItems.length > 0) {
      // Soft-delete existing checklist
      await PilotMaintenanceChecklist.update(
        { is_active: false, modified_on: new Date(), modified_by: pilotId },
        { where: { task_id: task.id, is_active: true }, transaction }
      );

      // Create new checklist items
      const checklistRows = checklistItems.map((item) => ({
        task_id: task.id,
        component: item.component,
        component_description: item.component_description || null,
        expected_status: item.expected_status || 'Good',
        actual_status: item.actual_status || 'Good',
        remarks: item.remarks || null,
        is_active: true,
        created_on: new Date(),
        created_by: pilotId,
      }));
      await PilotMaintenanceChecklist.bulkCreate(checklistRows, { transaction });
    }

    // Upload new attachments if provided
    if (req.files && req.files.length > 0) {
      const attachmentRows = [];
      for (const file of req.files) {
        const result = await uploadToCloudinary(file.buffer, 'pilot-maintenance');
        attachmentRows.push({
          task_id: task.id,
          file_url: result.secure_url,
          file_name: file.originalname,
          file_size: file.size,
          is_active: true,
          created_on: new Date(),
          created_by: pilotId,
        });
      }
      await PilotMaintenanceAttachment.bulkCreate(attachmentRows, { transaction });
    }

    // ── Create SalesOrder if Complaint Raised ──
    if (String(req.body.raise_complaint).toLowerCase() === 'true') {
      const existingOrder = await SalesOrder.findOne({
        where: { maintenance_task_id: task.id },
        transaction
      });
      if (!existingOrder) {
        const salesOrderNo = `SO-${Date.now()}`;
        await SalesOrder.create(
          {
            sales_order_no: salesOrderNo,
            customer_id: pilotId,
            maintenance_task_id: task.id,
            order_date: new Date().toISOString().slice(0, 10),
            status: 'Pending',
            total_amount: req.body.total_amount ? parseFloat(req.body.total_amount) : 0,
            is_active: true,
            created_by: pilotId,
            created_on: new Date(),
          },
          { transaction }
        );
      }
    }

    await transaction.commit();

    const fullTask = await getFullTask(task.id);

    return res.status(200).json({
      success: true,
      data: fullTask,
      message: 'Maintenance task updated successfully.',
    });
  } catch (err) {
    await transaction.rollback();
    console.error('updateTask error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 7. DELETE TASK (soft delete)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * DELETE /api/pilot/maintenance/:id
 */
export const deleteTask = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const pilotId = req.user?.id;
    const { id } = req.params;

    const task = await PilotMaintenanceTask.findOne({
      where: { id, pilot_id: pilotId, is_active: true },
    });

    if (!task) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Maintenance task not found.' });
    }

    const now = new Date();

    // Soft-delete task + checklist + attachments
    await task.update({ is_active: false, modified_on: now, modified_by: pilotId }, { transaction });
    await PilotMaintenanceChecklist.update(
      { is_active: false, modified_on: now, modified_by: pilotId },
      { where: { task_id: task.id, is_active: true }, transaction }
    );
    await PilotMaintenanceAttachment.update(
      { is_active: false, modified_on: now, modified_by: pilotId },
      { where: { task_id: task.id, is_active: true }, transaction }
    );

    await transaction.commit();

    return res.status(200).json({ success: true, message: 'Maintenance task deleted successfully.' });
  } catch (err) {
    await transaction.rollback();
    console.error('deleteTask error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 8. GET TASK STATS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/pilot/maintenance/stats
 *
 * Returns aggregated stats for the logged-in pilot.
 */
export const getTaskStats = async (req, res) => {
  try {
    const pilotId = req.user?.id;
    const baseWhere = { pilot_id: pilotId, is_active: true };

    const [totalTasks, drafts, submitted, good, minorIssues, majorIssues, critical] =
      await Promise.all([
        PilotMaintenanceTask.count({ where: baseWhere }),
        PilotMaintenanceTask.count({ where: { ...baseWhere, form_status: 'draft' } }),
        PilotMaintenanceTask.count({ where: { ...baseWhere, form_status: 'submitted' } }),
        PilotMaintenanceTask.count({ where: { ...baseWhere, overall_status: 'Good' } }),
        PilotMaintenanceTask.count({ where: { ...baseWhere, overall_status: 'Minor Issues' } }),
        PilotMaintenanceTask.count({ where: { ...baseWhere, overall_status: 'Major Issues' } }),
        PilotMaintenanceTask.count({ where: { ...baseWhere, overall_status: 'Critical' } }),
      ]);

    // Average health score across all submitted tasks
    const avgHealthScore = await PilotMaintenanceTask.findOne({
      where: { ...baseWhere, form_status: 'submitted' },
      attributes: [[sequelize.fn('AVG', sequelize.col('health_score')), 'avg_score']],
      raw: true,
    });

    return res.status(200).json({
      success: true,
      data: {
        totalTasks,
        drafts,
        submitted,
        byStatus: { good, minorIssues, majorIssues, critical },
        averageHealthScore: avgHealthScore?.avg_score
          ? Math.round(parseFloat(avgHealthScore.avg_score))
          : 0,
      },
    });
  } catch (err) {
    console.error('getTaskStats error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 9. ADD ATTACHMENTS to existing task
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/pilot/maintenance/:id/attachments
 *
 * Multipart upload — field name "attachments".
 */
export const addAttachments = async (req, res) => {
  try {
    const pilotId = req.user?.id;
    const { id } = req.params;

    const task = await PilotMaintenanceTask.findOne({
      where: { id, pilot_id: pilotId, is_active: true },
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Maintenance task not found.' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files provided.' });
    }

    const attachmentRows = [];
    for (const file of req.files) {
      const result = await uploadToCloudinary(file.buffer, 'pilot-maintenance');
      attachmentRows.push({
        task_id: task.id,
        file_url: result.secure_url,
        file_name: file.originalname,
        file_size: file.size,
        is_active: true,
        created_on: new Date(),
        created_by: pilotId,
      });
    }

    const created = await PilotMaintenanceAttachment.bulkCreate(attachmentRows);

    return res.status(201).json({
      success: true,
      data: created,
      message: `${created.length} attachment(s) uploaded successfully.`,
    });
  } catch (err) {
    console.error('addAttachments error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 10. DELETE ATTACHMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * DELETE /api/pilot/maintenance/:id/attachments/:attachmentId
 */
export const deleteAttachment = async (req, res) => {
  try {
    const pilotId = req.user?.id;
    const { id, attachmentId } = req.params;

    // Verify task belongs to pilot
    const task = await PilotMaintenanceTask.findOne({
      where: { id, pilot_id: pilotId, is_active: true },
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Maintenance task not found.' });
    }

    const attachment = await PilotMaintenanceAttachment.findOne({
      where: { id: attachmentId, task_id: task.id, is_active: true },
    });

    if (!attachment) {
      return res.status(404).json({ success: false, message: 'Attachment not found.' });
    }

    await attachment.update({
      is_active: false,
      modified_on: new Date(),
      modified_by: pilotId,
    });

    return res.status(200).json({ success: true, message: 'Attachment deleted successfully.' });
  } catch (err) {
    console.error('deleteAttachment error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};
