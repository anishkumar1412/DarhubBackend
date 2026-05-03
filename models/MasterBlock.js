import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';
const MasterBlock = (sequelize, DataTypes) => sequelize.define('MasterBlock', {
  block_name: DataTypes.STRING,
  district_id: DataTypes.INTEGER,
  ...AuditFields,
}, {
  tableName: 'MASTER_BLOCK',
});

export default MasterBlock;
