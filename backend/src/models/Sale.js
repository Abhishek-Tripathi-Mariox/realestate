const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  societyId: String,
  inventoryId: String,
  customerId: String,
  buyerName: String,
  buyerContact: String,
  saleDate: String,
  sqft: Number,
  ratePerSqft: Number,
  discountPercent: Number,
  dealPrice: Number,
  discount: Number,
  finalAmount: Number,
  amountPaid: Number,
  status: String,
  paymentStatus: String,
  notes: String,
  createdBy: String,
  isDeleted: Boolean,
  deletedAt: Date,
  createdAt: Date,
  updatedAt: Date,
});

schema.index({ societyId: 1, isDeleted: 1 });
schema.index({ inventoryId: 1 });
schema.index({ customerId: 1 });
schema.index({ status: 1 });

module.exports = mongoose.model('Sale', schema, 'sales');
