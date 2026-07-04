import { DataTypes } from 'sequelize';
import AuditFields from './auditFields.js';

const UserDocuments = (sequelize, DataTypes) => sequelize.define('UserDocuments', {
  user_id: DataTypes.INTEGER,
  document_type: DataTypes.INTEGER,
  document_original_name: DataTypes.STRING,
  document_new_name: DataTypes.STRING,
  document_url: DataTypes.STRING,
  ...AuditFields,
}, {
  tableName: 'USER_DOCUMENTS',
});

export default UserDocuments;
