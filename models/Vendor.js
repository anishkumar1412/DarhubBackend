import AuditFields from './auditFields.js';

/**
 * VendorBasic Model – Table 1
 * Stores vendor basic details and contact information (main table).
 * Other vendor sub-tables reference this table via vendor_id.
 */
const Vendor = (sequelize, DataTypes) =>
  sequelize.define(
    'Vendor',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      // ── Basic Information ────────────────────────────────────────
      vendor_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Full legal name of the vendor',
      },
      vendor_type: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'e.g. Manufacturer, Distributor, Service Provider',
      },
      category: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'e.g. Battery, ESC, Propeller, Software',
      },
      gst_number: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'GST Registration Number',
      },
      pan_number: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: 'PAN number of the vendor',
      },
      udyam_registration_number: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Udyam / MSME Registration Number',
      },
      company_business_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Official company / business name',
      },
      business_address: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: 'Registered business address',
      },
      state: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'State ID (integer reference)',
      },
      district: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'District ID (integer reference)',
      },
      city_town: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      pincode: {
        type: DataTypes.STRING(10),
        allowNull: false,
      },
      // ── Vendor Logo ──────────────────────────────────────────────
      vendor_logo_original_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      vendor_logo_url: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Cloudinary URL for vendor logo (PNG, JPG, JPEG)',
      },
      vendor_logo_public_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Cloudinary public_id for deletion',
      },
      // ── Business Documents ───────────────────────────────────────
      business_doc_gst_cert_original_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      business_doc_gst_cert_url: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Cloudinary URL for GST Certificate (PDF, PNG, JPG, JPEG)',
      },
      business_doc_gst_cert_public_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      business_doc_pan_original_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      business_doc_pan_url: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Cloudinary URL for PAN Document (PDF, PNG, JPG, JPEG)',
      },
      business_doc_pan_public_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      business_doc_udyam_original_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      business_doc_udyam_url: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Cloudinary URL for Udyam Certificate (PDF, PNG, JPG, JPEG)',
      },
      business_doc_udyam_public_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      ...AuditFields,
    },
    {
      tableName: 'vendor_basic',
      timestamps: false,
    }
  );

export default Vendor;