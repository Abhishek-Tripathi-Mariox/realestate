const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  societyId: String,
  inventoryId: String,
  sellerName: String,
  buyerName: String,
  resalePrice: Number,
  companyCommission: Number,
  status: String,
  closedAt: Date,
  closedBy: String,
  isDeleted: Boolean,
  deletedAt: Date,
  createdAt: Date,
});

module.exports = mongoose.model('ResaleDeal', schema, 'resale_deals');
