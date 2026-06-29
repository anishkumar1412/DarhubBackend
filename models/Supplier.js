import { DataTypes } from 'sequelize';
import sequelize from "./index.js";
import AuditFields from './auditFields.js';

const Supplier = (sequelize, DataTypes) => sequelize.define('Supplier', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  supplier_name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  contact_person: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  ...AuditFields,
}, {
  tableName: 'suppliers',
  timestamps: false,
});

export default Supplier;
