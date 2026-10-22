import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const MasterGramPanchayat = (sequelize, DataTypes) => sequelize.define('MasterDistrict', {
  gram_panchayat_name: DataTypes.STRING,
  block_id:DataTypes.INTEGER,
  // Official Local Government Directory (LGD) code; null for rows that were added by hand
  lgd_code: { type: DataTypes.INTEGER, allowNull: true },
  ...AuditFields,
}, {
  tableName: 'MASTER_GRAMPANCHAYAT',
});

export default MasterGramPanchayat;
