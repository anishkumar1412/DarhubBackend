import jwt from 'jsonwebtoken';
import db from '../models/index.js';
import env from '../config/env.js';

const { User, AdminProfile, UserRole, MasterRole, MasterRolePrivilage, MasterPrivilage } = db;

// ── Load all permission names for an admin user ──────────────────
const loadAdminPermissions = async (userId) => {
  const userRole = await UserRole.findOne({ where: { user_id: userId } });
  if (!userRole) return [];

  const rolePrivs = await MasterRolePrivilage.findAll({
    where: { role_id: userRole.role_id },
  });

  const privIds = rolePrivs.map((rp) => rp.privilage_id);
  if (!privIds.length) return [];

  const privs = await MasterPrivilage.findAll({ where: { id: privIds } });
  return privs.map((p) => p.privilage_name);
};

// ── Load role name for an admin user ─────────────────────────────
const loadAdminRole = async (userId) => {
  const userRole = await UserRole.findOne({ where: { user_id: userId } });
  if (!userRole) return null;
  const role = await MasterRole.findByPk(userRole.role_id);
  return role?.role_name || null;
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

    const token   = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, env.JWT_SECRET);

    // Verify the user exists and is an admin
    const user = await User.findByPk(decoded.id);
    if (!user || user.user_type !== 2) {
      return res.status(401).json({ success: false, message: 'Not an admin account.' });
    }

    // Verify the admin profile is activated
    const profile = await AdminProfile.findOne({ where: { user_id: decoded.id } });
    if (!profile?.is_verified) {
      return res.status(403).json({
        success: false,
        message: 'Admin account not activated. Please complete the setup process.',
      });
    }

    // Load permissions fresh on every request —
    // ensures revoked permissions take effect immediately
    const permissions = await loadAdminPermissions(decoded.id);
    const role        = await loadAdminRole(decoded.id);

    req.admin = {
      id:          decoded.id,
      email:       decoded.email,
      role,
      permissions,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired. Please login again.' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token.' });
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
