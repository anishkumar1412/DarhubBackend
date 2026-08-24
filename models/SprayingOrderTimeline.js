import { DataTypes } from 'sequelize';
import AuditFields from './auditFields.js';
import { OrderStatusEnum } from '../utils/enums.js';

const SprayingOrderTimeline = (sequelize, DataTypes) => sequelize.define('SprayingOrderTimeline', {
  timeline_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  booking_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  order_status: {
    type: DataTypes.ENUM(...Object.values(OrderStatusEnum)),
    allowNull: false,
  },
  remarks: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  ...AuditFields,
}, {
  tableName: 'SPRAYING_ORDER_TIMELINE',
});

export default SprayingOrderTimeline;