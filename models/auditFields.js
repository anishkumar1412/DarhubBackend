import { DataTypes } from "sequelize";

const AuditFields = {
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  created_on: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  modified_on: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  modified_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
};

export default AuditFields;