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

  // Summary (total amount + total count) is expensive when filters match
  // thousands of rows — it scans every match to sum the amount. When the
  // user is only paginating (filters unchanged), the frontend passes
  // `skipSummary=1` so we don't re-run the aggregate; the previously
  // computed totals stay valid until filters change again.
  const skipSummary = query.skipSummary === '1' || query.skipSummary === 'true';

  // Run the page fetch and the summary aggregate in parallel. The aggregate
  // also gives us the total count for pagination, so we can drop the
  // separate countDocuments() call entirely.
  const txnsPromise = Transaction
    .find(filter)
    .sort({ txnDate: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const summaryPromise = skipSummary
    ? Promise.resolve(null)
    : Transaction.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);

  const [txns, summaryAgg] = await Promise.all([txnsPromise, summaryPromise]);

  // Drop rows whose parent (sale/bill/etc) has been soft-deleted so the
  // user doesn't see "ghost" inflows for records they've already removed.
  // Only runs over the current page (≤ limit rows) so this stays cheap.
  const alive = await filterAliveTransactions(txns);

  // Account + society lookups are scoped to the IDs that actually appear on
  // this page, keeping the enrichment step O(page) rather than O(global).
  const accountIds = [...new Set(alive.map(t => t.accountId).filter(Boolean))];
  const societyIds = [...new Set(alive.map(t => t.societyId).filter(Boolean))];

  const [accounts, societies] = await Promise.all([
    accountIds.length ? Account.find({ id: { $in: accountIds } }).lean() : [],
    societyIds.length ? Society.find({ id: { $in: societyIds } }).lean() : [],
  ]);
  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a.name]));
  const societyMap = Object.fromEntries(societies.map(s => [s.id, s.name]));

  const enriched = alive.map(({ _id, ...t }) => ({
    ...t,
    accountName: accountMap[t.accountId] || 'Unknown',
    societyName: t.societyId ? (societyMap[t.societyId] || 'Unknown') : 'Company',
  }));

  const totalAmount = summaryAgg ? (summaryAgg[0]?.total || 0) : null;
  const matchCount = summaryAgg ? (summaryAgg[0]?.count || 0) : null;

  return {
    transactions: enriched,
    summary: skipSummary
      ? null
      : { totalAmount, matchCount, pageCount: enriched.length },
    pagination: {
      page,
      limit,
      // frontend keeps the previously-known value so the pager still works.
      totalCount: matchCount,
      totalPages: matchCount != null ? Math.ceil(matchCount / limit) : null,
    },
  };
};

module.exports = { list };
