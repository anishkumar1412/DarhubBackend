import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const SprayingDailyLogs = (sequelize, DataTypes) => sequelize.define('SprayingDailyLogs', {
  drone_id:DataTypes.INTEGER,// NEWLY ADDED 16-12-2025
  spraying_work_id: DataTypes.UUID,
  status_id: DataTypes.INTEGER,
  working_date: DataTypes.DATE,
  pilot_user_id: DataTypes.INTEGER,
  co_pilot_user_id: DataTypes.INTEGER,
  ...AuditFields,
}, {
  tableName: 'SPRAYING_DAILY_LOGS',
});

export default SprayingDailyLogs;