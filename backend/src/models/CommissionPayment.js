const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  billId: String,
  societyId: String,
  accountId: String,
  amount: Number,
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

module.exports = mongoose.model('CommissionPayment', schema, 'commission_payments');
