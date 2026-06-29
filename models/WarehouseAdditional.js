import { DataTypes } from 'sequelize';
import AuditFields from './auditFields.js';

const WarehouseAdditional = (sequelize, DataTypes) => sequelize.define('WarehouseAdditional', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  warehouse_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  manager_name: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  manager_mobile: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  manager_email: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  ...AuditFields,
}, {
  tableName: 'warehouse_additional_info',
  timestamps: false,
});

export default WarehouseAdditional;
