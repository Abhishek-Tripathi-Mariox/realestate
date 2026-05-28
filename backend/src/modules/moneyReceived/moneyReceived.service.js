const { filterAliveTransactions } = require('../../utils/aliveTransactions');
const { Transaction, Account, Society } = require('../../models');

// Money Received = every IN (credit) txn the company has logged, surfaced as
// its own filterable view. The daybook has the same data but is scoped to a
// single society or to "company"; this page is a flat cross-scope read so
// the user can answer "what came in?" with both a transaction-date and an
// entry-created-date filter (entries logged after the fact still get caught).
//
// Two independent date ranges (txnFrom/txnTo + createdFrom/createdTo) is the
// behaviour the user explicitly asked for — keep them ANDed so the result is
// the intersection (txns matching BOTH ranges), not a union.
const buildFilter = (query) => {
  const filter = {
    direction: 'IN',
    isVoided: { $ne: true },
    isReversed: { $ne: true },
    isReversal: { $ne: true },
    // Internal Bank → Bank / Bank → Cash transfers are not real inflows
    // (the OUT leg is on another company-owned account), so they'd inflate
    // the Money-Received total. Hide them at the source.
    sourceType: { $ne: 'BANK_TRANSFER' },
  };

  if (query.accountId && query.accountId !== 'all') filter.accountId = query.accountId;
  if (query.societyId && query.societyId !== 'all') {
    if (query.societyId === 'company') {
      filter.$or = [
        { societyId: null },
        { societyId: { $exists: false } },
        { societyId: '' },
      ];
    } else {
      filter.societyId = query.societyId;
    }
  }
  if (query.sourceType && query.sourceType !== 'all') filter.sourceType = query.sourceType;
  if (query.paymentMode && query.paymentMode !== 'all') filter.paymentMode = query.paymentMode;

  if (query.txnFrom || query.txnTo) {
    filter.txnDate = {};
    if (query.txnFrom) filter.txnDate.$gte = query.txnFrom;
    if (query.txnTo) filter.txnDate.$lte = query.txnTo;
  }
  if (query.createdFrom || query.createdTo) {
    filter.createdAt = {};
    if (query.createdFrom) {
      filter.createdAt.$gte = new Date(`${query.createdFrom}T00:00:00.000Z`);
    }
    if (query.createdTo) {
      filter.createdAt.$lte = new Date(`${query.createdTo}T23:59:59.999Z`);
    }
  }

  return filter;
};

const list = async (query) => {
  const filter = buildFilter(query);

  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 100;
  const skip = (page - 1) * limit;

  // Pull a window of matching rows + the total count for pagination.
  const totalCount = await Transaction.countDocuments(filter);
  const txns = await Transaction
    .find(filter)
    .sort({ txnDate: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // Drop rows whose parent (sale/bill/etc) has been soft-deleted so the
  // user doesn't see "ghost" inflows for records they've already removed.
  const alive = await filterAliveTransactions(txns);

  const accounts = await Account.find({}).lean();
  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a.name]));

  const societyIds = [...new Set(alive.map(t => t.societyId).filter(Boolean))];
  const societies = societyIds.length
    ? await Society.find({ id: { $in: societyIds } }).lean()
    : [];
  const societyMap = Object.fromEntries(societies.map(s => [s.id, s.name]));

  const enriched = alive.map(({ _id, ...t }) => ({
    ...t,
    accountName: accountMap[t.accountId] || 'Unknown',
    societyName: t.societyId ? (societyMap[t.societyId] || 'Unknown') : 'Company',
  }));

  // The summary totals reflect every row matching the filter (across pages)
  // so the user can trust them as the "true" total for the current filter.
  const summaryAgg = await Transaction.aggregate([
    { $match: filter },
    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);
  const totalAmount = summaryAgg[0]?.total || 0;
  const matchCount = summaryAgg[0]?.count || 0;

  return {
    transactions: enriched,
    summary: { totalAmount, matchCount, pageCount: enriched.length },
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
    },
  };
};

module.exports = { list };
