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

  // Compute balances in a single batch instead of N separate scans of the
  // transactions collection. Load every transaction for the relevant
  // accounts once, run aliveTransactions ONCE, then group by accountId.
  const accountIds = accounts.map(a => a.id);
  const rawTxns = await Transaction.find({
    accountId: { $in: accountIds },
    isVoided: { $ne: true },
    isReversed: { $ne: true },
    isReversal: { $ne: true },
  }).lean();
  const { filterAliveTransactions } = require('../../utils/aliveTransactions');
  const aliveTxns = await filterAliveTransactions(rawTxns);
  const balanceByAccount = aliveTxns.reduce((acc, t) => {
    const amt = Number(t.amount) || 0;
    acc[t.accountId] = (acc[t.accountId] || 0) + (t.direction === 'IN' ? amt : -amt);
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
