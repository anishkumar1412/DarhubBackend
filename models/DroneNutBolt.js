import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const DroneNutBolt = (sequelize, DataTypes) => sequelize.define('DroneNutBolt', {
  drone_id: DataTypes.INTEGER,
  bolt_type_id: DataTypes.INTEGER,
  nut_type_id: DataTypes.INTEGER,
  bolt_qty: DataTypes.INTEGER,
  ...AuditFields,
}, {
  tableName: 'DRONE_NUT_BOLT',
});

export default DroneNutBolt;
