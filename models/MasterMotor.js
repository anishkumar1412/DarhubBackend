import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const MasterMotor = (sequelize, DataTypes) => sequelize.define('MasterMotor', {
  name: DataTypes.STRING,
  brand_name: DataTypes.STRING,
  desc: DataTypes.STRING,
  ...AuditFields,
}, {
  tableName: 'MASTER_MOTOR',
});

export default MasterMotor;
