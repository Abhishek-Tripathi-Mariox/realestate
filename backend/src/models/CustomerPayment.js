const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  customerId: String,
  societyId: String,
  accountId: String,
  amount: Number,
  paymentDate: String,
  paymentMode: String,
  referenceNo: String,
  remark: String,
  unallocatedAmount: Number,
  createdBy: String,
  isDeleted: Boolean,
  deletedAt: Date,
  createdAt: Date,
  updatedAt: Date,
});

module.exports = mongoose.model('CustomerPayment', schema, 'customer_payments');
