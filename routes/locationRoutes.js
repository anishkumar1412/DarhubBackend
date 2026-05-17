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

const router = express.Router();

// All states
router.get("/states", getStates);

// Get districts by state ID
router.get("/districts/:state_id", getDistrictsByState);

// Get blocks by district ID
router.get("/blocks/:district_id", getBlocksByDistrict);

router.get("/panchayats/:block_id",  getPanchayatsByBlock);
router.get("/drones",                getDrones);
 
// IMPORTANT: /address/all must come before /address/:id
// so Express does not treat "all" as an :id param value
router.get("/address/all",           getAllAddresses);   // ?search= &drone_id=
router.post("/address/bulk",         createAddressBulk);
router.delete("/address/:id",        deleteAddress);

export default router;
