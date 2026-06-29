import { DataTypes } from 'sequelize';
import sequelize from "./index.js";
import AuditFields from './auditFields.js';

const Product = (sequelize, DataTypes) => sequelize.define('Product', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  product_code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  product_name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  category_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  unit_price: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  },
  reorder_level: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 10,
  },
  ...AuditFields,
}, {
  tableName: 'products',
  timestamps: false,
});

export default Product;
