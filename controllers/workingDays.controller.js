import { Op } from "sequelize";
import db from "../models/index.js";

const { MasterWorkingDays } = db;

/* ══════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════ */

/**
 * Check whether a new min_acre–max_acre range overlaps any
 * existing active row (optionally excluding a given id for updates).
 */
async function hasOverlap(min_acre, max_acre, excludeId = null) {
  const where = {
    is_active: true,
    // Overlap condition: existing.min <= new.max AND existing.max >= new.min
    min_acre: { [Op.lte]: max_acre },
    max_acre: { [Op.gte]: min_acre },
  };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  const count = await MasterWorkingDays.count({ where });
  return count > 0;
}

/* ══════════════════════════════════════════════════════════
   CREATE
   POST /working-days/create
   Body: { min_acre, max_acre, working_days }
══════════════════════════════════════════════════════════ */
export const createWorkingDays = async (req, res) => {
  try {
    const { min_acre, max_acre, working_days } = req.body;

    // ── Validation ──
    if (min_acre === undefined || min_acre === null || min_acre === "")
      return res.status(400).json({ success: false, message: "min_acre is required" });
    if (max_acre === undefined || max_acre === null || max_acre === "")
      return res.status(400).json({ success: false, message: "max_acre is required" });
    if (!working_days || isNaN(Number(working_days)) || Number(working_days) < 1)
      return res.status(400).json({ success: false, message: "working_days must be a positive integer" });

    const min = parseFloat(min_acre);
    const max = parseFloat(max_acre);

    if (isNaN(min) || isNaN(max))
      return res.status(400).json({ success: false, message: "min_acre and max_acre must be valid numbers" });
    if (min < 0 || max < 0)
      return res.status(400).json({ success: false, message: "Acre values cannot be negative" });
    if (min >= max)
      return res.status(400).json({ success: false, message: "min_acre must be less than max_acre" });

    // ── Overlap check ──
    if (await hasOverlap(min, max))
      return res.status(409).json({
        success: false,
        message: `Range ${min}–${max} acres overlaps an existing entry. Ranges must not overlap.`,
      });

    const record = await MasterWorkingDays.create({
      min_acre:     min,
      max_acre:     max,
      working_days: parseInt(working_days),
      is_active:    true,
      created_on:   new Date(),
      modified_on:  new Date(),
    });

    return res.status(201).json({
      success: true,
      message: "Working days entry created successfully",
      data:    record,
    });
  } catch (error) {
    console.error("createWorkingDays:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/* ══════════════════════════════════════════════════════════
   GET ALL (with optional filters)
   POST /working-days/filter
   Body (all optional):
   { search, sortBy, sortDir, page, pageSize }
══════════════════════════════════════════════════════════ */
export const filterWorkingDays = async (req, res) => {
  try {
    const {
      sortBy   = "min_acre",
      sortDir  = "ASC",
      page     = 1,
      pageSize = 20,
    } = req.body ?? {};

    const where = { is_active: true };

    const allowedSort = ["min_acre", "max_acre", "working_days", "created_on"];
    const orderField  = allowedSort.includes(sortBy) ? sortBy : "min_acre";
    const orderDir    = sortDir?.toUpperCase() === "DESC" ? "DESC" : "ASC";
    const offset      = (Math.max(1, Number(page)) - 1) * Number(pageSize);

    const { count, rows } = await MasterWorkingDays.findAndCountAll({
      where,
      order:  [[orderField, orderDir]],
      limit:  Number(pageSize),
      offset,
    });

    return res.json({
      success:    true,
      total:      count,
      page:       Number(page),
      pageSize:   Number(pageSize),
      totalPages: Math.ceil(count / Number(pageSize)),
      data:       rows,
    });
  } catch (error) {
    console.error("filterWorkingDays:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/* ══════════════════════════════════════════════════════════
   GET ALL active (simple list — for booking logic)
   GET /working-days/list
══════════════════════════════════════════════════════════ */
export const listWorkingDays = async (_req, res) => {
  try {
    const rows = await MasterWorkingDays.findAll({
      where: { is_active: true },
      order: [["min_acre", "ASC"]],
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/* ══════════════════════════════════════════════════════════
   GET BY ID
   GET /working-days/:id
══════════════════════════════════════════════════════════ */
export const getWorkingDaysById = async (req, res) => {
  try {
    const record = await MasterWorkingDays.findOne({
      where: { id: req.params.id, is_active: true },
    });
    if (!record)
      return res.status(404).json({ success: false, message: "Record not found" });
    return res.json({ success: true, data: record });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/* ══════════════════════════════════════════════════════════
   UPDATE
   PUT /working-days/update/:id
   Body: { min_acre?, max_acre?, working_days? }
══════════════════════════════════════════════════════════ */
export const updateWorkingDays = async (req, res) => {
  try {
    const { id } = req.params;
    const { min_acre, max_acre, working_days } = req.body;

    const record = await MasterWorkingDays.findOne({ where: { id, is_active: true } });
    if (!record)
      return res.status(404).json({ success: false, message: "Record not found" });

    const newMin = min_acre !== undefined ? parseFloat(min_acre) : parseFloat(record.min_acre);
    const newMax = max_acre !== undefined ? parseFloat(max_acre) : parseFloat(record.max_acre);

    if (newMin >= newMax)
      return res.status(400).json({ success: false, message: "min_acre must be less than max_acre" });

    if (await hasOverlap(newMin, newMax, id))
      return res.status(409).json({
        success: false,
        message: `Range ${newMin}–${newMax} acres overlaps an existing entry.`,
      });

    if (working_days !== undefined && (isNaN(Number(working_days)) || Number(working_days) < 1))
      return res.status(400).json({ success: false, message: "working_days must be a positive integer" });

    await record.update({
      min_acre:     newMin,
      max_acre:     newMax,
      ...(working_days !== undefined && { working_days: parseInt(working_days) }),
      modified_on:  new Date(),
    });

    return res.json({ success: true, message: "Updated successfully", data: record });
  } catch (error) {
    console.error("updateWorkingDays:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/* ══════════════════════════════════════════════════════════
   SOFT DELETE
   DELETE /working-days/:id
══════════════════════════════════════════════════════════ */
export const deleteWorkingDays = async (req, res) => {
  try {
    const record = await MasterWorkingDays.findOne({
      where: { id: req.params.id, is_active: true },
    });
    if (!record)
      return res.status(404).json({ success: false, message: "Record not found" });

    await record.update({ is_active: false, modified_on: new Date() });
    return res.json({ success: true, message: "Deleted successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};