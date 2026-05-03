import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const DroneCharger = (sequelize, DataTypes) => sequelize.define('DroneCharger', {
  drone_id: DataTypes.INTEGER,
  charger_id: DataTypes.INTEGER,
  is_charger_cable: DataTypes.BOOLEAN,
  ischarger_pcable: DataTypes.BOOLEAN,
  ...AuditFields,
}, {
  tableName: 'DRONE_CHARGER',
});

export default DroneCharger;
