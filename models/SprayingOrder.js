import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const SprayingOrder = (sequelize, DataTypes) => sequelize.define('SprayingOrder', {
   booking_id: {
    type: DataTypes.UUID,
    primaryKey: true,       // ✅ Add this line
  },
  start_date: DataTypes.DATE,
  end_date: DataTypes.DATE,
  num_of_days: DataTypes.INTEGER,
  crop_type_id: DataTypes.INTEGER,
  land_in_acers: DataTypes.FLOAT,
  price: DataTypes.FLOAT,
  tax: DataTypes.FLOAT,
  total_price: DataTypes.FLOAT,
  cupon_id: DataTypes.INTEGER,
  discount: DataTypes.FLOAT,
  user_id: DataTypes.INTEGER,
  order_status: DataTypes.STRING,
  is_paid: DataTypes.BOOLEAN,
  transcation_id: DataTypes.STRING,
  booking_otp: DataTypes.STRING,
  ...AuditFields,
}, {
  tableName: 'SPRAYING_ORDER',
});

export default SprayingOrder;