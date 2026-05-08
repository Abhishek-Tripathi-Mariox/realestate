const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  loanId: String,
  partyId: String,
  amount: Number,
  repaymentDate: String,
  accountId: String,
  paymentMode: String,
  remark: String,
  createdBy: String,
  isDeleted: Boolean,
  deletedAt: Date,
  createdAt: Date,
});

schema.index({ loanId: 1, isDeleted: 1 });
schema.index({ partyId: 1 });
schema.index({ accountId: 1 });

module.exports = mongoose.model('LoanRepayment', schema, 'loan_repayments');
