const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const {
  createTransaction: createDaybookTxn,
  createReversalTransaction,
  getAccountBalance,
} = require('../../utils/transactions');
const { Account, BankOperation, Transaction } = require('../../models');

// sourceType values used on the daybook txns that mirror a BankOperation.
// `sourceId` is the BankOperation `id`, so we can find both legs of a
// transfer + the single withdrawal txn to reverse on update / delete.
const WITHDRAWAL_SOURCE_TYPE = 'BANK_WITHDRAWAL';
const TRANSFER_SOURCE_TYPE = 'BANK_TRANSFER';

const stripId = ({ _id, ...rest }) => rest;

const buildOpFilter = (query) => {
  const filter = notDeleted();
  if (query.kind && query.kind !== 'all') filter.kind = query.kind;
  if (query.accountId && query.accountId !== 'all') {
    filter.$or = [
      { fromAccountId: query.accountId },
      { toAccountId: query.accountId },
    ];
  }
  if (query.from || query.to) {
    filter.txnDate = {};
    if (query.from) filter.txnDate.$gte = query.from;
    if (query.to) filter.txnDate.$lte = query.to;
  }
  return filter;
};

const listOperations = async (query) => {
  const filter = buildOpFilter(query);
  const ops = await BankOperation.find(filter).sort({ txnDate: -1, createdAt: -1 }).lean();

  const search = (query.search || '').toLowerCase().trim();
  const filtered = search
    ? ops.filter(o => (o.note || '').toLowerCase().includes(search))
    : ops;

  return filtered.map(stripId);
};

const summary = async (query) => {
  const filter = buildOpFilter(query);
  const ops = await BankOperation.find(filter, { kind: 1, amount: 1 }).lean();
  const totalWithdrawal = ops
    .filter(o => o.kind === 'WITHDRAWAL')
    .reduce((s, o) => s + (o.amount || 0), 0);
  const totalTransfer = ops
    .filter(o => o.kind === 'TRANSFER')
    .reduce((s, o) => s + (o.amount || 0), 0);
  return {
    totalWithdrawal,
    totalTransfer,
    withdrawalCount: ops.filter(o => o.kind === 'WITHDRAWAL').length,
    transferCount: ops.filter(o => o.kind === 'TRANSFER').length,
    opCount: ops.length,
  };
};

const validateWithdrawal = async (body) => {
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Amount must be positive', status: 400 };
  if (!body.fromAccountId) return { error: 'Bank account is required', status: 400 };
  if (!body.txnDate) return { error: 'Transaction date is required', status: 400 };
  const account = await Account.findOne({ id: body.fromAccountId }).lean();
  if (!account) return { error: 'Account not found', status: 404 };
  return null;
};

const validateTransfer = async (body) => {
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Amount must be positive', status: 400 };
  if (!body.fromAccountId) return { error: 'Source account is required', status: 400 };
  if (!body.toAccountId) return { error: 'Destination account is required', status: 400 };
  if (body.fromAccountId === body.toAccountId) return { error: 'Source and destination must be different', status: 400 };
  if (!body.txnDate) return { error: 'Transaction date is required', status: 400 };
  const [fromAccount, toAccount] = await Promise.all([
    Account.findOne({ id: body.fromAccountId }).lean(),
    Account.findOne({ id: body.toAccountId }).lean(),
  ]);
  if (!fromAccount) return { error: 'Source account not found', status: 404 };
  if (!toAccount) return { error: 'Destination account not found', status: 404 };
  return null;
};

// Find every live daybook txn this BankOperation produced and reverse each.
// A WITHDRAWAL has one mirror, a TRANSFER has two (OUT + IN legs).
const reverseDaybookForOp = async (opId, userId, reason) => {
  const originals = await Transaction.find({
    sourceType: { $in: [WITHDRAWAL_SOURCE_TYPE, TRANSFER_SOURCE_TYPE] },
    sourceId: opId,
    isReversal: { $ne: true },
    isReversed: { $ne: true },
  }).lean();
  for (const original of originals) {
    await createReversalTransaction(original, userId, reason);
  }
};

const postWithdrawalDaybook = async (op, fromAccount, userId) => {
  await createDaybookTxn({
    txnDate: op.txnDate,
    societyId: null,                            // bank ops are company-wide
    accountId: op.fromAccountId,
    direction: 'OUT',
    amount: op.amount,
    paymentMode: fromAccount?.type === 'CASH' ? 'Cash' : 'Bank Transfer',
    partyType: 'Bank',
    partyName: fromAccount?.name || '',
    sourceType: WITHDRAWAL_SOURCE_TYPE,
    sourceId: op.id,
    remark: op.note || `Withdrawal from ${fromAccount?.name || 'account'}`,
  }, userId);
};

const postTransferDaybook = async (op, fromAccount, toAccount, userId) => {
  // OUT leg on source
  await createDaybookTxn({
    txnDate: op.txnDate,
    societyId: null,
    accountId: op.fromAccountId,
    direction: 'OUT',
    amount: op.amount,
    paymentMode: fromAccount?.type === 'CASH' ? 'Cash' : 'Bank Transfer',
    partyType: 'Transfer',
    partyName: toAccount?.name || '',
    sourceType: TRANSFER_SOURCE_TYPE,
    sourceId: op.id,
    remark: op.note || `Transfer to ${toAccount?.name || 'account'}`,
  }, userId);
  // IN leg on destination
  await createDaybookTxn({
    txnDate: op.txnDate,
    societyId: null,
    accountId: op.toAccountId,
    direction: 'IN',
    amount: op.amount,
    paymentMode: toAccount?.type === 'CASH' ? 'Cash' : 'Bank Transfer',
    partyType: 'Transfer',
    partyName: fromAccount?.name || '',
    sourceType: TRANSFER_SOURCE_TYPE,
    sourceId: op.id,
    remark: op.note || `Transfer from ${fromAccount?.name || 'account'}`,
  }, userId);
};

const createWithdrawal = async (body, userId) => {
  const err = await validateWithdrawal(body);
  if (err) return err;
  const op = {
    id: uuidv4(),
    kind: 'WITHDRAWAL',
    fromAccountId: body.fromAccountId,
    amount: Number(body.amount),
    txnDate: body.txnDate,
    note: (body.note || '').trim(),
    createdBy: userId,
    createdAt: new Date(),
  };
  await BankOperation.create(op);
  const fromAccount = await Account.findOne({ id: op.fromAccountId }).lean();
  await postWithdrawalDaybook(op, fromAccount, userId);
  return op;
};

const createTransfer = async (body, userId) => {
  const err = await validateTransfer(body);
  if (err) return err;
  const op = {
    id: uuidv4(),
    kind: 'TRANSFER',
    fromAccountId: body.fromAccountId,
    toAccountId: body.toAccountId,
    amount: Number(body.amount),
    txnDate: body.txnDate,
    note: (body.note || '').trim(),
    createdBy: userId,
    createdAt: new Date(),
  };
  await BankOperation.create(op);
  const [fromAccount, toAccount] = await Promise.all([
    Account.findOne({ id: op.fromAccountId }).lean(),
    Account.findOne({ id: op.toAccountId }).lean(),
  ]);
  await postTransferDaybook(op, fromAccount, toAccount, userId);
  return op;
};

const updateOperation = async (id, body, userId) => {
  const existing = await BankOperation.findOne(notDeleted({ id })).lean();
  if (!existing) return { error: 'Bank operation not found', status: 404 };

  const merged = { ...existing, ...body };
  const err = existing.kind === 'WITHDRAWAL'
    ? await validateWithdrawal(merged)
    : await validateTransfer(merged);
  if (err) return err;

  const update = { updatedAt: new Date() };
  ['fromAccountId', 'toAccountId', 'txnDate', 'note'].forEach(k => {
    if (body[k] !== undefined) update[k] = body[k];
  });
  if (body.amount !== undefined) update.amount = Number(body.amount);

  await BankOperation.updateOne({ id }, { $set: update });
  // Reverse the prior daybook entries and post fresh ones with the new values.
  await reverseDaybookForOp(id, userId, 'Bank operation updated');
  const updated = { ...existing, ...update };
  if (updated.kind === 'WITHDRAWAL') {
    const fromAccount = await Account.findOne({ id: updated.fromAccountId }).lean();
    await postWithdrawalDaybook(updated, fromAccount, userId);
  } else {
    const [fromAccount, toAccount] = await Promise.all([
      Account.findOne({ id: updated.fromAccountId }).lean(),
      Account.findOne({ id: updated.toAccountId }).lean(),
    ]);
    await postTransferDaybook(updated, fromAccount, toAccount, userId);
  }
  return updated;
};

const removeOperation = async (id, userId) => {
  const existing = await BankOperation.findOne(notDeleted({ id })).lean();
  if (!existing) return { error: 'Bank operation not found', status: 404 };
  await BankOperation.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  await reverseDaybookForOp(id, userId, 'Bank operation deleted');
  return { message: 'Bank operation deleted' };
};

module.exports = {
  listOperations,
  summary,
  createWithdrawal,
  createTransfer,
  updateOperation,
  removeOperation,
};
