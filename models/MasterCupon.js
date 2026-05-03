import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const MasterCupon = (sequelize, DataTypes) =>sequelize.define('MasterCupon', {
  cupon_type: DataTypes.STRING,
  discount_percentage: DataTypes.FLOAT,
  discount_price: DataTypes.FLOAT,
  ...AuditFields,
}, {
  tableName: 'MASTER_CUPON',
});

export default MasterCupon;
