import jwt from 'jsonwebtoken';
import db from '../models/index.js';
import { respondWithError } from './errorHandler.js';
import { isPilotAccount, isFarmerAccount } from '../utils/roles.js';

const { User, AdminProfile, UserRole, MasterRole } = db;

/** Lower-cased names of the user's roles (a user normally has one). */
export const loadRoleNames = async (userId) => {
  const links = await UserRole.findAll({ where: { user_id: userId }, attributes: ['role_id'], raw: true });
  if (!links.length) return [];
  const roles = await MasterRole.findAll({ where: { id: links.map((l) => l.role_id) }, attributes: ['role_name'], raw: true });
  return roles.map((r) => String(r.role_name || '').trim().toLowerCase());
};

export { isPilotAccount, isFarmerAccount };

/**
 * Any signed-in user (farmer, pilot or admin). Attaches req.auth = { id, userType, isAdmin }.
 *
 * Unlike the plain `authenticate` (which only checks the token's signature), this confirms the account still
 * exists and tells admins apart, so handlers can serve a farmer their own data and an admin everything.
 * Only a bad token is a 401; a database failure goes to the error handler (never a false "session expired").
 */
export const authenticateUser = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, code: 'NO_TOKEN', message: 'No token provided. Unauthorized.', error: 'No token provided. Unauthorized.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    const message = expired ? 'Token expired. Please login again.' : 'Invalid token.';
    return res.status(401).json({ success: false, code: expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN', message, error: message });
  }

  try {
    const user = await User.findByPk(decoded.id, { attributes: ['id', 'user_type', 'is_active'] });
    if (!user || user.is_active === false) {
      return res.status(401).json({ success: false, code: 'USER_NOT_FOUND', message: 'User not found. Please login again.', error: 'User not found. Please login again.' });
    }

    // Admins share user_type 2 with pilots; what makes someone an admin is an activated admin profile.
    let isAdmin = false;
    if (user.user_type === 2) {
      const profile = await AdminProfile.findOne({ where: { user_id: user.id }, attributes: ['is_verified'] });
      isAdmin = profile?.is_verified === true;
    }

    req.auth = { id: user.id, userType: user.user_type, isAdmin };
    req.user = { id: user.id, email: decoded.email }; // what the audit fields (created_by / modified_by) read
    return next();
  } catch (err) {
    return respondWithError(req, res, err, 'authenticateUser');
  }
};

const forbidden = (res, message) =>
  res.status(403).json({ success: false, code: 'FORBIDDEN', message, error: message });

/** For routes like /users/:user_id/...: a user may act on their own record, an admin on anyone's. */
export const requireSelfOrAdmin = (param = 'user_id') => (req, res, next) => {
  if (req.auth?.isAdmin || String(req.params[param]) === String(req.auth?.id)) return next();
  return forbidden(res, 'You can only access your own data.');
};

/**
 * For search-style endpoints that take a user_id in the body: a non-admin is always scoped to themselves,
 * whatever user_id they send.
 */
export const scopeBodyToCaller = (req, res, next) => {
  if (!req.auth?.isAdmin) req.body = { ...(req.body || {}), user_id: req.auth.id };
  return next();
};

/** Farmer-only, for use after authenticateUser (pilots and admins have their own endpoints). */
export const requireFarmer = async (req, res, next) => {
  try {
    const roles = await loadRoleNames(req.auth.id);
    if (!isFarmerAccount(req.auth.userType, roles)) return forbidden(res, 'Only farmer accounts can use this endpoint.');
    req.auth.roles = roles;
    return next();
  } catch (err) {
    return respondWithError(req, res, err, 'requireFarmer');
  }
};

/** Admin-only, for use after authenticateUser. */
export const requireAdminRole = (req, res, next) =>
  req.auth?.isAdmin ? next() : forbidden(res, 'Only administrators can do this.');
