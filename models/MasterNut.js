import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const MasterNut = (sequelize, DataTypes) => sequelize.define('MasterNut', {
  name: DataTypes.STRING,
  brand_name: DataTypes.STRING,
  desc: DataTypes.STRING,
  ...AuditFields,
}, {
  tableName: 'MASTER_NUT',
});

export default MasterNut;
