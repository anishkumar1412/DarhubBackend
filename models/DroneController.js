

import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const DroneController = (sequelize, DataTypes) => sequelize.define('DroneController', {
  drone_id: DataTypes.INTEGER,
  transmitter_id: DataTypes.INTEGER,
  receiver_id: DataTypes.INTEGER,
  ...AuditFields,
}, {
  tableName: 'DRONE_CONTROLLER',
});

export default DroneController;
