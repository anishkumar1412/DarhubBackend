import express from "express";
import {
  getStates,
  getDistrictsByState,
  getBlocksByDistrict,
  getPanchayatsByBlock,
  getDrones,
  getAllAddresses,
  createAddressBulk,
  deleteAddress,
} from "../controllers/locationController.js";

import { authenticateAdmin } from "../middleware/adminAuth.middleware.js";

const router = express.Router();

// ── Public: the state/district/block/panchayat lists are needed by the sign-up forms, before anyone has logged in ──
// All states
router.get("/states", getStates);

// Get districts by state ID
router.get("/districts/:state_id", getDistrictsByState);

// Get blocks by district ID
router.get("/blocks/:district_id", getBlocksByDistrict);

router.get("/panchayats/:block_id",  getPanchayatsByBlock);

// ── Admin only: drone service areas and bulk address changes ──
router.get("/drones",                authenticateAdmin, getDrones);
 
// IMPORTANT: /address/all must come before /address/:id
// so Express does not treat "all" as an :id param value
router.get("/address/all",           authenticateAdmin, getAllAddresses);   // ?search= &drone_id=
router.post("/address/bulk",         authenticateAdmin, createAddressBulk);
router.delete("/address/:id",        authenticateAdmin, deleteAddress);

export default router;
