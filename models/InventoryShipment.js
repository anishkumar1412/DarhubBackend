import AuditFields from './auditFields.js';

const InventoryShipment = (sequelize, DataTypes) =>
  sequelize.define(
    'InventoryShipment',
    {
      shipment_code: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'e.g. SHIP-BATT-001',
      },
      shipment_type: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'e.g. (Flight Pack Bulk), (Sensitive Payload)',
      },
      item_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      origin: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      destination: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      dispatch_date: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      estimated_arrival: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'In Transit (On-Time), Delayed, Delivered',
      },
      tracking_awb: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Air Waybill tracking number',
      },
      courier_partner: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      total_units: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      order_value: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      ...AuditFields,
    },
    {
      tableName: 'INVENTORY_SHIPMENT',
    }
  );

export default InventoryShipment;
