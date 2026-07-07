import { DataTypes } from 'sequelize';
import sequelize from "./index.js";
import AuditFields from './auditFields.js';

const UserBankDetails = (sequelize, DataTypes) => sequelize.define('UserBankDetails', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  bank_name: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  acc_holder_name: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  acc_number: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  ifsc_code: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  passbook_image_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  is_primary: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  ...AuditFields,
}, {
  tableName: "USER_BANK_DETAILS",
  timestamps: false,
});

export default UserBankDetails;
