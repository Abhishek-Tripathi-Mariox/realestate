const { mongoose, buildSchema } = require('./baseSchema');

// Firm = a business/entity owned by the user (e.g., "A1", "A2"). Used as an
// optional tag on DastiTransaction (which firm received/gave the cash), and
// as the primary subject of the Firm Ledger (phase 2).
const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  remark: String,
  createdBy: String,
  isDeleted: Boolean,
  deletedAt: Date,
  deletedReason: String,
  createdAt: Date,
  updatedAt: Date,
});

schema.index({ name: 1, isDeleted: 1 });

module.exports = mongoose.model('Firm', schema, 'firms');
