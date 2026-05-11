const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  purchaseId: String,
  societyId: String,
  accountId: String,
  amount: Number,
  paymentDate: String,
  paymentMode: String,
  entryType: { type: String, default: 'PURCHASE_PAYMENT' },
  referenceNo: String,
  remark: String,
  createdBy: String,
  isDeleted: Boolean,
  deletedAt: Date,
  createdAt: Date,
});

schema.index({ purchaseId: 1, isDeleted: 1 });
schema.index({ societyId: 1 });
schema.index({ accountId: 1 });

module.exports = mongoose.model('PurchasePaymentEntry', schema, 'purchase_payment_entries');
