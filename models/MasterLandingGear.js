import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';;

const MasterLandingGear = (sequelize, DataTypes) => sequelize.define('MasterLandingGear', {
  name: DataTypes.STRING,
  brand_name: DataTypes.STRING,
  desc: DataTypes.STRING,
  ...AuditFields,
}, {
  tableName: 'MASTER_LANDING_GEAR',
});

export default MasterLandingGear;
