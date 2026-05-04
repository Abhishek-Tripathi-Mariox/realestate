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

module.exports = mongoose.model('LoanRepayment', schema, 'loan_repayments');
