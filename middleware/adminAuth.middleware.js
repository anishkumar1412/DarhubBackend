import jwt from 'jsonwebtoken';
import db from '../models/index.js';
import env from '../config/env.js';
import { respondWithError } from './errorHandler.js';

const { User, AdminProfile, UserRole, MasterRole, MasterRolePrivilage, MasterPrivilage } = db;

// ── Role name + permission names for an admin ─────────────────────
// Three dependent round trips (role link -> role & its privilege ids together -> privilege names). Admin requests
// load this on every call and the database is remote, so each avoided round trip is noticeable.
export const loadAdminAccess = async (userId) => {
  const userRole = await UserRole.findOne({ where: { user_id: userId } });
  if (!userRole) return { role: null, permissions: [] };

  const [role, rolePrivs] = await Promise.all([
    MasterRole.findByPk(userRole.role_id),
    MasterRolePrivilage.findAll({ where: { role_id: userRole.role_id } }),
  ]);
  const privIds = rolePrivs.map((rp) => rp.privilage_id);
  const privs = privIds.length ? await MasterPrivilage.findAll({ where: { id: privIds } }) : [];
  return { role: role?.role_name || null, permissions: privs.map((p) => p.privilage_name) };
};

// ── authenticateAdmin ────────────────────────────────────────────
/**
 * Validates the Bearer JWT on every admin API request.
 * Attaches req.admin = { id, email, role, permissions }
 */
export const authenticateAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided. Unauthorized.' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token expired. Please login again.' });
      }
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }

    // The three lookups are independent, so they run together (they used to run one after another)
    const [user, profile, access] = await Promise.all([
      User.findByPk(decoded.id),
      AdminProfile.findOne({ where: { user_id: decoded.id } }),
      loadAdminAccess(decoded.id),   // loaded fresh on every request: revoked permissions take effect immediately
    ]);
    if (!user || user.is_active === false || user.user_type !== 2) {
      return res.status(401).json({ success: false, message: 'Not an admin account.' });
    }
    if (!profile?.is_verified) {
      return res.status(403).json({
        success: false,
        message: 'Admin account not activated. Please complete the setup process.',
      });
    }

    req.admin = {
      id:          decoded.id,
      email:       decoded.email,
      role:        access.role,
      permissions: access.permissions,
    };
    req.user = { id: decoded.id, email: decoded.email }; // what the audit fields (created_by / modified_by) read
    req.auth = { id: decoded.id, userType: 2, isAdmin: true };

    next();
  } catch (err) {
    // A database failure is not a bad token: answering 401 would sign the admin out during a brief outage
    return respondWithError(req, res, err, 'authenticateAdmin');
  }
};

// ── requirePermission ────────────────────────────────────────────
/**
 * Gate a route to admins with a specific permission.
 * Usage: router.post('/route', authenticateAdmin, requirePermission('kyc:approve'), handler)
 */
export const requirePermission = (permission) => (req, res, next) => {
  if (!req.admin) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }

  if (!req.admin.permissions.includes(permission)) {
    return res.status(403).json({
      success: false,
      message: `Access denied. Required permission: "${permission}"`,
    });
  }

  next();
};

/**
 * Gate a route to admins with at least one of the listed permissions.
 * Usage: requireAnyPermission('users:view', 'users:block')
 */
export const requireAnyPermission = (...perms) => (req, res, next) => {
  if (!req.admin) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }

  const hasAny = perms.some((p) => req.admin.permissions.includes(p));
  if (!hasAny) {
    return res.status(403).json({
      success: false,
      message: `Access denied. Required one of: ${perms.map((p) => `"${p}"`).join(', ')}`,
    });
  }

  next();
};
