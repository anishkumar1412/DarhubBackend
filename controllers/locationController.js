import { Op } from "sequelize";
import db from "../models/index.js";

const {
  MasterState,
  MasterDistrict,
  MasterBlock,
  MasterGramPanchayat,
  DroneAddress,
  Drone1,
  sequelize,
} = db;

// ──────────────────────────────────────────────────────────
//  EXISTING — keep these exactly as they were
// ──────────────────────────────────────────────────────────

export const getStates = async (req, res) => {
  try {
    const states = await MasterState.findAll({
      attributes: ["id", "state_name"],
      order: [["state_name", "ASC"]],
    });
    return res.json(states);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch states", error: error.message });
  }
};

export const getDistrictsByState = async (req, res) => {
  try {
    const { state_id } = req.params;
    const districts = await MasterDistrict.findAll({
      where: { state_id },
      attributes: ["id", "district_name"],
      order: [["district_name", "ASC"]],
    });
    return res.json(districts);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch districts", error: error.message });
  }
};

export const getBlocksByDistrict = async (req, res) => {
  try {
    const { district_id } = req.params;
    const blocks = await MasterBlock.findAll({
      where: { district_id },
      attributes: ["id", "block_name"],
      order: [["block_name", "ASC"]],
    });
    return res.json(blocks);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch blocks", error: error.message });
  }
};

// ──────────────────────────────────────────────────────────
//  NEW — panchayats by block
//  GET /api/locations/panchayats/:block_id
// ──────────────────────────────────────────────────────────
export const getPanchayatsByBlock = async (req, res) => {
  try {
    const { block_id } = req.params;
    const panchayats = await MasterGramPanchayat.findAll({
      where: { block_id },
      attributes: ["id", "gram_panchayat_name"],
      order: [["gram_panchayat_name", "ASC"]],
    });
    return res.json(panchayats);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch panchayats", error: error.message });
  }
};

// ──────────────────────────────────────────────────────────
//  NEW — drones with location counts
//  GET /api/locations/drones
// ──────────────────────────────────────────────────────────
export const getDrones = async (req, res) => {
  try {
    const drones = await Drone1.findAll({
      where: { is_active: true },
      attributes: ["id", "model", "name", "acres_per_day"],
      order: [["id", "ASC"]],
    });

    // Count saved addresses per drone in one query
    const counts = await DroneAddress.findAll({
      where: { is_active: true },
      attributes: [
        "drone_id",
        [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
      ],
      group: ["drone_id"],
      raw: true,
    });

    const countMap = {};
    counts.forEach((c) => { countMap[c.drone_id] = Number(c.count); });

    const data = drones.map((d) => ({
      ...d.toJSON(),
      droneId:       `DRN-${String(d.id).padStart(3, "0")}`,
      locationCount: countMap[d.id] || 0,
      battery:       null,   // real-time hardware value — not stored in DB
      status:        "Active",
    }));

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch drones", error: error.message });
  }
};

// ──────────────────────────────────────────────────────────
//  NEW — save multiple panchayat addresses for one drone
//  POST /api/locations/address/bulk
//  Body: { drone_id, lane_1, lane_2?, state_id, district_id, pincode,
//          entries: [{ block_id, panchayat_id }, ...] }
// ──────────────────────────────────────────────────────────
export const createAddressBulk = async (req, res) => {
  try {
    const { drone_id, lane_1, lane_2, state_id, district_id, pincode, entries } = req.body;

    if (!drone_id || !lane_1?.trim() || !state_id || !district_id || !pincode?.trim() || !Array.isArray(entries) || !entries.length)
      return res.status(400).json({ success: false, message: "Missing required fields or empty entries array" });

    const drone = await Drone1.findOne({ where: { id: drone_id, is_active: true } });
    if (!drone)
      return res.status(404).json({ success: false, message: "Drone not found" });

    const created = [];
    const skipped = [];

    for (const entry of entries) {
      const { block_id, panchayat_id } = entry;
      if (!block_id || !panchayat_id) continue;

      // Skip if this drone+panchayat combo already exists
      const dup = await DroneAddress.findOne({
        where: { drone_id, panchayat: panchayat_id, is_active: true },
      });
      if (dup) { skipped.push(panchayat_id); continue; }

      const addr = await DroneAddress.create({
        drone_id,
        lane_1:      lane_1.trim(),
        lane_2:      lane_2?.trim() || null,
        state:       state_id,
        district:    district_id,
        block:       block_id,
        panchayat:   panchayat_id,
        pincode:     pincode.trim(),
        is_active:   true,
        created_on:  new Date(),
        modified_on: new Date(),
      });
      created.push(addr.id);
    }

    return res.status(201).json({
      success: true,
      message: `${created.length} location(s) saved${skipped.length ? `, ${skipped.length} skipped (already exist)` : ""}`,
      data: { created, skipped },
    });
  } catch (error) {
    console.error("createAddressBulk:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ──────────────────────────────────────────────────────────
//  NEW — all saved locations (grouped for table view)
//  GET /api/locations/address/all?search=&drone_id=
// ──────────────────────────────────────────────────────────
export const getAllAddresses = async (req, res) => {
  try {
    const { drone_id, search } = req.query;
    const where = { is_active: true };
    if (drone_id) where.drone_id = drone_id;

    const addresses = await DroneAddress.findAll({ where, order: [["created_on", "DESC"]] });
    if (!addresses.length) return res.json({ success: true, total: 0, data: [] });

    // Batch-fetch all names needed
    const stateIds     = [...new Set(addresses.map((a) => a.state))];
    const districtIds  = [...new Set(addresses.map((a) => a.district))];
    const blockIds     = [...new Set(addresses.map((a) => a.block))];
    const panchayatIds = [...new Set(addresses.map((a) => a.panchayat))];
    const droneIds     = [...new Set(addresses.map((a) => a.drone_id))];

    const [states, districts, blocks, panchayats, drones] = await Promise.all([
      MasterState.findAll({ where: { id: stateIds },         attributes: ["id", "state_name"],            raw: true }),
      MasterDistrict.findAll({ where: { id: districtIds },   attributes: ["id", "district_name"],         raw: true }),
      MasterBlock.findAll({ where: { id: blockIds },         attributes: ["id", "block_name"],            raw: true }),
      MasterGramPanchayat.findAll({ where: { id: panchayatIds }, attributes: ["id", "gram_panchayat_name"], raw: true }),
      Drone1.findAll({ where: { id: droneIds },               attributes: ["id", "model", "name"],         raw: true }),
    ]);

    const stateMap     = Object.fromEntries(states.map((s) => [s.id, s.state_name]));
    const districtMap  = Object.fromEntries(districts.map((d) => [d.id, d.district_name]));
    const blockMap     = Object.fromEntries(blocks.map((b) => [b.id, b.block_name]));
    const panchayatMap = Object.fromEntries(panchayats.map((p) => [p.id, p.gram_panchayat_name]));
    const droneMap     = Object.fromEntries(drones.map((d) => [d.id, d]));

    // Group: one row per (drone_id + state + district)
    const grouped = {};
    for (const addr of addresses) {
      const key = `${addr.drone_id}__${addr.state}__${addr.district}`;
      if (!grouped[key]) {
        const droneInfo = droneMap[addr.drone_id] || {};
        grouped[key] = {
          id:               addr.id,
          droneId:          `DRN-${String(addr.drone_id).padStart(3, "0")}`,
          drone_id:         addr.drone_id,
          droneName:        droneInfo.name  || "",
          droneModel:       droneInfo.model || "",
          state:            stateMap[addr.state]       || String(addr.state),
          district:         districtMap[addr.district] || String(addr.district),
          blocks:           [],
          panchayats:       [],
          panchayatsByBlock: {},
          addresses:        [],
          savedAt: new Date(addr.created_on).toLocaleDateString("en-IN", {
            day: "2-digit", month: "short", year: "numeric",
          }),
        };
      }

      const row       = grouped[key];
      const blockName = blockMap[addr.block]         || String(addr.block);
      const pName     = panchayatMap[addr.panchayat] || String(addr.panchayat);

      if (!row.blocks.includes(blockName))         row.blocks.push(blockName);
      if (!row.panchayats.includes(pName))         row.panchayats.push(pName);
      if (!row.panchayatsByBlock[blockName])       row.panchayatsByBlock[blockName] = [];
      if (!row.panchayatsByBlock[blockName].includes(pName))
        row.panchayatsByBlock[blockName].push(pName);

      row.addresses.push({
        id:             addr.id,
        block_id:       addr.block,
        block_name:     blockName,
        panchayat_id:   addr.panchayat,
        panchayat_name: pName,
        lane_1:         addr.lane_1,
        lane_2:         addr.lane_2,
        pincode:        addr.pincode,
      });
    }

    let rows = Object.values(grouped);

    // Text search
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.droneId.toLowerCase().includes(q)    ||
          r.state.toLowerCase().includes(q)      ||
          r.district.toLowerCase().includes(q)   ||
          r.droneName.toLowerCase().includes(q)
      );
    }

    return res.json({ success: true, total: rows.length, data: rows });
  } catch (error) {
    console.error("getAllAddresses:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ──────────────────────────────────────────────────────────
//  NEW — soft-delete one address row
//  DELETE /api/locations/address/:id
// ──────────────────────────────────────────────────────────
export const deleteAddress = async (req, res) => {
  try {
    const addr = await DroneAddress.findOne({ where: { id: req.params.id, is_active: true } });
    if (!addr)
      return res.status(404).json({ success: false, message: "Address not found" });

    await addr.update({ is_active: false, modified_on: new Date() });
    return res.json({ success: true, message: "Location deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};