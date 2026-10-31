import db from '../models/index.js';
import { respondWithError } from '../middleware/errorHandler.js';
import { withLocationNames, maskAccountNumber } from './farmerProfile.controller.js';

// Request bodies and :id are validated (and normalised) by zod in routes/farmerRoutes.js
// (validation/farmer.schemas.js), so the handlers below receive clean values.

const {
  UserAddress,
  UserBankDetails,
  UserUpiDetails,
  MasterState,
  MasterDistrict,
  MasterBlock,
  sequelize,
} = db;

// The farmer's identity always comes from the verified token, never from the body/URL.
const farmerId = (req) => req.user?.id || req.user?.userId;

const fail = (res, status, message) => res.status(status).json({ success: false, message });

// ─────────────────────────────────────────────────────────────────────────────
//  Address helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Checks that state/district/block exist and belong to each other. Returns an error string or null. */
const validateLocation = async ({ state, district, block }) => {
  const [stateRow, districtRow, blockRow] = await Promise.all([
    MasterState.findByPk(state),
    MasterDistrict.findByPk(district),
    MasterBlock.findByPk(block),
  ]);
  if (!stateRow) return 'Invalid state';
  if (!districtRow || districtRow.state_id !== state) return 'District does not belong to the selected state';
  if (!blockRow || blockRow.district_id !== district) return 'Taluka does not belong to the selected district';
  return null;
};

const serializeAddress = async (address) => {
  const toNamed = await withLocationNames([address]);
  return {
    id: address.id,
    is_primary: address.is_primary,
    type: address.is_primary ? 'Home' : 'Farm/Warehouse',
    ...toNamed(address),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/farmer/addresses
//  Body: { lane_1, lane_2?, state, district, block, village, pincode, is_primary? }
// ─────────────────────────────────────────────────────────────────────────────
export const addFarmerAddress = async (req, res) => {
  try {
    const userId = farmerId(req);
    const { lane_1, lane_2, state, district, block, village, pincode, is_primary } = req.body;

    const locationError = await validateLocation({ state, district, block });
    if (locationError) return fail(res, 400, locationError);

    const existingCount = await UserAddress.count({ where: { user_id: userId } });
    const makePrimary = existingCount === 0 || is_primary === true;

    const address = await sequelize.transaction(async (t) => {
      if (makePrimary) {
        await UserAddress.update({ is_primary: false }, { where: { user_id: userId }, transaction: t });
      }
      return UserAddress.create({
        user_id: userId,
        lane_1,
        lane_2: lane_2 || null,
        state,
        district,
        block,
        village,
        pincode,
        is_primary: makePrimary,
        is_active: true,
        created_by: userId,
      }, { transaction: t });
    });

    return res.status(201).json({
      success: true,
      message: 'Address added successfully',
      data: await serializeAddress(address),
    });
  } catch (error) {
    return respondWithError(req, res, error, 'addFarmerAddress');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/farmer/addresses/:id
//  Body: any of lane_1, lane_2, state, district, block, village, pincode, is_primary(true)
// ─────────────────────────────────────────────────────────────────────────────
export const updateFarmerAddress = async (req, res) => {
  try {
    const userId = farmerId(req);
    const address = await UserAddress.findOne({ where: { id: req.valid.params.id, user_id: userId } });
    if (!address) return fail(res, 404, 'Address not found');

    const body = req.body;
    const next = Object.fromEntries(
      ['lane_1', 'lane_2', 'state', 'district', 'block', 'village', 'pincode'].map((k) => [k, body[k] ?? address[k]]),
    );

    const locationChanged = ['state', 'district', 'block'].some((k) => next[k] !== address[k]);
    if (locationChanged) {
      const locationError = await validateLocation(next);
      if (locationError) return fail(res, 400, locationError);
    }

    const setPrimary = body.is_primary === true;
    const unsetPrimary = body.is_primary === false;
    if (unsetPrimary && address.is_primary) {
      return fail(res, 400, 'Choose another address as primary instead of unsetting this one');
    }

    await sequelize.transaction(async (t) => {
      if (setPrimary && !address.is_primary) {
        await UserAddress.update({ is_primary: false }, { where: { user_id: userId }, transaction: t });
      }
      await address.update({
        ...next,
        ...(setPrimary && { is_primary: true }),
        modified_by: userId,
        modified_on: new Date(),
      }, { transaction: t });
    });

    return res.status(200).json({
      success: true,
      message: setPrimary ? 'Primary address updated' : 'Address updated successfully',
      data: await serializeAddress(address),
    });
  } catch (error) {
    return respondWithError(req, res, error, 'updateFarmerAddress');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /api/farmer/addresses/:id
// ─────────────────────────────────────────────────────────────────────────────
export const deleteFarmerAddress = async (req, res) => {
  try {
    const userId = farmerId(req);
    const address = await UserAddress.findOne({ where: { id: req.valid.params.id, user_id: userId } });
    if (!address) return fail(res, 404, 'Address not found');

    if (address.is_primary) {
      const others = await UserAddress.count({ where: { user_id: userId, id: { [db.Op.ne]: address.id } } });
      if (others > 0) return fail(res, 400, 'Set another address as primary before deleting this one');
    }

    await address.destroy();
    return res.status(200).json({ success: true, message: 'Address deleted successfully' });
  } catch (error) {
    return respondWithError(req, res, error, 'deleteFarmerAddress');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  Bank accounts
// ─────────────────────────────────────────────────────────────────────────────
const serializeBank = (b) => ({
  id: b.id,
  bank_name: b.bank_name,
  acc_holder_name: b.acc_holder_name,
  acc_number: maskAccountNumber(b.acc_number),
  ifsc_code: b.ifsc_code,
  is_primary: b.is_primary,
  passbook_image_url: b.passbook_image_url || null,
});

// POST /api/farmer/bank-accounts
// Body: { bank_name, acc_holder_name, acc_number, ifsc_code, is_primary? }
export const addBankAccount = async (req, res) => {
  try {
    const userId = farmerId(req);
    const { bank_name, acc_holder_name, acc_number: accNumber, ifsc_code: ifsc, is_primary } = req.body;

    const duplicate = await UserBankDetails.findOne({ where: { user_id: userId, acc_number: accNumber } });
    if (duplicate) return fail(res, 409, 'This bank account is already added');

    const existingCount = await UserBankDetails.count({ where: { user_id: userId } });
    const makePrimary = existingCount === 0 || is_primary === true;

    const account = await sequelize.transaction(async (t) => {
      if (makePrimary) {
        await UserBankDetails.update({ is_primary: false }, { where: { user_id: userId }, transaction: t });
      }
      return UserBankDetails.create({
        user_id: userId,
        bank_name,
        acc_holder_name,
        acc_number: accNumber,
        ifsc_code: ifsc,
        is_primary: makePrimary,
        is_active: true,
        created_by: userId,
        modified_by: userId,
      }, { transaction: t });
    });

    return res.status(201).json({ success: true, message: 'Bank account added successfully', data: serializeBank(account) });
  } catch (error) {
    return respondWithError(req, res, error, 'addBankAccount');
  }
};

// PATCH /api/farmer/bank-accounts/:id
// Body: any of bank_name, acc_holder_name, acc_number, ifsc_code, is_primary(true)
export const updateBankAccount = async (req, res) => {
  try {
    const userId = farmerId(req);
    const account = await UserBankDetails.findOne({ where: { id: req.valid.params.id, user_id: userId } });
    if (!account) return fail(res, 404, 'Bank account not found');

    const body = req.body;
    const updates = {};

    if (body.bank_name !== undefined) updates.bank_name = body.bank_name;
    if (body.acc_holder_name !== undefined) updates.acc_holder_name = body.acc_holder_name;
    if (body.ifsc_code !== undefined) updates.ifsc_code = body.ifsc_code;
    if (body.acc_number !== undefined) {
      const accNumber = body.acc_number;
      if (accNumber !== account.acc_number) {
        const duplicate = await UserBankDetails.findOne({
          where: { user_id: userId, acc_number: accNumber, id: { [db.Op.ne]: account.id } },
        });
        if (duplicate) return fail(res, 409, 'This bank account is already added');
        updates.acc_number = accNumber;
      }
    }

    const setPrimary = body.is_primary === true;
    const unsetPrimary = body.is_primary === false;
    if (unsetPrimary && account.is_primary) {
      return fail(res, 400, 'Choose another account as primary instead of unsetting this one');
    }

    await sequelize.transaction(async (t) => {
      if (setPrimary && !account.is_primary) {
        await UserBankDetails.update({ is_primary: false }, { where: { user_id: userId }, transaction: t });
      }
      await account.update({
        ...updates,
        ...(setPrimary && { is_primary: true }),
        modified_by: userId,
        modified_on: new Date(),
      }, { transaction: t });
    });

    return res.status(200).json({
      success: true,
      message: setPrimary ? 'Primary bank account updated' : 'Bank account updated successfully',
      data: serializeBank(account),
    });
  } catch (error) {
    return respondWithError(req, res, error, 'updateBankAccount');
  }
};

// DELETE /api/farmer/bank-accounts/:id
export const deleteBankAccount = async (req, res) => {
  try {
    const userId = farmerId(req);
    const account = await UserBankDetails.findOne({ where: { id: req.valid.params.id, user_id: userId } });
    if (!account) return fail(res, 404, 'Bank account not found');

    if (account.is_primary) {
      const others = await UserBankDetails.count({ where: { user_id: userId, id: { [db.Op.ne]: account.id } } });
      if (others > 0) return fail(res, 400, 'Set another account as primary before deleting this one');
    }

    await account.destroy();
    return res.status(200).json({ success: true, message: 'Bank account deleted successfully' });
  } catch (error) {
    return respondWithError(req, res, error, 'deleteBankAccount');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  UPI IDs
// ─────────────────────────────────────────────────────────────────────────────
const serializeUpi = (u) => ({ id: u.id, upi_id: u.upi_id });

// POST /api/farmer/upi   Body: { upi_id }
export const addUpi = async (req, res) => {
  try {
    const userId = farmerId(req);
    const upiId = req.body.upi_id;

    const duplicate = await UserUpiDetails.findOne({ where: { user_id: userId, upi_id: upiId } });
    if (duplicate) return fail(res, 409, 'This UPI ID is already added');

    const upi = await UserUpiDetails.create({ user_id: userId, upi_id: upiId, created_by: userId, modified_by: userId });
    return res.status(201).json({ success: true, message: 'UPI ID added successfully', data: serializeUpi(upi) });
  } catch (error) {
    return respondWithError(req, res, error, 'addUpi');
  }
};

// PATCH /api/farmer/upi/:id   Body: { upi_id }
export const updateUpi = async (req, res) => {
  try {
    const userId = farmerId(req);
    const upi = await UserUpiDetails.findOne({ where: { id: req.valid.params.id, user_id: userId } });
    if (!upi) return fail(res, 404, 'UPI ID not found');

    const upiId = req.body.upi_id;

    const duplicate = await UserUpiDetails.findOne({
      where: { user_id: userId, upi_id: upiId, id: { [db.Op.ne]: upi.id } },
    });
    if (duplicate) return fail(res, 409, 'This UPI ID is already added');

    await upi.update({ upi_id: upiId, modified_by: userId, modified_on: new Date() });
    return res.status(200).json({ success: true, message: 'UPI ID updated successfully', data: serializeUpi(upi) });
  } catch (error) {
    return respondWithError(req, res, error, 'updateUpi');
  }
};

// DELETE /api/farmer/upi/:id
export const deleteUpi = async (req, res) => {
  try {
    const userId = farmerId(req);
    const upi = await UserUpiDetails.findOne({ where: { id: req.valid.params.id, user_id: userId } });
    if (!upi) return fail(res, 404, 'UPI ID not found');

    await upi.destroy();
    return res.status(200).json({ success: true, message: 'UPI ID deleted successfully' });
  } catch (error) {
    return respondWithError(req, res, error, 'deleteUpi');
  }
};
