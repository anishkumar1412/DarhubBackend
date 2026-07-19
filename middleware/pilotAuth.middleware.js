import jwt from 'jsonwebtoken';
import db from '../models/index.js';

const { User } = db;

// ══════════════════════════════════════════════════════════════
//  authenticatePilot
//  ─────────────────────────────────────────────────────────────
//  Validates the Bearer JWT and confirms the caller is a pilot
//  (user_type === 3).  Attaches req.pilot = { id, email, mobile }
//  so that controller can use req.pilot.id as the authoritative
//  pilot identity — NOT a value from the request body/params.
//
//  This is the key security guard: because we read the pilot's
//  identity exclusively from the signed token, a malicious actor
//  cannot supply a different pilot_user_id in the payload to
//  accept/confirm another pilot's assignments.
// ══════════════════════════════════════════════════════════════
export const authenticatePilot = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Unauthorized.',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch the user row to verify it still exists and is a pilot
    const user = await User.findByPk(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found. Token may be stale.',
      });
    }

    // user_type === 3  →  Pilot  (admin = 2, farmer = 1 based on existing code)
    if (user.user_type !== 3) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only pilots can use this endpoint.',
      });
    }

    // Attach authoritative pilot identity from the verified token
    req.pilot = {
      id: user.id,
      email: user.email,
      mobile: user.mobile_number,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid token.',
    });
  }
};
