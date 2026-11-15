import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const MasterState =  (sequelize, DataTypes) =>sequelize.define('MasterState', {
  state_name: DataTypes.STRING,
  // Official Local Government Directory (LGD) code; null for rows that were added by hand
  lgd_code: { type: DataTypes.INTEGER, allowNull: true },
  ...AuditFields,
}, {
  tableName: 'MASTER_STATE',
});

export default MasterState;
