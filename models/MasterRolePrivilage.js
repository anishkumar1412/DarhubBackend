import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const MasterRolePrivilage =(sequelize, DataTypes) => sequelize.define('MasterRolePrivilage', {
  role_id: DataTypes.INTEGER,
  privilage_id: DataTypes.INTEGER,
  ...AuditFields,
}, {
  tableName: 'MASTER_ROLE_PRIVILAGE',
});

export default MasterRolePrivilage;
