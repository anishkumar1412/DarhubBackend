import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';
const DroneNozzel = (sequelize, DataTypes) => sequelize.define('DroneNozzel', {
  drone_id: DataTypes.INTEGER,
  nozzel_id: DataTypes.INTEGER,
  nozzel_qty: DataTypes.INTEGER,
  ...AuditFields,
}, {
  tableName: 'DRONE_NOZZEL',
});
export default DroneNozzel;
