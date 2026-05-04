// Build a Mongo filter that excludes soft-deleted documents.
// Pass any additional fields you want to filter on as the argument.
const notDeleted = (additionalQuery = {}) => ({
  ...additionalQuery,
  $or: [{ isDeleted: { $ne: true } }, { isDeleted: { $exists: false } }],
});

module.exports = { notDeleted };
