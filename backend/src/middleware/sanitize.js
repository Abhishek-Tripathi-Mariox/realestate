const { sanitizeMoneyFields, InvalidMoneyError } = require('../utils/money');

// Round any monetary field on the request body to 2 decimals (paise) for every
// JSON write request. GET / DELETE pass through. Garbage values (NaN, "abc")
// throw an InvalidMoneyError which we map to a 400 instead of letting them
// silently become 0 — a typo shouldn't quietly create a zero-rupee txn.
const moneySanitizer = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'DELETE') return next();
  if (!req.body || typeof req.body !== 'object') return next();
  try {
    sanitizeMoneyFields(req.body);
    next();
  } catch (err) {
    if (err instanceof InvalidMoneyError) {
      return res.status(400).json({
        error: err.message,
        code: 'INVALID_MONEY_VALUE',
        field: err.field,
      });
    }
    next(err);
  }
};

module.exports = { moneySanitizer };
