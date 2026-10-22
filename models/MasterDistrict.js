import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const MasterDistrict = (sequelize, DataTypes) =>sequelize.define('MasterDistrict', {
  district_name: DataTypes.STRING,
  state_id: DataTypes.INTEGER,
  // Official Local Government Directory (LGD) code; null for rows that were added by hand
  lgd_code: { type: DataTypes.INTEGER, allowNull: true },
  ...AuditFields,
}, {
  tableName: 'MASTER_DISTRICT',
});

export default MasterDistrict;
