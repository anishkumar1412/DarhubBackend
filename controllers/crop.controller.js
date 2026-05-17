import { Op } from "sequelize";
import db from "../models/index.js";
import upload, { uploadToCloudinary } from "../middleware/upload.js" // ← import from your cloudinary util

const { MasterCrop } = db;

// Re-export upload so cropRoutes.js can import it from here
export { upload };

export const createCrop = async (req, res) => {
  try {
    const { name, desc, price_per_acre } = req.body;

    if (!name || !name.trim())
      return res.status(400).json({ success: false, message: "Crop name is required" });
    if (!price_per_acre || isNaN(Number(price_per_acre)))
      return res.status(400).json({ success: false, message: "Valid price_per_acre is required" });

    const existing = await MasterCrop.findOne({ where: { name: name.trim(), is_active: true } });
    if (existing)
      return res.status(409).json({ success: false, message: `Crop "${name.trim()}" already exists` });

    let imageData = {};
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "crops");
      imageData = {
        crop_image_original_name: req.file.originalname,
        crop_image_new_name:      result.public_id,
        crop_image_url:           result.secure_url,  // ← full Cloudinary URL
      };
    }

    const crop = await MasterCrop.create({
      name:           name.trim(),
      desc:           desc?.trim() || null,
      price_per_acre: parseFloat(price_per_acre),
      ...imageData,
      is_active:   true,
      created_on:  new Date(),
      modified_on: new Date(),
    });

    return res.status(201).json({ success: true, message: "Crop created successfully", data: crop });
  } catch (error) {
    console.error("Error in createCrop:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateCrop = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, desc, price_per_acre } = req.body;

    const crop = await MasterCrop.findOne({ where: { id, is_active: true } });
    if (!crop)
      return res.status(404).json({ success: false, message: "Crop not found" });

    if (name && name.trim() !== crop.name) {
      const dup = await MasterCrop.findOne({
        where: { name: name.trim(), is_active: true, id: { [Op.ne]: id } },
      });
      if (dup)
        return res.status(409).json({ success: false, message: `Crop "${name.trim()}" already exists` });
    }

    let imageData = {};
    if (req.file) {
      // Delete old image from Cloudinary if exists
      if (crop.crop_image_new_name) {
        await cloudinary.v2.uploader.destroy(crop.crop_image_new_name).catch(() => {});
      }
      const result = await uploadToCloudinary(req.file.buffer, "crops");
      imageData = {
        crop_image_original_name: req.file.originalname,
        crop_image_new_name:      result.public_id,
        crop_image_url:           result.secure_url,
      };
    }

    await crop.update({
      ...(name              && { name: name.trim() }),
      ...(desc !== undefined && { desc: desc?.trim() || null }),
      ...(price_per_acre    && { price_per_acre: parseFloat(price_per_acre) }),
      ...imageData,
      modified_on: new Date(),
    });

    return res.status(200).json({ success: true, message: "Crop updated successfully", data: crop });
  } catch (error) {
    console.error("Error in updateCrop:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const filterCrops = async (req, res) => {
  try {
    const {
      search, is_active, min_price, max_price,
      sortBy = "created_on", sortDir = "DESC",
      page = 1, pageSize = 10,
    } = req.body ?? {};

    const where = {};
    where.is_active = (is_active !== undefined && is_active !== "")
      ? (is_active === true || is_active === "true")
      : true;

    if (search?.trim()) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search.trim()}%` } },
        { desc: { [Op.like]: `%${search.trim()}%` } },
      ];
    }
    if (min_price !== undefined && min_price !== "")
      where.price_per_acre = { ...(where.price_per_acre || {}), [Op.gte]: parseFloat(min_price) };
    if (max_price !== undefined && max_price !== "")
      where.price_per_acre = { ...(where.price_per_acre || {}), [Op.lte]: parseFloat(max_price) };

    const allowedSort = ["name", "price_per_acre", "created_on", "modified_on"];
    const orderField  = allowedSort.includes(sortBy) ? sortBy : "created_on";
    const orderDir    = sortDir?.toUpperCase() === "ASC" ? "ASC" : "DESC";
    const offset      = (Math.max(1, Number(page)) - 1) * Number(pageSize);

    const { count, rows } = await MasterCrop.findAndCountAll({
      where,
      order:  [[orderField, orderDir]],
      limit:  Number(pageSize),
      offset,
    });

    return res.status(200).json({
      success: true, total: count, page: Number(page),
      pageSize: Number(pageSize), totalPages: Math.ceil(count / Number(pageSize)),
      data: rows,
    });
  } catch (error) {
    console.error("Error in filterCrops:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getCropById = async (req, res) => {
  try {
    const crop = await MasterCrop.findOne({ where: { id: req.params.id } });
    if (!crop) return res.status(404).json({ success: false, message: "Crop not found" });
    return res.status(200).json({ success: true, data: crop });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteCrop = async (req, res) => {
  try {
    const crop = await MasterCrop.findOne({ where: { id: req.params.id, is_active: true } });
    if (!crop) return res.status(404).json({ success: false, message: "Crop not found" });
    await crop.update({ is_active: false, modified_on: new Date() });
    return res.status(200).json({ success: true, message: "Crop deleted successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};