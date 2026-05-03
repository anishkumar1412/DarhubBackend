import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';
const UserQualification = sequelize.define('UserQualification', {
  user_id: DataTypes.INTEGER,
  qualification_type: DataTypes.INTEGER,
  percentage: DataTypes.FLOAT,
  cgpa: DataTypes.FLOAT,
  grade: DataTypes.STRING,
  ...AuditFields,
}, {
  tableName: 'USER_QUALIFICATION',
});

export default UserQualification;
