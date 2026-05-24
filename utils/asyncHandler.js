/**
 * Wraps async route handlers so errors are automatically forwarded to next().
 * Usage: router.post('/route', asyncHandler(async (req, res) => { ... }))
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
