/**
 * controllers/inventoryDashboard.controller.js
 *
 * Aggregated stats for the 5 top metric cards on the Inventory & Assets page
 */

import db from '../models/index.js';

const { InventoryAccessory, InventoryDrone, InventoryShipment, MaintenanceLog, PurchaseOrder, Op } = db;

/**
 * GET /api/inventory/dashboard/stats
 * Returns all top-card metrics in one call
 */
export const getDashboardStats = async (req, res) => {
  try {
    // ── Card 1: Total Accessories Stock ──────────────────────────────────────
    const totalAccessoryItems = await InventoryAccessory.sum('quantity', { where: { is_active: true } }) || 0;
    const uniqueSkuCount = await InventoryAccessory.count({ where: { is_active: true } });
    const inventoryValue = await InventoryAccessory.findOne({
      attributes: [[db.sequelize.literal('SUM(quantity * unit_price)'), 'val']],
      where: { is_active: true },
      raw: true,
    });
    const lowStockCount = await InventoryAccessory.count({
      where: {
        is_active: true,
        [Op.and]: db.sequelize.literal('quantity < min_stock'),
      },
    });
    const outOfStockCount = await InventoryAccessory.count({
      where: { is_active: true, quantity: 0 },
    });

    // ── Card 2: Drones Active ─────────────────────────────────────────────────
    const totalDrones = await InventoryDrone.count({ where: { is_active: true } });
    const activeDrones = await InventoryDrone.count({
      where: { is_active: true, status: { [Op.like]: '%Active%' } },
    });
    const inMaintenanceDrones = await InventoryDrone.count({
      where: { is_active: true, status: { [Op.like]: '%Maintenance%' } },
    });

    // ── Card 3: Low Stock Alerts (same as above) ───────────────────────────────
    // already calculated: lowStockCount

    // ── Card 4: In Transit ────────────────────────────────────────────────────
    const inTransitShipments = await InventoryShipment.count({
      where: { is_active: true, status: { [Op.like]: '%Transit%' } },
    });
    const inTransitUnits = await InventoryShipment.sum('total_units', {
      where: { is_active: true, status: { [Op.like]: '%Transit%' } },
    }) || 0;
    const delayedShipments = await InventoryShipment.count({
      where: { is_active: true, status: { [Op.like]: '%Delayed%' } },
    });
    const deliveredShipments = await InventoryShipment.count({
      where: { is_active: true, status: { [Op.like]: '%Delivered%' } },
    });

    // ── Card 5: Maintenance ───────────────────────────────────────────────────
    const totalMaintenanceCost = await MaintenanceLog.sum('cost_value', { where: { is_active: true } }) || 0;
    const totalMaintenanceLogs = await MaintenanceLog.count({ where: { is_active: true } });
    const openMaintenanceLogs = await MaintenanceLog.count({
      where: { is_active: true, status: { [Op.notIn]: ['Resolved'] } },
    });
    const resolvedMaintenanceLogs = await MaintenanceLog.count({
      where: { is_active: true, status: 'Resolved' },
    });
    const pendingPOCount = await PurchaseOrder.count({
      where: { is_active: true, status: { [Op.in]: ['Draft', 'Submitted'] } },
    });

    return res.status(200).json({
      success: true,
      data: {
        accessories: {
          totalItems: totalAccessoryItems,
          total_items: totalAccessoryItems,
          total_quantity: totalAccessoryItems,
          uniqueSku: uniqueSkuCount,
          unique_sku: uniqueSkuCount,
          lowStockCount,
          low_stock_count: lowStockCount,
          out_of_stock_count: outOfStockCount,
          inventoryValue: parseFloat(inventoryValue?.val || 0),
          inventory_value: parseFloat(inventoryValue?.val || 0),
        },
        drones: {
          total: totalDrones,
          active: activeDrones,
          in_maintenance: inMaintenanceDrones,
        },
        transit: {
          shipmentCount: inTransitShipments,
          shipment_count: inTransitShipments,
          totalUnits: inTransitUnits,
          total_units: inTransitUnits,
          in_transit: inTransitShipments,
          delayed: delayedShipments,
          delivered: deliveredShipments,
        },
        shipments: {
          in_transit: inTransitShipments,
          delayed: delayedShipments,
          delivered: deliveredShipments,
          total_units: inTransitUnits,
        },
        maintenance: {
          totalCost: totalMaintenanceCost,
          total_cost: totalMaintenanceCost,
          total_logs: totalMaintenanceLogs,
          openLogs: openMaintenanceLogs,
          open_logs: openMaintenanceLogs,
          pending: openMaintenanceLogs,
          resolved: resolvedMaintenanceLogs,
          pendingPO: pendingPOCount,
          pending_po: pendingPOCount,
        },
        purchase_orders: {
          active: pendingPOCount,
        },
      },
    });
  } catch (err) {
    console.error('getDashboardStats error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: err.message });
  }
};
