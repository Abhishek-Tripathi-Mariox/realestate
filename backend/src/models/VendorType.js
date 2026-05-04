const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  name: String,
  isActive: Boolean,
  isDeleted: Boolean,
  createdAt: Date,
});

module.exports = mongoose.model('VendorType', schema, 'vendor_types');
