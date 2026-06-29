import db from "../models/index.js";
import { Op } from "sequelize";

const { Warehouse, WarehouseLocation, WarehouseAdditional } = db;

// CREATE WAREHOUSE
export const createWarehouse = async (req, res) => {
  try {
    const {
      warehouse_name,
      warehouse_code,
      type,
      warehouse_category,
      capacity,
      status,
      // Location Details
      address_line_1,
      address_line_2,
      state,
      district,
      city_location,
      pincode,
      latitude,
      longitude,
      // Additional Information
      manager_name,
      manager_mobile,
      manager_email,
      description,
    } = req.body;

    // Validate Warehouse Information
    if (!warehouse_name || !warehouse_name.trim()) {
      return res.status(400).json({ success: false, error: "Warehouse Name is required" });
    }
    if (!warehouse_code || !warehouse_code.trim()) {
      return res.status(400).json({ success: false, error: "Warehouse Code is required" });
    }
    if (!type || !type.trim()) {
      return res.status(400).json({ success: false, error: "Type is required" });
    }
    if (!warehouse_category || !warehouse_category.trim()) {
      return res.status(400).json({ success: false, error: "Warehouse Category is required" });
    }
    if (capacity === undefined || capacity === null || isNaN(Number(capacity))) {
      return res.status(400).json({ success: false, error: "Valid capacity (number of pallets) is required" });
    }
    if (!status || !status.trim()) {
      return res.status(400).json({ success: false, error: "Status is required" });
    }

    // Validate Location Details
    if (!address_line_1 || !address_line_1.trim()) {
      return res.status(400).json({ success: false, error: "Address Line 1 is required" });
    }
    if (state === undefined || state === null || isNaN(Number(state))) {
      return res.status(400).json({ success: false, error: "State (integer ID) is required" });
    }
    if (district === undefined || district === null || isNaN(Number(district))) {
      return res.status(400).json({ success: false, error: "District (integer ID) is required" });
    }
    if (!city_location || !city_location.trim()) {
      return res.status(400).json({ success: false, error: "City / Location is required" });
    }
    if (!pincode || !pincode.trim()) {
      return res.status(400).json({ success: false, error: "Pincode is required" });
    }

    // Check for duplicate warehouse code (case-insensitive)
    const existing = await Warehouse.findOne({
      where: {
        warehouse_code: {
          [Op.iLike]: warehouse_code.trim(),
        },
        is_active: true,
      },
    });
    if (existing) {
      return res.status(400).json({ success: false, error: "Warehouse with this Warehouse Code already exists" });
    }

    // Extract creator ID from authenticated user (req.user)
    const creatorId = req.user?.id || req.user?.userId || null;

    // Insert into all three tables using a transaction
    const result = await db.sequelize.transaction(async (t) => {
      // 1. Create Warehouse Information
      const warehouse = await Warehouse.create(
        {
          warehouse_name: warehouse_name.trim(),
          warehouse_code: warehouse_code.trim(),
          type: type.trim(),
          warehouse_category: warehouse_category.trim(),
          capacity: Number(capacity),
          status: status.trim(),
          created_by: creatorId,
        },
        { transaction: t }
      );

      // 2. Create Location Details
      const location = await WarehouseLocation.create(
        {
          warehouse_id: warehouse.id,
          address_line_1: address_line_1.trim(),
          address_line_2: address_line_2 ? address_line_2.trim() : null,
          state: Number(state),
          district: Number(district),
          city_location: city_location.trim(),
          pincode: pincode.trim(),
          latitude: latitude ? String(latitude).trim() : null,
          longitude: longitude ? String(longitude).trim() : null,
          created_by: creatorId,
        },
        { transaction: t }
      );

      // 3. Create Additional Information
      const additional = await WarehouseAdditional.create(
        {
          warehouse_id: warehouse.id,
          manager_name: manager_name ? manager_name.trim() : null,
          manager_mobile: manager_mobile ? String(manager_mobile).trim() : null,
          manager_email: manager_email ? manager_email.trim() : null,
          description: description ? description.trim() : null,
          created_by: creatorId,
        },
        { transaction: t }
      );

      return { warehouse, location, additional };
    });

    res.status(201).json({
      success: true,
      message: "Warehouse created successfully",
      data: {
        ...result.warehouse.get({ plain: true }),
        location: result.location.get({ plain: true }),
        additional: result.additional.get({ plain: true }),
      },
    });
  } catch (error) {
    console.error("Create Warehouse Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET ALL / FILTER WAREHOUSES
export const getAllWarehouses = async (req, res) => {
  try {
    const { search, type, status, warehouse_category, page, pageSize } = req.body || {};
    const condition = { is_active: true };

    if (type && type !== "All") {
      condition.type = type;
    }

    if (status && status !== "All") {
      condition.status = status;
    }

    if (warehouse_category && warehouse_category !== "All") {
      condition.warehouse_category = warehouse_category;
    }

    if (search) {
      condition[Op.or] = [
        { warehouse_name: { [Op.iLike]: `%${search}%` } },
        { warehouse_code: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const limit = pageSize ? parseInt(pageSize) : 10;
    const offset = page ? (parseInt(page) - 1) * limit : 0;

    const { count, rows } = await Warehouse.findAndCountAll({
      where: condition,
      limit,
      offset,
      order: [["created_on", "DESC"]],
    });

    // Efficiently merge location and additional details to avoid N+1 query issue
    const warehouseIds = rows.map((w) => w.id);
    let locations = [];
    let additionals = [];

    if (warehouseIds.length > 0) {
      locations = await WarehouseLocation.findAll({
        where: { warehouse_id: warehouseIds, is_active: true },
      });
      additionals = await WarehouseAdditional.findAll({
        where: { warehouse_id: warehouseIds, is_active: true },
      });
    }

    const locationMap = locations.reduce((acc, loc) => {
      acc[loc.warehouse_id] = loc.get({ plain: true });
      return acc;
    }, {});

    const additionalMap = additionals.reduce((acc, add) => {
      acc[add.warehouse_id] = add.get({ plain: true });
      return acc;
    }, {});

    const mergedData = rows.map((w) => {
      const plain = w.get({ plain: true });
      return {
        ...plain,
        location: locationMap[w.id] || null,
        additional: additionalMap[w.id] || null,
      };
    });

    res.json({
      success: true,
      data: mergedData,
      totalCount: count,
      totalPages: Math.ceil(count / limit),
      page: page ? parseInt(page) : 1,
      pageSize: limit,
    });
  } catch (error) {
    console.error("Get All Warehouses Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET WAREHOUSE BY ID
export const getWarehouseById = async (req, res) => {
  try {
    const { id } = req.params;

    const warehouse = await Warehouse.findOne({
      where: { id, is_active: true },
    });

    if (!warehouse) {
      return res.status(404).json({ success: false, error: "Warehouse not found" });
    }

    const location = await WarehouseLocation.findOne({
      where: { warehouse_id: id, is_active: true },
    });

    const additional = await WarehouseAdditional.findOne({
      where: { warehouse_id: id, is_active: true },
    });

    res.json({
      success: true,
      data: {
        ...warehouse.get({ plain: true }),
        location: location ? location.get({ plain: true }) : null,
        additional: additional ? additional.get({ plain: true }) : null,
      },
    });
  } catch (error) {
    console.error("Get Warehouse By ID Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// UPDATE WAREHOUSE
export const updateWarehouse = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      warehouse_name,
      warehouse_code,
      type,
      warehouse_category,
      capacity,
      status,
      // Location Details
      address_line_1,
      address_line_2,
      state,
      district,
      city_location,
      pincode,
      latitude,
      longitude,
      // Additional Information
      manager_name,
      manager_mobile,
      manager_email,
      description,
    } = req.body;

    const warehouse = await Warehouse.findOne({
      where: { id, is_active: true },
    });

    if (!warehouse) {
      return res.status(404).json({ success: false, error: "Warehouse not found" });
    }

    // Check duplicate code if changed
    if (warehouse_code && warehouse_code.trim().toLowerCase() !== warehouse.warehouse_code.toLowerCase()) {
      const duplicate = await Warehouse.findOne({
        where: {
          warehouse_code: { [Op.iLike]: warehouse_code.trim() },
          id: { [Op.ne]: id },
          is_active: true,
        },
      });
      if (duplicate) {
        return res.status(400).json({ success: false, error: "Warehouse with this Warehouse Code already exists" });
      }
    }

    const modifierId = req.user?.id || req.user?.userId || null;
    const now = new Date();

    const result = await db.sequelize.transaction(async (t) => {
      // 1. Update Warehouse Information
      await warehouse.update(
        {
          warehouse_name: warehouse_name !== undefined ? warehouse_name.trim() : warehouse.warehouse_name,
          warehouse_code: warehouse_code !== undefined ? warehouse_code.trim() : warehouse.warehouse_code,
          type: type !== undefined ? type.trim() : warehouse.type,
          warehouse_category: warehouse_category !== undefined ? warehouse_category.trim() : warehouse.warehouse_category,
          capacity: capacity !== undefined ? Number(capacity) : warehouse.capacity,
          status: status !== undefined ? status.trim() : warehouse.status,
          modified_by: modifierId,
          modified_on: now,
        },
        { transaction: t }
      );

      // 2. Update Location Details
      const location = await WarehouseLocation.findOne({
        where: { warehouse_id: id },
        transaction: t,
      });

      let updatedLocation;
      if (location) {
        updatedLocation = await location.update(
          {
            address_line_1: address_line_1 !== undefined ? address_line_1.trim() : location.address_line_1,
            address_line_2: address_line_2 !== undefined ? (address_line_2 ? address_line_2.trim() : null) : location.address_line_2,
            state: state !== undefined ? Number(state) : location.state,
            district: district !== undefined ? Number(district) : location.district,
            city_location: city_location !== undefined ? city_location.trim() : location.city_location,
            pincode: pincode !== undefined ? pincode.trim() : location.pincode,
            latitude: latitude !== undefined ? (latitude ? String(latitude).trim() : null) : location.latitude,
            longitude: longitude !== undefined ? (longitude ? String(longitude).trim() : null) : location.longitude,
            modified_by: modifierId,
            modified_on: now,
          },
          { transaction: t }
        );
      } else {
        // Fallback in case location record is missing
        updatedLocation = await WarehouseLocation.create(
          {
            warehouse_id: id,
            address_line_1: address_line_1 ? address_line_1.trim() : "",
            address_line_2: address_line_2 ? address_line_2.trim() : null,
            state: state ? Number(state) : 0,
            district: district ? Number(district) : 0,
            city_location: city_location ? city_location.trim() : "",
            pincode: pincode ? pincode.trim() : "",
            latitude: latitude ? String(latitude).trim() : null,
            longitude: longitude ? String(longitude).trim() : null,
            created_by: modifierId,
          },
          { transaction: t }
        );
      }

      // 3. Update Additional Details
      const additional = await WarehouseAdditional.findOne({
        where: { warehouse_id: id },
        transaction: t,
      });

      let updatedAdditional;
      if (additional) {
        updatedAdditional = await additional.update(
          {
            manager_name: manager_name !== undefined ? (manager_name ? manager_name.trim() : null) : additional.manager_name,
            manager_mobile: manager_mobile !== undefined ? (manager_mobile ? String(manager_mobile).trim() : null) : additional.manager_mobile,
            manager_email: manager_email !== undefined ? (manager_email ? manager_email.trim() : null) : additional.manager_email,
            description: description !== undefined ? (description ? description.trim() : null) : additional.description,
            modified_by: modifierId,
            modified_on: now,
          },
          { transaction: t }
        );
      } else {
        // Fallback in case additional info record is missing
        updatedAdditional = await WarehouseAdditional.create(
          {
            warehouse_id: id,
            manager_name: manager_name ? manager_name.trim() : null,
            manager_mobile: manager_mobile ? String(manager_mobile).trim() : null,
            manager_email: manager_email ? manager_email.trim() : null,
            description: description ? description.trim() : null,
            created_by: modifierId,
          },
          { transaction: t }
        );
      }

      return { warehouse, location: updatedLocation, additional: updatedAdditional };
    });

    res.json({
      success: true,
      message: "Warehouse updated successfully",
      data: {
        ...result.warehouse.get({ plain: true }),
        location: result.location.get({ plain: true }),
        additional: result.additional.get({ plain: true }),
      },
    });
  } catch (error) {
    console.error("Update Warehouse Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE WAREHOUSE
export const deleteWarehouse = async (req, res) => {
  try {
    const { id } = req.params;
    const { hardDelete } = req.query;

    const warehouse = await Warehouse.findByPk(id);
    if (!warehouse) {
      return res.status(404).json({ success: false, error: "Warehouse not found" });
    }

    const modifierId = req.user?.id || req.user?.userId || null;
    const now = new Date();

    await db.sequelize.transaction(async (t) => {
      if (hardDelete === "true") {
        // Hard Delete (permanently delete from database)
        await WarehouseLocation.destroy({ where: { warehouse_id: id }, transaction: t });
        await WarehouseAdditional.destroy({ where: { warehouse_id: id }, transaction: t });
        await warehouse.destroy({ transaction: t });
      } else {
        // Soft Delete (set is_active: false)
        await Warehouse.update(
          { is_active: false, modified_by: modifierId, modified_on: now },
          { where: { id }, transaction: t }
        );
        await WarehouseLocation.update(
          { is_active: false, modified_by: modifierId, modified_on: now },
          { where: { warehouse_id: id }, transaction: t }
        );
        await WarehouseAdditional.update(
          { is_active: false, modified_by: modifierId, modified_on: now },
          { where: { warehouse_id: id }, transaction: t }
        );
      }
    });

    res.json({
      success: true,
      message: hardDelete === "true" ? "Warehouse permanently deleted" : "Warehouse soft-deleted successfully",
    });
  } catch (error) {
    console.error("Delete Warehouse Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};
