import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const MasterArms = (sequelize, DataTypes) => sequelize.define('MasterArms', {
  name: DataTypes.STRING,
  brand_name: DataTypes.STRING,
   description: DataTypes.STRING,
  ...AuditFields,
}, {
  tableName: 'MASTER_ARMS',
});

export default MasterArms;
