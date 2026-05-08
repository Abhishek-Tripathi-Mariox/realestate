const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  dealId: String,
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

schema.index({ dealId: 1, isDeleted: 1 });
schema.index({ accountId: 1 });

module.exports = mongoose.model('ResaleSellerPayout', schema, 'resale_seller_payouts');
