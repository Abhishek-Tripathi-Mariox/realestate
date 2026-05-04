const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  name: String,
  phone: String,
  address: String,
  notes: String,
  isDeleted: Boolean,
  deletedAt: Date,
  createdAt: Date,
});

module.exports = mongoose.model('Party', schema, 'parties');
