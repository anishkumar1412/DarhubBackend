import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const SprayingOrderComment = (sequelize, DataTypes) => sequelize.define('SprayingOrderComment', {
  user_id: DataTypes.INTEGER,
  comment_type: DataTypes.STRING,
  comment: DataTypes.TEXT,
  spraying_order_id: DataTypes.UUID,
  working_date: DataTypes.DATE,
  ...AuditFields,
}, {
  tableName: 'SPRAYING_ORDER_COMMENT',
});

export default SprayingOrderComment;