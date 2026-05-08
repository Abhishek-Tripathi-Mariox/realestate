const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  partnerId: String,
  societyId: String,
  accountId: String,
  type: String,
  amount: Number,
  entryDate: String,
  paymentMode: String,
  remark: String,
  createdBy: String,
  isDeleted: Boolean,
  deletedAt: Date,
  createdAt: Date,
  updatedAt: Date,
});

schema.index({ partnerId: 1, isDeleted: 1 });
schema.index({ societyId: 1 });
schema.index({ accountId: 1 });

module.exports = mongoose.model('PartnerLedgerEntry', schema, 'partner_ledger_entries');
