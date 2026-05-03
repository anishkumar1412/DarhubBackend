import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const MasterCrop =(sequelize, DataTypes) => sequelize.define('MasterCrop', {
  name: DataTypes.STRING,
  desc: DataTypes.STRING,
  crop_image_original_name: DataTypes.STRING,
  crop_image_new_name: DataTypes.STRING,
  crop_image_url: DataTypes.STRING,
  price_per_acre:DataTypes.FLOAT,
  ...AuditFields,
}, {
  tableName: 'MASTER_CROP',
});

export default MasterCrop;
