const { v4: uuidv4 } = require('uuid');
const { getAccountBalance } = require('../../utils/transactions');
const { Account, AccountOpeningBalance } = require('../../models');

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

  const accountsWithBalance = await Promise.all(accounts.map(async (account) => {
    const { balance } = await getAccountBalance(account.id);
    const opening = await AccountOpeningBalance.findOne({ accountId: account.id }).lean();
    return {
      ...account,
      currentBalance: balance,
      openingAmount: opening?.openingAmount || 0,
      openingDate: opening?.openingDate || null,
    };
  }));

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
  await Account.updateOne({ id }, { $set: { ...body, updatedAt: new Date() } });
  const updated = await Account.findOne({ id }).lean();
  if (!updated) return null;
  return stripId(updated);
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
  await Account.updateOne({ id }, { $set: { isActive: false, deletedAt: new Date() } });
};

module.exports = { list, create, update, updateOpeningBalance, remove };
