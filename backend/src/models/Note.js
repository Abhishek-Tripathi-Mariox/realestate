const { mongoose, buildSchema } = require('./baseSchema');

// Note = simple sticky-note / reminder. Shared across users (single-admin
// deployment). Title + body, soft-deleted on remove so trash recovery works
// if it's ever wired up.
const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  body: String,
  // Optional society link — null/missing means a company-wide / general note.
  societyId: String,
  createdBy: String,
  isDeleted: Boolean,
  deletedAt: Date,
  createdAt: Date,
  updatedAt: Date,
});

schema.index({ isDeleted: 1, updatedAt: -1 });
schema.index({ societyId: 1, isDeleted: 1 });

module.exports = mongoose.model('Note', schema, 'notes');
