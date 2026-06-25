/**
 * controllers/maintenanceLog.controller.js
 *
 * Full CRUD for MaintenanceLog
 * Powers:
 *   - Maintenance & Asset Val. tab (image 7)
 *   - Log Diagnostic Report modal (image 8)
 *   - Generate Purchase Order modal from maintenance (image 9)
 * Table: MAINTENANCE_LOG
 */

import db from '../models/index.js';

const { MaintenanceLog, Op } = db;

// ─── CREATE ───────────────────────────────────────────────────────────────────

/**
 * POST /api/inventory/maintenance-logs
 * Body: Full maintenance log payload (see MaintenanceLog model fields)
 */
export const createMaintenanceLog = async (req, res) => {
  try {
    const {
      date, log_ref, drone_code, drone_type, component, component_sku,
      reason, action_taken, cost, cost_value, status,
      flight_hours, pilot, location, incident_date, pilot_statement,
      telemetry_batt, telemetry_rpm, telemetry_fc,
      damaged_sku, damaged_name, replacement_sku, replacement_name, replacement_serial,
      original_cost, replacement_cost, labor_hours, total_impact,
      approved_by, digital_id,
      part_name, part_sku, current_stock, min_stock, unit_price,
    } = req.body;

    if (!log_ref) {
      return res.status(400).json({ success: false, message: 'log_ref is required.' });
    }

    // Check duplicate log ref
    const existing = await MaintenanceLog.findOne({ where: { log_ref, is_active: true } });
    if (existing) {
      return res.status(409).json({ success: false, message: `Log reference '${log_ref}' already exists.` });
    }

    const log = await MaintenanceLog.create({
      date: date || new Date().toISOString().slice(0, 10),
      log_ref,
      drone_code: drone_code || null,
      drone_type: drone_type || null,
      component: component || null,
      component_sku: component_sku || null,
      reason: reason || null,
      action_taken: action_taken || null,
      cost: cost || null,
      cost_value: cost_value ? parseFloat(cost_value) : 0,
      status: status || 'In Progress',
      flight_hours: flight_hours || null,
      pilot: pilot || null,
      location: location || null,
      incident_date: incident_date || null,
      pilot_statement: pilot_statement || null,
      telemetry_batt: telemetry_batt || null,
      telemetry_rpm: telemetry_rpm || null,
      telemetry_fc: telemetry_fc || null,
      damaged_sku: damaged_sku || null,
      damaged_name: damaged_name || null,
      replacement_sku: replacement_sku || null,
      replacement_name: replacement_name || null,
      replacement_serial: replacement_serial || null,
      original_cost: original_cost ? parseFloat(original_cost) : 0,
      replacement_cost: replacement_cost ? parseFloat(replacement_cost) : 0,
      labor_hours: labor_hours ? parseFloat(labor_hours) : 0,
      total_impact: total_impact || null,
      approved_by: approved_by || null,
      digital_id: digital_id || null,
      part_name: part_name || null,
      part_sku: part_sku || null,
      current_stock: current_stock ? parseInt(current_stock) : null,
      min_stock: min_stock ? parseInt(min_stock) : null,
      unit_price: unit_price ? parseFloat(unit_price) : null,
      is_active: true,
      created_on: new Date(),
      created_by: req.user?.id || null,
    });

    return res.status(201).json({ success: true, data: log, message: 'Maintenance log created successfully.' });
  } catch (err) {
    console.error('createMaintenanceLog error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── READ ALL ─────────────────────────────────────────────────────────────────

/**
 * GET /api/inventory/maintenance-logs
 * Query: search, status, hub (location), page, limit
 */
export const getAllMaintenanceLogs = async (req, res) => {
  try {
    const { search = '', status = '', hub = '', page = 1, limit = 20 } = req.query;

    const where = { is_active: true };
    const andConditions = [];

    if (search) {
      andConditions.push({
        [Op.or]: [
          { log_ref: { [Op.like]: `%${search}%` } },
          { drone_code: { [Op.like]: `%${search}%` } },
          { component: { [Op.like]: `%${search}%` } },
          { reason: { [Op.like]: `%${search}%` } },
        ],
      });
    }
    if (status) andConditions.push({ status: { [Op.like]: `%${status}%` } });
    if (hub) andConditions.push({ location: { [Op.like]: `%${hub}%` } });
    if (andConditions.length) where[Op.and] = andConditions;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await MaintenanceLog.findAndCountAll({
      where,
      order: [['date', 'DESC'], ['created_on', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    return res.status(200).json({
      success: true,
      data: rows,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / parseInt(limit)),
    });
  } catch (err) {
    console.error('getAllMaintenanceLogs error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── READ ONE (Log Diagnostic Report) ────────────────────────────────────────

/**
 * GET /api/inventory/maintenance-logs/:id
 * Returns full diagnostic detail for the modal (image 8)
 */
export const getMaintenanceLogById = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await MaintenanceLog.findOne({ where: { id, is_active: true } });
    if (!log) return res.status(404).json({ success: false, message: 'Maintenance log not found.' });
    return res.status(200).json({ success: true, data: log });
  } catch (err) {
    console.error('getMaintenanceLogById error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── UPDATE (full update - used by "Update" modal, image 9) ──────────────────

/**
 * PUT /api/inventory/maintenance-logs/:id
 * Body: any updatable fields
 */
export const updateMaintenanceLog = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await MaintenanceLog.findOne({ where: { id, is_active: true } });
    if (!log) return res.status(404).json({ success: false, message: 'Maintenance log not found.' });

    const allowedFields = [
      'date', 'drone_code', 'drone_type', 'component', 'component_sku',
      'reason', 'action_taken', 'cost', 'cost_value', 'status',
      'flight_hours', 'pilot', 'location', 'incident_date', 'pilot_statement',
      'telemetry_batt', 'telemetry_rpm', 'telemetry_fc',
      'damaged_sku', 'damaged_name', 'replacement_sku', 'replacement_name', 'replacement_serial',
      'original_cost', 'replacement_cost', 'labor_hours', 'total_impact',
      'approved_by', 'digital_id',
      'part_name', 'part_sku', 'current_stock', 'min_stock', 'unit_price',
    ];

    const updates = { modified_on: new Date(), modified_by: req.user?.id || null };
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    await log.update(updates);

    return res.status(200).json({ success: true, data: log, message: 'Maintenance log updated successfully.' });
  } catch (err) {
    console.error('updateMaintenanceLog error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── UPDATE STATUS ONLY (In Progress / Pending Stock toggle) ─────────────────

/**
 * PATCH /api/inventory/maintenance-logs/:id/status
 * Body: { status }
 * Used by the status toggle buttons in the PO modal (image 9)
 */
export const updateMaintenanceStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) return res.status(400).json({ success: false, message: 'status is required.' });

    const validStatuses = ['Resolved', 'In Progress', 'Pending Stock'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed: ${validStatuses.join(', ')}`,
      });
    }

    const log = await MaintenanceLog.findOne({ where: { id, is_active: true } });
    if (!log) return res.status(404).json({ success: false, message: 'Maintenance log not found.' });

    await log.update({ status, modified_on: new Date(), modified_by: req.user?.id || null });
    return res.status(200).json({ success: true, data: log, message: `Status updated to '${status}'.` });
  } catch (err) {
    console.error('updateMaintenanceStatus error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── DELETE (soft) ────────────────────────────────────────────────────────────

/**
 * DELETE /api/inventory/maintenance-logs/:id
 */
export const deleteMaintenanceLog = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await MaintenanceLog.findOne({ where: { id, is_active: true } });
    if (!log) return res.status(404).json({ success: false, message: 'Maintenance log not found.' });

    await log.update({ is_active: false, modified_on: new Date(), modified_by: req.user?.id || null });
    return res.status(200).json({ success: true, message: 'Maintenance log deleted successfully.' });
  } catch (err) {
    console.error('deleteMaintenanceLog error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── STATS (for metric cards - image 7) ──────────────────────────────────────

/**
 * GET /api/inventory/maintenance-logs/stats
 */
export const getMaintenanceStats = async (req, res) => {
  try {
    const totalCost = await MaintenanceLog.sum('cost_value', { where: { is_active: true } });
    const openClaims = await MaintenanceLog.count({
      where: { is_active: true, status: { [Op.in]: ['In Progress', 'Pending Stock'] } },
    });
    const resolved = await MaintenanceLog.count({
      where: { is_active: true, status: 'Resolved' },
    });
    const pendingStock = await MaintenanceLog.count({
      where: { is_active: true, status: 'Pending Stock' },
    });

    return res.status(200).json({
      success: true,
      data: { totalCost: totalCost || 0, openClaims, resolved, pendingStock },
    });
  } catch (err) {
    console.error('getMaintenanceStats error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// PILOT MAINTENANCE TASKS — Admin view
// Shows all maintenance tasks submitted by pilots in the admin panel.
// ═══════════════════════════════════════════════════════════════════════════════

const {
  PilotMaintenanceTask,
  PilotMaintenanceChecklist,
  PilotMaintenanceAttachment,
  User,
} = db;

// ─── GET ALL PILOT MAINTENANCE TASKS (Admin) ─────────────────────────────────

/**
 * GET /api/inventory/pilot-maintenance-tasks
 * Query: search, form_status, overall_status, maintenance_type, drone_id, pilot_id, page, limit
 *
 * Admin sees ALL pilots' submitted (and optionally draft) tasks.
 */
export const getAllPilotMaintenanceTasks = async (req, res) => {
  try {
    const {
      search = '',
      form_status = '',
      overall_status = '',
      maintenance_type = '',
      drone_id = '',
      pilot_id = '',
      page = 1,
      limit = 20,
    } = req.query;

    const where = { is_active: true };
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
    if (drone_id) andConditions.push({ drone_id: parseInt(drone_id) });
    if (pilot_id) andConditions.push({ pilot_id: parseInt(pilot_id) });

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
    console.error('getAllPilotMaintenanceTasks error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── GET PILOT MAINTENANCE TASK BY ID (Admin) ────────────────────────────────

/**
 * GET /api/inventory/pilot-maintenance-tasks/:id
 * Full task detail with checklist + attachments + pilot + engineer info.
 */
export const getPilotMaintenanceTaskById = async (req, res) => {
  try {
    const { id } = req.params;

    const task = await PilotMaintenanceTask.findOne({
      where: { id, is_active: true },
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
      return res.status(404).json({ success: false, message: 'Pilot maintenance task not found.' });
    }

    return res.status(200).json({ success: true, data: task });
  } catch (err) {
    console.error('getPilotMaintenanceTaskById error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── PILOT MAINTENANCE STATS (Admin) ─────────────────────────────────────────

/**
 * GET /api/inventory/pilot-maintenance-tasks/stats
 * Aggregated stats across ALL pilots for the admin dashboard.
 */
export const getPilotMaintenanceStats = async (req, res) => {
  try {
    const baseWhere = { is_active: true };

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

    const avgHealthScore = await PilotMaintenanceTask.findOne({
      where: { ...baseWhere, form_status: 'submitted' },
      attributes: [
        [db.sequelize.fn('AVG', db.sequelize.col('health_score')), 'avg_score'],
      ],
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
    console.error('getPilotMaintenanceStats error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};