/**
 * controllers/inventoryAccessory.controller.js
 *
 * CRUD for InventoryAccessory + Low-Stock helpers
 * Table: INVENTORY_ACCESSORY
 */

import db from '../models/index.js';

const { InventoryAccessory, Op } = db;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Derive status string from qty vs min_stock */
const deriveStatus = (qty, minStock, currentStatus) => {
  if (currentStatus && (currentStatus.includes('In Use') || currentStatus.startsWith('In Use')))
    return currentStatus; // preserve "In Use (N) / In Stock (M)" strings
  if (qty === 0) return 'Out of Stock';
  if (minStock && qty < minStock) return 'Restock Needed';
  return 'In Stock';
};

// ─── CREATE ───────────────────────────────────────────────────────────────────

/**
 * POST /api/inventory/accessories
 * Body: { sku, name, description, location, assigned_pilot, quantity, min_stock, status, unit_price }
 */
export const createAccessory = async (req, res) => {
  try {
    const {
      sku, name, description, location, assigned_pilot,
      quantity, min_stock, status, unit_price,
    } = req.body;

    if (!sku || !name) {
      return res.status(400).json({ success: false, message: 'sku and name are required.' });
    }

    // Check duplicate SKU
    const existing = await InventoryAccessory.findOne({ where: { sku, is_active: true } });
    if (existing) {
      return res.status(409).json({ success: false, message: `SKU '${sku}' already exists.` });
    }

    const derivedStatus = status || deriveStatus(quantity ?? 0, min_stock ?? 0, null);

    const accessory = await InventoryAccessory.create({
      sku,
      name,
      description: description || null,
      location: location || null,
      assigned_pilot: assigned_pilot || 'Unassigned',
      quantity: quantity ?? 0,
      min_stock: min_stock ?? 0,
      status: derivedStatus,
      unit_price: unit_price ?? 0,
      is_active: true,
      created_on: new Date(),
      created_by: req.user?.id || null,
    });

    return res.status(201).json({ success: true, data: accessory, message: 'Accessory created successfully.' });
  } catch (err) {
    console.error('createAccessory error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── READ ALL (with search + filter + pagination) ─────────────────────────────

/**
 * GET /api/inventory/accessories
 * Query: search, hub, pilot, status, page, limit
 */
export const getAllAccessories = async (req, res) => {
  try {
    const {
      search = '',
      hub = '',
      pilot = '',
      status = '',
      page = 1,
      limit = 20,
    } = req.query;

    const where = { is_active: true };
    const andConditions = [];

    if (search) {
      andConditions.push({
        [Op.or]: [
          { sku: { [Op.like]: `%${search}%` } },
          { name: { [Op.like]: `%${search}%` } },
          { description: { [Op.like]: `%${search}%` } },
        ],
      });
    }
    if (hub) andConditions.push({ location: { [Op.like]: `%${hub}%` } });
    if (pilot) andConditions.push({ assigned_pilot: { [Op.like]: `%${pilot}%` } });
    if (status) andConditions.push({ status: { [Op.like]: `%${status}%` } });

    if (andConditions.length) where[Op.and] = andConditions;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await InventoryAccessory.findAndCountAll({
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
    console.error('getAllAccessories error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── READ ONE ─────────────────────────────────────────────────────────────────

/**
 * GET /api/inventory/accessories/:id
 */
export const getAccessoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const accessory = await InventoryAccessory.findOne({ where: { id, is_active: true } });
    if (!accessory) return res.status(404).json({ success: false, message: 'Accessory not found.' });
    return res.status(200).json({ success: true, data: accessory });
  } catch (err) {
    console.error('getAccessoryById error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────

/**
 * PUT /api/inventory/accessories/:id
 * Body: any updatable fields
 */
export const updateAccessory = async (req, res) => {
  try {
    const { id } = req.params;
    const accessory = await InventoryAccessory.findOne({ where: { id, is_active: true } });
    if (!accessory) return res.status(404).json({ success: false, message: 'Accessory not found.' });

    const {
      sku, name, description, location, assigned_pilot,
      quantity, min_stock, status, unit_price,
    } = req.body;

    // If SKU changing, check for duplicate
    if (sku && sku !== accessory.sku) {
      const dup = await InventoryAccessory.findOne({ where: { sku, is_active: true } });
      if (dup) return res.status(409).json({ success: false, message: `SKU '${sku}' already exists.` });
    }

    const newQty = quantity !== undefined ? quantity : accessory.quantity;
    const newMin = min_stock !== undefined ? min_stock : accessory.min_stock;
    const newStatus = status || deriveStatus(newQty, newMin, accessory.status);

    await accessory.update({
      sku: sku ?? accessory.sku,
      name: name ?? accessory.name,
      description: description !== undefined ? description : accessory.description,
      location: location !== undefined ? location : accessory.location,
      assigned_pilot: assigned_pilot !== undefined ? assigned_pilot : accessory.assigned_pilot,
      quantity: newQty,
      min_stock: newMin,
      status: newStatus,
      unit_price: unit_price !== undefined ? unit_price : accessory.unit_price,
      modified_on: new Date(),
      modified_by: req.user?.id || null,
    });

    return res.status(200).json({ success: true, data: accessory, message: 'Accessory updated successfully.' });
  } catch (err) {
    console.error('updateAccessory error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── DELETE (soft) ────────────────────────────────────────────────────────────

/**
 * DELETE /api/inventory/accessories/:id
 */
export const deleteAccessory = async (req, res) => {
  try {
    const { id } = req.params;
    const accessory = await InventoryAccessory.findOne({ where: { id, is_active: true } });
    if (!accessory) return res.status(404).json({ success: false, message: 'Accessory not found.' });

    await accessory.update({ is_active: false, modified_on: new Date(), modified_by: req.user?.id || null });
    return res.status(200).json({ success: true, message: 'Accessory deleted successfully.' });
  } catch (err) {
    console.error('deleteAccessory error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── TRANSFER (update location + pilot) ──────────────────────────────────────

/**
 * PATCH /api/inventory/accessories/:id/transfer
 * Body: { location, assigned_pilot }
 */
export const transferAccessory = async (req, res) => {
  try {
    const { id } = req.params;
    const { location, assigned_pilot } = req.body;

    const accessory = await InventoryAccessory.findOne({ where: { id, is_active: true } });
    if (!accessory) return res.status(404).json({ success: false, message: 'Accessory not found.' });

    await accessory.update({
      location: location ?? accessory.location,
      assigned_pilot: assigned_pilot ?? accessory.assigned_pilot,
      modified_on: new Date(),
      modified_by: req.user?.id || null,
    });

    return res.status(200).json({ success: true, data: accessory, message: 'Accessory transferred successfully.' });
  } catch (err) {
    console.error('transferAccessory error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── LOW STOCK ALERTS ─────────────────────────────────────────────────────────

/**
 * GET /api/inventory/accessories/low-stock
 * Returns accessories where quantity < min_stock
 * Query: page, limit, search, hub, status
 */
export const getLowStockAccessories = async (req, res) => {
  try {
    const { search = '', hub = '', status = '', page = 1, limit = 20 } = req.query;

    const where = {
      is_active: true,
      [Op.and]: [
        db.sequelize.literal('quantity < min_stock'),
      ],
    };

    const andConditions = [];
    if (search) {
      andConditions.push({
        [Op.or]: [
          { sku: { [Op.like]: `%${search}%` } },
          { name: { [Op.like]: `%${search}%` } },
        ],
      });
    }
    if (hub) andConditions.push({ location: { [Op.like]: `%${hub}%` } });
    if (status) andConditions.push({ status: { [Op.like]: `%${status}%` } });
    if (andConditions.length) where[Op.and].push(...andConditions);

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await InventoryAccessory.findAndCountAll({
      where,
      order: [['quantity', 'ASC']],
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
    console.error('getLowStockAccessories error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── SUMMARY STATS (for top metric cards) ────────────────────────────────────

/**
 * GET /api/inventory/accessories/stats
 */
export const getAccessoryStats = async (req, res) => {
  try {
    const totalItems = await InventoryAccessory.sum('quantity', { where: { is_active: true } });
    const uniqueSku = await InventoryAccessory.count({ where: { is_active: true } });
    const lowStockCount = await InventoryAccessory.count({
      where: {
        is_active: true,
        [Op.and]: db.sequelize.literal('quantity < min_stock'),
      },
    });
    const totalValue = await InventoryAccessory.findOne({
      attributes: [
        [db.sequelize.literal('SUM(quantity * unit_price)'), 'total_value'],
      ],
      where: { is_active: true },
      raw: true,
    });

    return res.status(200).json({
      success: true,
      data: {
        uniqueSku,
        totalItems: totalItems || 0,
        lowStockCount,
        totalValue: parseFloat(totalValue?.total_value || 0),
      },
    });
  } catch (err) {
    console.error('getAccessoryStats error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};