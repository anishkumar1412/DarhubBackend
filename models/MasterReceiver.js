import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const MasterReceiver = (sequelize, DataTypes) => sequelize.define('MasterReceiver', {
  name: DataTypes.STRING,
  brand_name: DataTypes.STRING,
  receiver_type: DataTypes.STRING,
  desc: DataTypes.STRING,
  ...AuditFields,
}, {
  tableName: 'MASTER_RECEIVER',
});

export default MasterReceiver;
