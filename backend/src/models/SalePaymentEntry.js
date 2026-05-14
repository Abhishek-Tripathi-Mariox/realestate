const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  saleId: String,
  societyId: String,
  accountId: String,
  entryType: String,
  amount: Number,
  paymentDate: String,
  paymentMode: String,
  transferGroupId: String,
  referenceNo: String,
  remark: String,
  createdBy: String,
  isDeleted: Boolean,
  deletedAt: Date,
  createdAt: Date,
});

schema.index({ saleId: 1, isDeleted: 1 });
schema.index({ societyId: 1 });
schema.index({ accountId: 1 });

module.exports = mongoose.model('SalePaymentEntry', schema, 'sale_payment_entries');
