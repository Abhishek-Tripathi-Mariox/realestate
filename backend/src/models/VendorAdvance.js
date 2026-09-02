const { mongoose, buildSchema } = require('./baseSchema');

// Advance payment given to a vendor before any work / bill exists. Behaves
// like a "reverse bill": money leaves the account on create, and work items
// are added against it later (see VendorAdvanceWork).
const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  vendorId: String,
  vendorName: String,
  societyId: String,          // null for company-scope advances
  accountId: String,
  amount: Number,
  advanceDate: String,
  paymentMode: String,
  referenceNo: String,
  remark: String,
  createdBy: String,
  isDeleted: Boolean,
  deletedAt: Date,
  deletedBy: String,
  createdAt: Date,
});

schema.index({ vendorId: 1, isDeleted: 1 });
schema.index({ societyId: 1 });
schema.index({ accountId: 1 });

module.exports = mongoose.model('VendorAdvance', schema, 'vendor_advances');
