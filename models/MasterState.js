import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const MasterState =  (sequelize, DataTypes) =>sequelize.define('MasterState', {
  state_name: DataTypes.STRING,
  ...AuditFields,
}, {
  tableName: 'MASTER_STATE',
});

export default MasterState;
