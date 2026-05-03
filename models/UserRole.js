import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const UserRole = (sequelize, DataTypes) => sequelize.define('UserRole', {
  user_id: DataTypes.INTEGER,
  role_id: DataTypes.INTEGER,
  ...AuditFields,
}, {
  tableName: 'USER_ROLE',
});

export default UserRole;


// user address profile role 
