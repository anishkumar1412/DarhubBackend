import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const MasterPropeller = (sequelize, DataTypes) => (sequelize, DataTypes) => sequelize.define('MasterPropeller', {
  name: DataTypes.STRING,
  brand_name: DataTypes.STRING,
  desc: DataTypes.STRING,
  ...AuditFields,
}, {
  tableName: 'MASTER_PROPERLLER',
});

export default MasterPropeller;
