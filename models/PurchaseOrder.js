<<<<<<< HEAD
import { DataTypes } from 'sequelize';
import sequelize from "./index.js";
import AuditFields from './auditFields.js';

const PurchaseOrder = (sequelize, DataTypes) => sequelize.define('PurchaseOrder', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  po_number: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  supplier_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  order_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'PENDING',
  },
  total_amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  },
  ...AuditFields,
}, {
  tableName: 'purchase_orders',
  timestamps: false,
});
=======
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
>>>>>>> 57db33b73037736565fcc0730ab667ce41a3bb86

export default PurchaseOrder;
