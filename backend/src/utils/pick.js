// Pick only the listed keys from `body`. Used by service `update()` paths
// to avoid mass-assignment — without this an authenticated user could PUT
// `{isDeleted: true, amountPaid: 999}` and silently bypass the soft-delete
// OTP guard or rewrite denormalized totals.
//
// `null`/`undefined` values are dropped so callers don't accidentally null
// out fields the FE didn't intend to send.
const pick = (body, allowedKeys) => {
  const out = {};
  if (!body || typeof body !== 'object') return out;
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined) {
      out[key] = body[key];
    }
  }
  return out;
};

module.exports = { pick };
