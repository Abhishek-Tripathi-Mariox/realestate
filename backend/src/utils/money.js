const roundPaise = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
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
      obj[key] = roundPaise(val);
    }
  }
  return obj;
};

module.exports = { roundPaise, MONEY_FIELDS, sanitizeMoneyFields };
