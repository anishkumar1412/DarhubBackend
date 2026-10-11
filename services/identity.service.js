import { Op, fn, col, where as sqlWhere } from 'sequelize';
import db from '../models/index.js';
import { ApiError } from '../utils/apiError.js';
import { isSmsConfigured } from './sms.service.js';
import { normalizeEmail, isValidEmail, normalizeMobile, findVerifiedChannels } from './registration.service.js';

const { User, OtpVerification } = db;

/**
 * Changing the e-mail or mobile number of an existing account. Every endpoint that can do it (farmer-edit,
 * pilot-edit, PATCH /api/farmer/profile) goes through here, so they all apply the same rules:
 *  - normalised (lower-cased e-mail, 10-digit mobile) and unique, ignoring case and "+91"/"0" spellings;
 *  - unless an administrator makes the change, the new e-mail must have been verified with an OTP in the last
 *    30 minutes, and so must the new mobile number whenever an SMS gateway is connected (otherwise anyone could
 *    attach an address/number they do not own, and lock its real owner out of registering);
 *  - the isEmailVerify / isMobileVerify flags follow the new value.
 *
 * Returns the User columns to write ({} when nothing changes) or throws ApiError(400/409).
 */
export const resolveIdentityChange = async (targetUser, { email, mobile_number }, { editedByAdmin }) => {
  const updates = {};

  if (email !== undefined && email !== null) {
    const emailStr = normalizeEmail(email);
    if (!isValidEmail(emailStr)) throw new ApiError(400, 'Invalid email format. Enter a valid email address, e.g. name@example.com');
    if (emailStr !== normalizeEmail(targetUser.email)) {
      const clash = await User.findOne({
        where: { id: { [Op.ne]: targetUser.id }, [Op.and]: [sqlWhere(fn('lower', col('email')), emailStr)] },
        attributes: ['id'],
      });
      if (clash) throw new ApiError(409, 'User already exists with this email');

      if (!editedByAdmin) {
        const proof = await findVerifiedChannels({ OtpVerification }, { email: emailStr, mobile: null });
        if (!proof.email) throw new ApiError(400, 'Verify the new email address with the OTP we send to it before changing it.');
      }
      updates.email = emailStr;
      updates.isEmailVerify = !editedByAdmin;
    }
  }

  if (mobile_number !== undefined && mobile_number !== null) {
    const mobileStr = normalizeMobile(mobile_number);
    if (!mobileStr) throw new ApiError(400, 'Mobile number must be exactly 10 digits');
    if (mobileStr !== normalizeMobile(targetUser.mobile_number)) {
      const clash = await User.findOne({
        where: { id: { [Op.ne]: targetUser.id }, mobile_number: { [Op.in]: [mobileStr, `0${mobileStr}`, `91${mobileStr}`, `+91${mobileStr}`] } },
        attributes: ['id'],
      });
      if (clash) throw new ApiError(409, 'User already exists with this mobile number');

      // A code can only be asked for when an SMS can be delivered (services/sms.service.js)
      let verified = false;
      if (!editedByAdmin && isSmsConfigured()) {
        const proof = await findVerifiedChannels({ OtpVerification }, { email: null, mobile: mobileStr });
        if (!proof.mobile) throw new ApiError(400, 'Verify the new mobile number with the OTP we send to it before changing it.');
        verified = true;
      }
      updates.mobile_number = mobileStr;
      updates.isMobileVerify = verified;
    }
  }

  return updates;
};

/** A verification is good for one change: remove it once used. */
export const consumeIdentityVerification = (updates, transaction) => {
  const filters = [
    ...(updates.email && updates.isEmailVerify ? [sqlWhere(fn('lower', col('email')), updates.email)] : []),
    ...(updates.mobile_number && updates.isMobileVerify ? [{ mobile_number: updates.mobile_number }] : []),
  ];
  if (!filters.length) return null;
  return OtpVerification.destroy({ where: { [Op.or]: filters }, transaction });
};

/** True for a user with an activated admin profile. */
export const isActivatedAdmin = async (userId) => {
  const user = await User.findByPk(userId, { attributes: ['id', 'user_type', 'is_active'] });
  if (!user || user.user_type !== 2 || user.is_active === false) return false;
  const profile = await db.AdminProfile.findOne({ where: { user_id: userId }, attributes: ['is_verified'] });
  return profile?.is_verified === true;
};
