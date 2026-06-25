/**
 * controllers/dashboardSummary.controller.js
 *
 * GET /api/inventory/dashboard-summary
 *
 * Returns ONLY the numbers needed for the top tab cards + sub-metric cards
 * on the Inventory page — without pulling full row data for every section.
 * This replaces the previous pattern of calling all 6 list endpoints on
 * page load just to compute counts.
 *
 * Response shape:
 * {
 *   success: true,
 *   data: {
 *     accessories: { totalQty, uniqueSkus, invValue, avgPerDrone },
 *     drones:      { activeToday, fleetSize, inMaintenance, activePilots },
 *     lowStock:    { count, outOfStock, restockCost },
 *     transit:     { transitUnits, dispatches, delivered, delayed },
 *     maintenance: { open, resolved, pendingStock, maintCost, healthScore }
 *   }
 * }
 */

import db from "../models/index.js";

const { InventoryAccessory, Drone1, MaintenanceLog, InventoryShipment, User, UserRole, MasterRole,InventoryDrone, Op, sequelize } = db;

export const getDashboardSummary = async (req, res) => {
  try {
    // ── ACCESSORIES ──────────────────────────────────────────────
    const accessories = await InventoryAccessory.findAll({
      attributes: ["quantity", "min_stock", "unit_price", "sku"],
    });
    const totalQty   = accessories.reduce((s, a) => s + (Number(a.quantity) || 0), 0);
    const uniqueSkus = new Set(accessories.map(a => a.sku).filter(Boolean)).size;
    const invValue   = accessories.reduce((s, a) => s + (Number(a.quantity) || 0) * (Number(a.unit_price) || 0), 0);

    // ── LOW STOCK (quantity <= min_stock) ───────────────────────
    const lowStockItems = accessories.filter(a => (Number(a.quantity) || 0) <= (Number(a.min_stock) || 0));
    const outOfStock    = lowStockItems.filter(a => (Number(a.quantity) || 0) <= 0).length;
    const restockCost   = lowStockItems.reduce((s, a) => {
      const need = Math.max((Number(a.min_stock) || 0) - (Number(a.quantity) || 0), 0);
      return s + need * (Number(a.unit_price) || 0);
    }, 0);

    // ── DRONES ───────────────────────────────────────────────────
    const today = new Date().toISOString().split("T")[0];

    const fleetSize = await Drone1.count({ where: { is_active: true } });

    const activeToday = await Drone1.count({
      where: {
        is_active: true,
        daily_status: true,
        [Op.or]: [
          { daily_status_date: today },
          { daily_status_date: null }, // edge case: stale not yet reset
        ],
      },
    });

    const inMaintenance = await InventoryDrone.count({
      where: { is_active: true, status: { [Op.iLike]: "%maintenance%" } },
    });

    const avgPerDrone = fleetSize > 0 ? Math.round(totalQty / fleetSize) : 0;

    // ── ACTIVE PILOTS (USER + UserRole + MasterRole = 'pilot') ─────
    const pilotRoles = await MasterRole.findAll({
      where: { role_name: { [Op.iLike]: "pilot" }, is_active: true },
      attributes: ["id"],
    });
    const pilotRoleIds = pilotRoles.map(r => r.id);

    let activePilotsCount = 0;
    if (pilotRoleIds.length > 0) {
      const userRoles = await UserRole.findAll({
        where: { role_id: { [Op.in]: pilotRoleIds } },
        attributes: ["user_id"],
      });
      const userIds = Array.from(new Set(userRoles.map(ur => ur.user_id)));
      if (userIds.length > 0) {
        activePilotsCount = await User.count({
          where: { id: { [Op.in]: userIds }, is_active: true },
        });
      }
    }

    // ── InventoryShipmentS / TRANSIT ─────────────────────────────────────
    const shipments = await InventoryShipment.findAll({
      attributes: ["status", "total_units"],
    });
    const transitUnits = shipments.reduce((s, sh) => s + (Number(sh.total_units) || 1), 0);
    const dispatches   = shipments.length;
    const delivered    = shipments.filter(sh => /delivered/i.test(sh.status || "")).length;
    const delayed      = shipments.filter(sh => /delayed/i.test(sh.status || "")).length;

    // ── MAINTENANCE ──────────────────────────────────────────────
    const maintenanceLogs = await MaintenanceLog.findAll({
      attributes: ["status", "cost_value"],
    });
    const open         = maintenanceLogs.filter(m => !/resolved/i.test(m.status || "")).length;
    const resolved     = maintenanceLogs.filter(m => /resolved/i.test(m.status || "")).length;
    const pendingStock = maintenanceLogs.filter(m => /pending stock/i.test(m.status || "")).length;
    const maintCost    = maintenanceLogs.reduce((s, m) => s + (Number(m.cost_value) || 0), 0);
    const healthScore  = maintenanceLogs.length ? Math.round((resolved / maintenanceLogs.length) * 100) : 0;

    return res.status(200).json({
      success: true,
      data: {
        accessories: { totalQty, uniqueSkus, invValue, avgPerDrone },
        drones:      { activeToday, fleetSize, inMaintenance, activePilots: activePilotsCount },
        lowStock:    { count: lowStockItems.length, outOfStock, restockCost },
        transit:     { transitUnits, dispatches, delivered, delayed },
        maintenance: { open, resolved, pendingStock, maintCost, healthScore },
      },
    });
  } catch (err) {
    console.error("getDashboardSummary error:", err);
    return res.status(500).json({ success: false, message: "Internal server error.", error: err.message });
  }
};