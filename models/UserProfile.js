import { DataTypes } from 'sequelize';
import sequelize from "./index.js";

import AuditFields from './auditFields.js';

const UserProfile = (sequelize, DataTypes) => sequelize.define('UserProfile', {
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false  // required
  },
  first_name: {
    type: DataTypes.STRING,
    allowNull: false  // required
  },
  last_name: {
    type: DataTypes.STRING,
    allowNull: true   // optional
  },
  whatsapp_number: {
    type: DataTypes.STRING,
    allowNull: true   // optional
  },
  user_image_original_filename: {
    type: DataTypes.STRING,
    allowNull: true   // optional
  },
  user_image_new_filename: {
    type: DataTypes.STRING,
    allowNull: true   // optional
  },
  user_image_url: {
    type: DataTypes.STRING,
    allowNull: true   // optional
  },
  aadhar_number: {
    type: DataTypes.STRING,
    allowNull: true   // optional
  },
  
  pan_card_number: {
    type: DataTypes.STRING,
    allowNull: true   // optional
  },
  ...AuditFields,
}, {
  tableName: 'USER_PROFILE',
});

export default UserProfile;
