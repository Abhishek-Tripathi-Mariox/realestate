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

schema.index({ customerId: 1, isDeleted: 1 });
schema.index({ societyId: 1, isDeleted: 1 });
schema.index({ accountId: 1 });

module.exports = mongoose.model('CustomerPayment', schema, 'customer_payments');
