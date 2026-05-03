

import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';


const DroneLandingGear =  (sequelize, DataTypes) => sequelize.define('DroneLandingGear', {
  drone_id: DataTypes.INTEGER,
  landing_gear_id: DataTypes.INTEGER,
  landing_gear_qty: DataTypes.INTEGER,
  ...AuditFields,
}, {
  tableName: 'DRONE_LANDING_GEAR',
});

export default DroneLandingGear;
