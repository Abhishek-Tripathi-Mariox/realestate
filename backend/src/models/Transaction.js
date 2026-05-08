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

module.exports = mongoose.model('Transaction', schema, 'transactions');
