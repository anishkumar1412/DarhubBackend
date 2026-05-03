import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const MasterPrivilage =  (sequelize, DataTypes) => sequelize.define('MasterPrivilage', {
  privilage_name: DataTypes.STRING,
  privilage_desc: DataTypes.STRING,
  ...AuditFields,
}, {
  tableName: 'MASTER_PRIVILAGE',
});

export default MasterPrivilage;
