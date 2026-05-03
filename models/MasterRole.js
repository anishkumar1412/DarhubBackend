import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const MasterRole = (sequelize, DataTypes) => sequelize.define('MasterRole', {
  role_name: DataTypes.STRING,
  role_desc: DataTypes.STRING,
  ...AuditFields,
}, {
  tableName: 'MASTER_ROLE',
});
export default MasterRole;
