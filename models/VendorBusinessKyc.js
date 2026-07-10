import AuditFields from './auditFields.js';

/**
 * VendorBusinessKyc Model – Table 3
 * Stores vendor business/KYC details, director info, and KYC document uploads.
 * Links to vendor_basic via vendor_id (no FK constraint).
 */
const VendorBusinessKyc = (sequelize, DataTypes) =>
  sequelize.define(
    'VendorBusinessKyc',
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
      // ── Business Information ─────────────────────────────────────
      business_type: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'e.g. Private Limited, LLP, Proprietorship',
      },
      entity_type: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'e.g. Company, Individual, HUF',
      },
      business_name_as_pan: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Business name exactly as on PAN card',
      },
      trade_name_brand_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Trade / Brand name if different from legal name',
      },
      kyc_gst_number: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      kyc_pan_number: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: 'PAN as per KYC documents',
      },
      // ── KYC Documents ────────────────────────────────────────────
      // PAN Card
      pan_card_original_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      pan_card_url: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Cloudinary URL – PAN Card (JPG, PNG, PDF, max 5MB)',
      },
      pan_card_public_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      // GST Certificate
      gst_cert_original_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      gst_cert_url: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Cloudinary URL – GST Certificate (JPG, PNG, PDF, max 5MB)',
      },
      gst_cert_public_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      // Business Registration Certificate
      business_reg_cert_original_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      business_reg_cert_url: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Cloudinary URL – Business Reg. Certificate (JPG, PNG, PDF, max 5MB)',
      },
      business_reg_cert_public_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      // MOA / AOA
      moa_aoa_original_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      moa_aoa_url: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Cloudinary URL – MOA/AOA (JPG, PNG, PDF, max 5MB)',
      },
      moa_aoa_public_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      // Address Proof
      address_proof_original_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      address_proof_url: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Cloudinary URL – Address Proof (JPG, PNG, PDF, max 5MB)',
      },
      address_proof_public_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      // Cancelled Cheque (KYC)
      kyc_cancelled_cheque_original_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      kyc_cancelled_cheque_url: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Cloudinary URL – Cancelled Cheque KYC (JPG, PNG, PDF, max 5MB)',
      },
      kyc_cancelled_cheque_public_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      // ── Director / Owner Details ─────────────────────────────────
      director_full_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Full name of director / owner / authorized signatory',
      },
      director_mobile: {
        type: DataTypes.STRING(20),
        allowNull: false,
      },
      director_email: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      director_din_number: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Director Identification Number (for companies)',
      },
      director_aadhaar_number: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      ...AuditFields,
    },
    {
      tableName: 'vendor_business_kyc',
      timestamps: false,
    }
  );

export default VendorBusinessKyc;
