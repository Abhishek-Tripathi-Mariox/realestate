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

schema.index({ societyId: 1, isDeleted: 1 });
schema.index({ saleId: 1 });
// Vendor list enriches with commission totals via brokerVendorId. Without
// this the vendors list had to scan every commission bill on each page open.
schema.index({ brokerVendorId: 1, isDeleted: 1 });

module.exports = mongoose.model('CommissionBill', schema, 'commission_bills');
