import { DataTypes } from 'sequelize';

const Fertilizer = (sequelize, DataTypes) => sequelize.define('Fertilizer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  type: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  company: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  packageType: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  quantity: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  unit: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  fertilizer_image_original_name: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  fertilizer_image_new_name: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  fertilizer_image_url: {
    type: DataTypes.STRING(1000),
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: true,
  },
  created_on: {
    type: DataTypes.DATE,
    allowNull: true,
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
}, {
  tableName: 'fertilizers',
  timestamps: false,
});

export default Fertilizer;
