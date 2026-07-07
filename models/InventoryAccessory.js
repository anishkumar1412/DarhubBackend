import AuditFields from './auditFields.js';

const InventoryAccessory = (sequelize, DataTypes) =>
  sequelize.define(
    'InventoryAccessory',
    {
      sku: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Unique SKU code e.g. BAT-DJI-AG12',
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Display name e.g. DJI Agras Battery',
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      location: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Storage hub / site location',
      },
      assigned_pilot: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'Unassigned',
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      min_stock: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'e.g. In Stock, Out of Stock, Restock Needed, In Use',
      },
      unit_price: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
      },
      ...AuditFields,
    },
    {
      tableName: 'INVENTORY_ACCESSORY',
    }
  );

export default InventoryAccessory;
