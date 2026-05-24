import { DataTypes } from "sequelize";
import AuditFields from "./auditFields.js";

const MasterWorkingDays = (sequelize, DataTypes) => 
  sequelize.define(
    "MasterWorkingDays",
    {
      min_acre: {
        type:      DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment:   "Lower bound of the acreage range (inclusive)",
      },
      max_acre: {
        type:      DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment:   "Upper bound of the acreage range (inclusive)",
      },
      working_days: {
        type:      DataTypes.INTEGER,
        allowNull: false,
        comment:   "Number of working days required for this acreage range",
      },
      is_active: {
        type:         DataTypes.BOOLEAN,
        allowNull:    false,
        defaultValue: true,
      },
      ...AuditFields,
    },
    {
      tableName: "MASTER_WORKING_DAYS",
      timestamps: true,
    }
  );

export default MasterWorkingDays;