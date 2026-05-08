const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  societyId: String,
  inventoryId: String,
  vendorName: String,
  sellerName: String,
  partyName: String,
  purchaseDate: String,
  totalCost: Number,
  totalAmount: Number,
  dealAmount: Number,
  amountPaid: Number,
  paymentStatus: String,
  status: String,
  notes: String,
  isDeleted: Boolean,
  deletedAt: Date,
  createdAt: Date,
  updatedAt: Date,
});

schema.index({ societyId: 1, isDeleted: 1 });
schema.index({ inventoryId: 1 });

module.exports = mongoose.model('Purchase', schema, 'purchases');
