<<<<<<< HEAD
import { DataTypes } from 'sequelize';
import sequelize from "./index.js";
import AuditFields from './auditFields.js';

const SalesOrder = (sequelize, DataTypes) => sequelize.define('SalesOrder', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  sales_order_no: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  customer_id: {
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
  tableName: 'sales_orders',
  timestamps: false,
});
=======
import AuditFields from './auditFields.js';

const SalesOrder = (sequelize, DataTypes) =>
  sequelize.define(
    'SalesOrder',
    {
      sales_order_no: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        comment: 'Auto-generated sales order number',
      },
      customer_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'FK to User (Pilot or Owner raising complaint)',
      },
      maintenance_task_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'FK to PilotMaintenanceTask if created from a maintenance form',
      },
      maintenance_log_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Manual linkage to MaintenanceLog',
      },
      order_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('Pending', 'Approved', 'Shipped', 'Delivered', 'Cancelled'),
        allowNull: false,
        defaultValue: 'Pending',
      },
      total_amount: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
      },
      ...AuditFields,
    },
    {
      tableName: 'SALES_ORDER',
    }
  );
>>>>>>> 97afd87e400d625576914ee638f11570197fef88

export default SalesOrder;
