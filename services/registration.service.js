import { Op, fn, col, where as sqlWhere } from 'sequelize';
import { ApiError } from '../utils/apiError.js';
import { lockKeys } from '../utils/locks.js';

/**
 * Rules shared by every self-registration flow (farmer, pilot): how identifiers are normalised, what counts as
 * proof that an email/mobile was verified, and how addresses, birth dates and passwords are validated.
 * Pure functions where possible; the ones that read the database take the models as an argument so they can be tested.
 */

export const VERIFICATION_VALID_MINUTES = 30;

// ── Identifiers ──────────────────────────────────────────────────

/** Lower-cased, trimmed e-mail: the single stored/compared form (login already compares case-insensitively). */
export const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isValidEmail = (email) => email.length <= 254 && EMAIL_RE.test(email);

/**
 * 10-digit Indian mobile number, or null. Accepts "+91 98765 43210", "919876543210" and "09876543210" but
 * does not silently cut longer input down to its last 10 digits (that stored the wrong number).
 */
export const normalizeMobile = (value) => {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^\d{10}$/.test(digits) ? digits : null;
};

// ── Password ─────────────────────────────────────────────────────

/** bcrypt only reads the first 72 bytes, so a longer password would be silently truncated. */
export const validatePassword = (password) => {
  if (typeof password !== 'string' || password.length === 0) return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (Buffer.byteLength(password, 'utf8') > 72) return 'Password must be at most 72 bytes long';
  return null;
};

// ── Date of birth ────────────────────────────────────────────────

/** Accepts dd/mm/yyyy or yyyy-mm-dd. Returns { value } (a Date or null when absent) or { error }. */
export const parseDob = (input, now = new Date()) => {
  if (input === undefined || input === null || String(input).trim() === '') return { value: null };
  const text = String(input).trim();

  let y; let m; let d;
  let match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) { [, d, m, y] = match.map(Number); }
  else if ((match = text.match(/^(\d{4})-(\d{2})-(\d{2})/))) { [, y, m, d] = match.map(Number); }
  else return { error: 'Date of birth must be dd/mm/yyyy' };

  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { error: 'Date of birth is not a real date' };
  }
  if (date > now) return { error: 'Date of birth cannot be in the future' };
  if (y < now.getUTCFullYear() - 120) return { error: 'Date of birth is not valid' };
  return { value: date };
};

// ── OTP proof ────────────────────────────────────────────────────

/**
 * Is the proof of ownership enough to create the account? Returns a message for the user, or null when it is.
 *  - an e-mail that was given must have been verified (otherwise anybody could claim someone else's address and
 *    stop its owner from ever registering);
 *  - at least one contact must be verified: the e-mail, or - for people who gave no e-mail - the mobile number.
 */
export const verificationProblem = ({ email }, verified) => {
  if (email && !verified.email) {
    return 'Please verify your email address with the OTP we sent before registering. If the code expired, request a new one.';
  }
  if (!verified.email && !verified.mobile) {
    return 'Please verify your mobile number with the OTP we sent before registering. If the code expired, request a new one.';
  }
  return null;
};

/**
 * Which of the two identifiers has really been verified with an OTP in the last [VERIFICATION_VALID_MINUTES].
 * This - never a flag in the request body - decides what is stored as verified.
 */
export const findVerifiedChannels = async ({ OtpVerification }, { email, mobile }, now = new Date()) => {
  const since = new Date(now.getTime() - VERIFICATION_VALID_MINUTES * 60 * 1000);
  const base = { modified_on: { [Op.gte]: since } };

  const [emailRow, mobileRow] = await Promise.all([
    email
      ? OtpVerification.findOne({ where: { ...base, is_email_verified: true, [Op.and]: [sqlWhere(fn('lower', col('email')), email)] } })
      : null,
    mobile
      ? OtpVerification.findOne({ where: { ...base, is_mobile_verified: true, mobile_number: mobile } })
      : null,
  ]);
  return { email: Boolean(emailRow), mobile: Boolean(mobileRow) };
};

/** A verification is good for one registration: remove it once the account exists. */
export const consumeVerification = ({ OtpVerification }, { email, mobile }, transaction) =>
  OtpVerification.destroy({
    where: {
      [Op.or]: [
        ...(email ? [sqlWhere(fn('lower', col('email')), email)] : []),
        ...(mobile ? [{ mobile_number: mobile }] : []),
      ],
    },
    transaction,
  });

// ── Duplicates ───────────────────────────────────────────────────

/**
 * Serialises concurrent sign-ups for the same e-mail/mobile. The database has no unique index on them (yet), so
 * "check, then insert" alone lets two simultaneous requests both pass the check. A transaction-scoped advisory
 * lock makes the second request wait until the first has committed, then see its row.
 */
export const lockIdentifiers = (sequelize, transaction, keys) =>
  lockKeys(sequelize, transaction, keys.filter(Boolean).map((key) => `signup:${key}`));

export const findDuplicate = async ({ User }, { email, mobile }, transaction) => {
  if (email) {
    const byEmail = await User.findOne({ where: sqlWhere(fn('lower', col('email')), email), transaction });
    if (byEmail) return 'User already exists with this email';
  }
  if (mobile) {
    // Older rows were saved as typed ("09798297100", "+919798297100"), so look for every spelling of the number
    const spellings = [mobile, `0${mobile}`, `91${mobile}`, `+91${mobile}`];
    const byMobile = await User.findOne({ where: { mobile_number: { [Op.in]: spellings } }, transaction });
    if (byMobile) return 'User already exists with this mobile number';
  }
  return null;
};

// ── Who already owns this e-mail / mobile ────────────────────────

/** Every stored spelling of a 10-digit mobile number (older rows were saved as typed). */
export const mobileSpellings = (mobile) => [mobile, `0${mobile}`, `91${mobile}`, `+91${mobile}`];

/** All accounts that use this e-mail or this mobile number (at most one per identifier; may be two different rows). */
export const findAccountsByIdentity = async ({ User }, { email, mobile }, transaction) => {
  const any = [
    ...(email ? [sqlWhere(fn('lower', col('email')), email)] : []),
    ...(mobile ? [{ mobile_number: { [Op.in]: mobileSpellings(mobile) } }] : []),
  ];
  if (!any.length) return [];
  return User.findAll({ where: { [Op.or]: any }, order: [['id', 'ASC']], transaction });
};

/**
 * An account that somebody ELSE made for a person who never registered: an administrator booking for a walk-in
 * farmer creates one from just a name and a mobile number. Such an account was never verified, never signed in
 * (nobody knows its password) and was created by another user. It is a placeholder, not a registration, so it must
 * not stop the real person from signing up: they can claim it by proving they own the contact (see
 * [evaluateRegistration]). Self-made accounts (created_by = their own id) and accounts with an unknown creator are
 * never claimable.
 */
export const isUnclaimedAccount = (user) =>
  user.user_type === 3
  && user.isEmailVerify !== true
  && user.isMobileVerify !== true
  && !user.refresh_token
  && user.created_by != null
  && Number(user.created_by) !== Number(user.id);

const sameMobile = (stored, mobile) => Boolean(mobile) && normalizeMobile(stored) === mobile;
const sameEmail = (stored, email) => Boolean(email) && normalizeEmail(stored) === email;

/** The 409 for "this belongs to an existing account": names the field and tells the person what to do. */
const alreadyRegistered = (accounts, { email, mobile }) => {
  const byEmail = accounts.some((a) => sameEmail(a.email, email));
  const byMobile = accounts.some((a) => sameMobile(a.mobile_number, mobile));
  const field = byEmail && byMobile ? 'both' : byEmail ? 'email' : 'mobile';
  const what = field === 'both' ? 'email address and mobile number' : field === 'email' ? 'email address' : 'mobile number';
  const err = new ApiError(409, accounts.length > 1 && field === 'both'
    ? `These details already belong to existing accounts. Please log in instead.`
    : `An account already exists with this ${what}. Please log in instead.`);
  err.code = 'ALREADY_EXISTS';
  err.field = field;
  return err;
};

/**
 * Decides what a sign-up with these details means. Returns { action: 'create' } or { action: 'claim', existing },
 * or throws the 409 to send back:
 *  - nobody uses the details                          -> create a new account;
 *  - they belong to a real, registered account        -> 409 "already exists, please log in" (field: email|mobile|both);
 *  - they belong to ONE unclaimed placeholder account -> claim it, but only for a farmer, and only when the person has
 *    proved (with an OTP) that they own every detail that matched the placeholder: otherwise the placeholder's
 *    bookings would be handed to whoever typed someone else's number.
 * `verified` is { email, mobile }: what the person proved in the last 30 minutes (findVerifiedChannels).
 */
export const evaluateRegistration = (accounts, identity, verified, userType) => {
  if (accounts.length === 0) return { action: 'create' };
  if (accounts.length > 1 || !isUnclaimedAccount(accounts[0]) || userType !== 3) {
    throw alreadyRegistered(accounts, identity);
  }
  const existing = accounts[0];
  const needs = [
    ...(sameEmail(existing.email, identity.email) && !verified.email ? ['email address'] : []),
    ...(sameMobile(existing.mobile_number, identity.mobile) && !verified.mobile ? ['mobile number'] : []),
  ];
  if (needs.length) {
    const err = new ApiError(409, `A booking was already made for this ${needs.join(' and ')}. Verify it with the OTP we send to link it to your new account; if you cannot receive the code, please contact Darhub support.`);
    err.code = 'CLAIM_NEEDS_VERIFICATION';
    throw err;
  }
  return { action: 'claim', existing };
};

/**
 * Used before an OTP is sent for a sign-up: null when the details may proceed (new, or a claimable placeholder),
 * otherwise the 409 to answer with. The claim itself is decided at registration, once the person has verified.
 */
export const registrationBlocker = async (models, identity) => {
  const accounts = await findAccountsByIdentity(models, identity);
  if (accounts.length === 0) return null;
  if (accounts.length === 1 && isUnclaimedAccount(accounts[0])) return null;
  return alreadyRegistered(accounts, identity);
};

// ── Addresses ────────────────────────────────────────────────────

const toId = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * Checks that the state, district and block that were sent really exist and belong together
 * (district in that state, block in that district). Returns a message, or null when consistent.
 * Parts that were not sent are not checked.
 */
export const checkLocationChain = async ({ MasterState, MasterDistrict, MasterBlock }, { state, district, block }) => {
  const stateId = toId(state);
  const districtId = toId(district);
  const blockId = toId(block);

  const [stateRow, districtRow, blockRow] = await Promise.all([
    stateId ? MasterState.findByPk(stateId) : null,
    districtId ? MasterDistrict.findByPk(districtId) : null,
    blockId ? MasterBlock.findByPk(blockId) : null,
  ]);
  if (stateId && !stateRow) return 'state is not a valid state';
  if (districtId && !districtRow) return 'district is not a valid district';
  if (blockId && !blockRow) return 'block is not a valid block';
  if (stateRow && districtRow && districtRow.state_id !== stateRow.id) return 'district does not belong to the selected state';
  if (districtRow && blockRow && blockRow.district_id !== districtRow.id) return 'block does not belong to the selected district';
  return null;
};

/**
 * Validates registration addresses against the master location tables and returns rows ready to insert.
 * The state -> district -> block chain must be consistent, the pincode must be 6 digits, and exactly one address
 * is primary. Throws ApiError(400) with a message the user can act on.
 */
export const buildAddresses = async ({ MasterState, MasterDistrict, MasterBlock }, rawAddresses) => {
  const list = Array.isArray(rawAddresses) ? rawAddresses : [];
  const rows = [];

  for (const [index, raw] of list.entries()) {
    const label = list.length > 1 ? `Address ${index + 1}: ` : 'Address: ';
    const fail = (message) => { throw new ApiError(400, `${label}${message}`); };

    const stateId = toId(raw.state);
    const districtId = toId(raw.district);
    const blockId = toId(raw.block);
    const pincode = String(raw.pincode ?? '').trim();
    const village = String(raw.village ?? '').trim();

    if (!stateId) fail('state is required');
    if (!districtId) fail('district is required');
    if (!blockId) fail('block is required');
    if (!/^[1-9]\d{5}$/.test(pincode)) fail('pincode must be a valid 6-digit pincode');
    if (!village) fail('village is required');

    const [state, district, block] = await Promise.all([
      MasterState.findByPk(stateId),
      MasterDistrict.findByPk(districtId),
      MasterBlock.findByPk(blockId),
    ]);
    if (!state) fail('state is not a valid state');
    if (!district || district.state_id !== state.id) fail('district does not belong to the selected state');
    if (!block || block.district_id !== district.id) fail('block does not belong to the selected district');

    rows.push({
      state: stateId,
      district: districtId,
      block: blockId,
      lane_1: String(raw.lane1 ?? raw.lane_1 ?? '').trim().slice(0, 255),
      lane_2: String(raw.lane2 ?? raw.lane_2 ?? '').trim().slice(0, 255),
      village: village.slice(0, 255),
      pincode,
      is_primary: raw.is_primary === true || raw.is_primary === 'true',
    });
  }

  // Exactly one primary address (the first one when none or several were marked)
  if (rows.length > 0) {
    const firstPrimary = rows.findIndex((r) => r.is_primary);
    rows.forEach((r, i) => { r.is_primary = i === (firstPrimary === -1 ? 0 : firstPrimary); });
  }
  return rows;
};

/** Reads the address(es) a client sent: a JSON string/array in `address`, or flat fields. */
export const parseAddressInput = (body) => {
  if (body.address) {
    try {
      const parsed = typeof body.address === 'string' ? JSON.parse(body.address) : body.address;
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      throw new ApiError(400, 'Address is not valid JSON');
    }
  }
  if (body.state || body.district || body.block || body.pincode || body.lane1 || body.lane_1) {
    return [{
      state: body.state, district: body.district, block: body.block, village: body.village,
      lane1: body.lane1 ?? body.lane_1, lane2: body.lane2 ?? body.lane_2, pincode: body.pincode, is_primary: body.is_primary,
    }];
  }
  return [];
};

/** True for a unique-constraint violation, which means a concurrent sign-up beat us to it. */
export const isUniqueViolation = (err) => err?.name === 'SequelizeUniqueConstraintError';
