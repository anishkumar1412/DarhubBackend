import logger from '../utils/logger.js';

const isProduction = () => process.env.NODE_ENV === 'production';

const GENERIC_MESSAGE = 'Something went wrong on our side. Please try again.';

/**
 * Turns any thrown value into { status, code, message, errors } for the client.
 * Anything not recognised is a 500 whose real message is only revealed outside production.
 */
const classify = (err) => {
  const name = err?.name || '';

  // ApiError / http-errors (body-parser, etc.) already carry a client-safe status
  const status = err?.statusCode || err?.status;
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    if (err.type === 'entity.too.large') return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'The request is too large.' };
    if (err.type === 'entity.parse.failed') return { status: 400, code: 'MALFORMED_JSON', message: 'The request body is not valid JSON.' };
    return { status, code: err.code && typeof err.code === 'string' ? err.code : undefined, message: err.message, errors: err.errors };
  }

  // Uploads
  if (name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') return { status: 413, code: 'FILE_TOO_LARGE', message: 'The file is too large (maximum 5 MB).' };
    return { status: 400, code: 'UPLOAD_ERROR', message: `Upload failed: ${err.message}` };
  }

  // Database: bad input
  if (name === 'SequelizeValidationError') {
    return { status: 400, code: 'VALIDATION_ERROR', message: 'Validation failed.', errors: err.errors?.map((e) => e.message) };
  }
  if (name === 'SequelizeUniqueConstraintError') {
    return { status: 409, code: 'ALREADY_EXISTS', message: 'A record with these details already exists.' };
  }
  if (name === 'SequelizeForeignKeyConstraintError') {
    return { status: 409, code: 'CONSTRAINT_VIOLATION', message: 'This record is linked to other data and the change was refused.' };
  }
  if (name === 'SequelizeDatabaseError' && /invalid input syntax|out of range/i.test(err.message || '')) {
    return { status: 400, code: 'INVALID_INPUT', message: 'One of the values sent is not valid.' };
  }

  // Database: unavailable. The client should retry, not treat it as a bug or a logout.
  if (/^Sequelize(Connection|ConnectionRefused|ConnectionTimedOut|HostNotFound|HostNotReachable|AccessDenied|ConnectionAcquireTimeout)/.test(name)
      || name === 'SequelizeConnectionError' || err?.parent?.code === 'ECONNREFUSED') {
    return { status: 503, code: 'DATABASE_UNAVAILABLE', message: 'The service is temporarily unavailable. Please try again in a moment.', retry: true };
  }

  // Auth tokens that slipped past the auth middleware
  if (name === 'TokenExpiredError') return { status: 401, code: 'TOKEN_EXPIRED', message: 'Token expired. Please login again.' };
  if (name === 'JsonWebTokenError' || name === 'NotBeforeError') return { status: 401, code: 'INVALID_TOKEN', message: 'Invalid token.' };

  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: isProduction() ? GENERIC_MESSAGE : (err?.message || GENERIC_MESSAGE),
  };
};

/**
 * Logs the error with the request that caused it and answers with the standard error body:
 *   { success:false, message, error (same text, kept for older clients), code?, errors?, request_id? }
 */
export const respondWithError = (req, res, err, context = '') => {
  const { status, code, message, errors, retry } = classify(err);

  const line = `${context ? `${context}: ` : ''}[${req.method}] ${req.originalUrl} -> ${status} ${err?.message || err}`;
  if (status >= 500) logger.error(line, { stack: err?.stack, request_id: req.id, user_id: req.pilot?.id ?? req.user?.id ?? req.admin?.id });
  else logger.warn(line, { request_id: req.id });

  if (res.headersSent) return undefined;
  if (retry) res.set('Retry-After', '5');
  return res.status(status).json({
    success: false,
    message,
    error: message,
    ...(code && { code }),
    ...(errors?.length && { errors }),
    ...(req.id && { request_id: req.id }),
  });
};

/** Express error middleware (must be registered last). */
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => respondWithError(req, res, err);

/** JSON 404 for unknown routes (Express would otherwise answer with an HTML page). */
export const notFoundHandler = (req, res) =>
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
    code: 'ROUTE_NOT_FOUND',
  });

/**
 * Safety net for the many older handlers that answer a failure with `res.status(500).json({ error: err.message })`:
 * in production the body of ANY 5xx response is replaced with a generic message (SQL fragments, table names and
 * file paths never reach a client) and the original body is logged together with the request id.
 * Handlers that use respondWithError already send a safe body and are left alone.
 */
export const hideServerErrorDetails = (req, res, next) => {
  const send = res.json.bind(res);
  res.json = (body) => {
    if (!isProduction() || res.statusCode < 500 || body?.code === 'INTERNAL_ERROR' || body?.code === 'DATABASE_UNAVAILABLE') {
      return send(body);
    }
    logger.error(`[${req.method}] ${req.originalUrl} -> ${res.statusCode} (details hidden from client): ${JSON.stringify(body)?.slice(0, 500)}`, { request_id: req.id });
    return send({
      success: false,
      message: GENERIC_MESSAGE,
      error: GENERIC_MESSAGE,
      code: 'INTERNAL_ERROR',
      ...(req.id && { request_id: req.id }),
    });
  };
  next();
};
