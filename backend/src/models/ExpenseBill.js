const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  societyId: String,
  scope: String,
  vendorId: String,
  vendorName: String,
  category: String,
  amount: Number,
  billDate: String,
  description: String,
  paidAmount: Number,
  status: String,
  createdBy: String,
  deletedBy: String,
  isDeleted: Boolean,
  deletedAt: Date,
  createdAt: Date,
});

schema.index({ societyId: 1, isDeleted: 1 });
// Vendor drawer + Company Vendor Ledger both filter on (vendorId, isDeleted)
// — the bare vendorId index couldn't serve the compound predicate.
schema.index({ vendorId: 1, isDeleted: 1 });
schema.index({ scope: 1 });

module.exports = mongoose.model('ExpenseBill', schema, 'expense_bills');
