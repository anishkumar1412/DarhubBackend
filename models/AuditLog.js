import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";
import AuditFields from "./auditFields.js";


const AuditLog = (sequelize, DataTypes) => sequelize.define("AuditLog", {
  method: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  api_route: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  ip_address: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  audit_fields: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  payload_history: {
    type: DataTypes.TEXT, // Store JSON string of payload
    allowNull: true,
  },
  response_history: {
    type: DataTypes.TEXT, // Store JSON string of response
    allowNull: true,
  },
  response_status: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  response_time: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  // ⬇️ Reusing your common audit fields here
  ...AuditFields,
}, {
  tableName: "audit_logs",
  timestamps: false, // Disable Sequelize's default createdAt/updatedAt
});

export default AuditLog;
