import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../models/index.js';
import { uploadToCloudinary } from '../middleware/upload.js';
import { respondWithError } from '../middleware/errorHandler.js';
import { ApiError } from '../utils/apiError.js';
import { issueSessionTokens } from '../services/token.service.js';
import {
  findVerifiedChannels, consumeVerification, lockIdentifiers, findAccountsByIdentity, evaluateRegistration,
  buildAddresses, parseAddressInput, verificationProblem,
} from '../services/registration.service.js';
import {
  validateImage, discardUploads, uploadPilotFiles, PILOT_FILES, readBankDetails, readUpiId, readAadhar, readPan,
} from '../services/profileInput.service.js';
import { parseOrThrow } from '../middleware/validate.js';
import { registrationIdentitySchema } from '../validation/auth.schemas.js';

const { User, UserRole, UserProfile, UserAddress, MasterRole, OtpVerification } = db;

// ── helpers ──────────────────────────────────────────────────────

/** Optional Authorization header: when present it must be valid, and names who created the account. */
const optionalCreatorId = (req) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    return decoded.id || decoded.userId || null;
  } catch {
    throw new ApiError(401, 'Invalid or expired token.');
  }
};

/**
 * The fields every registration shares (zod schema in validation/auth.schemas.js). Returns the clean values or
 * throws a 400. Verification is NOT taken from the request: see `requireVerifiedChannel`.
 */
const readIdentity = (body, { emailRequired = true } = {}) => {
  const v = parseOrThrow(registrationIdentitySchema({ emailRequired }), body);
  return {
    firstName: v.first_name, lastName: v.last_name, email: v.email || null, mobile: v.mobile_number,
    password: v.password, dob: v.dob ?? null,
  };
};

/**
 * Registration needs real proof, held by the server, that the person controls the email and/or mobile number
 * (an OTP verified in the last 30 minutes). The old code trusted `isverifyEmail` / `isMobileVerify` from the
 * request body, so anyone could register any email address or number with no OTP at all.
 */
const requireVerifiedChannel = async ({ email, mobile }) => {
  const verified = await findVerifiedChannels({ OtpVerification }, { email, mobile });
  const problem = verificationProblem({ email }, verified);
  if (problem) throw new ApiError(400, problem);
  return verified;
};

const findOrCreateRole = async (name, description) => {
  const existing = await MasterRole.findOne({ where: { role_name: { [db.Sequelize.Op.iLike]: name } } });
  if (existing) return existing;
  const [role] = await MasterRole.findOrCreate({
    where: { role_name: name },
    defaults: { role_name: name, role_desc: description, is_active: true },
  });
  return role;
};

/**
 * One transaction for the whole account: user, role, profile, addresses (and whatever `extras` adds).
 * Concurrent sign-ups for the same email/mobile are serialised, so the duplicate check cannot be raced.
 */
const createAccount = async ({ identity, verified, userType, refPrefix, role, creatorId, imageInfo, addresses, extras }) => {
  const hashedPassword = await bcrypt.hash(identity.password, 10);

  return db.sequelize.transaction(async (t) => {
    await lockIdentifiers(db.sequelize, t, [identity.email, identity.mobile]);

    // Decided again here, under the lock: another request may have registered these details a moment ago
    const decision = evaluateRegistration(await findAccountsByIdentity({ User }, identity, t), identity, verified, userType);

    const accountFields = {
      email: identity.email,
      password: hashedPassword,
      username: `${identity.firstName}_${identity.lastName}_${Date.now()}`.substring(0, 50),
      mobile_number: identity.mobile,
      isEmailVerify: verified.email,
      isMobileVerify: verified.mobile,
    };

    let user;
    if (decision.action === 'claim') {
      // The person proved they own the number / address that an administrator booked under: this becomes their
      // account, keeping every booking made for them. The placeholder's unusable password is replaced by theirs.
      user = decision.existing;
      await user.update({ ...accountFields, email: identity.email ?? user.email, modified_by: user.id, modified_on: new Date() }, { transaction: t });
    } else {
      user = await User.create({ ...accountFields, is_superuser: false, user_type: userType, created_by: creatorId }, { transaction: t });
    }

    const ownerId = creatorId || user.id;
    await user.update({
      user_ref_id: user.user_ref_id || `${refPrefix}-${String(user.id).padStart(5, '0')}`,
      ...(decision.action === 'create' && { created_by: ownerId }),
    }, { transaction: t });

    await UserRole.findOrCreate({ where: { user_id: user.id, role_id: role.id }, defaults: { created_by: ownerId }, transaction: t });

    const profileFields = {
      first_name: identity.firstName,
      last_name: identity.lastName,
      whatsapp_number: identity.mobile,
      dob: identity.dob,
      user_image_original_filename: imageInfo?.original_name || null,
      user_image_new_filename: imageInfo?.new_name || null,
      user_image_url: imageInfo?.url || null,
      ...(extras?.profile || {}),
    };
    const existingProfile = decision.action === 'claim' ? await UserProfile.findOne({ where: { user_id: user.id }, transaction: t }) : null;
    if (existingProfile) await existingProfile.update({ ...profileFields, modified_by: user.id, modified_on: new Date() }, { transaction: t });
    else await UserProfile.create({ user_id: user.id, ...profileFields, created_by: ownerId }, { transaction: t });

    if (addresses.length > 0 && decision.action === 'claim') {
      await UserAddress.destroy({ where: { user_id: user.id }, transaction: t });   // the form is the person's own, up-to-date address
    }
    for (const address of addresses) {
      await UserAddress.create({ user_id: user.id, ...address, created_by: ownerId }, { transaction: t });
    }

    if (extras?.afterCreate) await extras.afterCreate(user, ownerId, t);

    await consumeVerification({ OtpVerification }, { email: verified.email ? identity.email : null, mobile: verified.mobile ? identity.mobile : null }, t);

    const tokens = await issueSessionTokens(user, { transaction: t });
    return { user, tokens, claimed: decision.action === 'claim' };
  });
};

/**
 * Fails fast, before any document is uploaded to Cloudinary: a sign-up that is going to be refused (the details
 * belong to an existing account) used to upload every file first and then answer "already exists". createAccount
 * decides again, under a lock, because two requests can race.
 */
const assertCanRegister = async (identity, verified, userType) =>
  evaluateRegistration(await findAccountsByIdentity({ User }, identity), identity, verified, userType);

const success = (res, message, { user, tokens, claimed }) =>
  res.status(201).json({
    success: true,
    message,
    // true when the details belonged to a booking an administrator made for this person: it is now their account
    ...(claimed && { linked_existing_bookings: true }),
    user_id: user.id,
    user_ref_id: user.user_ref_id,
    token: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });

// ═══════════════════════════════════════════════════════════════
//  POST /api/user/farmer-registration  (multipart; public)
// ═══════════════════════════════════════════════════════════════
export const registerFarmer = async (req, res) => {
  const uploaded = [];
  try {
    const creatorId = optionalCreatorId(req);
    const body = req.body || {};

    const identity = readIdentity(body, { emailRequired: false });
    const verified = await requireVerifiedChannel(identity);
    await assertCanRegister(identity, verified, 3);

    // Which role a farmer gets is decided here. The client used to send a role id ("10") that was trusted as-is,
    // so a hand-made request could give itself any role, including an administrator's.
    const role = await findOrCreateRole('Farmer', 'Farmer user role');

    const addresses = await buildAddresses(db, parseAddressInput(body));

    validateImage(req.file, 'Profile photo', ['jpg', 'jpeg', 'png']);
    let imageInfo = null;
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, 'farmers', 'auto', req.file.originalname);
      imageInfo = { original_name: req.file.originalname, new_name: result.public_id, url: result.secure_url, resource_type: 'image' };
      uploaded.push(imageInfo);
    }

    const created = await createAccount({
      identity, verified, userType: 3, refPrefix: 'FAM', role, creatorId, imageInfo, addresses,
    });
    return success(res, 'Farmer registered successfully', created);
  } catch (error) {
    await discardUploads(uploaded);
    return respondWithError(req, res, error, 'registerFarmer');
  }
};

// ═══════════════════════════════════════════════════════════════
//  POST /api/user/pilot-registration  (multipart; public)
// ═══════════════════════════════════════════════════════════════
export const registerPilot = async (req, res) => {
  const uploaded = [];
  try {
    const creatorId = optionalCreatorId(req);
    const body = req.body || {};

    const identity = readIdentity(body);
    const verified = await requireVerifiedChannel(identity);
    await assertCanRegister(identity, verified, 2);

    const upiId = readUpiId(body.upi_id);
    const banks = readBankDetails(body) || [];
    const aadharNumber = readAadhar(body.aadhar_number);
    const panNumber = readPan(body.pan_card_number);

    const role = await MasterRole.findOne({ where: { role_name: { [db.Sequelize.Op.iLike]: 'Pilot' } } });
    if (!role) throw new ApiError(500, "Role validation failed: 'Pilot' role is not configured in the database");

    const addresses = await buildAddresses(db, parseAddressInput(body));

    // Validate every file first, upload only when all are acceptable
    const { files, uploaded: pilotUploads } = await uploadPilotFiles(req.files, uploadToCloudinary);
    uploaded.push(...pilotUploads);

    const created = await createAccount({
      identity, verified, userType: 2, refPrefix: 'PIL', role, creatorId,
      imageInfo: files.profile_image?.[0], addresses,
      extras: {
        profile: {
          aadhar_number: aadharNumber,
          pan_card_number: panNumber,
        },
        afterCreate: async (user, ownerId, t) => {
          for (const bank of banks) {
            await db.UserBankDetails.create({
              user_id: user.id, ...bank,
              passbook_image_url: files.passbook_image?.[0]?.url || null,
              is_active: true, created_by: ownerId,
            }, { transaction: t });
          }
          if (upiId) {
            await db.UserUpiDetails.create({ user_id: user.id, upi_id: upiId, created_by: ownerId }, { transaction: t });
          }
          for (const field of PILOT_FILES.filter((f) => !f.isBank)) {
            for (const info of files[field.key] || []) {
              await db.UserDocuments.create({
                user_id: user.id, document_type: field.docType,
                document_original_name: info.original_name, document_new_name: info.new_name, document_url: info.url,
                is_active: true, created_by: ownerId,
              }, { transaction: t });
            }
          }
        },
      },
    });
    return success(res, 'Pilot registered successfully', created);
  } catch (error) {
    await discardUploads(uploaded);
    return respondWithError(req, res, error, 'registerPilot');
  }
};
