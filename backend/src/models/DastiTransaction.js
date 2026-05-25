const { mongoose, buildSchema } = require('./baseSchema');

// DastiTransaction = one IN or OUT entry between the firm and a person.
// Standalone ledger — does NOT touch the daybook / bank accounts. The point
// of "dasti" is fast, throwaway tracking of who owes whom.
//   type: 'IN'  => money received by firm from person  (person -> firm)
//   type: 'OUT' => money given by firm to person       (firm -> person)
const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  personId: { type: String, required: true },
  firmId: String,                             // optional firm tag
  accountId: { type: String, required: true },// cash/bank account that moved
  type: { type: String, enum: ['IN', 'OUT'], required: true },
  amount: { type: Number, required: true },
  paymentMode: { type: String, default: 'Cash' },
  txnDate: { type: String, required: true },  // YYYY-MM-DD
  note: String,
  createdBy: String,
  isDeleted: Boolean,
  deletedAt: Date,
  deletedReason: String,
  createdAt: Date,
  updatedAt: Date,
});

schema.index({ personId: 1, isDeleted: 1 });
schema.index({ firmId: 1, isDeleted: 1 });
schema.index({ txnDate: -1 });
schema.index({ type: 1 });

module.exports = mongoose.model('DastiTransaction', schema, 'dastiTransactions');
