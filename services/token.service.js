import { randomUUID, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';

/**
 * Access + refresh token pair, identical to what /api/login returns. Registration used to return only an access
 * token, so a newly registered user could not refresh their session until they logged in again.
 * The refresh token is also stored on the user (the refresh endpoint checks it against the stored value).
 */
export const issueSessionTokens = async (user, { transaction } = {}) => {
  const payload = { id: user.id, email: user.email };
  // jwtid: two tokens issued within the same second would otherwise be byte-identical (iat has 1 s resolution), so a
  // refresh right after a login handed back the same refresh token and the "old" one kept working
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '3d', jwtid: randomUUID() });
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d', jwtid: randomUUID() });
  await user.update({ refresh_token: refreshToken }, { transaction });
  return { accessToken, refreshToken };
};

/**
 * Is this the refresh token the server last issued to the user? Only the latest one is stored, so a refresh token
 * that was replaced (by a later login or refresh) or cleared (password change) no longer works, even before it expires.
 */
export const refreshTokenMatches = (user, presented) => {
  const stored = Buffer.from(String(user?.refresh_token ?? ''));
  const given = Buffer.from(String(presented ?? ''));
  return stored.length > 0 && stored.length === given.length && timingSafeEqual(stored, given);
};
