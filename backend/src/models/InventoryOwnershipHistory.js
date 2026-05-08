const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  inventoryId: String,
  previousOwner: String,
  newOwner: String,
  dealId: String,
  transferDate: Date,
  transferredBy: String,
});

schema.index({ inventoryId: 1 });
schema.index({ dealId: 1 });

module.exports = mongoose.model('InventoryOwnershipHistory', schema, 'inventory_ownership_history');
