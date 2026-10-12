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
  // When true the account is kept for historical reference (old txns still
  // reference it) but no longer offered in Account dropdowns on new entry
  // forms. Toggle via Edit Account dialog.
  isHidden: Boolean,
  deletedAt: Date,
  createdAt: Date,
  updatedAt: Date,
});

schema.index({ scope: 1, societyId: 1 });
schema.index({ isDefault: 1 });

module.exports = mongoose.model('Account', schema, 'accounts');
