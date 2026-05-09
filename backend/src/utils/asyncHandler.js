// Wrap an async controller so thrown errors become structured JSON
// responses. Maps known error classes to 4xx where appropriate so client
// bugs stop being reported as 500s, and logs the full stack server-side
// so production crashes are diagnosable.

const isProd = process.env.NODE_ENV === 'production';

const classify = (error) => {
  // Caller can hint via `statusCode` (e.g. InvalidMoneyError) or `status`.
  if (error.statusCode) return error.statusCode;
  if (error.status && Number.isInteger(error.status)) return error.status;

  // Mongoose validation / cast errors are client bugs, not server bugs.
  if (error.name === 'ValidationError') return 400;
  if (error.name === 'CastError') return 400;
  // Duplicate key from a unique index.
  if (error.code === 11000) return 409;
  // JWT problems on routes that re-verify mid-request.
  if (error.name === 'JsonWebTokenError') return 401;
  if (error.name === 'TokenExpiredError') return 401;

  return 500;
};

const codeFor = (error, status) => {
  if (error.code && typeof error.code === 'string') return error.code;
  if (error.code === 11000) return 'DUPLICATE_KEY';
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  return 'INTERNAL_ERROR';
};

const asyncHandler = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    const status = classify(error);
    // Always log server-side so 5xx are diagnosable; skip the noise for 4xx
    // unless verbose logging is on.
    if (status >= 500 || process.env.VERBOSE_ERRORS === 'true') {
      console.error(`[${req.method} ${req.originalUrl}]`, error);
    }
    if (res.headersSent) return;
    const body = {
      error: status >= 500 && isProd ? 'Internal server error' : (error.message || 'Error'),
      code: codeFor(error, status),
    };
    if (error.field) body.field = error.field;
    res.status(status).json(body);
  }
};

module.exports = { asyncHandler };
