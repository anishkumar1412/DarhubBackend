import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const SprayingOrderAddress = (sequelize, DataTypes) => sequelize.define('SprayingOrderAddress', {
  order_id: DataTypes.UUID,
  state: DataTypes.INTEGER,
  district: DataTypes.INTEGER,
  block: DataTypes.INTEGER,
  village: DataTypes.STRING,
  address1: DataTypes.STRING,
  address2: DataTypes.STRING,
  ...AuditFields,
}, {
  tableName: 'SPRAYING_ORDER_ADDRESS',
});

export default SprayingOrderAddress;