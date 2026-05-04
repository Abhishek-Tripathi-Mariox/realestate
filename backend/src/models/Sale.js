const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  societyId: String,
  inventoryId: String,
  customerId: String,
  buyerName: String,
  buyerContact: String,
  saleDate: String,
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

module.exports = mongoose.model('Sale', schema, 'sales');
