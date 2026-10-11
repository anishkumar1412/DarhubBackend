import { ApiError } from '../utils/apiError.js';
import { respondWithError } from './errorHandler.js';

/**
 * Request validation with zod schemas.
 *
 * A failure is a 400 in the standard error body, with `message` set to the first problem (what the apps show)
 * and `errors` listing every problem by field:
 *   { success:false, code:'VALIDATION_ERROR', message:'pincode must be a valid 6-digit pincode',
 *     errors:[{ field:'pincode', message:'pincode must be a valid 6-digit pincode' }] }
 */

const fieldName = (part, path) => {
  const name = path.join('.');
  if (part === 'body') return name || 'body';
  return name ? `${part}.${name}` : part;
};

export const validationError = (zodError, part = 'body') => {
  const errors = zodError.issues.map((issue) => ({ field: fieldName(part, issue.path), message: issue.message }));
  const err = new ApiError(400, errors[0]?.message || 'Validation failed', errors);
  err.code = 'VALIDATION_ERROR';
  return err;
};

/** Parses `data` with `schema`; returns the clean value or throws the 400 described above. */
export const parseOrThrow = (schema, data, part = 'body') => {
  const result = schema.safeParse(data ?? {});
  if (!result.success) throw validationError(result.error, part);
  return result.data;
};

/**
 * Route middleware: validate({ params, query, body }). The clean values are put on `req.valid` (and the body also
 * replaces `req.body`, so unknown fields never reach the handler). `req.query` is read-only in Express 5, which is
 * why handlers read `req.valid.query`.
 */
export const validate = (schemas) => (req, res, next) => {
  req.valid = req.valid || {};
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (!result.success) return respondWithError(req, res, validationError(result.error, part));
    req.valid[part] = result.data;
  }
  if (req.valid.body) req.body = req.valid.body;
  return next();
};
