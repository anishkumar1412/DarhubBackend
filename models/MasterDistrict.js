import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const MasterDistrict = (sequelize, DataTypes) =>sequelize.define('MasterDistrict', {
  district_name: DataTypes.STRING,
  state_id: DataTypes.INTEGER,
  ...AuditFields,
}, {
  tableName: 'MASTER_DISTRICT',
});

export default MasterDistrict;
