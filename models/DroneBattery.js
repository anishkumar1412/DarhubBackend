
import sequelize from "./index.js"


import { DataTypes } from 'sequelize';

import AuditFields from './auditFields.js';

const DroneBattery = (sequelize, DataTypes) => sequelize.define('DroneBattery', {
  drone_id: DataTypes.INTEGER,
  battery_id: DataTypes.INTEGER,
  battery_qty: DataTypes.INTEGER,
  ...AuditFields,
}, {
  tableName: 'DRONE_BATTERY',
});

export default DroneBattery;
