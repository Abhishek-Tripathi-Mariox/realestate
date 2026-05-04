const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  accountId: String,
  openingAmount: Number,
  openingDate: String,
  createdAt: Date,
  updatedAt: Date,
});

module.exports = mongoose.model('AccountOpeningBalance', schema, 'account_opening_balances');
