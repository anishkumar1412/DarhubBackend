import cloudinary from 'cloudinary';
import { ApiError } from '../utils/apiError.js';
import logger from '../utils/logger.js';

/**
 * Input rules shared by registration and profile editing (farmer and pilot): uploaded files, bank details, UPI.
 * Kept in one place so an edit can never accept what registration refuses.
 */

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Both the extension AND the declared type must be allowed (one of the two alone is trivially faked). */
export const validateImage = (file, label, allowed) => {
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) throw new ApiError(400, `${label} exceeds the 5MB size limit.`);
  const ext = file.originalname.split('.').pop().toLowerCase();
  if (!allowed.includes(ext) || !allowed.some((type) => file.mimetype.includes(type))) {
    throw new ApiError(400, `${label} has an invalid format. Allowed: ${allowed.join(', ')}`);
  }
};

/** Removes files from Cloudinary when the change could not be saved, so no orphan uploads pile up. */
export const discardUploads = async (uploaded) => {
  await Promise.all(uploaded.map((u) =>
    cloudinary.v2.uploader.destroy(u.new_name, { resource_type: u.resource_type || 'image' }).catch((err) =>
      logger.warn(`Could not remove orphan upload ${u.new_name}: ${err.message}`))));
};

export const PILOT_FILES = [
  { key: 'profile_image', allowed: ['jpg', 'jpeg', 'png'], label: 'Profile photo', docType: 5 },
  { key: 'aaddhar_image', allowed: ['jpg', 'jpeg', 'png', 'pdf'], label: 'Aadhar Card', docType: 10 },
  { key: 'pan_card_image', allowed: ['jpg', 'jpeg', 'png', 'pdf'], label: 'Pan Card', docType: 15 },
  { key: 'dcga_pilot_cert', allowed: ['jpg', 'jpeg', 'png', 'pdf'], label: 'DGCI Pilot Cert', docType: 20 },
  { key: 'dcga_pilot_license', allowed: ['jpg', 'jpeg', 'png', 'pdf'], label: 'DGCI License', docType: 25 },
  { key: 'medical_certificate', allowed: ['jpg', 'jpeg', 'png', 'pdf'], label: 'Medical Cert', docType: 30 },
  { key: 'insurance_doc', allowed: ['jpg', 'jpeg', 'png', 'pdf'], label: 'Insurance Doc', docType: 35 },
  { key: 'passbook_image', allowed: ['jpg', 'jpeg', 'png'], label: 'Passbook photo', isBank: true },
];

/**
 * Validates every pilot file first, then uploads them (nothing is uploaded when one file is unacceptable).
 * Returns { files: { [fieldKey]: [info] }, uploaded: [info] }; on an upload failure the files already uploaded
 * are removed before the error is rethrown.
 */
export const uploadPilotFiles = async (reqFiles, uploadToCloudinary) => {
  for (const field of PILOT_FILES) {
    for (const file of reqFiles?.[field.key] || []) validateImage(file, field.label, field.allowed);
  }
  const files = {};
  const uploaded = [];
  try {
    for (const field of PILOT_FILES) {
      for (const file of reqFiles?.[field.key] || []) {
        const isPdf = file.originalname.split('.').pop().toLowerCase() === 'pdf';
        const result = await uploadToCloudinary(file.buffer, 'pilots', isPdf ? 'raw' : 'auto', file.originalname);
        const info = { original_name: file.originalname, new_name: result.public_id, url: result.secure_url, resource_type: isPdf ? 'raw' : 'image' };
        uploaded.push(info);
        (files[field.key] ||= []).push(info);
      }
    }
  } catch (err) {
    await discardUploads(uploaded);
    throw err;
  }
  return { files, uploaded };
};

export const UPI_RE = /^[\w.-]{2,}@[a-zA-Z][\w.-]*$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** Optional UPI id: '' when not given, otherwise a valid one (or a 400). */
export const readUpiId = (value) => {
  const upiId = text(value);
  if (upiId && (upiId.length > 100 || !UPI_RE.test(upiId))) throw new ApiError(400, 'Invalid UPI ID format');
  return upiId;
};

/**
 * Bank details are all-or-nothing (the old code filled the gaps with the text "N/A"). Accepts `bank_details`
 * (a JSON string/array/object) or flat bank_name / acc_holder_name / acc_number / ifsc_code fields.
 * Returns null when no bank details were sent, otherwise the validated rows (the first one is primary).
 */
export const readBankDetails = (body) => {
  let list = null;
  if (body.bank_details) {
    try {
      const parsed = typeof body.bank_details === 'string' ? JSON.parse(body.bank_details) : body.bank_details;
      list = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      throw new ApiError(400, 'Bank details are not valid JSON');
    }
  } else if (body.bank_name || body.acc_number) {
    list = [{ bank_name: body.bank_name, acc_holder_name: body.acc_holder_name, acc_number: body.acc_number, ifsc_code: body.ifsc_code }];
  }
  if (!list) return null;

  return list.filter((b) => b && (b.bank_name || b.acc_number)).map((b, i) => {
    const bank = {
      bank_name: text(b.bank_name).slice(0, 100),
      acc_holder_name: text(b.acc_holder_name).slice(0, 100),
      acc_number: String(b.acc_number ?? '').replace(/\s+/g, ''),
      ifsc_code: text(b.ifsc_code).toUpperCase(),
    };
    if (!bank.bank_name || !bank.acc_holder_name) throw new ApiError(400, 'Bank name and account holder name are required');
    if (!/^\d{9,18}$/.test(bank.acc_number)) throw new ApiError(400, 'Bank account number must be 9 to 18 digits');
    if (!IFSC_RE.test(bank.ifsc_code)) throw new ApiError(400, 'IFSC code is not valid (example: SBIN0001234)');
    return { ...bank, is_primary: i === 0 };
  });
};

/** 12-digit Aadhaar / ABCDE1234F PAN, both optional. */
export const readAadhar = (value) => {
  const digits = String(value ?? '').replace(/\s+/g, '');
  if (!digits) return null;
  if (!/^[2-9]\d{11}$/.test(digits)) throw new ApiError(400, 'Aadhaar number must be 12 digits');
  return digits;
};

export const readPan = (value) => {
  const pan = text(value).toUpperCase();
  if (!pan) return null;
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) throw new ApiError(400, 'PAN must look like ABCDE1234F');
  return pan;
};
