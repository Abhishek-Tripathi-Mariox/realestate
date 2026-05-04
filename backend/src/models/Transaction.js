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

module.exports = mongoose.model('Transaction', schema, 'transactions');
