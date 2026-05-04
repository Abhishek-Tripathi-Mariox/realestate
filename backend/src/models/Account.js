const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  name: String,
  type: String,
  isDefault: Boolean,
  overdraftEnabled: Boolean,
  scope: String,
  societyId: String,
  isActive: Boolean,
  deletedAt: Date,
  createdAt: Date,
  updatedAt: Date,
});

module.exports = mongoose.model('Account', schema, 'accounts');
