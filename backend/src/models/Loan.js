const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  partyId: String,
  direction: String,
  principalAmount: Number,
  loanDate: String,
  accountId: String,
  purpose: String,
  paymentMode: String,
  totalRepaid: Number,
  balancePrincipal: Number,
  status: String,
  createdBy: String,
  isDeleted: Boolean,
  deletedAt: Date,
  createdAt: Date,
});

module.exports = mongoose.model('Loan', schema, 'loans');
