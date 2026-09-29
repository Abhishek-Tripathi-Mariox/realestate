const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  societyId: String,
  inventoryId: String,
  sellerName: String,
  buyerName: String,
  resalePrice: Number,
  companyCommission: Number,
  previousResaleDealId: String,
  status: String,
  closedAt: Date,
  closedBy: String,
  isDeleted: Boolean,
  deletedAt: Date,
  createdAt: Date,
});

schema.index({ societyId: 1, isDeleted: 1 });
schema.index({ inventoryId: 1 });
// TRANSFERRED-sale mirror sync (sales.service.js) filters on originalSaleId
// + isDeleted; the compound covers both.
schema.index({ originalSaleId: 1, isDeleted: 1 });

module.exports = mongoose.model('ResaleDeal', schema, 'resale_deals');
