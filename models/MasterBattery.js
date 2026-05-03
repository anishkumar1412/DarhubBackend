import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const MasterBattery = (sequelize, DataTypes) => sequelize.define('MasterBattery', {
  name: DataTypes.STRING,
  brand_name: DataTypes.STRING,
  capacity: DataTypes.INTEGER,
  cell_number: DataTypes.INTEGER,
  desc: DataTypes.STRING,
  ...AuditFields,
}, {
  tableName: 'MASTER_BATTERY',
});

export default MasterBattery;
