import express from "express";
import {
  getStates,
  getDistrictsByState,
  getBlocksByDistrict,
  getPanchayatsByBlock,
  matchLocation,
  getDrones,
  getAllAddresses,
  createAddressBulk,
  deleteAddress,
} from "../controllers/locationController.js";

import { authenticateAdmin } from "../middleware/adminAuth.middleware.js";
import { validate } from "../middleware/validate.js";
import { idParam } from "../validation/common.js";
import { locationMatchQuery } from "../validation/location.schemas.js";

const router = express.Router();

// ── Public: the state/district/block/panchayat lists are needed by the sign-up forms, before anyone has logged in ──
// All states
router.get("/states", getStates);

// Get districts by state ID
router.get("/districts/:state_id", validate({ params: idParam("state_id") }), getDistrictsByState);

// Get blocks by district ID
router.get("/blocks/:district_id", validate({ params: idParam("district_id") }), getBlocksByDistrict);

router.get("/panchayats/:block_id", validate({ params: idParam("block_id") }), getPanchayatsByBlock);

// "Use my current location": the app reverse-geocodes on the phone and asks which of our rows those names are
router.get("/match", validate({ query: locationMatchQuery }), matchLocation);

// ── Admin only: drone service areas and bulk address changes ──
router.get("/drones",                authenticateAdmin, getDrones);
 
// IMPORTANT: /address/all must come before /address/:id
// so Express does not treat "all" as an :id param value
router.get("/address/all",           authenticateAdmin, getAllAddresses);   // ?search= &drone_id=
router.post("/address/bulk",         authenticateAdmin, createAddressBulk);
router.delete("/address/:id",        authenticateAdmin, validate({ params: idParam("id") }), deleteAddress);

export default router;
