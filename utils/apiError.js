/**
 * Standard API error class.
 * Throw this anywhere in controllers — the global error handler will catch it.
 */
export class ApiError extends Error {
  constructor(statusCode, message = 'Something went wrong', errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.success    = false;
    this.errors     = errors;
    Error.captureStackTrace(this, this.constructor);
  }

  static validation(errors) { return new ApiError(400, 'Validation failed', errors); }
  static unauthorized(msg = 'Unauthorized') { return new ApiError(401, msg); }
  static forbidden(msg = 'Forbidden') { return new ApiError(403, msg); }
  static notFound(msg = 'Resource not found') { return new ApiError(404, msg); }
  static conflict(msg = 'Conflict') { return new ApiError(409, msg); }
  static internal(msg = 'Internal Server Error') { return new ApiError(500, msg); }
}