import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const SprayingWorkAssignee = (sequelize, DataTypes) => sequelize.define('SprayingWorkAssignee', {
  drone_id: DataTypes.INTEGER,
  booking_id: DataTypes.UUID,
  pilot_user_id: DataTypes.INTEGER,
  co_pilot_user_id: DataTypes.INTEGER,
  is_pilot_confirm: DataTypes.BOOLEAN,
  is_copilot_confirm: DataTypes.BOOLEAN,

  // start_date: DataTypes.DATE,
  // end_date: DataTypes.DATE,
  ...AuditFields,
}, {
  tableName: 'SPRAYING_WORK_ASSIGNEE',
});

export default SprayingWorkAssignee;