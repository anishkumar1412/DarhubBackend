import { DataTypes } from 'sequelize';
import AuditFields from './auditFields.js';

const WarehouseLocation = (sequelize, DataTypes) => sequelize.define('WarehouseLocation', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  warehouse_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  address_line_1: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  address_line_2: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  state: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  district: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  city_location: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  pincode: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  latitude: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  longitude: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  ...AuditFields,
}, {
  tableName: 'warehouse_locations',
  timestamps: false,
});

export default WarehouseLocation;
