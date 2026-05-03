import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';
const MasterPrice = (sequelize, DataTypes) => sequelize.define('MasterPrice', {
  crop_type_id: DataTypes.INTEGER,
  price_per_acer: DataTypes.FLOAT,
  ...AuditFields,
}, {
  tableName: 'MASTER_PRICE',
});

export default MasterPrice;
