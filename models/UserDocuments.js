import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';

const UserDocuments = sequelize.define('UserDocuments', {
  user_id: DataTypes.INTEGER,
  document_type: DataTypes.INTEGER,
  document_original_name: DataTypes.STRING,
  document_new_name: DataTypes.STRING,
  document_url: DataTypes.STRING,
  
  // pan_card_doc_original_name: DataTypes.STRING,
  // pan_card_doc_new_name: DataTypes.STRING,
  // pan_card_doc_url: DataTypes.STRING,
  
  // aadhar_doc_original_name: DataTypes.STRING,
  // aadhar_doc_new_name: DataTypes.STRING,
  // aadhar_doc_url: DataTypes.STRING,

  // hsc_certificate_original_name: DataTypes.STRING,
  // hsc_certificate_new_name: DataTypes.STRING,
  // hsc_certificate_url: DataTypes.STRING,
  // chse_certificate_original_name: DataTypes.STRING,
  // chse_certificate_new_name: DataTypes.STRING,
  // chse_certificate_url: DataTypes.STRING,
  // graduation_certificate_original_name: DataTypes.STRING,
  // graduation_certificate_new_name: DataTypes.STRING,
  // graduation_certificate_url: DataTypes.STRING,
  // diploma_certificate_original_name: DataTypes.STRING,
  // diploma_certificate_new_name: DataTypes.STRING,
  // diploma_certificate_url: DataTypes.STRING,
  ...AuditFields,
}, {
  tableName: 'USER_DOCUMENTS',
});

export default UserDocuments;
