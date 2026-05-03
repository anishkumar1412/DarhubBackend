import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const DronePipe = (sequelize, DataTypes) => sequelize.define('DronePipe', {
  drone_id: DataTypes.INTEGER,
  pipe_id: DataTypes.INTEGER,
  pipe_qty: DataTypes.INTEGER,
  ...AuditFields,
}, {
  tableName: 'DRONE_PIPE',
});

export default DronePipe;
