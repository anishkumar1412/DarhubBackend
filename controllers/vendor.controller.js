/**
 * controllers/vendor.controller.js
 *
 * Full CRUD for Vendor
 * Table: VENDOR
 */

import db from '../models/index.js';

const { Vendor, Op } = db;

// ─── CREATE ───────────────────────────────────────────────────────────────────

/**
 * POST /api/inventory/vendors
 * Body: { name, contact_person, email, phone, address, category, notes }
 */
export const createVendor = async (req, res) => {
  try {
    const { name, contact_person, email, phone, address, category, notes } = req.body;

    if (!name) return res.status(400).json({ success: false, message: 'name is required.' });

    // Prevent duplicate vendor name
    const existing = await Vendor.findOne({ where: { name, is_active: true } });
    if (existing) {
      return res.status(409).json({ success: false, message: `Vendor '${name}' already exists.` });
    }

    const vendor = await Vendor.create({
      name,
      contact_person: contact_person || null,
      email: email || null,
      phone: phone || null,
      address: address || null,
      category: category || null,
      notes: notes || null,
      is_active: true,
      created_on: new Date(),
      created_by: req.user?.id || null,
    });

    return res.status(201).json({ success: true, data: vendor, message: 'Vendor created successfully.' });
  } catch (err) {
    console.error('createVendor error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── READ ALL ─────────────────────────────────────────────────────────────────

/**
 * GET /api/inventory/vendors
 * Query: search, category, page, limit
 */
export const getAllVendors = async (req, res) => {
  try {
    const { search = '', category = '', page = 1, limit = 50 } = req.query;

    const where = { is_active: true };
    const andConditions = [];

    if (search) {
      andConditions.push({
        [Op.or]: [
          { name: { [Op.like]: `%${search}%` } },
          { contact_person: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } },
        ],
      });
    }
    if (category) andConditions.push({ category: { [Op.like]: `%${category}%` } });
    if (andConditions.length) where[Op.and] = andConditions;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await Vendor.findAndCountAll({
      where,
      order: [['name', 'ASC']],
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
    console.error('getAllVendors error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── READ ONE ─────────────────────────────────────────────────────────────────

/**
 * GET /api/inventory/vendors/:id
 */
export const getVendorById = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await Vendor.findOne({ where: { id, is_active: true } });
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found.' });
    return res.status(200).json({ success: true, data: vendor });
  } catch (err) {
    console.error('getVendorById error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────

/**
 * PUT /api/inventory/vendors/:id
 */
export const updateVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await Vendor.findOne({ where: { id, is_active: true } });
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found.' });

    const { name, contact_person, email, phone, address, category, notes } = req.body;

    if (name && name !== vendor.name) {
      const dup = await Vendor.findOne({ where: { name, is_active: true } });
      if (dup) return res.status(409).json({ success: false, message: `Vendor '${name}' already exists.` });
    }

    await vendor.update({
      name: name ?? vendor.name,
      contact_person: contact_person !== undefined ? contact_person : vendor.contact_person,
      email: email !== undefined ? email : vendor.email,
      phone: phone !== undefined ? phone : vendor.phone,
      address: address !== undefined ? address : vendor.address,
      category: category !== undefined ? category : vendor.category,
      notes: notes !== undefined ? notes : vendor.notes,
      modified_on: new Date(),
      modified_by: req.user?.id || null,
    });

    return res.status(200).json({ success: true, data: vendor, message: 'Vendor updated successfully.' });
  } catch (err) {
    console.error('updateVendor error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};

// ─── DELETE (soft) ────────────────────────────────────────────────────────────

/**
 * DELETE /api/inventory/vendors/:id
 */
export const deleteVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await Vendor.findOne({ where: { id, is_active: true } });
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found.' });

    await vendor.update({ is_active: false, modified_on: new Date(), modified_by: req.user?.id || null });
    return res.status(200).json({ success: true, message: 'Vendor deleted successfully.' });
  } catch (err) {
    console.error('deleteVendor error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};