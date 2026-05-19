const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  billId: String,
  societyId: String,
  accountId: String,
  amount: Number,
  // 'PAYMENT' (default) or 'WITHDRAWAL' — withdrawals return money from
  // vendor back to the account (IN transaction, paidAmount decrement).
  type: { type: String, default: 'PAYMENT' },
  paymentDate: String,
  paymentMode: String,
  referenceNo: String,
  remark: String,
  createdBy: String,
  isDeleted: Boolean,
  deletedAt: Date,
  createdAt: Date,
});

schema.index({ billId: 1, isDeleted: 1 });
schema.index({ societyId: 1 });
schema.index({ accountId: 1 });

module.exports = mongoose.model('ExpensePayment', schema, 'expense_payments');
