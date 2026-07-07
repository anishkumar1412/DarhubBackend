import { DataTypes } from 'sequelize';
import sequelize from "./index.js";
import AuditFields from './auditFields.js';

const Stock = (sequelize, DataTypes) => sequelize.define('Stock', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  warehouse_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  ...AuditFields,
}, {
  tableName: 'stock',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['product_id', 'warehouse_id'],
    },
  ],
});

export default Stock;
