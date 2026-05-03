import express from "express";
import {
  getStates,
  getDistrictsByState,
  getBlocksByDistrict,
} from "../controllers/locationController.js";

const router = express.Router();

// All states
router.get("/states", getStates);

// Get districts by state ID
router.get("/districts/:state_id", getDistrictsByState);

// Get blocks by district ID
router.get("/blocks/:district_id", getBlocksByDistrict);

export default router;
