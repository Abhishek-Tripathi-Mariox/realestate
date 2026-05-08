const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  societyId: String,
  inventoryNumber: String,
  type: String,
  phase: String,
  area: Number,
  pricePerSqft: Number,
  totalPrice: Number,
  status: String,
  currentOwner: String,
  facing: String,
  floor: String,
  notes: String,
  soldDate: String,
  isDeleted: Boolean,
  deletedAt: Date,
  createdAt: Date,
  updatedAt: Date,
});

schema.index({ societyId: 1, isDeleted: 1 });
schema.index({ status: 1 });
schema.index({ societyId: 1, status: 1 });

module.exports = mongoose.model('Inventory', schema, 'inventory');
