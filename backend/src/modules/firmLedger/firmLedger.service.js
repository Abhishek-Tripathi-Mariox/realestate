const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { createTransaction: createDaybookTxn, createReversalTransaction } = require('../../utils/transactions');
const { Firm, FirmTransaction, Account, Transaction } = require('../../models');

const FIRM_PAYMENT_MODES = ['Cash', 'Bank Transfer', 'Cheque', 'RTGS', 'UPI'];

// sourceType used on the daybook entry that mirrors a FirmTransaction. The
// firm-ledger row's `id` is stored as the daybook txn's `sourceId` so we can
// find + reverse it on update / delete.
const FIRM_SOURCE_TYPE = 'FIRM_TRANSACTION';

const stripId = ({ _id, ...rest }) => rest;

const buildTxnFilter = (query) => {
  const filter = notDeleted();
  if (query.firmId && query.firmId !== 'all') filter.firmId = query.firmId;
  if (query.type && query.type !== 'all') filter.type = query.type;
  if (query.paymentMode && query.paymentMode !== 'all') filter.paymentMode = query.paymentMode;
  if (query.from || query.to) {
    filter.txnDate = {};
    if (query.from) filter.txnDate.$gte = query.from;
    if (query.to) filter.txnDate.$lte = query.to;
  }
  return filter;
};

const listTransactions = async (query) => {
  const filter = buildTxnFilter(query);
  const txns = await FirmTransaction.find(filter).sort({ txnDate: -1, createdAt: -1 }).lean();

  // Optional cheap client-side search over note + counterparty so the table
  // search field matches the rows the user actually sees.
  const search = (query.search || '').toLowerCase().trim();
  const filtered = search
    ? txns.filter(t =>
        (t.note || '').toLowerCase().includes(search) ||
        (t.counterparty || '').toLowerCase().includes(search))
    : txns;

  return filtered.map(stripId);
};

const summary = async (query) => {
  const filter = buildTxnFilter(query);
  const txns = await FirmTransaction.find(filter, { type: 1, amount: 1, firmId: 1 }).lean();
  const totalIn = txns.filter(t => t.type === 'IN').reduce((s, t) => s + (t.amount || 0), 0);
  const totalOut = txns.filter(t => t.type === 'OUT').reduce((s, t) => s + (t.amount || 0), 0);
  return {
    totalIn,
    totalOut,
    netBalance: totalIn - totalOut,
    firmsActive: new Set(txns.map(t => t.firmId)).size,
    txnCount: txns.length,
  };
};

const validateTxnInput = async (body) => {
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Amount must be positive', status: 400 };
  if (!body.firmId) return { error: 'Firm is required', status: 400 };
  if (!body.accountId) return { error: 'Account is required', status: 400 };
  if (!['IN', 'OUT'].includes(body.type)) return { error: 'Type must be IN or OUT', status: 400 };
  if (!body.txnDate) return { error: 'Transaction date is required', status: 400 };
  if (body.paymentMode && !FIRM_PAYMENT_MODES.includes(body.paymentMode)) {
    return { error: `Payment mode must be one of: ${FIRM_PAYMENT_MODES.join(', ')}`, status: 400 };
  }
  const firm = await Firm.findOne(notDeleted({ id: body.firmId })).lean();
  if (!firm) return { error: 'Firm not found', status: 404 };
  const account = await Account.findOne({ id: body.accountId }).lean();
  if (!account) return { error: 'Account not found', status: 404 };
  return null;
};

// Mirror a FirmTransaction onto the daybook so the chosen Cash/Bank account
// actually reflects the cash movement. The firm-ledger row's `id` is stored
// as the daybook txn's `sourceId` to support reversal on update / delete.
const postDaybookForFirm = async (txn, firm, userId) => {
  await createDaybookTxn({
    txnDate: txn.txnDate,
    societyId: null,                  // firm ledger is company-wide
    accountId: txn.accountId,
    direction: txn.type,
    amount: txn.amount,
    paymentMode: txn.paymentMode,
    partyType: 'Firm',
    partyName: firm?.name || '',
    sourceType: FIRM_SOURCE_TYPE,
    sourceId: txn.id,
    remark: txn.note || `Firm ${txn.type} — ${firm?.name || ''}${txn.counterparty ? ` (${txn.counterparty})` : ''}`,
  }, userId);
};

const reverseDaybookForFirm = async (firmTxnId, userId, reason) => {
  const original = await Transaction.findOne({
    sourceType: FIRM_SOURCE_TYPE,
    sourceId: firmTxnId,
    isReversal: { $ne: true },
    isReversed: { $ne: true },
  }).lean();
  if (original) await createReversalTransaction(original, userId, reason);
};

const createTransaction = async (body, userId) => {
  const err = await validateTxnInput(body);
  if (err) return err;
  const txn = {
    id: uuidv4(),
    firmId: body.firmId,
    accountId: body.accountId,
    type: body.type,
    amount: Number(body.amount),
    counterparty: (body.counterparty || '').trim(),
    paymentMode: body.paymentMode || 'Cash',
    txnDate: body.txnDate,
    note: (body.note || '').trim(),
    createdBy: userId,
    createdAt: new Date(),
  };
  await FirmTransaction.create(txn);
  const firm = await Firm.findOne({ id: txn.firmId }).lean();
  await postDaybookForFirm(txn, firm, userId);
  return txn;
};

const updateTransaction = async (id, body, userId) => {
  const existing = await FirmTransaction.findOne(notDeleted({ id })).lean();
  if (!existing) return { error: 'Transaction not found', status: 404 };
  // Validate the merged shape so partial updates can't smuggle invalid values
  // (e.g., amount=0) past the create-time checks.
  const merged = { ...existing, ...body };
  const err = await validateTxnInput(merged);
  if (err) return err;

  const update = { updatedAt: new Date() };
  ['firmId', 'accountId', 'type', 'paymentMode', 'txnDate', 'note', 'counterparty'].forEach(k => {
    if (body[k] !== undefined) update[k] = body[k];
  });
  if (body.amount !== undefined) update.amount = Number(body.amount);

  await FirmTransaction.updateOne({ id }, { $set: update });
  // Reverse the prior daybook entry + post a fresh one off the updated values.
  await reverseDaybookForFirm(id, userId, 'Firm-ledger entry updated');
  const updated = { ...existing, ...update };
  const firm = await Firm.findOne({ id: updated.firmId }).lean();
  await postDaybookForFirm(updated, firm, userId);
  return updated;
};

const removeTransaction = async (id, userId) => {
  const existing = await FirmTransaction.findOne(notDeleted({ id })).lean();
  if (!existing) return { error: 'Transaction not found', status: 404 };
  await FirmTransaction.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  await reverseDaybookForFirm(id, userId, 'Firm-ledger entry deleted');
  return { message: 'Transaction deleted' };
};

module.exports = {
  listTransactions, summary, createTransaction, updateTransaction, removeTransaction,
};
