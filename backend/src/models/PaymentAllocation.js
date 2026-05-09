const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  paymentId: String,
  saleId: String,
  amount: Number,
  createdBy: String,
  createdAt: Date,
});

schema.index({ saleId: 1 });
schema.index({ paymentId: 1 });
// setAllocations cap-check pulls allocations by (saleId, paymentId != current)
// for every incoming sale — a compound here makes that read index-only.
schema.index({ saleId: 1, paymentId: 1 });

module.exports = mongoose.model('PaymentAllocation', schema, 'payment_allocations');
