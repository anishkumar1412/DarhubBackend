import { DataTypes } from 'sequelize';
import sequelize from "./index.js";
import AuditFields from './auditFields.js';

const UserAddress = (sequelize, DataTypes) => sequelize.define('UserAddress', {
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    lane_1: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    lane_2: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    state: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    district: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    block: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    village: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    pincode: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    is_primary: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    ...AuditFields,
}, {
    tableName: 'USER_ADDRESS',
});

export default UserAddress;
