const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  societyId: String,
  name: String,
  phone: String,
  email: String,
  address: String,
  notes: String,
  createdBy: String,
  isDeleted: Boolean,
  deletedAt: Date,
  createdAt: Date,
  updatedAt: Date,
});

schema.index({ societyId: 1, isDeleted: 1 });
schema.index({ phone: 1 });

module.exports = mongoose.model('Customer', schema, 'customers');
