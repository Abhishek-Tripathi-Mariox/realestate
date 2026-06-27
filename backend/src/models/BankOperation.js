const { mongoose, buildSchema } = require('./baseSchema');

// BankOperation = standalone record for either:
//   kind: 'WITHDRAWAL'      — money pulled out of a single account.
//                             Posts ONE daybook OUT txn on `fromAccountId`.
//   kind: 'TRANSFER'        — money moved between two accounts (bank↔bank, bank↔cash).
//                             Posts TWO daybook txns: OUT on `fromAccountId`,
//                             IN on `toAccountId`. Both share this op's id as
//                             sourceId so an update / delete reverses the pair.
//   kind: 'DIRECT_PAYMENT'  — money added directly into a single account
//                             (manual credit). Posts ONE daybook IN txn on
//                             `fromAccountId`. The opposite shape of WITHDRAWAL.
const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  kind: { type: String, enum: ['WITHDRAWAL', 'TRANSFER', 'DIRECT_PAYMENT'], required: true },
  fromAccountId: { type: String, required: true },
  toAccountId: String,                          // only for TRANSFER
  amount: { type: Number, required: true },
  txnDate: { type: String, required: true },    // YYYY-MM-DD
  note: String,
  createdBy: String,
  isDeleted: Boolean,
  deletedAt: Date,
  deletedReason: String,
  createdAt: Date,
  updatedAt: Date,
});

schema.index({ kind: 1, isDeleted: 1 });
schema.index({ txnDate: -1 });
schema.index({ fromAccountId: 1 });
schema.index({ toAccountId: 1 });

module.exports = mongoose.model('BankOperation', schema, 'bankOperations');
