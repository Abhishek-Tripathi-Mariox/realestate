const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  txnDate: String,
  societyId: String,
  scope: String,
  accountId: String,
  direction: String,
  amount: Number,
  paymentMode: String,
  partyType: String,
  partyName: String,
  sourceType: String,
  sourceId: String,
  referenceNo: String,
  remark: String,
  createdBy: String,
  isReversal: Boolean,
  originalTxnId: String,
  isReversed: Boolean,
  reversedAt: Date,
  reversalTxnId: String,
  isVoided: Boolean,
  createdAt: Date,
});

schema.index({ sourceType: 1, sourceId: 1 });
schema.index({ societyId: 1, txnDate: -1 });
schema.index({ accountId: 1, txnDate: -1 });
schema.index({ originalTxnId: 1 });
// Direction is filtered on every daybook/expense/account-balance query —
// add a compound to support the common (society + direction + date) read.
schema.index({ societyId: 1, direction: 1, txnDate: -1 });
// Money-Received view filters by direction+txnDate across all societies, so
// the (society, direction, date) index above doesn't cover that case. This
// pair lets the list query and the summary aggregate both walk an index
// instead of scanning the whole transactions collection.
schema.index({ direction: 1, txnDate: -1 });
schema.index({ direction: 1, createdAt: -1 });
// `isVoided` / `isReversed` are filtered on every summary/balance call;
// the partial index keeps it small (most rows are neither).
schema.index(
  { isVoided: 1, isReversed: 1 },
  { partialFilterExpression: { $or: [{ isVoided: true }, { isReversed: true }] } },
);

module.exports = mongoose.model('Transaction', schema, 'transactions');
