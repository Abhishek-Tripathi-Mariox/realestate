const { sanitizeMoneyFields } = require('../utils/money');

// Round any monetary field on the request body to 2 decimals (paise) for every
// JSON write request. GET / DELETE pass through.
const moneySanitizer = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'DELETE') return next();
  if (req.body && typeof req.body === 'object') sanitizeMoneyFields(req.body);
  next();
};

module.exports = { moneySanitizer };
