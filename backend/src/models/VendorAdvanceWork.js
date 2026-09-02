const { mongoose, buildSchema } = require('./baseSchema');

// Work logged against a VendorAdvance. Consumes the advance balance; does
// not move money (the money already left the account when the advance was
// created).
const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  advanceId: String,
  vendorId: String,
  societyId: String,
  amount: Number,
  workDate: String,
  category: String,
  description: String,
  createdBy: String,
  isDeleted: Boolean,
  deletedAt: Date,
  deletedBy: String,
  createdAt: Date,
});

schema.index({ advanceId: 1, isDeleted: 1 });
schema.index({ vendorId: 1 });
schema.index({ societyId: 1 });

module.exports = mongoose.model('VendorAdvanceWork', schema, 'vendor_advance_works');
