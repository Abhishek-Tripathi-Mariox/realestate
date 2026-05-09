const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  accountId: String,
  openingAmount: Number,
  openingDate: String,
  createdAt: Date,
  updatedAt: Date,
});

// One opening balance per account — the upsert in updateOpeningBalance
// would otherwise race and create duplicates.
schema.index({ accountId: 1 }, { unique: true });

module.exports = mongoose.model('AccountOpeningBalance', schema, 'account_opening_balances');
