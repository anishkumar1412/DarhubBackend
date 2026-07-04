import { Op } from "sequelize";
import db from "../models/index.js";

const {
  InventoryAccessory,
  InventoryDrone,
  InventoryShipment,
  MaintenanceLog,
  PurchaseOrder,
} = db;

// ─────────────────────────────────────────────────────────────────────────────
// ─── ACCESSORIES ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export const createAccessory = async (req, res) => {
  try {
    const { sku, name, description, location, assigned_pilot, quantity, min_stock, status, unit_price } = req.body;

    if (!sku || !sku.trim())
      return res.status(400).json({ success: false, message: "SKU is required" });
    if (!name || !name.trim())
      return res.status(400).json({ success: false, message: "Name is required" });

    const existing = await InventoryAccessory.findOne({ where: { sku: sku.trim(), is_active: true } });
    if (existing)
      return res.status(409).json({ success: false, message: `Accessory with SKU "${sku.trim()}" already exists` });

    const item = await InventoryAccessory.create({
      sku: sku.trim(),
      name: name.trim(),
      description: description?.trim() || null,
      location: location?.trim() || null,
      assigned_pilot: assigned_pilot?.trim() || "Unassigned",
      quantity: quantity ?? 0,
      min_stock: min_stock ?? 0,
      status: status?.trim() || "In Stock",
      unit_price: unit_price ?? 0,
      is_active: true,
      created_on: new Date(),
    });

    return res.status(201).json({ success: true, message: "Accessory created successfully", data: item });
  } catch (error) {
    console.error("Error in createAccessory:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateAccessory = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await InventoryAccessory.findOne({ where: { id, is_active: true } });
    if (!item) return res.status(404).json({ success: false, message: "Accessory not found" });

    const updates = {};
    const fields = ["sku", "name", "description", "location", "assigned_pilot", "quantity", "min_stock", "status", "unit_price"];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) updates[f] = typeof req.body[f] === "string" ? req.body[f].trim() : req.body[f];
    });
    updates.modified_on = new Date();

    await item.update(updates);
    return res.status(200).json({ success: true, message: "Accessory updated successfully", data: item });
  } catch (error) {
    console.error("Error in updateAccessory:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteAccessory = async (req, res) => {
  try {
    const item = await InventoryAccessory.findOne({ where: { id: req.params.id, is_active: true } });
    if (!item) return res.status(404).json({ success: false, message: "Accessory not found" });
    await item.update({ is_active: false, modified_on: new Date() });
    return res.status(200).json({ success: true, message: "Accessory deleted successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getAccessoryById = async (req, res) => {
  try {
    const item = await InventoryAccessory.findOne({ where: { id: req.params.id, is_active: true } });
    if (!item) return res.status(404).json({ success: false, message: "Accessory not found" });
    return res.status(200).json({ success: true, data: item });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const filterAccessories = async (req, res) => {
  try {
    const {
      search, status, location, pilot,
      sortBy = "created_on", sortDir = "DESC",
      page = 1, pageSize = 10,
    } = req.body ?? {};

    const where = { is_active: true };

    if (search?.trim()) {
      where[Op.or] = [
        { sku: { [Op.iLike]: `%${search.trim()}%` } },
        { name: { [Op.iLike]: `%${search.trim()}%` } },
        { description: { [Op.iLike]: `%${search.trim()}%` } },
      ];
    }
    if (status && status !== "All Statuses") where.status = { [Op.iLike]: `%${status}%` };
    if (location && location !== "All Locations") where.location = { [Op.iLike]: `%${location}%` };
    if (pilot && pilot !== "All Pilots") where.assigned_pilot = { [Op.iLike]: `%${pilot}%` };

    const allowedSort = ["sku", "name", "quantity", "min_stock", "status", "created_on"];
    const orderField = allowedSort.includes(sortBy) ? sortBy : "created_on";
    const orderDir = sortDir?.toUpperCase() === "ASC" ? "ASC" : "DESC";
    const offset = (Math.max(1, Number(page)) - 1) * Number(pageSize);

    const { count, rows } = await InventoryAccessory.findAndCountAll({
      where,
      order: [[orderField, orderDir]],
      limit: Number(pageSize),
      offset,
    });

    return res.status(200).json({
      success: true, total: count, page: Number(page),
      pageSize: Number(pageSize), totalPages: Math.ceil(count / Number(pageSize)),
      data: rows,
    });
  } catch (error) {
    console.error("Error in filterAccessories:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ─── INVENTORY DRONES ────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export const createInventoryDrone = async (req, res) => {
  try {
    const { drone_code, drone_type, pilot, location, current_mission, status, attached_parts } = req.body;

    if (!drone_code || !drone_code.trim())
      return res.status(400).json({ success: false, message: "Drone code is required" });

    const existing = await InventoryDrone.findOne({ where: { drone_code: drone_code.trim(), is_active: true } });
    if (existing)
      return res.status(409).json({ success: false, message: `Drone "${drone_code.trim()}" already exists` });

    const item = await InventoryDrone.create({
      drone_code: drone_code.trim(),
      drone_type: drone_type?.trim() || null,
      pilot: pilot?.trim() || "Unassigned",
      location: location?.trim() || null,
      current_mission: current_mission?.trim() || null,
      status: status?.trim() || "Idle (On Site)",
      attached_parts: attached_parts?.trim() || null,
      is_active: true,
      created_on: new Date(),
    });

    return res.status(201).json({ success: true, message: "Inventory drone created successfully", data: item });
  } catch (error) {
    console.error("Error in createInventoryDrone:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateInventoryDrone = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await InventoryDrone.findOne({ where: { id, is_active: true } });
    if (!item) return res.status(404).json({ success: false, message: "Inventory drone not found" });

    const updates = {};
    const fields = ["drone_code", "drone_type", "pilot", "location", "current_mission", "status", "attached_parts"];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) updates[f] = typeof req.body[f] === "string" ? req.body[f].trim() : req.body[f];
    });
    updates.modified_on = new Date();

    await item.update(updates);
    return res.status(200).json({ success: true, message: "Inventory drone updated successfully", data: item });
  } catch (error) {
    console.error("Error in updateInventoryDrone:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteInventoryDrone = async (req, res) => {
  try {
    const item = await InventoryDrone.findOne({ where: { id: req.params.id, is_active: true } });
    if (!item) return res.status(404).json({ success: false, message: "Inventory drone not found" });
    await item.update({ is_active: false, modified_on: new Date() });
    return res.status(200).json({ success: true, message: "Inventory drone deleted successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getInventoryDroneById = async (req, res) => {
  try {
    const item = await InventoryDrone.findOne({ where: { id: req.params.id, is_active: true } });
    if (!item) return res.status(404).json({ success: false, message: "Inventory drone not found" });
    return res.status(200).json({ success: true, data: item });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const filterInventoryDrones = async (req, res) => {
  try {
    const {
      search, status, pilot, location,
      sortBy = "created_on", sortDir = "DESC",
      page = 1, pageSize = 10,
    } = req.body ?? {};

    const where = { is_active: true };

    if (search?.trim()) {
      where[Op.or] = [
        { drone_code: { [Op.iLike]: `%${search.trim()}%` } },
        { drone_type: { [Op.iLike]: `%${search.trim()}%` } },
        { pilot: { [Op.iLike]: `%${search.trim()}%` } },
        { current_mission: { [Op.iLike]: `%${search.trim()}%` } },
      ];
    }
    if (status && status !== "All Statuses") where.status = { [Op.iLike]: `%${status}%` };
    if (pilot && pilot !== "All Pilots") where.pilot = { [Op.iLike]: `%${pilot}%` };
    if (location && location !== "All Locations") where.location = { [Op.iLike]: `%${location}%` };

    const allowedSort = ["drone_code", "drone_type", "pilot", "status", "created_on"];
    const orderField = allowedSort.includes(sortBy) ? sortBy : "created_on";
    const orderDir = sortDir?.toUpperCase() === "ASC" ? "ASC" : "DESC";
    const offset = (Math.max(1, Number(page)) - 1) * Number(pageSize);

    const { count, rows } = await InventoryDrone.findAndCountAll({
      where,
      order: [[orderField, orderDir]],
      limit: Number(pageSize),
      offset,
    });

    return res.status(200).json({
      success: true, total: count, page: Number(page),
      pageSize: Number(pageSize), totalPages: Math.ceil(count / Number(pageSize)),
      data: rows,
    });
  } catch (error) {
    console.error("Error in filterInventoryDrones:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ─── LOW STOCK (derived from accessories) ────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export const getLowStockItems = async (req, res) => {
  try {
    const {
      search,
      sortBy = "quantity", sortDir = "ASC",
      page = 1, pageSize = 20,
    } = req.query ?? {};

    const where = {
      is_active: true,
      min_stock: { [Op.gt]: 0 },
      quantity: { [Op.lt]: db.sequelize.col("min_stock") },
    };

    if (search?.trim()) {
      where[Op.or] = [
        { sku: { [Op.iLike]: `%${search.trim()}%` } },
        { name: { [Op.iLike]: `%${search.trim()}%` } },
      ];
    }

    const allowedSort = ["sku", "name", "quantity", "min_stock", "unit_price", "created_on"];
    const orderField = allowedSort.includes(sortBy) ? sortBy : "quantity";
    const orderDir = sortDir?.toUpperCase() === "ASC" ? "ASC" : "DESC";
    const offset = (Math.max(1, Number(page)) - 1) * Number(pageSize);

    const { count, rows } = await InventoryAccessory.findAndCountAll({
      where,
      order: [[orderField, orderDir]],
      limit: Number(pageSize),
      offset,
    });

    // Enrich with computed status
    const data = rows.map((r) => {
      const plain = r.toJSON();
      if (plain.quantity === 0) plain.computed_status = "Out of Stock";
      else if (plain.quantity <= plain.min_stock * 0.25) plain.computed_status = "Critical Low";
      else plain.computed_status = "Restock Needed";
      return plain;
    });

    return res.status(200).json({
      success: true, total: count, page: Number(page),
      pageSize: Number(pageSize), totalPages: Math.ceil(count / Number(pageSize)),
      data,
    });
  } catch (error) {
    console.error("Error in getLowStockItems:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ─── SHIPMENTS ───────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export const createShipment = async (req, res) => {
  try {
    const {
      shipment_code, shipment_type, item_name, origin, destination,
      dispatch_date, estimated_arrival, status, tracking_awb,
      courier_partner, total_units, order_value,
    } = req.body;

    if (!shipment_code || !shipment_code.trim())
      return res.status(400).json({ success: false, message: "Shipment code is required" });
    if (!item_name || !item_name.trim())
      return res.status(400).json({ success: false, message: "Item name is required" });

    const item = await InventoryShipment.create({
      shipment_code: shipment_code.trim(),
      shipment_type: shipment_type?.trim() || null,
      item_name: item_name.trim(),
      origin: origin?.trim() || null,
      destination: destination?.trim() || null,
      dispatch_date: dispatch_date?.trim() || null,
      estimated_arrival: estimated_arrival?.trim() || null,
      status: status?.trim() || "In Transit (On-Time)",
      tracking_awb: tracking_awb?.trim() || null,
      courier_partner: courier_partner?.trim() || null,
      total_units: total_units ?? null,
      order_value: order_value ?? null,
      is_active: true,
      created_on: new Date(),
    });

    return res.status(201).json({ success: true, message: "Shipment created successfully", data: item });
  } catch (error) {
    console.error("Error in createShipment:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateShipment = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await InventoryShipment.findOne({ where: { id, is_active: true } });
    if (!item) return res.status(404).json({ success: false, message: "Shipment not found" });

    const updates = {};
    const fields = [
      "shipment_code", "shipment_type", "item_name", "origin", "destination",
      "dispatch_date", "estimated_arrival", "status", "tracking_awb",
      "courier_partner", "total_units", "order_value",
    ];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) updates[f] = typeof req.body[f] === "string" ? req.body[f].trim() : req.body[f];
    });
    updates.modified_on = new Date();

    await item.update(updates);
    return res.status(200).json({ success: true, message: "Shipment updated successfully", data: item });
  } catch (error) {
    console.error("Error in updateShipment:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteShipment = async (req, res) => {
  try {
    const item = await InventoryShipment.findOne({ where: { id: req.params.id, is_active: true } });
    if (!item) return res.status(404).json({ success: false, message: "Shipment not found" });
    await item.update({ is_active: false, modified_on: new Date() });
    return res.status(200).json({ success: true, message: "Shipment deleted successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getShipmentById = async (req, res) => {
  try {
    const item = await InventoryShipment.findOne({ where: { id: req.params.id, is_active: true } });
    if (!item) return res.status(404).json({ success: false, message: "Shipment not found" });
    return res.status(200).json({ success: true, data: item });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const filterShipments = async (req, res) => {
  try {
    const {
      search, status, origin, destination,
      sortBy = "created_on", sortDir = "DESC",
      page = 1, pageSize = 10,
    } = req.body ?? {};

    const where = { is_active: true };

    if (search?.trim()) {
      where[Op.or] = [
        { shipment_code: { [Op.iLike]: `%${search.trim()}%` } },
        { item_name: { [Op.iLike]: `%${search.trim()}%` } },
        { tracking_awb: { [Op.iLike]: `%${search.trim()}%` } },
      ];
    }
    if (status && status !== "All Statuses") where.status = { [Op.iLike]: `%${status}%` };
    if (origin && origin !== "All Origins") where.origin = { [Op.iLike]: `%${origin}%` };
    if (destination && destination !== "All Destinations") where.destination = { [Op.iLike]: `%${destination}%` };

    const allowedSort = ["shipment_code", "item_name", "dispatch_date", "estimated_arrival", "status", "created_on"];
    const orderField = allowedSort.includes(sortBy) ? sortBy : "created_on";
    const orderDir = sortDir?.toUpperCase() === "ASC" ? "ASC" : "DESC";
    const offset = (Math.max(1, Number(page)) - 1) * Number(pageSize);

    const { count, rows } = await InventoryShipment.findAndCountAll({
      where,
      order: [[orderField, orderDir]],
      limit: Number(pageSize),
      offset,
    });

    return res.status(200).json({
      success: true, total: count, page: Number(page),
      pageSize: Number(pageSize), totalPages: Math.ceil(count / Number(pageSize)),
      data: rows,
    });
  } catch (error) {
    console.error("Error in filterShipments:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ─── MAINTENANCE LOGS ────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export const createMaintenanceLog = async (req, res) => {
  try {
    const body = req.body;

    if (!body.log_ref || !body.log_ref.trim())
      return res.status(400).json({ success: false, message: "Log reference is required" });

    const item = await MaintenanceLog.create({
      date: body.date || null,
      log_ref: body.log_ref.trim(),
      drone_code: body.drone_code || null,
      drone_type: body.drone_type || null,
      component: body.component || null,
      component_sku: body.component_sku || null,
      reason: body.reason || null,
      action_taken: body.action_taken || null,
      cost: body.cost || null,
      cost_value: body.cost_value ?? 0,
      status: body.status || "In Progress",
      flight_hours: body.flight_hours || null,
      pilot: body.pilot || null,
      location: body.location || null,
      incident_date: body.incident_date || null,
      pilot_statement: body.pilot_statement || null,
      telemetry_batt: body.telemetry_batt || null,
      telemetry_rpm: body.telemetry_rpm || null,
      telemetry_fc: body.telemetry_fc || null,
      damaged_sku: body.damaged_sku || null,
      damaged_name: body.damaged_name || null,
      replacement_sku: body.replacement_sku || null,
      replacement_name: body.replacement_name || null,
      replacement_serial: body.replacement_serial || null,
      original_cost: body.original_cost ?? 0,
      replacement_cost: body.replacement_cost ?? 0,
      labor_hours: body.labor_hours ?? 0,
      total_impact: body.total_impact || null,
      approved_by: body.approved_by || null,
      digital_id: body.digital_id || null,
      part_name: body.part_name || null,
      part_sku: body.part_sku || null,
      current_stock: body.current_stock ?? null,
      min_stock: body.min_stock ?? null,
      unit_price: body.unit_price ?? null,
      is_active: true,
      created_on: new Date(),
    });

    return res.status(201).json({ success: true, message: "Maintenance log created successfully", data: item });
  } catch (error) {
    console.error("Error in createMaintenanceLog:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateMaintenanceLog = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await MaintenanceLog.findOne({ where: { id, is_active: true } });
    if (!item) return res.status(404).json({ success: false, message: "Maintenance log not found" });

    const updates = { ...req.body, modified_on: new Date() };
    // Remove id from updates to avoid overwriting PK
    delete updates.id;

    await item.update(updates);
    return res.status(200).json({ success: true, message: "Maintenance log updated successfully", data: item });
  } catch (error) {
    console.error("Error in updateMaintenanceLog:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteMaintenanceLog = async (req, res) => {
  try {
    const item = await MaintenanceLog.findOne({ where: { id: req.params.id, is_active: true } });
    if (!item) return res.status(404).json({ success: false, message: "Maintenance log not found" });
    await item.update({ is_active: false, modified_on: new Date() });
    return res.status(200).json({ success: true, message: "Maintenance log deleted successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getMaintenanceLogById = async (req, res) => {
  try {
    const item = await MaintenanceLog.findOne({ 
      where: { id: req.params.id, is_active: true },
      include: [{
        model: db.PilotMaintenanceTask,
        as: 'pilot_task',
        include: [{
          model: db.PilotMaintenanceAttachment,
          as: 'attachments'
        }]
      }]
    });
    if (!item) return res.status(404).json({ success: false, message: "Maintenance log not found" });
    
    // Map attachments for frontend if pilot_task exists
    const data = item.toJSON();
    if (data.pilot_task && data.pilot_task.attachments) {
      data.attachments = data.pilot_task.attachments;
    }
    
    return res.status(200).json({ success: true, data: data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const filterMaintenanceLogs = async (req, res) => {
  try {
    const {
      search, status, drone_code, pilot, date_from, date_to,
      sortBy = "created_on", sortDir = "DESC",
      page = 1, pageSize = 10,
    } = req.body ?? {};

    const where = { is_active: true };

    if (search?.trim()) {
      where[Op.or] = [
        { log_ref: { [Op.iLike]: `%${search.trim()}%` } },
        { drone_code: { [Op.iLike]: `%${search.trim()}%` } },
        { component: { [Op.iLike]: `%${search.trim()}%` } },
        { reason: { [Op.iLike]: `%${search.trim()}%` } },
        { pilot: { [Op.iLike]: `%${search.trim()}%` } },
      ];
    }
    if (status && status !== "All Statuses") where.status = { [Op.iLike]: `%${status}%` };
    if (drone_code && drone_code !== "All Drones") where.drone_code = { [Op.iLike]: `%${drone_code}%` };
    if (pilot && pilot !== "All Pilots") where.pilot = { [Op.iLike]: `%${pilot}%` };

    const allowedSort = ["date", "log_ref", "drone_code", "component", "cost_value", "status", "created_on"];
    const orderField = allowedSort.includes(sortBy) ? sortBy : "created_on";
    const orderDir = sortDir?.toUpperCase() === "ASC" ? "ASC" : "DESC";
    const offset = (Math.max(1, Number(page)) - 1) * Number(pageSize);

    const { count, rows } = await MaintenanceLog.findAndCountAll({
      where,
      order: [[orderField, orderDir]],
      limit: Number(pageSize),
      offset,
      include: [{
        model: db.PilotMaintenanceTask,
        as: 'pilot_task',
        include: [{
          model: db.PilotMaintenanceAttachment,
          as: 'attachments'
        }]
      }]
    });
    
    // Map attachments for frontend
    const mappedRows = rows.map(row => {
      const data = row.toJSON();
      if (data.pilot_task && data.pilot_task.attachments) {
        data.attachments = data.pilot_task.attachments;
      }
      return data;
    });

    return res.status(200).json({
      success: true, total: count, page: Number(page),
      pageSize: Number(pageSize), totalPages: Math.ceil(count / Number(pageSize)),
      data: mappedRows,
    });
  } catch (error) {
    console.error("Error in filterMaintenanceLogs:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ─── PURCHASE ORDERS ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const generatePONumber = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PO-${timestamp}-${rand}`;
};

export const createPurchaseOrder = async (req, res) => {
  try {
    const {
      maintenance_log_id, part_name, part_sku, vendor,
      order_quantity, unit_price, logistics_cost, target_hub,
      shelf_bin, special_notes, status,
    } = req.body;

    if (!part_name || !part_name.trim())
      return res.status(400).json({ success: false, message: "Part name is required" });
    if (!order_quantity || order_quantity < 1)
      return res.status(400).json({ success: false, message: "Order quantity must be at least 1" });

    const subtotal = (order_quantity || 1) * (unit_price || 0);
    const totalCost = subtotal + (logistics_cost || 0);

    const item = await PurchaseOrder.create({
      po_number: generatePONumber(),
      maintenance_log_id: maintenance_log_id || null,
      part_name: part_name.trim(),
      part_sku: part_sku?.trim() || null,
      vendor: vendor?.trim() || null,
      order_quantity: order_quantity || 1,
      unit_price: unit_price || 0,
      logistics_cost: logistics_cost || 0,
      total_cost: totalCost,
      target_hub: target_hub?.trim() || null,
      shelf_bin: shelf_bin?.trim() || null,
      special_notes: special_notes?.trim() || null,
      status: status?.trim() || "Draft",
      is_active: true,
      created_on: new Date(),
    });

    return res.status(201).json({ success: true, message: "Purchase order created successfully", data: item });
  } catch (error) {
    console.error("Error in createPurchaseOrder:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updatePurchaseOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await PurchaseOrder.findOne({ where: { id, is_active: true } });
    if (!item) return res.status(404).json({ success: false, message: "Purchase order not found" });

    const updates = {};
    const fields = [
      "part_name", "part_sku", "vendor", "order_quantity", "unit_price",
      "logistics_cost", "target_hub", "shelf_bin", "special_notes", "status",
    ];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) updates[f] = typeof req.body[f] === "string" ? req.body[f].trim() : req.body[f];
    });

    // Recalculate total if qty or price changed
    const qty = updates.order_quantity ?? item.order_quantity;
    const price = updates.unit_price ?? item.unit_price;
    const logistics = updates.logistics_cost ?? item.logistics_cost;
    updates.total_cost = (qty * price) + logistics;
    updates.modified_on = new Date();

    await item.update(updates);
    return res.status(200).json({ success: true, message: "Purchase order updated successfully", data: item });
  } catch (error) {
    console.error("Error in updatePurchaseOrder:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getPurchaseOrderById = async (req, res) => {
  try {
    const item = await PurchaseOrder.findOne({ where: { id: req.params.id, is_active: true } });
    if (!item) return res.status(404).json({ success: false, message: "Purchase order not found" });
    return res.status(200).json({ success: true, data: item });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const filterPurchaseOrders = async (req, res) => {
  try {
    const {
      search, status,
      sortBy = "created_on", sortDir = "DESC",
      page = 1, pageSize = 10,
    } = req.body ?? {};

    const where = { is_active: true };

    if (search?.trim()) {
      where[Op.or] = [
        { po_number: { [Op.iLike]: `%${search.trim()}%` } },
        { part_name: { [Op.iLike]: `%${search.trim()}%` } },
        { vendor: { [Op.iLike]: `%${search.trim()}%` } },
      ];
    }
    if (status && status !== "All Statuses") where.status = { [Op.iLike]: `%${status}%` };

    const allowedSort = ["po_number", "part_name", "total_cost", "status", "created_on"];
    const orderField = allowedSort.includes(sortBy) ? sortBy : "created_on";
    const orderDir = sortDir?.toUpperCase() === "ASC" ? "ASC" : "DESC";
    const offset = (Math.max(1, Number(page)) - 1) * Number(pageSize);

    const { count, rows } = await PurchaseOrder.findAndCountAll({
      where,
      order: [[orderField, orderDir]],
      limit: Number(pageSize),
      offset,
    });

    return res.status(200).json({
      success: true, total: count, page: Number(page),
      pageSize: Number(pageSize), totalPages: Math.ceil(count / Number(pageSize)),
      data: rows,
    });
  } catch (error) {
    console.error("Error in filterPurchaseOrders:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ─── DASHBOARD STATS ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export const getDashboardStats = async (req, res) => {
  try {
    // Accessories stats
    const totalAccessories = await InventoryAccessory.count({ where: { is_active: true } });
    const totalQty = await InventoryAccessory.sum("quantity", { where: { is_active: true } }) || 0;
    const lowStockCount = await InventoryAccessory.count({
      where: {
        is_active: true,
        min_stock: { [Op.gt]: 0 },
        quantity: { [Op.lt]: db.sequelize.col("min_stock") },
      },
    });
    const outOfStockCount = await InventoryAccessory.count({
      where: { is_active: true, quantity: 0 },
    });

    // Drone stats
    const totalDrones = await InventoryDrone.count({ where: { is_active: true } });
    const activeDrones = await InventoryDrone.count({
      where: { is_active: true, status: { [Op.iLike]: "%Active%" } },
    });
    const maintenanceDrones = await InventoryDrone.count({
      where: { is_active: true, status: { [Op.iLike]: "%Maintenance%" } },
    });

    // Shipment stats
    const inTransitCount = await InventoryShipment.count({
      where: { is_active: true, status: { [Op.iLike]: "%Transit%" } },
    });
    const delayedCount = await InventoryShipment.count({
      where: { is_active: true, status: { [Op.iLike]: "%Delayed%" } },
    });

    // Maintenance stats
    const totalLogs = await MaintenanceLog.count({ where: { is_active: true } });
    const resolvedLogs = await MaintenanceLog.count({
      where: { is_active: true, status: "Resolved" },
    });
    const pendingLogs = await MaintenanceLog.count({
      where: { is_active: true, status: { [Op.in]: ["In Progress", "Pending Stock"] } },
    });
    const totalMaintenanceCost = await MaintenanceLog.sum("cost_value", { where: { is_active: true } }) || 0;

    // Purchase order stats
    const totalPOs = await PurchaseOrder.count({ where: { is_active: true } });
    const activePOs = await PurchaseOrder.count({
      where: { is_active: true, status: { [Op.notIn]: ["Delivered", "Cancelled"] } },
    });

    return res.status(200).json({
      success: true,
      data: {
        accessories: {
          total_items: totalAccessories,
          total_quantity: totalQty,
          low_stock_count: lowStockCount,
          out_of_stock_count: outOfStockCount,
        },
        drones: {
          total: totalDrones,
          active: activeDrones,
          in_maintenance: maintenanceDrones,
        },
        shipments: {
          in_transit: inTransitCount,
          delayed: delayedCount,
        },
        maintenance: {
          total_logs: totalLogs,
          resolved: resolvedLogs,
          pending: pendingLogs,
          total_cost: totalMaintenanceCost,
        },
        purchase_orders: {
          total: totalPOs,
          active: activePOs,
        },
      },
    });
  } catch (error) {
    console.error("Error in getDashboardStats:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
