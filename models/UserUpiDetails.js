import { DataTypes } from 'sequelize';
import sequelize from "./index.js";
import AuditFields from './auditFields.js';

const UserUpiDetails = (sequelize, DataTypes) => sequelize.define('UserUpiDetails', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  upi_id: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  ...AuditFields,
}, {
  tableName: "USER_UPI_DETAILS",
  timestamps: false,
});

export default UserUpiDetails;
