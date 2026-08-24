import express from 'express';
import {
  createVendor,
  getAllVendors,
  getVendorById,
  updateVendor,
  deleteVendor,
} from '../controllers/vendor.controller.js';
import upload from '../middleware/upload.js';

const router = express.Router();

// File fields expected from multipart/form-data
const vendorUploadFields = upload.fields([
  // VendorBasic uploads
  { name: 'vendor_logo', maxCount: 1 },
  { name: 'business_doc_gst_cert', maxCount: 1 },
  { name: 'business_doc_pan', maxCount: 1 },
  { name: 'business_doc_udyam', maxCount: 1 },
  // VendorBusinessKyc uploads
  { name: 'pan_card', maxCount: 1 },
  { name: 'gst_cert', maxCount: 1 },
  { name: 'business_reg_cert', maxCount: 1 },
  { name: 'moa_aoa', maxCount: 1 },
  { name: 'address_proof', maxCount: 1 },
  { name: 'kyc_cancelled_cheque', maxCount: 1 },
  // VendorBankDetails uploads
  { name: 'cancelled_cheque_passbook', maxCount: 1 },
  { name: 'bank_statement', maxCount: 1 },
]);

// ── Vendor CRUD Routes ─────────────────────────────────────────────────────────
router.post('/filter', getAllVendors);          // GET all vendors with filter & pagination
router.get('/:id', getVendorById);              // GET vendor by ID (all 4 sections)
router.post('/', vendorUploadFields, createVendor);      // CREATE vendor (multipart/form-data)
router.put('/:id', vendorUploadFields, updateVendor);    // UPDATE vendor (multipart/form-data)
router.delete('/:id', deleteVendor);            // DELETE vendor (soft / ?hardDelete=true)

export default router;
