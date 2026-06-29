/**
 * controllers/inventoryDrone.controller.js
 *
 * Full CRUD for InventoryDrone
 * Table: INVENTORY_DRONE
 */

import db from '../models/index.js';

const { InventoryDrone, Op } = db;

// ─── CREATE ───────────────────────────────────────────────────────────────────

/**
 * POST /api/inventory/drones
 * Body: { drone_code, drone_type, pilot, location, current_mission, status, attached_parts }
 */
export const createDrone = async (req, res) => {
  try {
    const { drone_code, drone_type, pilot, location, current_mission, status, attached_parts } = req.body;

    if (!drone_code) {
      return res.status(400).json({ success: false, message: 'drone_code is required.' });
    }

    const existing = await InventoryDrone.findOne({ where: { drone_code, is_active: true } });
    if (existing) {
      return res.status(409).json({ success: false, message: `Drone code '${drone_code}' already exists.` });
    }

    const drone = await InventoryDrone.create({
      drone_code,
      drone_type: drone_type || null,
      pilot: pilot || 'Unassigned',
      location: location || null,
      current_mission: current_mission || null,
      status: status || 'Idle (On Site)',
      attached_parts: attached_parts || null,
      is_active: true,
      created_on: new Date(),
      created_by: req.user?.id || null,
    });

    return res.status(201).json({ success: true, data: drone, message: 'Drone created successfully.' });
  } catch (err) {
    console.error('createDrone error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── READ ALL ─────────────────────────────────────────────────────────────────

/**
 * GET /api/inventory/drones
 * Query: search, hub, pilot, status, page, limit
 */
export const getAllDrones = async (req, res) => {
  try {
    const { search = '', hub = '', pilot = '', status = '', page = 1, limit = 20 } = req.query;

    const where = { is_active: true };
    const andConditions = [];

    if (search) {
      andConditions.push({
        [Op.or]: [
          { drone_code: { [Op.like]: `%${search}%` } },
          { drone_type: { [Op.like]: `%${search}%` } },
          { current_mission: { [Op.like]: `%${search}%` } },
        ],
      });
    }
    if (hub) andConditions.push({ location: { [Op.like]: `%${hub}%` } });
    if (pilot) andConditions.push({ pilot: { [Op.like]: `%${pilot}%` } });
    if (status) andConditions.push({ status: { [Op.like]: `%${status}%` } });

    if (andConditions.length) where[Op.and] = andConditions;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await InventoryDrone.findAndCountAll({
      where,
      order: [['created_on', 'DESC']],
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
    console.error('getAllDrones error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── READ ONE ─────────────────────────────────────────────────────────────────

/**
 * GET /api/inventory/drones/:id
 */
export const getDroneById = async (req, res) => {
  try {
    const { id } = req.params;
    const drone = await InventoryDrone.findOne({ where: { id, is_active: true } });
    if (!drone) return res.status(404).json({ success: false, message: 'Drone not found.' });
    return res.status(200).json({ success: true, data: drone });
  } catch (err) {
    console.error('getDroneById error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────

/**
 * PUT /api/inventory/drones/:id
 */
export const updateDrone = async (req, res) => {
  try {
    const { id } = req.params;
    const drone = await InventoryDrone.findOne({ where: { id, is_active: true } });
    if (!drone) return res.status(404).json({ success: false, message: 'Drone not found.' });

    const { drone_code, drone_type, pilot, location, current_mission, status, attached_parts } = req.body;

    // If drone_code is changing, check for duplicate
    if (drone_code && drone_code !== drone.drone_code) {
      const dup = await InventoryDrone.findOne({ where: { drone_code, is_active: true } });
      if (dup) return res.status(409).json({ success: false, message: `Drone code '${drone_code}' already exists.` });
    }

    await drone.update({
      drone_code: drone_code ?? drone.drone_code,
      drone_type: drone_type !== undefined ? drone_type : drone.drone_type,
      pilot: pilot !== undefined ? pilot : drone.pilot,
      location: location !== undefined ? location : drone.location,
      current_mission: current_mission !== undefined ? current_mission : drone.current_mission,
      status: status !== undefined ? status : drone.status,
      attached_parts: attached_parts !== undefined ? attached_parts : drone.attached_parts,
      modified_on: new Date(),
      modified_by: req.user?.id || null,
    });

    return res.status(200).json({ success: true, data: drone, message: 'Drone updated successfully.' });
  } catch (err) {
    console.error('updateDrone error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── DELETE (soft) ────────────────────────────────────────────────────────────

/**
 * DELETE /api/inventory/drones/:id
 */
export const deleteDrone = async (req, res) => {
  try {
    const { id } = req.params;
    const drone = await InventoryDrone.findOne({ where: { id, is_active: true } });
    if (!drone) return res.status(404).json({ success: false, message: 'Drone not found.' });

    await drone.update({ is_active: false, modified_on: new Date(), modified_by: req.user?.id || null });
    return res.status(200).json({ success: true, message: 'Drone deleted successfully.' });
  } catch (err) {
    console.error('deleteDrone error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── STATS (for metric cards) ─────────────────────────────────────────────────

/**
 * GET /api/inventory/drones/stats
 */
export const getDroneStats = async (req, res) => {
  try {
    const totalDrones = await InventoryDrone.count({ where: { is_active: true } });
    const activeDrones = await InventoryDrone.count({
      where: { is_active: true, status: { [Op.like]: '%Active%' } },
    });
    const inMaintenance = await InventoryDrone.count({
      where: { is_active: true, status: { [Op.like]: '%Maintenance%' } },
    });
    const idle = await InventoryDrone.count({
      where: { is_active: true, status: { [Op.like]: '%Idle%' } },
    });

    return res.status(200).json({
      success: true,
      data: { totalDrones, activeDrones, inMaintenance, idle },
    });
  } catch (err) {
    console.error('getDroneStats error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};