const LOAN_PAYMENT_MODES = ['Cash', 'Bank Transfer', 'Cheque', 'RTGS', 'UPI'];
const PHONE_RX = /^[0-9+\-\s()]{7,20}$/;

const isFiniteNumber = (v) => Number.isFinite(v) && !Number.isNaN(v);

const validateDateNotFuture = (dateStr, label = 'Date') => {
  if (!dateStr) return { ok: true };
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return { ok: false, error: `${label} is invalid` };
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (d.getTime() > today.getTime()) return { ok: false, error: `${label} cannot be in the future` };
  return { ok: true };
};

module.exports = { LOAN_PAYMENT_MODES, PHONE_RX, isFiniteNumber, validateDateNotFuture };
