import express from "express";
import {
  createWarehouse,
  getAllWarehouses,
  getWarehouseById,
  updateWarehouse,
  deleteWarehouse,
} from "../controllers/Warehouse.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// CRUD endpoints for Warehouses
router.post("/filter", getAllWarehouses);
router.get("/:id", getWarehouseById);
// router.post("/", authenticate, createWarehouse);
// router.put("/:id", authenticate, updateWarehouse);
// router.delete("/:id", authenticate, deleteWarehouse);
router.post("/", createWarehouse);
router.put("/:id", updateWarehouse);
router.delete("/:id", deleteWarehouse);

export default router;
