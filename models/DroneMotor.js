import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const DroneMotor = (sequelize, DataTypes) => sequelize.define('DroneMotor', {
  drone_id: DataTypes.INTEGER,
  motor_id: DataTypes.INTEGER,
  motor_qty: DataTypes.INTEGER,
  ...AuditFields,
}, {
  tableName: 'DRONE_MOTOR',
});
 
export default DroneMotor;
