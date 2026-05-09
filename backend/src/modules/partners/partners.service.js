const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { createTransaction, createReversalTransaction } = require('../../utils/transactions');
const { pick } = require('../../utils/pick');
const {
  Partner, PartnerLedgerEntry, Account, Transaction,
} = require('../../models');

const PARTNER_UPDATABLE = ['name', 'percentage', 'expectedInvestment', 'notes'];

const stripId = ({ _id, ...rest }) => rest;

const listForSociety = async (societyId) => {
  const partners = await Partner.find(notDeleted({ societyId })).lean();

  const partnersWithTotals = await Promise.all(partners.map(async (partner) => {
    const ledgerEntries = await PartnerLedgerEntry.find(notDeleted({ partnerId: partner.id })).lean();
    const totalInvestment = ledgerEntries.filter(e => e.type === 'INVESTMENT').reduce((sum, e) => sum + e.amount, 0);
    const totalWithdrawal = ledgerEntries.filter(e => e.type === 'WITHDRAWAL').reduce((sum, e) => sum + e.amount, 0);
    const totalProfitPaid = ledgerEntries.filter(e => e.type === 'PROFIT_PAYOUT').reduce((sum, e) => sum + e.amount, 0);
    const runningBalance = totalInvestment - totalWithdrawal - totalProfitPaid;
    return { ...partner, totalInvestment, totalWithdrawal, totalProfitPaid, runningBalance };
  }));

  const summary = {
    totalPartnerInvestment: partnersWithTotals.reduce((sum, p) => sum + p.totalInvestment, 0),
    totalWithdrawals: partnersWithTotals.reduce((sum, p) => sum + p.totalWithdrawal, 0),
    totalProfitPaid: partnersWithTotals.reduce((sum, p) => sum + p.totalProfitPaid, 0),
    totalRunningBalance: partnersWithTotals.reduce((sum, p) => sum + p.runningBalance, 0),
    totalPercentage: partnersWithTotals.reduce((sum, p) => sum + p.percentage, 0),
    partnerCount: partnersWithTotals.length,
  };

  return { partners: partnersWithTotals.map(stripId), summary };
};

const create = async (societyId, body) => {
  const percentage = Number(body.percentage) || 0;
  const expectedInvestment = Number(body.expectedInvestment) || 0;

  const existingPartners = await Partner.find(notDeleted({ societyId })).lean();
  const existingPercentage = existingPartners.reduce((sum, p) => sum + (Number(p.percentage) || 0), 0);
  if (existingPercentage + percentage > 100) {
    return { error: 'Total partner percentage cannot exceed 100%', status: 400 };
  }

  const partner = {
    id: uuidv4(),
    societyId,
    name: body.name,
    percentage,
    expectedInvestment,
    notes: body.notes || '',
    createdAt: new Date(),
  };

  await Partner.create(partner);
  return { ...partner, totalInvestment: 0, totalWithdrawal: 0, totalProfitPaid: 0, runningBalance: 0 };
};

const update = async (id, body) => {
  // Cap-check: if percentage changes, make sure the partner percentages
  // for this society still sum to <= 100. Without this an editor can
  // bump one partner above the cap and silently break profit splits.
  const partner = await Partner.findOne({ id }).lean();
  if (!partner) return null;
  if (body.percentage !== undefined) {
    const newPct = Number(body.percentage) || 0;
    const others = await Partner.find(notDeleted({
      societyId: partner.societyId,
      id: { $ne: id },
    })).lean();
    const otherTotal = others.reduce((s, p) => s + (Number(p.percentage) || 0), 0);
    if (otherTotal + newPct > 100) {
      return { error: 'Total partner percentage cannot exceed 100%', status: 400 };
    }
  }

  const patch = { ...pick(body, PARTNER_UPDATABLE), updatedAt: new Date() };
  await Partner.updateOne({ id }, { $set: patch });
  const updated = await Partner.findOne({ id }).lean();
  if (!updated) return null;
  return stripId(updated);
};

const remove = async (id) => {
  // Cascade: soft-delete partner ledger entries so the per-partner ledger
  // view doesn't show orphan rows. The aliveTransactions filter already
  // excludes PARTNER_CAPITAL daybook entries when the partner is gone.
  await PartnerLedgerEntry.updateMany(
    { partnerId: id, isDeleted: { $ne: true } },
    { $set: { isDeleted: true, deletedAt: new Date(), deletedReason: 'Partner deleted' } },
  );
  await Partner.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
};

const listLedger = async (partnerId) => {
  const entries = await PartnerLedgerEntry
    .find(notDeleted({ partnerId }))
    .sort({ entryDate: -1 })
    .lean();
  return entries.map(stripId);
};

const addLedgerEntry = async (partnerId, body, userId) => {
  const partner = await Partner.findOne({ id: partnerId }).lean();
  if (!partner) return { error: 'Partner not found', status: 404 };

  let accountId = body.accountId;
  if (!accountId) {
    const defaultAccount = await Account.findOne({ isDefault: true }).lean();
    accountId = defaultAccount?.id;
  }

  const entry = {
    id: uuidv4(),
    partnerId,
    societyId: partner.societyId,
    accountId,
    type: body.type,
    amount: Number(body.amount) || 0,
    entryDate: body.entryDate,
    paymentMode: body.paymentMode,
    remark: body.remark || '',
    createdBy: userId,
    createdAt: new Date(),
  };

  await PartnerLedgerEntry.create(entry);

  const direction = body.type === 'INVESTMENT' ? 'IN' : 'OUT';
  await createTransaction({
    txnDate: body.entryDate,
    societyId: partner.societyId,
    accountId,
    direction,
    amount: Number(body.amount) || 0,
    paymentMode: body.paymentMode,
    partyType: 'Partner',
    partyName: partner.name,
    sourceType: 'PARTNER_CAPITAL',
    sourceId: entry.id,
    remark: body.remark || `${body.type} - ${partner.name}`,
  }, userId);

  return entry;
};

const updateLedgerEntry = async (id, body, userId) => {
  const entry = await PartnerLedgerEntry.findOne({ id }).lean();
  if (!entry) return { error: 'Entry not found', status: 404 };

  const partner = await Partner.findOne({ id: entry.partnerId }).lean();

  const originalTxn = await Transaction.findOne({ sourceType: 'PARTNER_CAPITAL', sourceId: id }).lean();
  if (originalTxn) {
    await createReversalTransaction(originalTxn, userId, 'Ledger entry edited');
  }

  const update = {
    type: body.type ?? entry.type,
    amount: parseFloat(body.amount) || entry.amount,
    entryDate: body.entryDate || entry.entryDate,
    paymentMode: body.paymentMode || entry.paymentMode,
    accountId: body.accountId || entry.accountId,
    remark: body.remark ?? entry.remark,
    updatedAt: new Date(),
  };
  await PartnerLedgerEntry.updateOne({ id }, { $set: update });

  const direction = update.type === 'INVESTMENT' ? 'IN' : 'OUT';
  await createTransaction({
    txnDate: update.entryDate,
    societyId: entry.societyId,
    accountId: update.accountId,
    direction,
    amount: update.amount,
    paymentMode: update.paymentMode,
    partyType: 'Partner',
    partyName: partner?.name || '',
    sourceType: 'PARTNER_CAPITAL',
    sourceId: entry.id,
    remark: update.remark || `${update.type} - ${partner?.name || ''}`,
  }, userId);

  const updated = await PartnerLedgerEntry.findOne({ id }).lean();
  return stripId(updated);
};

const deleteLedgerEntry = async (id, userId) => {
  const entry = await PartnerLedgerEntry.findOne({ id }).lean();
  if (!entry) return { error: 'Entry not found', status: 404 };

  const originalTxn = await Transaction.findOne({ sourceType: 'PARTNER_CAPITAL', sourceId: id }).lean();
  if (originalTxn) {
    await createReversalTransaction(originalTxn, userId, 'Ledger entry deleted');
  }

  await PartnerLedgerEntry.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  return { message: 'Ledger entry deleted with reversal' };
};

module.exports = {
  listForSociety, create, update, remove,
  listLedger, addLedgerEntry, updateLedgerEntry, deleteLedgerEntry,
};
