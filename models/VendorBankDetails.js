import AuditFields from './auditFields.js';

/**
 * VendorBankDetails Model – Table 4
 * Stores vendor bank account and document information.
 * Links to vendor_basic via vendor_id (no FK constraint).
 */
const VendorBankDetails = (sequelize, DataTypes) =>
  sequelize.define(
    'VendorBankDetails',
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
      // ── Bank Account Information ──────────────────────────────────
      account_holder_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Name of the account holder as per bank records',
      },
      bank_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      branch_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      account_number: {
        type: DataTypes.STRING(30),
        allowNull: false,
      },
      confirm_account_number: {
        type: DataTypes.STRING(30),
        allowNull: false,
        comment: 'Re-entered account number for verification',
      },
      ifsc_code: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: 'IFSC code of the bank branch',
      },
      account_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'e.g. Savings, Current, OD/CC',
      },
      micr_code: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: 'MICR code on the cheque',
      },
      upi_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'UPI ID / VPA of the vendor',
      },
      // ── Bank Documents ────────────────────────────────────────────
      // Cancelled Cheque / Passbook
      cancelled_cheque_passbook_original_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      cancelled_cheque_passbook_url: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Cloudinary URL – Cancelled Cheque / Passbook (PDF, PNG, JPG, max 2MB)',
      },
      cancelled_cheque_passbook_public_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      // Bank Statement
      bank_statement_original_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      bank_statement_url: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Cloudinary URL – Bank Statement (PDF, PNG, JPG, max 2MB)',
      },
      bank_statement_public_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      ...AuditFields,
    },
    {
      tableName: 'vendor_bank_details',
      timestamps: false,
    }
  );

export default VendorBankDetails;
