const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  societyId: String,
  name: String,
  percentage: Number,
  expectedInvestment: Number,
  notes: String,
  isDeleted: Boolean,
  deletedAt: Date,
  createdAt: Date,
  updatedAt: Date,
});

schema.index({ societyId: 1, isDeleted: 1 });

module.exports = mongoose.model('Partner', schema, 'partners');
