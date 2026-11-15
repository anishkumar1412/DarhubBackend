import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const SprayingDailyLogs = (sequelize, DataTypes) => sequelize.define('SprayingDailyLogs', {
  drone_id: DataTypes.INTEGER,                          // NEWLY ADDED 16-12-2025
  spraying_work_id: DataTypes.UUID,
  land_image_original_name: DataTypes.STRING,
  land_image_new_name: DataTypes.STRING,
  land_image_url: DataTypes.STRING,
  is_verified: DataTypes.BOOLEAN,
  verified_on: DataTypes.DATE,
  verified_by: DataTypes.INTEGER,
  verification_comment: DataTypes.TEXT,
  working_date: DataTypes.DATE,
  pilot_user_id: DataTypes.INTEGER,
  co_pilot_user_id: DataTypes.INTEGER,

  // ── Pilot per-date confirmation ───────────────────────────────────
  // true  = pilot accepted this specific date
  // false = pilot declined this specific date
  // null  = pilot has not responded yet (default)
  is_pilot_confirmed: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: null,
  },
  pilot_confirmed_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
  },

  ...AuditFields,
}, {
  tableName: 'SPRAYING_DAILY_LOGS',
});

export default SprayingDailyLogs;