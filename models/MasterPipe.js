import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const MasterPipe =(sequelize, DataTypes) => sequelize.define('MasterPipe', {
  name: DataTypes.STRING,
  brand_name: DataTypes.STRING,
  desc: DataTypes.STRING,
  ...AuditFields,
}, {
  tableName: 'MASTER_PIPE',
});

export default MasterPipe;
