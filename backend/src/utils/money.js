// Custom error so the sanitizer middleware can map this to a 400 cleanly
// instead of letting the request continue with silently-zeroed money fields.
class InvalidMoneyError extends Error {
  constructor(field, value) {
    super(`Invalid money value for field "${field}": ${JSON.stringify(value)}`);
    this.name = 'InvalidMoneyError';
    this.field = field;
    this.value = value;
    this.statusCode = 400;
  }
}

const roundPaise = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
};

// Same as roundPaise but throws on garbage instead of silently zeroing —
// used by the request sanitizer so a typo (e.g. amount: "five hundred")
// becomes a 400 instead of a phantom zero-rupee transaction.
const roundPaiseStrict = (value, field) => {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new InvalidMoneyError(field, value);
  if (n < 0) throw new InvalidMoneyError(field, value);
  return Math.round(n * 100) / 100;
};

const MONEY_FIELDS = new Set([
  'amount', 'paidAmount', 'pendingAmount', 'totalAmount', 'totalPrice',
  'pricePerSqft', 'salePrice', 'purchasePrice', 'discount', 'tax', 'taxAmount',
  'commissionAmount', 'commissionRate', 'commission',
  'billAmount', 'billTotal', 'totalPaid', 'balance',
  'capital', 'capitalContributed', 'profitShare',
  'openingAmount', 'openingBalance', 'closingBalance',
  'currentBalance', 'creditLimit', 'overdraftLimit',
  'principal', 'interest', 'interestRate', 'interestAmount',
  'loanAmount', 'repaymentAmount', 'outstandingAmount',
  'buyerPayment', 'sellerPayout', 'companyCommission',
  'expenseAmount', 'rent', 'deposit', 'advance',
  'price',
]);

const sanitizeMoneyFields = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    obj.forEach(sanitizeMoneyFields);
    return obj;
  }
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === 'object') {
      sanitizeMoneyFields(val);
    } else if (MONEY_FIELDS.has(key) && val !== null && val !== undefined && val !== '') {
      obj[key] = roundPaiseStrict(val, key);
    }
  }
  return obj;
};

// Money math without float drift: scale to integer paise, do the math, scale
// back. Use these instead of `a + b`, `a - b`, etc. on rupee values when the
// result will be compared (e.g. status thresholds) — JS floats accumulate
// rounding error and 500.0000001 vs 500 silently flip "Paid" status.
const PAISE = 100;
const toPaise = (rupees) => Math.round((Number(rupees) || 0) * PAISE);
const fromPaise = (paise) => Math.round(paise) / PAISE;
const addMoney = (...vals) => fromPaise(vals.reduce((s, v) => s + toPaise(v), 0));
const subMoney = (a, b) => fromPaise(toPaise(a) - toPaise(b));
// True if a >= b within half-paise tolerance (covers any post-arithmetic drift).
const gteMoney = (a, b) => toPaise(a) + 1 >= toPaise(b);
const eqMoney  = (a, b) => Math.abs(toPaise(a) - toPaise(b)) <= 1;

module.exports = {
  roundPaise, roundPaiseStrict, MONEY_FIELDS, sanitizeMoneyFields,
  InvalidMoneyError,
  toPaise, fromPaise, addMoney, subMoney, gteMoney, eqMoney,
};
