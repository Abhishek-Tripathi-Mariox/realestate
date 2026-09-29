const { v4: uuidv4 } = require('uuid');
const { Account, Transaction, AccountOpeningBalance } = require('../models');

const getAccountBalance = async (accountId) => {
  const account = await Account.findOne({ id: accountId }).lean();
  if (!account) return { balance: 0, account: null };

  // Aggregate on the server: one synthetic row per (sourceType, sourceId,
  // direction) instead of one row per raw transaction. That keeps the
  // aliveTransactions cost proportional to the number of distinct parent
  // records rather than the total transaction count.
  const groups = await Transaction.aggregate([
    {
      $match: {
        accountId,
        isVoided: { $ne: true },
        isReversed: { $ne: true },
        isReversal: { $ne: true },
      },
    },
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

  // Lazy-require to avoid a circular import (aliveTransactions ↔ models ↔ utils).
  const { filterAliveTransactions } = require('./aliveTransactions');
  const aliveGroups = await filterAliveTransactions(
    groups.map((g) => ({ sourceType: g._id.sourceType, sourceId: g._id.sourceId, _group: g })),
  );

  // Start from the opening balance the user entered when creating the
  // account — without this, a fresh bank with ₹25L pre-existing cash shows
  // ₹0 until activity flows through.
  const opening = await AccountOpeningBalance.findOne({ accountId }).lean();
  let balance = Number(opening?.openingAmount) || 0;
  for (const g of aliveGroups) {
    const amt = Number(g._group.amount) || 0;
    if (g._group._id.direction === 'IN') balance += amt;
    else balance -= amt;
  }

  return { balance, account };
};

const createTransaction = async (data, userId) => {
  const scope = data.societyId ? 'SOCIETY' : 'COMPANY';
  const transaction = {
    id: uuidv4(),
    txnDate: data.txnDate || new Date().toISOString().split('T')[0],
    societyId: data.societyId || null,
    scope,
    accountId: data.accountId,
    direction: data.direction,
    amount: Number(data.amount) || 0,
    paymentMode: data.paymentMode || 'Cash',
    partyType: data.partyType,
    partyName: data.partyName,
    sourceType: data.sourceType,
    sourceId: data.sourceId,
    referenceNo: data.referenceNo || '',
    remark: data.remark || '',
    createdBy: userId,
    createdAt: new Date(),
  };
  await Transaction.create(transaction);
  return transaction;
};

const createReversalTransaction = async (originalTxn, userId, reason = 'Payment deleted') => {
  if (!originalTxn) return null;

  const existingReversal = await Transaction.findOne({
    originalTxnId: originalTxn.id,
    isReversal: true,
  }).lean();
  if (existingReversal) return existingReversal;

  const reversalTxn = {
    id: uuidv4(),
    txnDate: new Date().toISOString().split('T')[0],
    societyId: originalTxn.societyId,
    scope: originalTxn.scope || 'SOCIETY',
    accountId: originalTxn.accountId,
    direction: originalTxn.direction === 'IN' ? 'OUT' : 'IN',
    amount: Number(originalTxn.amount) || 0,
    paymentMode: originalTxn.paymentMode,
    partyType: originalTxn.partyType,
    partyName: originalTxn.partyName,
    sourceType: `${originalTxn.sourceType}_REVERSAL`,
    sourceId: originalTxn.id,
    referenceNo: originalTxn.referenceNo,
    remark: `REVERSAL: ${reason}`,
    createdBy: userId,
    createdAt: new Date(),
    isReversal: true,
    originalTxnId: originalTxn.id,
  };

  await Transaction.create(reversalTxn);
  await Transaction.updateOne(
    { id: originalTxn.id },
    { $set: { isReversed: true, reversedAt: new Date(), reversalTxnId: reversalTxn.id } },
  );

  return reversalTxn;
};

module.exports = { getAccountBalance, createTransaction, createReversalTransaction };
