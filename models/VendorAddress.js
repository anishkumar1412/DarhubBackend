import AuditFields from './auditFields.js';

/**
 * VendorAddress Model – Table 2
 * Stores vendor address and contact information.
 * Links to vendor_basic via vendor_id (no FK constraint).
 */
const VendorAddress = (sequelize, DataTypes) =>
  sequelize.define(
    'VendorAddress',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      vendor_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'References vendor_basic.id (no FK constraint)',
      },
      // ── Primary Contact ──────────────────────────────────────────
      primary_contact_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Name of the primary contact person',
      },
      designation: {
        type: DataTypes.STRING(150),
        allowNull: true,
        comment: 'Job title / designation of the contact person',
      },
      mobile_number: {
        type: DataTypes.STRING(20),
        allowNull: false,
      },
      whatsapp_number: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      email_address: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      alternate_mobile: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      telephone_landline: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },
      website: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      // ── Communication Address ────────────────────────────────────
      communication_address: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      same_as_business_address: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'If true, communication address mirrors business address',
      },
      comm_state: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'State ID (integer reference)',
      },
      comm_district: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'District ID (integer reference)',
      },
      comm_city_town: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      comm_pincode: {
        type: DataTypes.STRING(10),
        allowNull: false,
      },
      ...AuditFields,
    },
    {
      tableName: 'vendor_address',
      timestamps: false,
    }
  );

export default VendorAddress;
