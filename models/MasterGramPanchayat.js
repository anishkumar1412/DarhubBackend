import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const MasterGramPanchayat = (sequelize, DataTypes) => sequelize.define('MasterDistrict', {
  gram_panchayat_name: DataTypes.STRING,
  block_id:DataTypes.INTEGER,
  ...AuditFields,
}, {
  tableName: 'MASTER_GRAMPANCHAYAT',
});

export default MasterGramPanchayat;
