const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  paymentId: String,
  saleId: String,
  amount: Number,
  createdBy: String,
  createdAt: Date,
});

module.exports = mongoose.model('PaymentAllocation', schema, 'payment_allocations');
