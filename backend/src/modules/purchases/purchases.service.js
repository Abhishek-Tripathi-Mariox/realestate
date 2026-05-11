const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { addMoney, gteMoney, eqMoney } = require('../../utils/money');
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

// Allow rename / re-date / re-deal-amount / notes — but never `id`,
// `societyId`, or denormalized totals (amountPaid, status). dealAmount
// can't be set below the already-paid total or downstream balance math
// would go negative.
const update = async (id, body) => {
  const current = await Purchase.findOne({ id }).lean();
  if (!current) return null;

  const partyName = body.partyName !== undefined
    ? body.partyName
    : (body.vendorName !== undefined ? body.vendorName : current.partyName);

  const incomingDeal = body.dealAmount !== undefined ? body.dealAmount : body.totalCost;
  const dealAmount = incomingDeal !== undefined ? Number(incomingDeal) : (current.dealAmount ?? current.totalCost ?? 0);

  if (!(dealAmount > 0)) {
    return { error: 'Deal amount must be greater than zero', status: 400 };
  }
  const paid = current.amountPaid || 0;
  if (dealAmount < paid) {
    return {
      error: `Deal amount (${dealAmount}) cannot be less than already-paid (${paid}). Reverse some payments first.`,
      status: 400,
    };
  }

  const purchaseDate = body.agreementDate || body.purchaseDate || current.purchaseDate || current.agreementDate;
  const notes = body.notes !== undefined ? body.notes : current.notes;

  const status = paid <= 0
    ? 'Pending'
    : (gteMoney(paid, dealAmount) ? 'Paid' : 'Partial');

  await Purchase.updateOne(
    { id },
    {
      $set: {
        partyName,
        vendorName: partyName,
        dealAmount,
        totalCost: dealAmount,
        purchaseDate,
        agreementDate: purchaseDate,
        notes,
        status,
        updatedAt: new Date(),
      },
    },
  );
  const updated = await Purchase.findOne({ id }).lean();
  return stripId(updated);
};

const remove = async (id, userId) => {
  const purchase = await Purchase.findOne({ id }).lean();
  if (!purchase) return { error: 'Purchase not found', status: 404 };

  // PURCHASE_PAYMENT transactions are keyed by the payment-entry id, not the
  // purchase id (see addPayment: sourceId = entry.id). The previous query
  // looked up `sourceId = id` (purchase id) so it found nothing — payments
  // stayed live in the daybook. Enumerate the children, reverse each, then
  // soft-delete them so they vanish from per-purchase listings too.
  const liveEntries = await PurchasePaymentEntry.find({
    purchaseId: id,
    isDeleted: { $ne: true },
  }).lean();
  for (const entry of liveEntries) {
    const t = await Transaction.findOne({
      sourceType: 'PURCHASE_PAYMENT',
      sourceId: entry.id,
      isReversed: { $ne: true },
      isReversal: { $ne: true },
    }).lean();
    if (t) await createReversalTransaction(t, userId, 'Purchase deleted');
  }
  if (liveEntries.length) {
    await PurchasePaymentEntry.updateMany(
      { purchaseId: id, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, deletedAt: new Date(), deletedReason: 'Purchase deleted' } },
    );
  }

  await Purchase.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  return { message: `Purchase deleted (${liveEntries.length} payment(s) reversed)` };
};

const listPayments = async (purchaseId) => {
  // Tie-break same-date rows by createdAt so the latest entry on a given
  // day appears first (e.g. a refund that follows a payment on the same
  // date shows up above the payment instead of in insertion-undefined order).
  const entries = await PurchasePaymentEntry
    .find(notDeleted({ purchaseId }))
    .sort({ paymentDate: -1, createdAt: -1 })
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
  if (!(amount > 0)) {
    return { error: 'Payment amount must be greater than zero', status: 400 };
  }
  const entryType = body.entryType === 'REFUND' ? 'REFUND' : 'PURCHASE_PAYMENT';
  const isRefund = entryType === 'REFUND';
  const dealAmount = purchase.dealAmount ?? purchase.totalAmount ?? purchase.totalCost ?? 0;
  const currentPaid = purchase.amountPaid || 0;

  if (isRefund) {
    // Refund can't exceed what has already been paid net.
    if (!gteMoney(currentPaid, amount)) {
      return {
        error: `Refund exceeds amount already paid (paid ${currentPaid}, attempted refund ${amount})`,
        status: 400,
      };
    }
  } else {
    const proposedPaid = addMoney(currentPaid, amount);
    if (!gteMoney(dealAmount, proposedPaid)) {
      return {
        error: `Payment exceeds purchase balance (deal ${dealAmount}, already paid ${currentPaid}, attempted ${amount})`,
        status: 400,
      };
    }
  }

  const entry = {
    id: uuidv4(),
    purchaseId,
    societyId: purchase.societyId,
    accountId,
    amount,
    entryType,
    paymentDate: body.paymentDate || body.entryDate,
    paymentMode: body.paymentMode || 'Cash',
    referenceNo: body.referenceNo || '',
    remark: body.remark || '',
    createdBy: userId,
    createdAt: new Date(),
  };

  await PurchasePaymentEntry.create(entry);

  const delta = isRefund ? -amount : amount;
  const updated = await Purchase.findOneAndUpdate(
    { id: purchaseId },
    { $inc: { amountPaid: delta } },
    { new: true },
  ).lean();
  const newPaid = Math.max(0, updated.amountPaid || 0);
  const status = newPaid <= 0
    ? 'Pending'
    : (gteMoney(newPaid, dealAmount) ? 'Paid' : 'Partial');
  await Purchase.updateOne({ id: purchaseId }, { $set: { paymentStatus: status } });

  await createTransaction({
    txnDate: entry.paymentDate,
    societyId: purchase.societyId,
    accountId,
    direction: isRefund ? 'IN' : 'OUT',
    amount,
    paymentMode: entry.paymentMode,
    partyType: 'Vendor',
    partyName: purchase.partyName || purchase.sellerName || 'Seller',
    sourceType: 'PURCHASE_PAYMENT',
    sourceId: entry.id,
    remark: entry.remark || `${isRefund ? 'Purchase refund' : 'Purchase payment'} - ${purchase.partyName || ''}`,
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

  const isRefund = entry.entryType === 'REFUND';
  const reversalDelta = isRefund ? (entry.amount || 0) : -(entry.amount || 0);
  const updated = await Purchase.findOneAndUpdate(
    { id: entry.purchaseId },
    { $inc: { amountPaid: reversalDelta } },
    { new: true },
  ).lean();
  if (updated) {
    const dealAmount = updated.dealAmount ?? updated.totalAmount ?? updated.totalCost ?? 0;
    const newPaid = Math.max(0, updated.amountPaid || 0);
    const status = newPaid <= 0
      ? 'Pending'
      : (gteMoney(newPaid, dealAmount) ? 'Paid' : 'Partial');
    await Purchase.updateOne(
      { id: entry.purchaseId },
      { $set: { amountPaid: newPaid, paymentStatus: status } },
    );
  }

  await PurchasePaymentEntry.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  return { message: `${isRefund ? 'Purchase refund' : 'Purchase payment'} deleted with reversal` };
};

// Update an existing payment entry. For non-trivial edits (amount / mode /
// account / date) we reverse the original daybook transaction and write a
// fresh one so the audit trail stays clean. Pure remark / referenceNo
// edits update in place because they don't affect any totals.
const updatePayment = async (id, body, userId) => {
  const entry = await PurchasePaymentEntry.findOne({ id }).lean();
  if (!entry) return { error: 'Entry not found', status: 404 };
  if (entry.isDeleted) return { error: 'Entry is deleted', status: 400 };

  // Accept both `paymentDate` and `entryDate` like addPayment does.
  const incomingAmount = body.amount !== undefined ? parseFloat(body.amount) : entry.amount;
  if (!(incomingAmount > 0)) {
    return { error: 'Payment amount must be greater than zero', status: 400 };
  }
  const newAmount = Number(incomingAmount);
  const newPaymentDate = body.paymentDate || body.entryDate || entry.paymentDate;
  const newPaymentMode = body.paymentMode || entry.paymentMode;
  const newAccountId = body.accountId || entry.accountId;
  const newReferenceNo = body.referenceNo !== undefined ? body.referenceNo : (entry.referenceNo || '');
  const newRemark = body.remark !== undefined ? body.remark : (entry.remark || '');
  const oldEntryType = entry.entryType === 'REFUND' ? 'REFUND' : 'PURCHASE_PAYMENT';
  const newEntryType = body.entryType === 'REFUND' || body.entryType === 'PURCHASE_PAYMENT'
    ? body.entryType
    : oldEntryType;
  const wasRefund = oldEntryType === 'REFUND';
  const isRefund = newEntryType === 'REFUND';

  const totalsAffectingChange =
    !eqMoney(newAmount, entry.amount || 0)
    || newPaymentMode !== entry.paymentMode
    || newAccountId !== entry.accountId
    || newPaymentDate !== entry.paymentDate
    || newEntryType !== oldEntryType;

  // Re-validate the parent's cap when amount or entryType changes affect the
  // signed contribution to amountPaid.
  if (!eqMoney(newAmount, entry.amount || 0) || newEntryType !== oldEntryType) {
    const purchase = await Purchase.findOne({ id: entry.purchaseId }).lean();
    if (!purchase) return { error: 'Parent purchase not found', status: 404 };
    const dealAmount = purchase.dealAmount ?? purchase.totalAmount ?? purchase.totalCost ?? 0;
    const oldDelta = wasRefund ? -(entry.amount || 0) : (entry.amount || 0);
    const newDelta = isRefund ? -newAmount : newAmount;
    const otherPaid = (purchase.amountPaid || 0) - oldDelta;
    const projectedPaid = otherPaid + newDelta;
    if (projectedPaid < 0) {
      return {
        error: `Refund exceeds amount already paid (other entries net ${otherPaid}, attempted refund ${newAmount})`,
        status: 400,
      };
    }
    if (!gteMoney(dealAmount, projectedPaid)) {
      return {
        error: `Updated amount exceeds purchase balance (deal ${dealAmount}, other payments ${otherPaid}, attempted ${newAmount})`,
        status: 400,
      };
    }
  }

  if (totalsAffectingChange) {
    // Reverse the original daybook txn and write a replacement so the
    // running cash balance / aliveTransactions filter stay correct.
    const originalTxn = await Transaction.findOne({
      sourceType: 'PURCHASE_PAYMENT',
      sourceId: id,
      isReversed: { $ne: true },
      isReversal: { $ne: true },
    }).lean();
    if (originalTxn) {
      await createReversalTransaction(originalTxn, userId, 'Purchase payment edited');
    }

    // Atomic adjustment of parent's amountPaid by the signed delta. Refunds
    // contribute a negative amount so swapping between PAYMENT/REFUND flips
    // the sign cleanly.
    const oldDelta = wasRefund ? -(entry.amount || 0) : (entry.amount || 0);
    const newDelta = isRefund ? -newAmount : newAmount;
    const delta = newDelta - oldDelta;
    const updatedPurchase = await Purchase.findOneAndUpdate(
      { id: entry.purchaseId },
      { $inc: { amountPaid: delta } },
      { new: true },
    ).lean();

    await PurchasePaymentEntry.updateOne(
      { id },
      {
        $set: {
          amount: newAmount,
          entryType: newEntryType,
          paymentDate: newPaymentDate,
          paymentMode: newPaymentMode,
          accountId: newAccountId,
          referenceNo: newReferenceNo,
          remark: newRemark,
          updatedAt: new Date(),
        },
      },
    );

    if (updatedPurchase) {
      const dealAmount = updatedPurchase.dealAmount ?? updatedPurchase.totalAmount ?? updatedPurchase.totalCost ?? 0;
      const newPaid = Math.max(0, updatedPurchase.amountPaid || 0);
      const status = newPaid <= 0
        ? 'Pending'
        : (gteMoney(newPaid, dealAmount) ? 'Paid' : 'Partial');
      await Purchase.updateOne(
        { id: entry.purchaseId },
        { $set: { paymentStatus: status } },
      );

      await createTransaction({
        txnDate: newPaymentDate,
        societyId: updatedPurchase.societyId,
        accountId: newAccountId,
        direction: isRefund ? 'IN' : 'OUT',
        amount: newAmount,
        paymentMode: newPaymentMode,
        partyType: 'Vendor',
        partyName: updatedPurchase.partyName || updatedPurchase.sellerName || 'Seller',
        sourceType: 'PURCHASE_PAYMENT',
        sourceId: id,
        referenceNo: newReferenceNo,
        remark: newRemark || `${isRefund ? 'Purchase refund' : 'Purchase payment'} - ${updatedPurchase.partyName || ''}`,
      }, userId);
    }
  } else {
    // Pure metadata change — no totals affected, no reversal needed.
    await PurchasePaymentEntry.updateOne(
      { id },
      {
        $set: {
          referenceNo: newReferenceNo,
          remark: newRemark,
          updatedAt: new Date(),
        },
      },
    );
  }

  const fresh = await PurchasePaymentEntry.findOne({ id }).lean();
  return { message: 'Purchase payment updated', entry: fresh };
};

module.exports = { listForSociety, create, update, remove, listPayments, addPayment, deletePayment, updatePayment };
