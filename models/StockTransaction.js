import { DataTypes } from 'sequelize';
import sequelize from "./index.js";
import AuditFields from './auditFields.js';

const StockTransaction = (sequelize, DataTypes) => sequelize.define('StockTransaction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  warehouse_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  transaction_type: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  reference_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  remarks: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  ...AuditFields,
}, {
  tableName: 'stock_transactions',
  timestamps: false,
});

export default StockTransaction;
