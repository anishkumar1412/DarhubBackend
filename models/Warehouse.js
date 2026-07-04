import { DataTypes } from 'sequelize';
import AuditFields from './auditFields.js';

const Warehouse = (sequelize, DataTypes) => sequelize.define('Warehouse', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  warehouse_name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  warehouse_code: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  type: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  warehouse_category: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  capacity: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  status: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'Active',
  },
  ...AuditFields,
}, {
  tableName: 'warehouses',
  timestamps: false,
});

export default Warehouse;

