import db from "../models/index.js";
import { Op } from "sequelize";
import cloudinary from "cloudinary";
import { uploadToCloudinary } from "../middleware/upload.js";

const { Fertilizer } = db;

// CREATE
export const createFertilizer = async (req, res) => {
  try {
    const { name, type, company, packageType, quantity, unit, price } = req.body;

    if (!name || !type || !company || !packageType || quantity === undefined || !unit || price === undefined) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    if (name.trim().toLowerCase() === company.trim().toLowerCase()) {
      return res.status(400).json({ success: false, error: "Company name and fertilizer name should not be the same" });
    }

    // Check duplicate name & company (case-insensitive & trimmed)
    const existing = await Fertilizer.findOne({
      where: {
        [Op.and]: [
          db.sequelize.where(
            db.sequelize.fn('trim', db.sequelize.col('name')),
            { [Op.iLike]: name.trim() }
          ),
          db.sequelize.where(
            db.sequelize.fn('trim', db.sequelize.col('company')),
            { [Op.iLike]: company.trim() }
          )
        ]
      }
    });

    if (existing) {
      return res.status(400).json({ success: false, error: "Fertilizer already exists with this name and company" });
    }

    let imageData = {};
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "fertilizers");
      imageData = {
        fertilizer_image_original_name: req.file.originalname,
        fertilizer_image_new_name:      result.public_id,
        fertilizer_image_url:           result.secure_url,
      };
    }

    const fertilizer = await Fertilizer.create({
      name: name.trim(),
      type: type.trim(),
      company: company.trim(),
      packageType: packageType.trim(),
      quantity: Number(quantity),
      unit: unit.trim(),
      price: Number(price),
      ...imageData,
    });

    res.status(201).json({ success: true, data: fertilizer, message: "Fertilizer created successfully" });
  } catch (error) {
    console.error("Create fertilizer error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET ALL / FILTER
export const getAllFertilizers = async (req, res) => {
  try {
    const { search, type, name, company, minQuantity, maxQuantity, minPrice, maxPrice, page, pageSize } = req.body;
    const condition = {};

    if (type && type !== "All") {
      condition.type = type;
    }

    if (name) {
      condition.name = { [Op.iLike]: `%${name}%` };
    }

    if (company) {
      condition.company = { [Op.iLike]: `%${company}%` };
    }

    if (search && !name && !company) {
      condition[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { company: { [Op.iLike]: `%${search}%` } }
      ];
    }

    if ((minQuantity !== undefined && minQuantity !== "") || (maxQuantity !== undefined && maxQuantity !== "")) {
      condition.quantity = {};
      if (minQuantity !== undefined && minQuantity !== "") {
        condition.quantity[Op.gte] = Number(minQuantity);
      }
      if (maxQuantity !== undefined && maxQuantity !== "") {
        condition.quantity[Op.lte] = Number(maxQuantity);
      }
    }

    if ((minPrice !== undefined && minPrice !== "") || (maxPrice !== undefined && maxPrice !== "")) {
      condition.price = {};
      const minVal = (minPrice === undefined || minPrice === "") ? 0 : Number(minPrice);
      condition.price[Op.gte] = minVal;

      if (maxPrice !== undefined && maxPrice !== "") {
        condition.price[Op.lte] = Number(maxPrice);
      }
    }

    const limit = pageSize ? parseInt(pageSize) : 10;
    const offset = page ? (parseInt(page) - 1) * limit : 0;

    const { count, rows } = await Fertilizer.findAndCountAll({
      where: condition,
      limit,
      offset,
      order: [["created_on", "DESC"]]
    });

    res.json({
      success: true,
      data: rows,
      totalCount: count,
      totalPages: Math.ceil(count / limit),
      page: page ? parseInt(page) : 1,
      pageSize: limit
    });
  } catch (error) {
    console.error("Get fertilizers error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET BY ID
export const getFertilizerById = async (req, res) => {
  try {
    const { id } = req.params;
    const fertilizer = await Fertilizer.findByPk(id);

    if (!fertilizer) {
      return res.status(404).json({ success: false, error: "Fertilizer not found" });
    }

    res.json({ success: true, data: fertilizer });
  } catch (error) {
    console.error("Get fertilizer by ID error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// UPDATE
export const updateFertilizer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, company, packageType, quantity, unit, price } = req.body;

    const fertilizer = await Fertilizer.findByPk(id);
    if (!fertilizer) {
      return res.status(404).json({ success: false, error: "Fertilizer not found" });
    }

    // Check duplicate name & company (excluding current fertilizer)
    const checkName = name !== undefined ? name : fertilizer.name;
    const checkCompany = company !== undefined ? company : fertilizer.company;

    if (checkName && checkCompany && checkName.trim().toLowerCase() === checkCompany.trim().toLowerCase()) {
      return res.status(400).json({ success: false, error: "Company name and fertilizer name should not be the same" });
    }

    if (checkName && checkCompany) {
      const existing = await Fertilizer.findOne({
        where: {
          [Op.and]: [
            db.sequelize.where(
              db.sequelize.fn('trim', db.sequelize.col('name')),
              { [Op.iLike]: checkName.trim() }
            ),
            db.sequelize.where(
              db.sequelize.fn('trim', db.sequelize.col('company')),
              { [Op.iLike]: checkCompany.trim() }
            ),
            { id: { [Op.ne]: id } }
          ]
        }
      });

      if (existing) {
        return res.status(400).json({ success: false, error: "Fertilizer already exists with this name and company" });
      }
    }

    let imageData = {};
    if (req.file) {
      // Delete old image from Cloudinary if exists
      if (fertilizer.fertilizer_image_new_name) {
        await cloudinary.v2.uploader.destroy(fertilizer.fertilizer_image_new_name).catch(() => {});
      }
      const result = await uploadToCloudinary(req.file.buffer, "fertilizers");
      imageData = {
        fertilizer_image_original_name: req.file.originalname,
        fertilizer_image_new_name:      result.public_id,
        fertilizer_image_url:           result.secure_url,
      };
    } else if (req.body.removeImage === "true") {
      // Delete old image from Cloudinary if exists and set DB fields to null
      if (fertilizer.fertilizer_image_new_name) {
        await cloudinary.v2.uploader.destroy(fertilizer.fertilizer_image_new_name).catch(() => {});
      }
      imageData = {
        fertilizer_image_original_name: null,
        fertilizer_image_new_name:      null,
        fertilizer_image_url:           null,
      };
    }

    await fertilizer.update({
      name: name !== undefined ? name.trim() : fertilizer.name,
      type: type !== undefined ? type.trim() : fertilizer.type,
      company: company !== undefined ? company.trim() : fertilizer.company,
      packageType: packageType !== undefined ? packageType.trim() : fertilizer.packageType,
      quantity: quantity !== undefined ? Number(quantity) : fertilizer.quantity,
      unit: unit !== undefined ? unit.trim() : fertilizer.unit,
      price: price !== undefined ? Number(price) : fertilizer.price,
      ...imageData,
    });

    res.json({ success: true, data: fertilizer, message: "Fertilizer updated successfully" });
  } catch (error) {
    console.error("Update fertilizer error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE
export const deleteFertilizer = async (req, res) => {
  try {
    const { id } = req.params;
    const fertilizer = await Fertilizer.findByPk(id);

    if (!fertilizer) {
      return res.status(404).json({ success: false, error: "Fertilizer not found" });
    }

    // Delete image from Cloudinary if exists
    if (fertilizer.fertilizer_image_new_name) {
      await cloudinary.v2.uploader.destroy(fertilizer.fertilizer_image_new_name).catch(() => {});
    }

    await fertilizer.destroy();
    res.json({ success: true, message: "Fertilizer deleted successfully" });
  } catch (error) {
    console.error("Delete fertilizer error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};
