'use strict';
/**
 * DEMO / DEVELOPMENT ONLY — never run in production (`npm run db:seed:demo`).
 *
 * Fills the inventory dashboard tables (accessories, drones, shipments, maintenance logs) with the sample data the
 * admin panel's dashboard was designed against. Each table is filled only while it is empty, so re-running changes
 * nothing, and it never touches a table that already holds real rows.
 */

// ── sample data (unchanged from the former seeders/inventorySeeder.js) ───────────────────────────────────────────
const ACCESSORIES = [
  { sku: "BAT-DJI-AG12", name: "DJI Agras Battery", description: "Drone #AGM-12S-8", location: "Site Alpha / Drone #DR-001", assigned_pilot: "Rakesh Kumar", quantity: 23, min_stock: 10, status: "In Use (16) / In Stock (7)", unit_price: 120 },
  { sku: "GIM-DJI-ZH20", name: "Zenmuse H20 Gimbal", description: "SKU: DJI-ZH20", location: "Site Alpha / Drone #DR-002", assigned_pilot: "Amit Patel", quantity: 1, min_stock: 0, status: "In Use", unit_price: 350 },
  { sku: "SKU-PRP-T30X", name: "Propeller", description: "SKU: Propeller (T-sort)", location: "Bhubaneswar HQ (Hub A)", assigned_pilot: "Unassigned", quantity: 15, min_stock: 20, status: "Good", unit_price: 15 },
  { sku: "ESC-HW-100A", name: "Hobbywing 100A ESC", description: "SKU: HWE-100A", location: "Central Warehouse", assigned_pilot: "Unassigned", quantity: 2, min_stock: 5, status: "Restock Needed", unit_price: 45 },
  { sku: "BAT-TATTU-12S", name: "Tattu 22000mAh", description: "12S Solid State", location: "Hub B", assigned_pilot: "Vikram Singh", quantity: 8, min_stock: 5, status: "In Stock", unit_price: 120 },
  { sku: "PMP-BRSH-16", name: "Brushless Pump", description: "For 16L tanks", location: "Bhubaneswar HQ (Hub A)", assigned_pilot: "Unassigned", quantity: 0, min_stock: 2, status: "Out of Stock", unit_price: 80 },
];

const DRONES = [
  { drone_code: "DRN-001", drone_type: "(EFT E416P)", pilot: "Rakesh Kumar", location: "Site Alpha (Bhubaneswar)", current_mission: "Nano Urea Spraying", status: "Active (Flying)", attached_parts: "Jiyi FC (1), Tattu 12S (4)" },
  { drone_code: "DRN-002", drone_type: "(Custom 16L Quad)", pilot: "Amit Patel", location: "Rahansa Village", current_mission: "Field Mapping", status: "Idle (On Site)", attached_parts: "VK FC (1), Tattu 12S (2)" },
  { drone_code: "DRN-003", drone_type: "(EFT E610P Hexa)", pilot: "Amit Patel", location: "Rahansa Village", current_mission: "Field Mapping", status: "Idle (On Site)", attached_parts: "VK FC (1), Tattu 12S (2)" },
  { drone_code: "DRN-004", drone_type: "(EFT E610P Hexa)", pilot: "Unassigned", location: "Central Warehouse", current_mission: "Firmware Update", status: "In Maintenance", attached_parts: "No FC, No Battery" },
  { drone_code: "DRN-005", drone_type: "(Agras T30)", pilot: "Vikram Singh", location: "Hub B", current_mission: "Pesticide Spray", status: "Active (Flying)", attached_parts: "DJI FC (1), DJI Bat (2)" },
];

const SHIPMENTS = [
  { shipment_code: "SHIP-BATT-001", shipment_type: "(Flight Pack Bulk)", item_name: "DJI Agras Battery 12S (Qty: 20)", origin: "Bhubaneswar HQ", destination: "Site Alpha", dispatch_date: "14 May 2026", estimated_arrival: "17 May 2026", status: "In Transit (On-Time)", tracking_awb: "BLR123456789", courier_partner: "BlueDart Express", total_units: 20, order_value: 32200 },
  { shipment_code: "SHIP-GIMB-005", shipment_type: "(Sensitive Payload)", item_name: "Zenmuse H20 Gimbal (Qty: 2)", origin: "Bhubaneswar HQ", destination: "Rahansa Village", dispatch_date: "12 May 2026", estimated_arrival: "16 May 2026", status: "Delayed (1 Day)", tracking_awb: "BLR246810135", courier_partner: "BlueDart Express", total_units: 2, order_value: 18500 },
  { shipment_code: "SHIP-ESC-010", shipment_type: "(Repair Parts)", item_name: "Hobbywing 100A ESC (Qty: 15)", origin: "Central Warehouse", destination: "Bhubaneswar HQ", dispatch_date: "15 May 2026", estimated_arrival: "16 May 2026", status: "In Transit (Processing)", tracking_awb: "BLR369121518", courier_partner: "DTDC", total_units: 15, order_value: 14400 },
  { shipment_code: "SHIP-PRP-022", shipment_type: "(Consumables)", item_name: "Propeller Set (Qty: 50)", origin: "Hub B", destination: "Site Alpha", dispatch_date: "16 May 2026", estimated_arrival: "18 May 2026", status: "In Transit (On-Time)", tracking_awb: "BLR481216200", courier_partner: "Delhivery", total_units: 50, order_value: 9500 },
];

const MAINTENANCE_LOGS = [
  {
    date: "19 May 2026", log_ref: "#MNT-892", drone_code: "DRN-001", drone_type: "(EFT E416P)",
    component: "Hobbywing 100A ESC", component_sku: "(SKU: ESC-HW-100)", reason: "Electrical Burnout",
    action_taken: "Swapped 1x New ESC", cost: "₹9,800", cost_value: 9800, status: "Resolved",
    flight_hours: "210.5", pilot: "Rakesh Kumar", location: "Site Alpha (Bhubaneswar)",
    incident_date: "19 May 2026 – 09:45 AM",
    pilot_statement: "Encountered unexpected voltage drop during active spraying mission. ESC emitted burning smell mid-flight. Drone auto-landed via failsafe. Grounded immediately for inspection.",
    telemetry_batt: "44.2V", telemetry_rpm: "+18% (M3)", telemetry_fc: "Auto-RTL",
    damaged_sku: "ESC-HW-100A", damaged_name: "Hobbywing 100A ESC",
    replacement_sku: "ESC-HW-100A-NEW", replacement_name: "Hobbywing 100A ESC (New)",
    replacement_serial: "S/N: HW-ESC-2021",
    original_cost: 9800, replacement_cost: 0, labor_hours: 2, total_impact: "₹9,800",
    approved_by: "Rakesh Kumar", digital_id: "RC-HUB-01",
    part_name: "Hobbywing 100A ESC", part_sku: "ESC-HW-100A", current_stock: 2, min_stock: 5, unit_price: 45,
  },
  {
    date: "18 May 2026", log_ref: "#DMG-104", drone_code: "DRN-002", drone_type: "(Custom 16L Quad)",
    component: "Carbon Fiber Propeller", component_sku: "(SKU: PROP-30IN)", reason: "Propeller Crack via Kinetic Impact",
    action_taken: "Swapped 2x Propellers", cost: "₹4,500", cost_value: 4500, status: "Resolved",
    flight_hours: "142.5", pilot: "Amit Patel", location: "Rahansa Village (Cuttack District)",
    incident_date: "18 May 2026 – 11:22 AM",
    pilot_statement: "Encountered unexpected low-altitude wind shear during Nano Urea spraying. Drone drifted from flight path. Conducted emergency hard landing on uneven, rocky terrain. Kinetic impact observed on port-side propeller.",
    telemetry_batt: "43.8V", telemetry_rpm: "+25% (M2)", telemetry_fc: "Corrective (Diminished)",
    damaged_sku: "ESC-HW-100A", damaged_name: "Hobbywing 100A ESC (SKU: ESC-HW-100) — Deducted from Stock",
    replacement_sku: "BAT-JIYI-12S", replacement_name: "Tattu 12S Battery",
    replacement_serial: "S/N: T-BAT-4501 (Issued from Cuttack Mobile Stock Kit)",
    original_cost: 9800, replacement_cost: 4500, labor_hours: 1.5, total_impact: "₹14,300",
    approved_by: "Rakesh Kumar", digital_id: "RC-HUB-01",
    part_name: "Carbon Fiber Propeller 30-inch", part_sku: "PROP-30IN", current_stock: 10, min_stock: 20, unit_price: 15,
  },
  {
    date: "18 May 2026", log_ref: "#MNT-890", drone_code: "DRN-003", drone_type: "(EFT E610P)",
    component: "Jiyi K++ V2 FC", component_sku: "(SKU: BAT-JIYI-12S)", reason: "Firmware Desync",
    action_taken: "None (Recalibrated)", cost: "₹0 (Labor)", cost_value: 0, status: "In Progress",
    flight_hours: "87.0", pilot: "Amit Patel", location: "Rahansa Village",
    incident_date: "18 May 2026 – 08:30 AM",
    pilot_statement: "Pre-flight checks revealed compass and IMU desync after overnight firmware push. All axis calibration failed on first attempt. Recalibration performed twice. Drone held for second verification flight.",
    telemetry_batt: "46.1V", telemetry_rpm: "Nominal", telemetry_fc: "Calibration Pending",
    damaged_sku: "FC-JIYI-KPP", damaged_name: "Jiyi K++ V2 Flight Controller",
    replacement_sku: "N/A", replacement_name: "No replacement — Recalibrated",
    replacement_serial: "N/A",
    original_cost: 0, replacement_cost: 0, labor_hours: 3, total_impact: "₹0 (Labor Only)",
    approved_by: "Amit Patel", digital_id: "AP-HUB-02",
    part_name: "Jiyi K++ V2 FC", part_sku: "FC-JIYI-KPP", current_stock: 1, min_stock: 2, unit_price: 220,
  },
  {
    date: "17 May 2026", log_ref: "#DMG-103", drone_code: "DRN-001", drone_type: "(EFT E416P)",
    component: "Liquid Spraying Pump", component_sku: "(SKU: PMP-BRSH-16)", reason: "Pump Seizure",
    action_taken: "Awaiting Stock", cost: "₹12,000", cost_value: 12000, status: "Pending Stock",
    flight_hours: "195.0", pilot: "Rakesh Kumar", location: "Site Alpha (Bhubaneswar)",
    incident_date: "17 May 2026 – 14:10 PM",
    pilot_statement: "Pump failed to prime during mid-mission refill. Brushless motor seized likely due to sediment blockage from chemical residue. Drone returned to base with partial payload.",
    telemetry_batt: "41.5V", telemetry_rpm: "Stable", telemetry_fc: "Manual Override",
    damaged_sku: "PMP-BRSH-16", damaged_name: "Brushless Pump (16L)",
    replacement_sku: "PMP-BRSH-16", replacement_name: "Brushless Pump (16L) — Awaiting Stock",
    replacement_serial: "N/A (Pending)",
    original_cost: 12000, replacement_cost: 0, labor_hours: 1, total_impact: "₹12,000",
    approved_by: "Rakesh Kumar", digital_id: "RC-HUB-01",
    part_name: "Brushless Pump 16L", part_sku: "PMP-BRSH-16", current_stock: 0, min_stock: 2, unit_price: 80,
  },
  {
    date: "16 May 2026", log_ref: "#MNT-885", drone_code: "DRN-004", drone_type: "(EFT E610P Hexa)",
    component: "Motor Mount", component_sku: "(SKU: MNT-MTR-01)", reason: "Wear & Tear",
    action_taken: "Swapped Mount", cost: "₹1,200", cost_value: 1200, status: "Resolved",
    flight_hours: "320.0", pilot: "Unassigned", location: "Central Warehouse",
    incident_date: "16 May 2026 – 10:00 AM",
    pilot_statement: "Routine inspection revealed visible wear on M4 motor mount bracket. Micro-cracks detected under UV inspection. Replaced preventively before next mission deployment.",
    telemetry_batt: "N/A (Ground)", telemetry_rpm: "N/A", telemetry_fc: "Offline (Maintenance)",
    damaged_sku: "MNT-MTR-01", damaged_name: "Motor Mount Basic",
    replacement_sku: "MNT-MTR-01", replacement_name: "Motor Mount Basic (New)",
    replacement_serial: "S/N: MT-01-2024",
    original_cost: 1200, replacement_cost: 0, labor_hours: 0.5, total_impact: "₹1,200",
    approved_by: "Warehouse Manager", digital_id: "WH-MAIN",
    part_name: "Motor Mount Basic", part_sku: "MNT-MTR-01", current_stock: 3, min_stock: 10, unit_price: 5,
  },
];

const TABLES = [
  ['INVENTORY_ACCESSORY', ACCESSORIES],
  ['INVENTORY_DRONE', DRONES],
  ['INVENTORY_SHIPMENT', SHIPMENTS],
  ['MAINTENANCE_LOG', MAINTENANCE_LOGS],
];

module.exports = {
  async up(queryInterface) {
    const { sequelize } = queryInterface;
    const now = new Date();
    for (const [table, rows] of TABLES) {
      const [[{ count }]] = await sequelize.query(`SELECT count(*)::int AS count FROM "${table}"`);
      if (count > 0) {
        console.log(`  ${table}: already has ${count} row(s), skipped`);
        continue;
      }
      await queryInterface.bulkInsert(table, rows.map((row) => ({ ...row, is_active: true, created_on: now, createdAt: now, updatedAt: now })));
      console.log(`  ${table}: seeded ${rows.length} row(s)`);
    }
  },

  async down(queryInterface) {
    // Only the rows this seeder created, identified by their natural keys
    const { sequelize } = queryInterface;
    const quote = (values) => values.map((v) => sequelize.escape(v)).join(', ');
    await sequelize.query(`DELETE FROM "INVENTORY_ACCESSORY" WHERE sku IN (${quote(ACCESSORIES.map((r) => r.sku))})`);
    await sequelize.query(`DELETE FROM "INVENTORY_DRONE" WHERE drone_code IN (${quote(DRONES.map((r) => r.drone_code))})`);
    await sequelize.query(`DELETE FROM "INVENTORY_SHIPMENT" WHERE shipment_code IN (${quote(SHIPMENTS.map((r) => r.shipment_code))})`);
    await sequelize.query(`DELETE FROM "MAINTENANCE_LOG" WHERE log_ref IN (${quote(MAINTENANCE_LOGS.map((r) => r.log_ref))})`);
  },
};
