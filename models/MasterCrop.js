import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const MasterCrop =(sequelize, DataTypes) => sequelize.define('MasterCrop', {
  name: DataTypes.STRING,
  desc: DataTypes.STRING,
  crop_image_original_name: DataTypes.STRING,
  crop_image_new_name: DataTypes.STRING,
  crop_image_url: DataTypes.STRING,
  price_per_acre:DataTypes.DECIMAL(10,2),
//   -- Run this migration if your DB column is still INTEGER
// ALTER TABLE "MASTER_CROP" ALTER COLUMN price_per_acre TYPE DECIMAL(10,2);
  ...AuditFields,
}, {
  tableName: 'MASTER_CROP',
});

export default MasterCrop;
