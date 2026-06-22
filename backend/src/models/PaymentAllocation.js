const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  paymentId: String,
  // Exactly one of `saleId` / `resaleDealId` is populated, identifying which
  // ledger this allocation belongs to. Resale flats reuse the same allocation
  // model (instead of getting a parallel collection) so the cap-check + listing
  // paths can treat both targets uniformly.
  saleId: String,
  resaleDealId: String,
  amount: Number,
  createdBy: String,
  createdAt: Date,
});

schema.index({ saleId: 1 });
schema.index({ paymentId: 1 });
schema.index({ resaleDealId: 1 });
// setAllocations cap-check pulls allocations by (saleId, paymentId != current)
// for every incoming sale — a compound here makes that read index-only.
schema.index({ saleId: 1, paymentId: 1 });
schema.index({ resaleDealId: 1, paymentId: 1 });

module.exports = mongoose.model('PaymentAllocation', schema, 'payment_allocations');
