/**
 * routes/inventory.routes.js
 *
 * All routes for the Inventory & Assets module.
 * Mount in app.js as: app.use('/api/inventory', inventoryRouter)
 *
 * Route Summary:
 * ─────────────────────────────────────────────────────────────────────────────
 * ACCESSORIES (Tab 1 + Tab 3 Low Stock)
 *   GET    /accessories              – list all (with search/filter/pagination)
 *   GET    /accessories/stats        – top metric card stats
 *   GET    /accessories/low-stock    – items where qty < min_stock
 *   POST   /accessories              – create
 *   GET    /accessories/:id          – read one
 *   PUT    /accessories/:id          – update
 *   DELETE /accessories/:id          – soft delete
 *   PATCH  /accessories/:id/transfer – change location + pilot
 *
 * DRONES (Tab 2)
 *   GET    /drones                   – list all
 *   GET    /drones/stats             – metric cards
 *   POST   /drones                   – create
 *   GET    /drones/:id               – read one
 *   PUT    /drones/:id               – update
 *   DELETE /drones/:id               – soft delete
 *
 * VENDORS (used by PO & Low-Stock modals)
 *   GET    /vendors                  – list all
 *   POST   /vendors                  – create
 *   GET    /vendors/:id              – read one
 *   PUT    /vendors/:id              – update
 *   DELETE /vendors/:id              – soft delete
 *
 * PURCHASE ORDERS (Low-Stock Reorder modal + Maintenance Update modal)
 *   GET    /purchase-orders          – list all
 *   POST   /purchase-orders          – generate PO
 *   GET    /purchase-orders/:id      – read one
 *   PUT    /purchase-orders/:id      – update
 *   PATCH  /purchase-orders/:id/status – update status only
 *   DELETE /purchase-orders/:id      – soft delete
 *
 * SHIPMENTS / IN-TRANSIT (Tab 4 + Tracking modal)
 *   GET    /shipments                – list all
 *   GET    /shipments/stats          – metric cards
 *   POST   /shipments                – create
 *   GET    /shipments/:id            – read one (full tracking detail)
 *   PUT    /shipments/:id            – update
 *   PATCH  /shipments/:id/status     – update status (courier webhook)
 *   DELETE /shipments/:id            – soft delete
 *
 * MAINTENANCE LOGS (Tab 5 + Log Diagnostic modal + Update/PO modal)
 *   GET    /maintenance-logs         – list all
 *   GET    /maintenance-logs/stats   – metric cards
 *   POST   /maintenance-logs         – create
 *   GET    /maintenance-logs/:id     – read one (full diagnostic detail)
 *   PUT    /maintenance-logs/:id     – full update
 *   PATCH  /maintenance-logs/:id/status – status-only update
 *   DELETE /maintenance-logs/:id     – soft delete
 *
 * DASHBOARD
 *   GET    /dashboard/stats          – all 5 top metric cards in one call
 * ─────────────────────────────────────────────────────────────────────────────
 */

import express from "express";

import {
  createAccessory,
  getAllAccessories,
  getAccessoryById,
  updateAccessory,
  deleteAccessory,
  transferAccessory,
  getLowStockAccessories,
  getAccessoryStats,
} from "../controllers/inventoryaccesory.controller.js";

import {
  createDrone,
  getAllDrones,
  getDroneById,
  updateDrone,
  deleteDrone,
  getDroneStats,
} from "../controllers/inventorydrone.controller.js";

import {
  createVendor,
  getAllVendors,
  getVendorById,
  updateVendor,
  deleteVendor,
} from "../controllers/vendor.controller.js";

import {
  createPurchaseOrder,
  getAllPurchaseOrders,
  getPurchaseOrderById,
  updatePurchaseOrder,
  updatePOStatus,
  deletePurchaseOrder,
} from "../controllers/purchaseOrder.controller.js";

import {
  createShipment,
  getAllShipments,
  getShipmentById,
  updateShipment,
  updateShipmentStatus,
  deleteShipment,
  getShipmentStats,
} from "../controllers/inventoryShipment.controller.js";

import {
  createMaintenanceLog,
  getAllMaintenanceLogs,
  getMaintenanceLogById,
  updateMaintenanceLog,
  updateMaintenanceStatus,
  deleteMaintenanceLog,
  getMaintenanceStats,
} from "../controllers/maintainance.controller.js";

import { getDashboardStats } from "../controllers/inventoryDashboard.controller.js";

const router = express.Router();

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
router.get("/dashboard/stats", getDashboardStats);

// ─── ACCESSORIES ──────────────────────────────────────────────────────────────
router.get("/accessories/stats", getAccessoryStats);
router.get("/accessories/low-stock", getLowStockAccessories);
router.get("/accessories", getAllAccessories);
router.post("/accessories", createAccessory);
router.get("/accessories/:id", getAccessoryById);
router.put("/accessories/:id", updateAccessory);
router.delete("/accessories/:id", deleteAccessory);
router.patch("/accessories/:id/transfer", transferAccessory);

// ─── DRONES ───────────────────────────────────────────────────────────────────
router.get("/drones/stats", getDroneStats);
router.get("/drones", getAllDrones);
router.post("/drones", createDrone);
router.get("/drones/:id", getDroneById);
router.put("/drones/:id", updateDrone);
router.delete("/drones/:id", deleteDrone);

// ─── VENDORS ──────────────────────────────────────────────────────────────────
router.get("/vendors", getAllVendors);
router.post("/vendors", createVendor);
router.get("/vendors/:id", getVendorById);
router.put("/vendors/:id", updateVendor);
router.delete("/vendors/:id", deleteVendor);

// ─── PURCHASE ORDERS ──────────────────────────────────────────────────────────
router.get("/purchase-orders", getAllPurchaseOrders);
router.post("/purchase-orders", createPurchaseOrder);
router.get("/purchase-orders/:id", getPurchaseOrderById);
router.put("/purchase-orders/:id", updatePurchaseOrder);
router.patch("/purchase-orders/:id/status", updatePOStatus);
router.delete("/purchase-orders/:id", deletePurchaseOrder);

// ─── SHIPMENTS (IN-TRANSIT) ───────────────────────────────────────────────────
router.get("/shipments/stats", getShipmentStats);
router.get("/shipments", getAllShipments);
router.post("/shipments", createShipment);
router.get("/shipments/:id", getShipmentById);
router.put("/shipments/:id", updateShipment);
router.patch("/shipments/:id/status", updateShipmentStatus);
router.delete("/shipments/:id", deleteShipment);

// ─── MAINTENANCE LOGS ─────────────────────────────────────────────────────────
router.get("/maintenance-logs/stats", getMaintenanceStats);
router.get("/maintenance-logs", getAllMaintenanceLogs);
router.post("/maintenance-logs", createMaintenanceLog);
router.get("/maintenance-logs/:id", getMaintenanceLogById);
router.put("/maintenance-logs/:id", updateMaintenanceLog);
router.patch("/maintenance-logs/:id/status", updateMaintenanceStatus);
router.delete("/maintenance-logs/:id", deleteMaintenanceLog);

export default router;
