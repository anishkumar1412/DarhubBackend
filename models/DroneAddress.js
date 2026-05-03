import { DataTypes } from "sequelize";
import sequelize from "./index.js";
import AuditFields from "./auditFields.js";

const DroneAddress = (sequelize, DataTypes) =>
  sequelize.define(
    "DroneAddress",
    {
      drone_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      lane_1: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      lane_2: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      state: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      district: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      block: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      village: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      pincode: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      ...AuditFields,
    },
    {
      tableName: "DRONE_ADDRESS",
    }
  );

export default DroneAddress;