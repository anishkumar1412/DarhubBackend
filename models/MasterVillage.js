import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const MasterVillage = sequelize.define('MasterVillage', {
  village_name: DataTypes.STRING,
  gram_panchayat_id: DataTypes.INTEGER,
  ...AuditFields,
}, {
  tableName: 'MASTER_VILLAGE',
});

export default MasterVillage;
