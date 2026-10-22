import { ApiError } from '../utils/apiError.js';
import { respondWithError } from './errorHandler.js';

/**
 * URL parameters are checked by name on every router (`checkRouteParams(router)` in app.js). Without this, an id
 * like "abc" went straight into SQL and came back as a 500 carrying the database error text
 * ("invalid input syntax for type integer") from ~60 handlers.
 *
 * Every :id-style parameter in the routes is an integer primary key; :booking_id is the orders' UUID.
 *
 * Express runs parameter callbacks before a route's own middleware, so an anonymous request is let through here
 * and refused by the route's authentication instead (a 401 should not depend on whether the id is well formed).
 */
const INT_PARAMS = ['id', 'user_id', 'log_id', 'role_id', 'priv_id', 'state_id', 'district_id', 'block_id', 'pilot_user_id', 'attachmentId'];
const UUID_PARAMS = ['booking_id'];

const MAX_INT = 2147483647;   // PostgreSQL INTEGER
const isInt = (v) => /^[1-9]\d{0,9}$/.test(v) && Number(v) <= MAX_INT;
const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

const reject = (req, res, name) => {
  const err = new ApiError(400, `${name} is not valid`, [{ field: `params.${name}`, message: `${name} is not valid` }]);
  err.code = 'VALIDATION_ERROR';
  return respondWithError(req, res, err);
};

const checker = (test) => (req, res, next, value, name) => {
  if (test(String(value)) || !req.headers.authorization) return next();
  return reject(req, res, name);
};

export const checkRouteParams = (router) => {
  for (const name of INT_PARAMS) router.param(name, checker(isInt));
  for (const name of UUID_PARAMS) router.param(name, checker(isUuid));
  return router;
};
