const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  name: String,
  location: String,
  totalArea: mongoose.Schema.Types.Mixed,
  startDate: String,
  status: String,
  notes: String,
  isDeleted: Boolean,
  deletedAt: Date,
  createdAt: Date,
  updatedAt: Date,
});

schema.index({ isDeleted: 1 });

module.exports = mongoose.model('Society', schema, 'societies');
