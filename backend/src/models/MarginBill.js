const { mongoose, buildSchema } = require('./baseSchema');

// Margin works like a commission bill but is attached to a ResaleDeal (the
// resold flat) instead of a broker/vendor. No recipient name — daybook
// entries just call it a margin payout against the inventory.
const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  societyId: String,
  resaleDealId: String,
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
schema.index({ resaleDealId: 1 });

module.exports = mongoose.model('MarginBill', schema, 'margin_bills');
