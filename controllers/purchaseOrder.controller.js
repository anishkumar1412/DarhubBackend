/**
 * controllers/purchaseOrder.controller.js
 *
 * Full CRUD for PurchaseOrder
 * Handles PO generation from Low Stock and Maintenance screens.
 * Table: PURCHASE_ORDER
 */

import db from '../models/index.js';

const { PurchaseOrder, MaintenanceLog, InventoryAccessory, Vendor, Op } = db;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Auto-generate PO number: PO-YYYYMMDD-XXXX */
const generatePONumber = async () => {
  const today = new Date();
  const datePart = today.toISOString().slice(0, 10).replace(/-/g, '');
  const count = await PurchaseOrder.count();
  const seq = String(count + 1).padStart(4, '0');
  return `PO-${datePart}-${seq}`;
};

// ─── CREATE ───────────────────────────────────────────────────────────────────

/**
 * POST /api/inventory/purchase-orders
 * Body: {
 *   maintenance_log_id?, part_name, part_sku?, vendor, order_quantity,
 *   unit_price, logistics_cost, target_hub, shelf_bin, special_notes, status
 * }
 */
export const createPurchaseOrder = async (req, res) => {
  try {
    const {
      maintenance_log_id,
      part_name,
      part_sku,
      vendor,
      order_quantity,
      unit_price,
      logistics_cost = 50,
      target_hub,
      shelf_bin,
      special_notes,
      status = 'Submitted',
    } = req.body;

    if (!part_name || !order_quantity) {
      return res.status(400).json({ success: false, message: 'part_name and order_quantity are required.' });
    }

    const po_number = await generatePONumber();
    const subtotal = (parseFloat(unit_price) || 0) * parseInt(order_quantity);
    const total_cost = subtotal + parseFloat(logistics_cost);

    const po = await PurchaseOrder.create({
      po_number,
      maintenance_log_id: maintenance_log_id || null,
      part_name,
      part_sku: part_sku || null,
      vendor: vendor || null,
      order_quantity: parseInt(order_quantity),
      unit_price: parseFloat(unit_price) || 0,
      logistics_cost: parseFloat(logistics_cost),
      total_cost,
      target_hub: target_hub || null,
      shelf_bin: shelf_bin || null,
      special_notes: special_notes || null,
      status,
      is_active: true,
      created_on: new Date(),
      created_by: req.user?.id || null,
    });

    // If linked to a maintenance log, update its status to 'In Progress'
    if (maintenance_log_id) {
      await MaintenanceLog.update(
        { status: 'In Progress', modified_on: new Date(), modified_by: req.user?.id || null },
        { where: { id: maintenance_log_id } }
      );
    }

    return res.status(201).json({ success: true, data: po, message: 'Purchase Order generated successfully.' });
  } catch (err) {
    console.error('createPurchaseOrder error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── READ ALL ─────────────────────────────────────────────────────────────────

/**
 * GET /api/inventory/purchase-orders
 * Query: search, status, page, limit
 */
export const getAllPurchaseOrders = async (req, res) => {
  try {
    const { search = '', status = '', page = 1, limit = 20 } = req.query;

    const where = { is_active: true };
    const andConditions = [];

    if (search) {
      andConditions.push({
        [Op.or]: [
          { po_number: { [Op.like]: `%${search}%` } },
          { part_name: { [Op.like]: `%${search}%` } },
          { part_sku: { [Op.like]: `%${search}%` } },
          { vendor: { [Op.like]: `%${search}%` } },
        ],
      });
    }
    if (status) andConditions.push({ status: { [Op.like]: `%${status}%` } });
    if (andConditions.length) where[Op.and] = andConditions;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await PurchaseOrder.findAndCountAll({
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
    console.error('getAllPurchaseOrders error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── READ ONE ─────────────────────────────────────────────────────────────────

/**
 * GET /api/inventory/purchase-orders/:id
 */
export const getPurchaseOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const po = await PurchaseOrder.findOne({ where: { id, is_active: true } });
    if (!po) return res.status(404).json({ success: false, message: 'Purchase Order not found.' });
    return res.status(200).json({ success: true, data: po });
  } catch (err) {
    console.error('getPurchaseOrderById error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────

/**
 * PUT /api/inventory/purchase-orders/:id
 */
export const updatePurchaseOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const po = await PurchaseOrder.findOne({ where: { id, is_active: true } });
    if (!po) return res.status(404).json({ success: false, message: 'Purchase Order not found.' });

    const {
      part_name, part_sku, vendor, order_quantity,
      unit_price, logistics_cost, target_hub, shelf_bin, special_notes, status,
    } = req.body;

    const newQty = order_quantity !== undefined ? parseInt(order_quantity) : po.order_quantity;
    const newUP = unit_price !== undefined ? parseFloat(unit_price) : po.unit_price;
    const newLC = logistics_cost !== undefined ? parseFloat(logistics_cost) : po.logistics_cost;
    const newTotal = newQty * newUP + newLC;

    await po.update({
      part_name: part_name ?? po.part_name,
      part_sku: part_sku !== undefined ? part_sku : po.part_sku,
      vendor: vendor !== undefined ? vendor : po.vendor,
      order_quantity: newQty,
      unit_price: newUP,
      logistics_cost: newLC,
      total_cost: newTotal,
      target_hub: target_hub !== undefined ? target_hub : po.target_hub,
      shelf_bin: shelf_bin !== undefined ? shelf_bin : po.shelf_bin,
      special_notes: special_notes !== undefined ? special_notes : po.special_notes,
      status: status !== undefined ? status : po.status,
      modified_on: new Date(),
      modified_by: req.user?.id || null,
    });

    return res.status(200).json({ success: true, data: po, message: 'Purchase Order updated successfully.' });
  } catch (err) {
    console.error('updatePurchaseOrder error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── UPDATE STATUS ONLY ───────────────────────────────────────────────────────

/**
 * PATCH /api/inventory/purchase-orders/:id/status
 * Body: { status }
 */
export const updatePOStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) return res.status(400).json({ success: false, message: 'status is required.' });

    const po = await PurchaseOrder.findOne({ where: { id, is_active: true } });
    if (!po) return res.status(404).json({ success: false, message: 'Purchase Order not found.' });

    await po.update({ status, modified_on: new Date(), modified_by: req.user?.id || null });

    // If status delivered, attempt to increment accessory stock
    if (status === 'Delivered' && po.part_sku) {
      const accessory = await InventoryAccessory.findOne({
        where: { sku: po.part_sku, is_active: true },
      });
      if (accessory) {
        const newQty = (accessory.quantity || 0) + po.order_quantity;
        const newStatus = newQty < accessory.min_stock ? 'Restock Needed' : 'In Stock';
        await accessory.update({
          quantity: newQty,
          status: newStatus,
          modified_on: new Date(),
          modified_by: req.user?.id || null,
        });
      }
    }

    return res.status(200).json({ success: true, data: po, message: `PO status updated to '${status}'.` });
  } catch (err) {
    console.error('updatePOStatus error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── DELETE (soft) ────────────────────────────────────────────────────────────

/**
 * DELETE /api/inventory/purchase-orders/:id
 */
export const deletePurchaseOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const po = await PurchaseOrder.findOne({ where: { id, is_active: true } });
    if (!po) return res.status(404).json({ success: false, message: 'Purchase Order not found.' });

    await po.update({ is_active: false, modified_on: new Date(), modified_by: req.user?.id || null });
    return res.status(200).json({ success: true, message: 'Purchase Order deleted successfully.' });
  } catch (err) {
    console.error('deletePurchaseOrder error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};