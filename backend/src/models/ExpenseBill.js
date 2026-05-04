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

module.exports = mongoose.model('ExpenseBill', schema, 'expense_bills');
