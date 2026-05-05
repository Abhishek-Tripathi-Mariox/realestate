const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { createTransaction, createReversalTransaction } = require('../../utils/transactions');
const {
  Purchase, PurchasePaymentEntry, Account, Transaction,
} = require('../../models');

const stripId = ({ _id, ...rest }) => rest;

const listForSociety = async (societyId) => {
  const purchases = await Purchase.find(notDeleted({ societyId })).lean();
  return purchases.map((p) => {
    const dealAmount = p.dealAmount ?? p.totalCost ?? 0;
    const totalPaid = p.amountPaid || 0;
    return {
      ...stripId(p),
      totalPaid,
      balance: dealAmount - totalPaid,
    };
  });
};

const create = async (societyId, body) => {
  // Frontend's PurchaseForm sends `partyName, dealAmount, agreementDate`. Older
  // callers may send `vendorName, totalCost, purchaseDate`. Accept both.
  const partyName = body.partyName ?? body.vendorName ?? '';
  const dealAmount = Number(body.dealAmount ?? body.totalCost) || 0;
  const purchaseDate = body.agreementDate || body.purchaseDate || null;

  const purchase = {
    id: uuidv4(),
    societyId,
    inventoryId: body.inventoryId || null,
    partyName,
    vendorName: partyName,           // legacy alias for read paths
    purchaseDate,
    agreementDate: purchaseDate,     // legacy alias
    dealAmount,
    totalCost: dealAmount,           // legacy alias
    amountPaid: 0,
    status: 'Pending',
    notes: body.notes || '',
    createdAt: new Date(),
  };
  await Purchase.create(purchase);
  return purchase;
};

const remove = async (id, userId) => {
  const purchase = await Purchase.findOne({ id }).lean();
  if (!purchase) return { error: 'Purchase not found', status: 404 };

  const txns = await Transaction.find({
    sourceType: { $in: ['PURCHASE', 'PURCHASE_PAYMENT'] },
    sourceId: id,
    isReversal: { $ne: true },
  }).lean();
  for (const t of txns) {
    await createReversalTransaction(t, userId, 'Purchase deleted');
  }

  await Purchase.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  return { message: 'Purchase deleted with reversal' };
};

const listPayments = async (purchaseId) => {
  const entries = await PurchasePaymentEntry
    .find(notDeleted({ purchaseId }))
    .sort({ paymentDate: -1 })
    .lean();
  return entries.map(stripId);
};

const addPayment = async (purchaseId, body, userId) => {
  const purchase = await Purchase.findOne({ id: purchaseId }).lean();
  if (!purchase) return { error: 'Purchase not found', status: 404 };

  let accountId = body.accountId;
  if (!accountId) {
    const defaultAccount = await Account.findOne({ isDefault: true }).lean();
    accountId = defaultAccount?.id;
  }

  const amount = parseFloat(body.amount) || 0;
  const entry = {
    id: uuidv4(),
    purchaseId,
    societyId: purchase.societyId,
    accountId,
    amount,
    paymentDate: body.paymentDate || body.entryDate,
    paymentMode: body.paymentMode || 'Cash',
    referenceNo: body.referenceNo || '',
    remark: body.remark || '',
    createdBy: userId,
    createdAt: new Date(),
  };

  await PurchasePaymentEntry.create(entry);

  const newPaid = (purchase.amountPaid || 0) + amount;
  const status = newPaid >= (purchase.dealAmount || purchase.totalAmount || 0) ? 'Paid' : 'Partial';
  await Purchase.updateOne({ id: purchaseId }, { $set: { amountPaid: newPaid, paymentStatus: status } });

  await createTransaction({
    txnDate: entry.paymentDate,
    societyId: purchase.societyId,
    accountId,
    direction: 'OUT',
    amount,
    paymentMode: entry.paymentMode,
    partyType: 'Vendor',
    partyName: purchase.partyName || purchase.sellerName || 'Seller',
    sourceType: 'PURCHASE_PAYMENT',
    sourceId: entry.id,
    remark: entry.remark || `Purchase payment - ${purchase.partyName || ''}`,
  }, userId);

  return entry;
};

const deletePayment = async (id, userId) => {
  const entry = await PurchasePaymentEntry.findOne({ id }).lean();
  if (!entry) return { error: 'Entry not found', status: 404 };

  const originalTxn = await Transaction.findOne({ sourceType: 'PURCHASE_PAYMENT', sourceId: id }).lean();
  if (originalTxn) {
    await createReversalTransaction(originalTxn, userId, 'Purchase payment deleted');
  }

  const purchase = await Purchase.findOne({ id: entry.purchaseId }).lean();
  if (purchase) {
    const newPaid = Math.max(0, (purchase.amountPaid || 0) - (entry.amount || 0));
    const status = newPaid <= 0 ? 'Pending' : (newPaid >= (purchase.dealAmount || purchase.totalAmount || 0) ? 'Paid' : 'Partial');
    await Purchase.updateOne({ id: entry.purchaseId }, { $set: { amountPaid: newPaid, paymentStatus: status } });
  }

  await PurchasePaymentEntry.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  return { message: 'Purchase payment deleted with reversal' };
};

module.exports = { listForSociety, create, remove, listPayments, addPayment, deletePayment };
