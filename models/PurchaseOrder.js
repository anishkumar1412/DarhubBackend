import AuditFields from './auditFields.js';

const PurchaseOrder = (sequelize, DataTypes) =>
  sequelize.define(
    'PurchaseOrder',
    {
      po_number: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Auto-generated PO number',
      },
      maintenance_log_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'FK to MaintenanceLog if PO originated from a maintenance event',
      },
      part_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      part_sku: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      vendor: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      order_quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      unit_price: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
      },
      logistics_cost: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
      },
      total_cost: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
      },
      target_hub: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      shelf_bin: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      special_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'Draft',
        comment: 'Draft, Submitted, In Progress, Delivered',
      },
      ...AuditFields,
    },
    {
      tableName: 'PURCHASE_ORDER',
    }
  );

export default PurchaseOrder;
