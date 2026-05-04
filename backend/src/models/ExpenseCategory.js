const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  name: String,
  scope: String,
  societyId: String,
  isActive: Boolean,
  isDeleted: Boolean,
  createdAt: Date,
});

module.exports = mongoose.model('ExpenseCategory', schema, 'expense_categories');
