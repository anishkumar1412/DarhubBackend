import jwt from 'jsonwebtoken';
import db from '../models/index.js';
import { respondWithError } from './errorHandler.js';
import { loadRoleNames, isPilotAccount } from './access.js';

const { User } = db;

// ══════════════════════════════════════════════════════════════
//  authenticatePilot
//  ─────────────────────────────────────────────────────────────
//  Validates the Bearer JWT and confirms the caller is a pilot.
//  Attaches req.pilot = { id, email, mobile } so that controllers
//  use req.pilot.id as the authoritative pilot identity — NOT a
//  value from the request body/params.
//
//  This is the key security guard: because we read the pilot's
//  identity exclusively from the signed token, a malicious actor
//  cannot supply a different pilot_user_id in the payload to
//  accept/confirm another pilot's assignments.
//
//  Only a bad/expired token is answered with 401 (the app reacts to
//  that by refreshing the token or signing the pilot out). A database
//  or other server failure is NOT a token problem: it goes to the
//  error handler (503/500) so a brief outage never logs the pilot out.
// ══════════════════════════════════════════════════════════════
export const authenticatePilot = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      code: 'NO_TOKEN',
      message: 'No token provided. Unauthorized.',
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    return res.status(401).json({
      success: false,
      code: expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
      message: expired ? 'Token expired. Please login again.' : 'Invalid token.',
    });
  }

  try {
    // Fetch the user row to verify it still exists, is active and is a pilot
    const user = await User.findByPk(decoded.id);
    if (!user || user.is_active === false) {
      return res.status(401).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User not found. Token may be stale.',
      });
    }

    // The role decides, not user_type alone: farmers have user_type 3 too, and the old `[2, 3]` check let every
    // farmer use the pilot endpoints. (One older pilot account has user_type 3; it has the Pilot role.)
    if (!isPilotAccount(user.user_type, await loadRoleNames(user.id))) {
      return res.status(403).json({
        success: false,
        code: 'NOT_A_PILOT',
        message: 'Access denied. Only pilots can use this endpoint.',
      });
    }

    // Attach authoritative pilot identity from the verified token
    req.pilot = {
      id: user.id,
      email: user.email,
      mobile: user.mobile_number,
    };
    req.user = { id: user.id, email: user.email };   // what handlers and the audit fields (created_by) read

    return next();
  } catch (err) {
    return respondWithError(req, res, err, 'authenticatePilot');
  }
};
