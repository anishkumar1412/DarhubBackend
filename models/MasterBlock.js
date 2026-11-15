import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';
const MasterBlock = (sequelize, DataTypes) => sequelize.define('MasterBlock', {
  block_name: DataTypes.STRING,
  district_id: DataTypes.INTEGER,
  // Official Local Government Directory (LGD) code; null for rows that were added by hand
  lgd_code: { type: DataTypes.INTEGER, allowNull: true },
  ...AuditFields,
}, {
  tableName: 'MASTER_BLOCK',
});

export default MasterBlock;
