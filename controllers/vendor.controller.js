import db from '../models/index.js';
import { uploadToCloudinary } from '../middleware/upload.js';
import cloudinary from 'cloudinary';

const {
  Vendor,
  VendorAddress,
  VendorBusinessKyc,
  VendorBankDetails,
  sequelize,
  Op,
} = db;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Upload a single file to Cloudinary. Returns { original_name, url, public_id } or null.
 * Allowed types: image/png, image/jpg, image/jpeg, application/pdf
 */
const uploadFile = async (file, folder) => {
  if (!file) return null;
  const allowed = ['image/png', 'image/jpg', 'image/jpeg', 'application/pdf'];
  if (!allowed.includes(file.mimetype)) {
    throw new Error(
      `File "${file.originalname}" has unsupported type: ${file.mimetype}. Allowed: PNG, JPG, JPEG, PDF.`
    );
  }
  const result = await uploadToCloudinary(file.buffer, folder, 'auto', file.originalname);
  return {
    original_name: file.originalname,
    url: result.secure_url,
    public_id: result.public_id,
  };
};

/** Delete a Cloudinary asset by public_id (silently ignores errors). */
const deleteCloudinaryAsset = async (public_id) => {
  if (!public_id) return;
  try {
    await cloudinary.v2.uploader.destroy(public_id, { resource_type: 'raw' });
  } catch (_) {}
};

// ─── CREATE VENDOR ─────────────────────────────────────────────────────────────
export const createVendor = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const body = req.body;
    const files = req.files || {};

    // ── Step 1: VendorBasic ──────────────────────────────────────
    const logoFile = files['vendor_logo']?.[0];
    const gstDocFile = files['business_doc_gst_cert']?.[0];
    const panDocFile = files['business_doc_pan']?.[0];
    const udyamDocFile = files['business_doc_udyam']?.[0];

    const [logo, gstDoc, panDoc, udyamDoc] = await Promise.all([
      uploadFile(logoFile, 'vendors/logos'),
      uploadFile(gstDocFile, 'vendors/biz_docs'),
      uploadFile(panDocFile, 'vendors/biz_docs'),
      uploadFile(udyamDocFile, 'vendors/biz_docs'),
    ]);

    const vendor = await Vendor.create(
      {
        vendor_name: body.vendor_name,
        vendor_type: body.vendor_type,
        category: body.category,
        gst_number: body.gst_number || null,
        pan_number: body.pan_number,
        udyam_registration_number: body.udyam_registration_number || null,
        company_business_name: body.company_business_name,
        business_address: body.business_address,
        state: body.state ? parseInt(body.state, 10) : null,
        district: body.district ? parseInt(body.district, 10) : null,
        city_town: body.city_town,
        pincode: body.pincode,
        vendor_logo_original_name: logo?.original_name || null,
        vendor_logo_url: logo?.url || null,
        vendor_logo_public_id: logo?.public_id || null,
        business_doc_gst_cert_original_name: gstDoc?.original_name || null,
        business_doc_gst_cert_url: gstDoc?.url || null,
        business_doc_gst_cert_public_id: gstDoc?.public_id || null,
        business_doc_pan_original_name: panDoc?.original_name || null,
        business_doc_pan_url: panDoc?.url || null,
        business_doc_pan_public_id: panDoc?.public_id || null,
        business_doc_udyam_original_name: udyamDoc?.original_name || null,
        business_doc_udyam_url: udyamDoc?.url || null,
        business_doc_udyam_public_id: udyamDoc?.public_id || null,
        created_by: req.user?.id || null,
      },
      { transaction: t }
    );

    const vendor_id = vendor.id;

    // ── Step 2: VendorAddress ────────────────────────────────────
    await VendorAddress.create(
      {
        vendor_id,
        primary_contact_name: body.primary_contact_name,
        designation: body.designation || null,
        mobile_number: body.mobile_number,
        whatsapp_number: body.whatsapp_number || null,
        email_address: body.email_address,
        alternate_mobile: body.alternate_mobile || null,
        telephone_landline: body.telephone_landline || null,
        website: body.website || null,
        communication_address: body.communication_address,
        same_as_business_address:
          body.same_as_business_address === 'true' || body.same_as_business_address === true,
        comm_state: body.comm_state ? parseInt(body.comm_state, 10) : null,
        comm_district: body.comm_district ? parseInt(body.comm_district, 10) : null,
        comm_city_town: body.comm_city_town,
        comm_pincode: body.comm_pincode,
        created_by: req.user?.id || null,
      },
      { transaction: t }
    );

    // ── Step 3: VendorBusinessKyc ────────────────────────────────
    const panCardFile = files['pan_card']?.[0];
    const gstCertFile = files['gst_cert']?.[0];
    const businessRegFile = files['business_reg_cert']?.[0];
    const moaAoaFile = files['moa_aoa']?.[0];
    const addressProofFile = files['address_proof']?.[0];
    const kycChequeFile = files['kyc_cancelled_cheque']?.[0];

    const [panCard, gstCert, businessReg, moaAoa, addressProof, kycCheque] = await Promise.all([
      uploadFile(panCardFile, 'vendors/kyc_docs'),
      uploadFile(gstCertFile, 'vendors/kyc_docs'),
      uploadFile(businessRegFile, 'vendors/kyc_docs'),
      uploadFile(moaAoaFile, 'vendors/kyc_docs'),
      uploadFile(addressProofFile, 'vendors/kyc_docs'),
      uploadFile(kycChequeFile, 'vendors/kyc_docs'),
    ]);

    await VendorBusinessKyc.create(
      {
        vendor_id,
        business_type: body.business_type,
        entity_type: body.entity_type,
        business_name_as_pan: body.business_name_as_pan,
        trade_name_brand_name: body.trade_name_brand_name || null,
        kyc_gst_number: body.kyc_gst_number || null,
        kyc_pan_number: body.kyc_pan_number,
        pan_card_original_name: panCard?.original_name || null,
        pan_card_url: panCard?.url || null,
        pan_card_public_id: panCard?.public_id || null,
        gst_cert_original_name: gstCert?.original_name || null,
        gst_cert_url: gstCert?.url || null,
        gst_cert_public_id: gstCert?.public_id || null,
        business_reg_cert_original_name: businessReg?.original_name || null,
        business_reg_cert_url: businessReg?.url || null,
        business_reg_cert_public_id: businessReg?.public_id || null,
        moa_aoa_original_name: moaAoa?.original_name || null,
        moa_aoa_url: moaAoa?.url || null,
        moa_aoa_public_id: moaAoa?.public_id || null,
        address_proof_original_name: addressProof?.original_name || null,
        address_proof_url: addressProof?.url || null,
        address_proof_public_id: addressProof?.public_id || null,
        kyc_cancelled_cheque_original_name: kycCheque?.original_name || null,
        kyc_cancelled_cheque_url: kycCheque?.url || null,
        kyc_cancelled_cheque_public_id: kycCheque?.public_id || null,
        director_full_name: body.director_full_name,
        director_mobile: body.director_mobile,
        director_email: body.director_email,
        director_din_number: body.director_din_number || null,
        director_aadhaar_number: body.director_aadhaar_number || null,
        created_by: req.user?.id || null,
      },
      { transaction: t }
    );

    // ── Step 4: VendorBankDetails ────────────────────────────────
    const chequePassbookFile = files['cancelled_cheque_passbook']?.[0];
    const bankStatementFile = files['bank_statement']?.[0];

    const [chequePassbook, bankStatement] = await Promise.all([
      uploadFile(chequePassbookFile, 'vendors/bank_docs'),
      uploadFile(bankStatementFile, 'vendors/bank_docs'),
    ]);

    await VendorBankDetails.create(
      {
        vendor_id,
        account_holder_name: body.account_holder_name,
        bank_name: body.bank_name,
        branch_name: body.branch_name,
        account_number: body.account_number,
        confirm_account_number: body.confirm_account_number,
        ifsc_code: body.ifsc_code,
        account_type: body.account_type,
        micr_code: body.micr_code || null,
        upi_id: body.upi_id || null,
        cancelled_cheque_passbook_original_name: chequePassbook?.original_name || null,
        cancelled_cheque_passbook_url: chequePassbook?.url || null,
        cancelled_cheque_passbook_public_id: chequePassbook?.public_id || null,
        bank_statement_original_name: bankStatement?.original_name || null,
        bank_statement_url: bankStatement?.url || null,
        bank_statement_public_id: bankStatement?.public_id || null,
        created_by: req.user?.id || null,
      },
      { transaction: t }
    );

    await t.commit();
    return res.status(201).json({
      success: true,
      message: 'Vendor created successfully.',
      data: { id: vendor_id },
    });
  } catch (err) {
    await t.rollback();
    console.error('createVendor error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Internal server error.' });
  }
};

// ─── GET ALL VENDORS (with filter & pagination) ────────────────────────────────
export const getAllVendors = async (req, res) => {
  try {
    const { vendor_type, category, search, is_active, page = 1, limit = 10 } = req.body;

    const where = {};
    if (vendor_type) where.vendor_type = vendor_type;
    if (category) where.category = category;
    if (is_active !== undefined) where.is_active = is_active;
    if (search) {
      where[Op.or] = [
        { vendor_name: { [Op.iLike]: `%${search}%` } },
        { company_business_name: { [Op.iLike]: `%${search}%` } },
        { gst_number: { [Op.iLike]: `%${search}%` } },
        { pan_number: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const { count, rows } = await Vendor.findAndCountAll({
      where,
      limit: parseInt(limit, 10),
      offset,
      order: [['id', 'DESC']],
    });

    return res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(count / parseInt(limit, 10)),
      },
    });
  } catch (err) {
    console.error('getAllVendors error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Internal server error.' });
  }
};

// ─── GET VENDOR BY ID ──────────────────────────────────────────────────────────
export const getVendorById = async (req, res) => {
  try {
    const { id } = req.params;

    const vendor = await Vendor.findByPk(id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: `Vendor with id ${id} not found.` });
    }

    const [address, businessKyc, bankDetails] = await Promise.all([
      VendorAddress.findOne({ where: { vendor_id: id, is_active: true } }),
      VendorBusinessKyc.findOne({ where: { vendor_id: id, is_active: true } }),
      VendorBankDetails.findOne({ where: { vendor_id: id, is_active: true } }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        basic: vendor,
        address: address || null,
        businessKyc: businessKyc || null,
        bankDetails: bankDetails || null,
      },
    });
  } catch (err) {
    console.error('getVendorById error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Internal server error.' });
  }
};

// ─── UPDATE VENDOR ─────────────────────────────────────────────────────────────
export const updateVendor = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const body = req.body;
    const files = req.files || {};

    const vendor = await Vendor.findByPk(id);
    if (!vendor) {
      await t.rollback();
      return res.status(404).json({ success: false, message: `Vendor with id ${id} not found.` });
    }

    // ── Update VendorBasic ───────────────────────────────────────
    const logoFile = files['vendor_logo']?.[0];
    const gstDocFile = files['business_doc_gst_cert']?.[0];
    const panDocFile = files['business_doc_pan']?.[0];
    const udyamDocFile = files['business_doc_udyam']?.[0];

    const [logo, gstDoc, panDoc, udyamDoc] = await Promise.all([
      uploadFile(logoFile, 'vendors/logos'),
      uploadFile(gstDocFile, 'vendors/biz_docs'),
      uploadFile(panDocFile, 'vendors/biz_docs'),
      uploadFile(udyamDocFile, 'vendors/biz_docs'),
    ]);

    if (logo) await deleteCloudinaryAsset(vendor.vendor_logo_public_id);
    if (gstDoc) await deleteCloudinaryAsset(vendor.business_doc_gst_cert_public_id);
    if (panDoc) await deleteCloudinaryAsset(vendor.business_doc_pan_public_id);
    if (udyamDoc) await deleteCloudinaryAsset(vendor.business_doc_udyam_public_id);

    await vendor.update(
      {
        ...(body.vendor_name && { vendor_name: body.vendor_name }),
        ...(body.vendor_type && { vendor_type: body.vendor_type }),
        ...(body.category && { category: body.category }),
        ...(body.gst_number !== undefined && { gst_number: body.gst_number }),
        ...(body.pan_number && { pan_number: body.pan_number }),
        ...(body.udyam_registration_number !== undefined && {
          udyam_registration_number: body.udyam_registration_number,
        }),
        ...(body.company_business_name && { company_business_name: body.company_business_name }),
        ...(body.business_address && { business_address: body.business_address }),
        ...(body.state && { state: parseInt(body.state, 10) }),
        ...(body.district && { district: parseInt(body.district, 10) }),
        ...(body.city_town && { city_town: body.city_town }),
        ...(body.pincode && { pincode: body.pincode }),
        ...(logo && {
          vendor_logo_original_name: logo.original_name,
          vendor_logo_url: logo.url,
          vendor_logo_public_id: logo.public_id,
        }),
        ...(gstDoc && {
          business_doc_gst_cert_original_name: gstDoc.original_name,
          business_doc_gst_cert_url: gstDoc.url,
          business_doc_gst_cert_public_id: gstDoc.public_id,
        }),
        ...(panDoc && {
          business_doc_pan_original_name: panDoc.original_name,
          business_doc_pan_url: panDoc.url,
          business_doc_pan_public_id: panDoc.public_id,
        }),
        ...(udyamDoc && {
          business_doc_udyam_original_name: udyamDoc.original_name,
          business_doc_udyam_url: udyamDoc.url,
          business_doc_udyam_public_id: udyamDoc.public_id,
        }),
        modified_by: req.user?.id || null,
        modified_on: new Date(),
      },
      { transaction: t }
    );

    // ── Update VendorAddress ─────────────────────────────────────
    const address = await VendorAddress.findOne({ where: { vendor_id: id } });
    if (address) {
      await address.update(
        {
          ...(body.primary_contact_name && { primary_contact_name: body.primary_contact_name }),
          ...(body.designation !== undefined && { designation: body.designation }),
          ...(body.mobile_number && { mobile_number: body.mobile_number }),
          ...(body.whatsapp_number !== undefined && { whatsapp_number: body.whatsapp_number }),
          ...(body.email_address && { email_address: body.email_address }),
          ...(body.alternate_mobile !== undefined && { alternate_mobile: body.alternate_mobile }),
          ...(body.telephone_landline !== undefined && { telephone_landline: body.telephone_landline }),
          ...(body.website !== undefined && { website: body.website }),
          ...(body.communication_address && { communication_address: body.communication_address }),
          ...(body.same_as_business_address !== undefined && {
            same_as_business_address:
              body.same_as_business_address === 'true' || body.same_as_business_address === true,
          }),
          ...(body.comm_state && { comm_state: parseInt(body.comm_state, 10) }),
          ...(body.comm_district && { comm_district: parseInt(body.comm_district, 10) }),
          ...(body.comm_city_town && { comm_city_town: body.comm_city_town }),
          ...(body.comm_pincode && { comm_pincode: body.comm_pincode }),
          modified_by: req.user?.id || null,
          modified_on: new Date(),
        },
        { transaction: t }
      );
    }

    // ── Update VendorBusinessKyc ─────────────────────────────────
    const kyc = await VendorBusinessKyc.findOne({ where: { vendor_id: id } });
    if (kyc) {
      const panCardFile = files['pan_card']?.[0];
      const gstCertFile = files['gst_cert']?.[0];
      const businessRegFile = files['business_reg_cert']?.[0];
      const moaAoaFile = files['moa_aoa']?.[0];
      const addressProofFile = files['address_proof']?.[0];
      const kycChequeFile = files['kyc_cancelled_cheque']?.[0];

      const [panCard, gstCert, businessReg, moaAoa, addressProof, kycCheque] = await Promise.all([
        uploadFile(panCardFile, 'vendors/kyc_docs'),
        uploadFile(gstCertFile, 'vendors/kyc_docs'),
        uploadFile(businessRegFile, 'vendors/kyc_docs'),
        uploadFile(moaAoaFile, 'vendors/kyc_docs'),
        uploadFile(addressProofFile, 'vendors/kyc_docs'),
        uploadFile(kycChequeFile, 'vendors/kyc_docs'),
      ]);

      if (panCard) await deleteCloudinaryAsset(kyc.pan_card_public_id);
      if (gstCert) await deleteCloudinaryAsset(kyc.gst_cert_public_id);
      if (businessReg) await deleteCloudinaryAsset(kyc.business_reg_cert_public_id);
      if (moaAoa) await deleteCloudinaryAsset(kyc.moa_aoa_public_id);
      if (addressProof) await deleteCloudinaryAsset(kyc.address_proof_public_id);
      if (kycCheque) await deleteCloudinaryAsset(kyc.kyc_cancelled_cheque_public_id);

      await kyc.update(
        {
          ...(body.business_type && { business_type: body.business_type }),
          ...(body.entity_type && { entity_type: body.entity_type }),
          ...(body.business_name_as_pan && { business_name_as_pan: body.business_name_as_pan }),
          ...(body.trade_name_brand_name !== undefined && {
            trade_name_brand_name: body.trade_name_brand_name,
          }),
          ...(body.kyc_gst_number !== undefined && { kyc_gst_number: body.kyc_gst_number }),
          ...(body.kyc_pan_number && { kyc_pan_number: body.kyc_pan_number }),
          ...(panCard && {
            pan_card_original_name: panCard.original_name,
            pan_card_url: panCard.url,
            pan_card_public_id: panCard.public_id,
          }),
          ...(gstCert && {
            gst_cert_original_name: gstCert.original_name,
            gst_cert_url: gstCert.url,
            gst_cert_public_id: gstCert.public_id,
          }),
          ...(businessReg && {
            business_reg_cert_original_name: businessReg.original_name,
            business_reg_cert_url: businessReg.url,
            business_reg_cert_public_id: businessReg.public_id,
          }),
          ...(moaAoa && {
            moa_aoa_original_name: moaAoa.original_name,
            moa_aoa_url: moaAoa.url,
            moa_aoa_public_id: moaAoa.public_id,
          }),
          ...(addressProof && {
            address_proof_original_name: addressProof.original_name,
            address_proof_url: addressProof.url,
            address_proof_public_id: addressProof.public_id,
          }),
          ...(kycCheque && {
            kyc_cancelled_cheque_original_name: kycCheque.original_name,
            kyc_cancelled_cheque_url: kycCheque.url,
            kyc_cancelled_cheque_public_id: kycCheque.public_id,
          }),
          ...(body.director_full_name && { director_full_name: body.director_full_name }),
          ...(body.director_mobile && { director_mobile: body.director_mobile }),
          ...(body.director_email && { director_email: body.director_email }),
          ...(body.director_din_number !== undefined && {
            director_din_number: body.director_din_number,
          }),
          ...(body.director_aadhaar_number !== undefined && {
            director_aadhaar_number: body.director_aadhaar_number,
          }),
          modified_by: req.user?.id || null,
          modified_on: new Date(),
        },
        { transaction: t }
      );
    }

    // ── Update VendorBankDetails ─────────────────────────────────
    const bank = await VendorBankDetails.findOne({ where: { vendor_id: id } });
    if (bank) {
      const chequePassbookFile = files['cancelled_cheque_passbook']?.[0];
      const bankStatementFile = files['bank_statement']?.[0];

      const [chequePassbook, bankStatement] = await Promise.all([
        uploadFile(chequePassbookFile, 'vendors/bank_docs'),
        uploadFile(bankStatementFile, 'vendors/bank_docs'),
      ]);

      if (chequePassbook) await deleteCloudinaryAsset(bank.cancelled_cheque_passbook_public_id);
      if (bankStatement) await deleteCloudinaryAsset(bank.bank_statement_public_id);

      await bank.update(
        {
          ...(body.account_holder_name && { account_holder_name: body.account_holder_name }),
          ...(body.bank_name && { bank_name: body.bank_name }),
          ...(body.branch_name && { branch_name: body.branch_name }),
          ...(body.account_number && { account_number: body.account_number }),
          ...(body.confirm_account_number && {
            confirm_account_number: body.confirm_account_number,
          }),
          ...(body.ifsc_code && { ifsc_code: body.ifsc_code }),
          ...(body.account_type && { account_type: body.account_type }),
          ...(body.micr_code !== undefined && { micr_code: body.micr_code }),
          ...(body.upi_id !== undefined && { upi_id: body.upi_id }),
          ...(chequePassbook && {
            cancelled_cheque_passbook_original_name: chequePassbook.original_name,
            cancelled_cheque_passbook_url: chequePassbook.url,
            cancelled_cheque_passbook_public_id: chequePassbook.public_id,
          }),
          ...(bankStatement && {
            bank_statement_original_name: bankStatement.original_name,
            bank_statement_url: bankStatement.url,
            bank_statement_public_id: bankStatement.public_id,
          }),
          modified_by: req.user?.id || null,
          modified_on: new Date(),
        },
        { transaction: t }
      );
    }

    await t.commit();
    return res.status(200).json({
      success: true,
      message: 'Vendor updated successfully.',
      data: { id: parseInt(id, 10) },
    });
  } catch (err) {
    await t.rollback();
    console.error('updateVendor error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Internal server error.' });
  }
};

// ─── DELETE VENDOR ─────────────────────────────────────────────────────────────
export const deleteVendor = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const hardDelete = req.query.hardDelete === 'true';

    const vendor = await Vendor.findByPk(id);
    if (!vendor) {
      await t.rollback();
      return res.status(404).json({ success: false, message: `Vendor with id ${id} not found.` });
    }

    if (hardDelete) {
      const [address, kyc, bank] = await Promise.all([
        VendorAddress.findOne({ where: { vendor_id: id } }),
        VendorBusinessKyc.findOne({ where: { vendor_id: id } }),
        VendorBankDetails.findOne({ where: { vendor_id: id } }),
      ]);

      // Delete Cloudinary assets
      await Promise.all([
        deleteCloudinaryAsset(vendor.vendor_logo_public_id),
        deleteCloudinaryAsset(vendor.business_doc_gst_cert_public_id),
        deleteCloudinaryAsset(vendor.business_doc_pan_public_id),
        deleteCloudinaryAsset(vendor.business_doc_udyam_public_id),
        kyc && deleteCloudinaryAsset(kyc.pan_card_public_id),
        kyc && deleteCloudinaryAsset(kyc.gst_cert_public_id),
        kyc && deleteCloudinaryAsset(kyc.business_reg_cert_public_id),
        kyc && deleteCloudinaryAsset(kyc.moa_aoa_public_id),
        kyc && deleteCloudinaryAsset(kyc.address_proof_public_id),
        kyc && deleteCloudinaryAsset(kyc.kyc_cancelled_cheque_public_id),
        bank && deleteCloudinaryAsset(bank.cancelled_cheque_passbook_public_id),
        bank && deleteCloudinaryAsset(bank.bank_statement_public_id),
      ]);

      await Promise.all([
        address && address.destroy({ transaction: t }),
        kyc && kyc.destroy({ transaction: t }),
        bank && bank.destroy({ transaction: t }),
      ]);
      await vendor.destroy({ transaction: t });
    } else {
      // Soft delete
      const now = new Date();
      const userId = req.user?.id || null;
      await Promise.all([
        Vendor.update(
          { is_active: false, modified_by: userId, modified_on: now },
          { where: { id }, transaction: t }
        ),
        VendorAddress.update(
          { is_active: false, modified_by: userId, modified_on: now },
          { where: { vendor_id: id }, transaction: t }
        ),
        VendorBusinessKyc.update(
          { is_active: false, modified_by: userId, modified_on: now },
          { where: { vendor_id: id }, transaction: t }
        ),
        VendorBankDetails.update(
          { is_active: false, modified_by: userId, modified_on: now },
          { where: { vendor_id: id }, transaction: t }
        ),
      ]);
    }

    await t.commit();
    return res.status(200).json({
      success: true,
      message: hardDelete
        ? 'Vendor permanently deleted.'
        : 'Vendor deleted (soft-delete) successfully.',
    });
  } catch (err) {
    await t.rollback();
    console.error('deleteVendor error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Internal server error.' });
  }
};