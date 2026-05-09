const { createTransaction } = require('../../utils/transactions');
const { filterAliveTransactions } = require('../../utils/aliveTransactions');
const { Transaction, Account, Society } = require('../../models');

const list = async (query) => {
  const filter = {};

  if (query.scope === 'COMPANY') {
    filter.societyId = null;
  } else if (query.societyId && query.societyId !== 'all') {
    filter.societyId = query.societyId;
  }

  if (query.accountId && query.accountId !== 'all') filter.accountId = query.accountId;
  if (query.direction && query.direction !== 'all') filter.direction = query.direction;
  if (query.sourceType && query.sourceType !== 'all') filter.sourceType = query.sourceType;

  if (query.startDate) filter.txnDate = { $gte: query.startDate };
  if (query.endDate) {
    filter.txnDate = filter.txnDate || {};
    filter.txnDate.$lte = query.endDate;
  }

  if (query.txnStatus === 'active') {
    filter.isVoided = { $ne: true };
  } else if (query.txnStatus === 'voided') {
    filter.isVoided = true;
  }

  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 50;
  const skip = (page - 1) * limit;

  const totalCount = await Transaction.countDocuments(filter);
  const transactions = await Transaction
    .find(filter)
    .sort({ txnDate: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // Tag each row with isOrphan so the UI can dim/hide rows whose parent
  // sale / bill / etc. has been soft-deleted. We don't drop them here so
  // pagination math stays straightforward — the summary() endpoint is the
  // place where orphans are actually excluded from totals.
  const aliveTxns = await filterAliveTransactions(transactions);
  const aliveIds = new Set(aliveTxns.map((t) => t.id));

  const accounts = await Account.find({}).lean();
  const accountMap = {};
  accounts.forEach(a => accountMap[a.id] = a.name);

  const societies = await Society.find({}).lean();
  const societyMap = {};
  societies.forEach(s => societyMap[s.id] = s.name);

  const enriched = transactions.map(txn => ({
    ...txn,
    accountName: accountMap[txn.accountId] || 'Unknown',
    societyName: txn.societyId ? (societyMap[txn.societyId] || 'Unknown') : 'Company Level',
    isOrphan: !aliveIds.has(txn.id),
  }));

  return {
    transactions: enriched.map(({ _id, ...rest }) => rest),
    pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) },
  };
};

const summary = async (query) => {
  const filter = { isVoided: { $ne: true }, isReversed: { $ne: true }, isReversal: { $ne: true } };

  if (query.scope === 'COMPANY') {
    filter.societyId = null;
  } else if (query.societyId && query.societyId !== 'all') {
    filter.societyId = query.societyId;
  }

  if (query.accountId && query.accountId !== 'all') filter.accountId = query.accountId;
  if (query.startDate) filter.txnDate = { $gte: query.startDate };
  if (query.endDate) {
    filter.txnDate = filter.txnDate || {};
    filter.txnDate.$lte = query.endDate;
  }

  // Group on the DB side first so we don't pull every transaction in the
  // date range into memory. Each group becomes one synthetic doc carrying
  // (sourceType, sourceId, direction) + the summed amount; aliveTxns
  // works the same way on those grouped rows since it only inspects the
  // sourceType/sourceId fields. This keeps the summary path bounded by
  // the number of distinct parents touched, not by raw txn count.
  const grouped = await Transaction.aggregate([
    { $match: filter },
    {
      $group: {
        _id: {
          sourceType: '$sourceType',
          sourceId: '$sourceId',
          direction: '$direction',
        },
        amount: { $sum: '$amount' },
      },
    },
  ]);
  const groupedAsTxns = grouped.map((g) => ({
    sourceType: g._id.sourceType,
    sourceId: g._id.sourceId,
    direction: g._id.direction,
    amount: g.amount,
  }));
  // Drop orphans (parent sale / bill / payment soft-deleted) so the daybook
  // totals match reality — without this, deleting a sale leaves its IN
  // payment hanging in the summary forever.
  const transactions = await filterAliveTransactions(groupedAsTxns);

  let totalIn = 0, totalOut = 0;
  transactions.forEach(txn => {
    const amt = Number(txn.amount) || 0;
    if (txn.direction === 'IN') totalIn += amt;
    else totalOut += amt;
  });

  return { openingBalance: 0, totalIn, totalOut, closingBalance: totalIn - totalOut };
};

const createManualEntry = async (body, userId) => {
  let accountId = body.accountId;
  if (!accountId) {
    const defaultAccount = await Account.findOne({ isDefault: true }).lean();
    accountId = defaultAccount?.id;
  }

  const txn = await createTransaction({
    txnDate: body.txnDate,
    societyId: body.societyId || null,
    scope: body.scope || (body.societyId ? 'SOCIETY' : 'COMPANY'),
    accountId,
    direction: body.direction || 'OUT',
    amount: parseFloat(body.amount) || 0,
    paymentMode: body.paymentMode || 'Cash',
    partyType: body.partyType || 'Other',
    partyName: body.partyName || '',
    sourceType: body.sourceType || 'QUICK_EXPENSE',
    sourceId: body.sourceId || null,
    referenceNo: body.referenceNo || '',
    remark: body.remark || '',
  }, userId);

  return txn || { message: 'Transaction created' };
};

module.exports = { list, summary, createManualEntry };
