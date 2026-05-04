const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  societyId: String,
  brokerName: String,
  saleId: String,
  amount: Number,
  billDate: String,
  description: String,
  paidAmount: Number,
  status: String,
  isDeleted: Boolean,
  deletedAt: Date,
  createdAt: Date,
});

module.exports = mongoose.model('CommissionBill', schema, 'commission_bills');
