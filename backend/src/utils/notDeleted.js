// Build a Mongo filter that excludes soft-deleted documents.
// Pass any additional fields you want to filter on as the argument.
//
// Uses $and to merge with a caller-provided $or instead of letting
// object-spread overwrite it. Without this, `notDeleted({ $or: [...] })`
// would silently drop the soft-delete clause — a foot-gun that broke
// search/cap-check filters in earlier revisions of this codebase.
const SOFT_DELETE_CLAUSE = {
  $or: [{ isDeleted: { $ne: true } }, { isDeleted: { $exists: false } }],
};

const notDeleted = (additionalQuery = {}) => {
  if (!additionalQuery.$or && !additionalQuery.$and) {
    return { ...additionalQuery, ...SOFT_DELETE_CLAUSE };
  }
  const { $and: callerAnd, ...rest } = additionalQuery;
  return {
    ...rest,
    $and: [...(callerAnd || []), SOFT_DELETE_CLAUSE],
  };
};

module.exports = { notDeleted };
