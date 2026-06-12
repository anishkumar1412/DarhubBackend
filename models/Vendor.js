import AuditFields from './auditFields.js';

/**
 * Vendor Model
 * Stores vendor/supplier information for purchase orders.
 * Referenced from PurchaseOrder.vendor_id
 */
const Vendor = (sequelize, DataTypes) =>
  sequelize.define(
    'Vendor',
    {
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'e.g. Vendor A (Tattu Direct)',
      },
      contact_person: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      address: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      category: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'e.g. Battery, ESC, Propeller',
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      ...AuditFields,
    },
    {
      tableName: 'VENDOR',
    }
  );

export default Vendor;