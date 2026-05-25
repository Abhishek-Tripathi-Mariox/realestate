const { mongoose, buildSchema } = require('./baseSchema');

// DastiPerson = a partner/friend/investor account in the Dasti Ledger.
// Tracks temporary cash going between the firm and this person.
const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  mobile: String,
  remark: String,
  createdBy: String,
  isDeleted: Boolean,
  deletedAt: Date,
  deletedReason: String,
  createdAt: Date,
  updatedAt: Date,
});

schema.index({ name: 1, isDeleted: 1 });
schema.index({ mobile: 1 });

module.exports = mongoose.model('DastiPerson', schema, 'dastiPersons');
