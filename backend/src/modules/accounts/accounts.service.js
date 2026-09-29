const { v4: uuidv4 } = require('uuid');
const { getAccountBalance } = require('../../utils/transactions');
const { pick } = require('../../utils/pick');
const { Account, AccountOpeningBalance, Transaction } = require('../../models');

// Allow rename / overdraft toggle but NOT scope/societyId/isDefault — those
// would silently change which account every "no accountId" payment lands in.
const ACCOUNT_UPDATABLE = ['name', 'type', 'overdraftEnabled'];

const stripId = ({ _id, ...rest }) => rest;

const list = async (query) => {
  const { societyId, scope } = query;
  const filter = { isActive: { $ne: false } };

  const isGlobalAccount = {
    $or: [
      { scope: 'GLOBAL' },
      { societyId: null },
      { societyId: { $exists: false } },
    ],
  };

  if (scope === 'COMPANY') {
    Object.assign(filter, isGlobalAccount);
  } else if (scope === 'SOCIETY') {
    filter.scope = 'SOCIETY';
    if (societyId && societyId !== 'all') filter.societyId = societyId;
  } else if (societyId && societyId !== 'all') {
    filter.$or = [
      { scope: 'GLOBAL' },
      { societyId: null },
      { societyId: { $exists: false } },
      { societyId },
    ];
  }

  const accounts = await Account.find(filter).lean();
  if (accounts.length === 0) return [];

  // Compute balances via an aggregation that GROUPS on the server instead
  // of shipping every transaction row to Node. We group by (accountId,
  // sourceType, sourceId, direction) so aliveTransactions only sees one
  // synthetic doc per parent (usually a few thousand) rather than every
  // txn row (potentially hundreds of thousands). That's the difference
  // between the accounts page loading in seconds vs. minutes.
  const accountIds = accounts.map(a => a.id);
  const groups = await Transaction.aggregate([
    {
      $match: {
        accountId: { $in: accountIds },
        isVoided: { $ne: true },
        isReversed: { $ne: true },
        isReversal: { $ne: true },
      },
    },
    {
      $group: {
        _id: {
          accountId: '$accountId',
          sourceType: '$sourceType',
          sourceId: '$sourceId',
          direction: '$direction',
        },
        amount: { $sum: '$amount' },
      },
    },
  ]);

  const { filterAliveTransactions } = require('../../utils/aliveTransactions');
  // filterAliveTransactions only looks at sourceType + sourceId, so passing
  // one synthetic doc per group is enough to reuse the parent-chain walker
  // without changing its signature.
  const aliveGroups = await filterAliveTransactions(
    groups.map((g) => ({ sourceType: g._id.sourceType, sourceId: g._id.sourceId, _group: g })),
  );
  const balanceByAccount = aliveGroups.reduce((acc, g) => {
    const grp = g._group;
    const amt = Number(grp.amount) || 0;
    acc[grp._id.accountId] = (acc[grp._id.accountId] || 0)
      + (grp._id.direction === 'IN' ? amt : -amt);
    return acc;
  }, {});

  const openingDocs = await AccountOpeningBalance
    .find({ accountId: { $in: accountIds } })
    .lean();
  const openingByAccount = Object.fromEntries(openingDocs.map(o => [o.accountId, o]));

  const accountsWithBalance = accounts.map((account) => {
    const opening = openingByAccount[account.id];
    const openingAmount = Number(opening?.openingAmount) || 0;
    return {
      ...account,
      currentBalance: openingAmount + (balanceByAccount[account.id] || 0),
      openingAmount,
      openingDate: opening?.openingDate || null,
    };
  });

  return accountsWithBalance.map(stripId);
};

const create = async (body) => {
  const account = {
    id: uuidv4(),
    name: body.name,
    type: body.type || 'BANK',
    isDefault: false,
    overdraftEnabled: body.overdraftEnabled || false,
    scope: body.scope || 'GLOBAL',
    societyId: body.societyId || null,
    isActive: true,
    createdAt: new Date(),
  };

  await Account.create(account);

  await AccountOpeningBalance.create({
    id: uuidv4(),
    accountId: account.id,
    openingAmount: Number(body.openingAmount) || 0,
    openingDate: new Date().toISOString().split('T')[0],
    createdAt: new Date(),
  });

  return account;
};

const update = async (id, body) => {
  const patch = { ...pick(body, ACCOUNT_UPDATABLE), updatedAt: new Date() };
  await Account.updateOne({ id }, { $set: patch });
  const updated = await Account.findOne({ id }).lean();
  if (!updated) return null;
  return stripId(updated);
};

// `isDefault` should be unique. Wrap the toggle in a transaction-style flow:
// clear it everywhere first, then set it on the chosen account. Two callers
// can still race here, but the result will be at-most-one default rather
// than silently letting many accounts share the flag.
const setDefault = async (id) => {
  const account = await Account.findOne({ id }).lean();
  if (!account) return { error: 'Account not found', status: 404 };
  await Account.updateMany({ isDefault: true }, { $set: { isDefault: false } });
  await Account.updateOne({ id }, { $set: { isDefault: true } });
  return { message: 'Default account updated' };
};

const updateOpeningBalance = async (id, body) => {
  await AccountOpeningBalance.updateOne(
    { accountId: id },
    { $set: { openingAmount: Number(body.openingAmount) || 0, openingDate: body.openingDate, updatedAt: new Date() } },
    { upsert: true },
  );
  return { message: 'Opening balance updated' };
};

const remove = async (id) => {
  // Refuse delete when there are live (non-reversed/voided) transactions
  // against the account or when the balance is non-zero — otherwise the
  // daybook keeps referencing a "deleted" account and balances drift.
  const liveTxnCount = await Transaction.countDocuments({
    accountId: id,
    isVoided: { $ne: true },
    isReversed: { $ne: true },
    isReversal: { $ne: true },
  });
  if (liveTxnCount > 0) {
    const { balance } = await getAccountBalance(id);
    if (Math.abs(balance) > 0.5) {
      return {
        error: `Account has a non-zero balance (${balance}). Settle it before deleting.`,
        status: 409,
      };
    }
    return {
      error: `Account has ${liveTxnCount} live transaction(s). Reverse them before deleting.`,
      status: 409,
    };
  }
  await Account.updateOne({ id }, { $set: { isActive: false, deletedAt: new Date() } });
  return { message: 'Account deactivated' };
};

module.exports = { list, create, update, updateOpeningBalance, setDefault, remove };
