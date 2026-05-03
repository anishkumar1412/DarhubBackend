import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const MasterTransmitter = (sequelize, DataTypes) => sequelize.define('MasterTransmitter', {
  name: DataTypes.STRING,
  brand_name: DataTypes.STRING,
  transmitter_type: DataTypes.STRING,
  desc: DataTypes.STRING,
  ...AuditFields,
}, {
  tableName: 'MASTER_TRANSMITTER',
});

export default MasterTransmitter;
