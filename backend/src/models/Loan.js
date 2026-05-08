const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  partyId: String,
  societyId: String,            // null/undefined = company-level loan
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

schema.index({ partyId: 1, isDeleted: 1 });
schema.index({ societyId: 1, isDeleted: 1 });
schema.index({ accountId: 1 });

module.exports = mongoose.model('Loan', schema, 'loans');
