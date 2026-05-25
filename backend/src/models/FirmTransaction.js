const { mongoose, buildSchema } = require('./baseSchema');

// FirmTransaction = a money-in / money-out entry for ONE firm. Standalone
// ledger — does NOT touch the daybook / bank accounts. Mirrors DastiTransaction
// in spirit but the subject is the firm itself (no person counterparty
// required); `counterparty` is a free-text "from whom" / "to whom" field.
//   type: 'IN'  => money came into the firm
//   type: 'OUT' => money went out of the firm
const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  firmId: { type: String, required: true },
  accountId: { type: String, required: true },// cash/bank account that moved
  type: { type: String, enum: ['IN', 'OUT'], required: true },
  amount: { type: Number, required: true },
  counterparty: String,                       // free-text "from/to whom"
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

schema.index({ firmId: 1, isDeleted: 1 });
schema.index({ txnDate: -1 });
schema.index({ type: 1 });

module.exports = mongoose.model('FirmTransaction', schema, 'firmTransactions');
