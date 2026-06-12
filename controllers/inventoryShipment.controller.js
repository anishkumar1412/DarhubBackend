/**
 * controllers/inventoryShipment.controller.js
 *
 * Full CRUD for InventoryShipment (In-Transit tracking)
 * Table: INVENTORY_SHIPMENT
 */

import db from '../models/index.js';

const { InventoryShipment, Op } = db;

// ─── CREATE ───────────────────────────────────────────────────────────────────

/**
 * POST /api/inventory/shipments
 * Body: {
 *   shipment_code, shipment_type, item_name, origin, destination,
 *   dispatch_date, estimated_arrival, status, tracking_awb,
 *   courier_partner, total_units, order_value
 * }
 */
export const createShipment = async (req, res) => {
  try {
    const {
      shipment_code, shipment_type, item_name, origin, destination,
      dispatch_date, estimated_arrival, status, tracking_awb,
      courier_partner, total_units, order_value,
    } = req.body;

    if (!shipment_code || !item_name) {
      return res.status(400).json({ success: false, message: 'shipment_code and item_name are required.' });
    }

    const existing = await InventoryShipment.findOne({ where: { shipment_code, is_active: true } });
    if (existing) {
      return res.status(409).json({ success: false, message: `Shipment code '${shipment_code}' already exists.` });
    }

    const shipment = await InventoryShipment.create({
      shipment_code,
      shipment_type: shipment_type || null,
      item_name,
      origin: origin || null,
      destination: destination || null,
      dispatch_date: dispatch_date || null,
      estimated_arrival: estimated_arrival || null,
      status: status || 'In Transit (On-Time)',
      tracking_awb: tracking_awb || null,
      courier_partner: courier_partner || null,
      total_units: total_units ? parseInt(total_units) : null,
      order_value: order_value ? parseFloat(order_value) : null,
      is_active: true,
      created_on: new Date(),
      created_by: req.user?.id || null,
    });

    return res.status(201).json({ success: true, data: shipment, message: 'Shipment created successfully.' });
  } catch (err) {
    console.error('createShipment error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── READ ALL ─────────────────────────────────────────────────────────────────

/**
 * GET /api/inventory/shipments
 * Query: search, hub, status, page, limit
 */
export const getAllShipments = async (req, res) => {
  try {
    const { search = '', hub = '', status = '', page = 1, limit = 20 } = req.query;

    const where = { is_active: true };
    const andConditions = [];

    if (search) {
      andConditions.push({
        [Op.or]: [
          { shipment_code: { [Op.like]: `%${search}%` } },
          { item_name: { [Op.like]: `%${search}%` } },
          { tracking_awb: { [Op.like]: `%${search}%` } },
        ],
      });
    }
    if (hub) {
      andConditions.push({
        [Op.or]: [
          { origin: { [Op.like]: `%${hub}%` } },
          { destination: { [Op.like]: `%${hub}%` } },
        ],
      });
    }
    if (status) andConditions.push({ status: { [Op.like]: `%${status}%` } });
    if (andConditions.length) where[Op.and] = andConditions;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await InventoryShipment.findAndCountAll({
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
    console.error('getAllShipments error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── READ ONE (Tracking Detail) ───────────────────────────────────────────────

/**
 * GET /api/inventory/shipments/:id
 * Returns full shipment detail used by the Tracking modal
 */
export const getShipmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const shipment = await InventoryShipment.findOne({ where: { id, is_active: true } });
    if (!shipment) return res.status(404).json({ success: false, message: 'Shipment not found.' });

    // Build step progress for frontend tracker (Order Placed / Shipped / In Transit / Delivered)
    const stepMap = {
      'Order Placed': 0,
      'Dispatched': 1,
      'In Transit (On-Time)': 2,
      'In Transit (Processing)': 2,
      'Delayed (1 Day)': 2,
      'In Transit': 2,
      'Delivered': 3,
    };
    const activeStep = stepMap[shipment.status] ?? 2;

    return res.status(200).json({
      success: true,
      data: { ...shipment.toJSON(), activeStep },
    });
  } catch (err) {
    console.error('getShipmentById error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────

/**
 * PUT /api/inventory/shipments/:id
 */
export const updateShipment = async (req, res) => {
  try {
    const { id } = req.params;
    const shipment = await InventoryShipment.findOne({ where: { id, is_active: true } });
    if (!shipment) return res.status(404).json({ success: false, message: 'Shipment not found.' });

    const {
      shipment_code, shipment_type, item_name, origin, destination,
      dispatch_date, estimated_arrival, status, tracking_awb,
      courier_partner, total_units, order_value,
    } = req.body;

    if (shipment_code && shipment_code !== shipment.shipment_code) {
      const dup = await InventoryShipment.findOne({ where: { shipment_code, is_active: true } });
      if (dup) return res.status(409).json({ success: false, message: `Shipment code '${shipment_code}' already exists.` });
    }

    await shipment.update({
      shipment_code: shipment_code ?? shipment.shipment_code,
      shipment_type: shipment_type !== undefined ? shipment_type : shipment.shipment_type,
      item_name: item_name ?? shipment.item_name,
      origin: origin !== undefined ? origin : shipment.origin,
      destination: destination !== undefined ? destination : shipment.destination,
      dispatch_date: dispatch_date !== undefined ? dispatch_date : shipment.dispatch_date,
      estimated_arrival: estimated_arrival !== undefined ? estimated_arrival : shipment.estimated_arrival,
      status: status !== undefined ? status : shipment.status,
      tracking_awb: tracking_awb !== undefined ? tracking_awb : shipment.tracking_awb,
      courier_partner: courier_partner !== undefined ? courier_partner : shipment.courier_partner,
      total_units: total_units !== undefined ? parseInt(total_units) : shipment.total_units,
      order_value: order_value !== undefined ? parseFloat(order_value) : shipment.order_value,
      modified_on: new Date(),
      modified_by: req.user?.id || null,
    });

    return res.status(200).json({ success: true, data: shipment, message: 'Shipment updated successfully.' });
  } catch (err) {
    console.error('updateShipment error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── UPDATE STATUS ONLY (Track endpoint) ─────────────────────────────────────

/**
 * PATCH /api/inventory/shipments/:id/status
 * Body: { status }
 * Used by courier webhook or manual tracking update
 */
export const updateShipmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) return res.status(400).json({ success: false, message: 'status is required.' });

    const shipment = await InventoryShipment.findOne({ where: { id, is_active: true } });
    if (!shipment) return res.status(404).json({ success: false, message: 'Shipment not found.' });

    await shipment.update({ status, modified_on: new Date(), modified_by: req.user?.id || null });
    return res.status(200).json({ success: true, data: shipment, message: `Shipment status updated to '${status}'.` });
  } catch (err) {
    console.error('updateShipmentStatus error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── DELETE (soft) ────────────────────────────────────────────────────────────

/**
 * DELETE /api/inventory/shipments/:id
 */
export const deleteShipment = async (req, res) => {
  try {
    const { id } = req.params;
    const shipment = await InventoryShipment.findOne({ where: { id, is_active: true } });
    if (!shipment) return res.status(404).json({ success: false, message: 'Shipment not found.' });

    await shipment.update({ is_active: false, modified_on: new Date(), modified_by: req.user?.id || null });
    return res.status(200).json({ success: true, message: 'Shipment deleted successfully.' });
  } catch (err) {
    console.error('deleteShipment error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── STATS ────────────────────────────────────────────────────────────────────

/**
 * GET /api/inventory/shipments/stats
 */
export const getShipmentStats = async (req, res) => {
  try {
    const inTransit = await InventoryShipment.count({
      where: { is_active: true, status: { [Op.like]: '%Transit%' } },
    });
    const delayed = await InventoryShipment.count({
      where: { is_active: true, status: { [Op.like]: '%Delayed%' } },
    });
    const delivered = await InventoryShipment.count({
      where: { is_active: true, status: { [Op.like]: '%Delivered%' } },
    });
    const totalUnits = await InventoryShipment.sum('total_units', { where: { is_active: true } });

    return res.status(200).json({
      success: true,
      data: { inTransit, delayed, delivered, totalUnits: totalUnits || 0 },
    });
  } catch (err) {
    console.error('getShipmentStats error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};