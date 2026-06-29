import { DataTypes } from 'sequelize';
import sequelize from "./index.js";
import AuditFields from './auditFields.js';

const OtpVerification = (sequelize, DataTypes) => sequelize.define('OtpVerification', {
  email: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  mobile_number: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  email_otp: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  mobile_otp: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  is_email_verified: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  is_mobile_verified: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  ...AuditFields,
}, {
  tableName: 'OTP_VERIFICATION',
});

export default OtpVerification;
