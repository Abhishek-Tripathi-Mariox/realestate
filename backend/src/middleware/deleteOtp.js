// All DELETE routes require the configured master OTP via the X-Delete-Otp
// header. This is in addition to per-route auth checks. If DELETE_MASTER_OTP
// is not set, the guard fails closed so deletes are never accidentally exposed.
const deleteOtpGuard = (req, res, next) => {
  if (req.method !== 'DELETE') return next();
  const expected = process.env.DELETE_MASTER_OTP;
  if (!expected) {
    return res.status(503).json({
      error: 'Delete OTP not configured on server',
      code: 'DELETE_OTP_NOT_CONFIGURED',
    });
  }
  const provided = req.headers['x-delete-otp'] || req.headers['X-Delete-Otp'];
  if (!provided || String(provided).trim() !== String(expected).trim()) {
    return res.status(403).json({
      error: 'Invalid or missing master delete OTP',
      code: 'DELETE_OTP_REQUIRED',
    });
  }
  next();
};

module.exports = { deleteOtpGuard };
