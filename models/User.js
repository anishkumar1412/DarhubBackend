import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const User  = (sequelize, DataTypes) => sequelize.define('User', {
  email: DataTypes.STRING,
  password: DataTypes.STRING,
  username: DataTypes.STRING,
  mobile_number: DataTypes.STRING,
  is_superuser: DataTypes.BOOLEAN,
  user_type: DataTypes.INTEGER,
  isMobileVerify: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  },
  isEmailVerify: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  },
  user_ref_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  ...AuditFields,
}, {
  tableName: 'USER',
});

export default User;