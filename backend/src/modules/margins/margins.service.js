const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { addMoney, gteMoney, eqMoney } = require('../../utils/money');
const { createTransaction, createReversalTransaction } = require('../../utils/transactions');
const {
  MarginBill, MarginPayment, Account, Transaction,
  ResaleDeal, Inventory,
} = require('../../models');

const stripId = ({ _id, ...rest }) => rest;

const listBills = async (query) => {
  const filter = notDeleted();
  if (query.societyId) filter.societyId = query.societyId;
  const bills = await MarginBill.find(filter).sort({ billDate: -1 }).lean();
  if (bills.length === 0) return [];

  // Join ResaleDeal + Inventory in batch so the table can render the resold
  // flat label and the (TRANSFERRED) seller/buyer alongside each margin row.
  const dealIds = [...new Set(bills.map(b => b.resaleDealId).filter(Boolean))];
  const deals = dealIds.length
    ? await ResaleDeal.find({ id: { $in: dealIds } }).lean()
    : [];
  const dealById = Object.fromEntries(deals.map(d => [d.id, d]));

  const inventoryIds = [...new Set(deals.map(d => d.inventoryId).filter(Boolean))];
  const inventories = inventoryIds.length
    ? await Inventory.find({ id: { $in: inventoryIds } }).lean()
    : [];
  const inventoryById = Object.fromEntries(inventories.map(i => [i.id, i]));

  return bills.map((b) => {
    const deal = b.resaleDealId ? dealById[b.resaleDealId] : null;
    const inv = deal?.inventoryId ? inventoryById[deal.inventoryId] : null;
    const amount = b.amount ?? 0;
    const paid = b.paidAmount || 0;
    return {
      ...stripId(b),
      inventoryName: inv?.inventoryNumber || '',
      inventoryType: inv?.type || '',
      sellerName: deal?.sellerName || '',
      buyerName: deal?.buyerName || '',
      resalePrice: deal?.resalePrice || 0,
      totalPaid: paid,
      balance: Math.max(0, amount - paid),
      status: (b.status || 'Pending').toUpperCase(),
    };
  });
};

const createBill = async (body) => {
  const amount = Number(body.amount) || 0;
  const billDate = body.billDate || null;
  const description = body.description || body.remark || '';

  if (!(amount > 0)) {
    return { error: 'Margin amount must be greater than zero', status: 400 };
  }

  let societyId = body.societyId || null;
  if (body.resaleDealId) {
    const deal = await ResaleDeal.findOne({ id: body.resaleDealId }).lean();
    if (!deal || deal.isDeleted) {
      return { error: 'Resale deal not found', status: 404 };
    }
    societyId = societyId || deal.societyId;
  }

  const bill = {
    id: uuidv4(),
    societyId,
    resaleDealId: body.resaleDealId || null,
    amount,
    billDate,
    description,
    remark: description,             // legacy alias for FE reads
    paidAmount: 0,
    status: 'Pending',
    createdAt: new Date(),
  };
  await MarginBill.create(bill);
  return bill;
};

// Edit a margin bill. Allow resale-deal / amount / date / description
// changes. Amount can't drop below already-paid (would make balance
// negative). No daybook reversal — bills don't write txns, only payments do.
const updateBill = async (id, body) => {
  const current = await MarginBill.findOne({ id }).lean();
  if (!current) return null;
  if (current.isDeleted) return { error: 'Bill is deleted', status: 400 };

  const incomingAmount = body.amount;
  const amount = incomingAmount !== undefined
    ? Number(incomingAmount)
    : (current.amount ?? 0);
  if (!(amount > 0)) {
    return { error: 'Margin amount must be greater than zero', status: 400 };
  }
  const paid = current.paidAmount || 0;
  if (amount < paid) {
    return {
      error: `Margin amount (${amount}) cannot be less than already paid (${paid}). Reverse some payments first.`,
      status: 400,
    };
  }

  const billDate = body.billDate || current.billDate;
  const description = body.description !== undefined
    ? body.description
    : (body.remark !== undefined ? body.remark : current.description);
  const resaleDealId = body.resaleDealId !== undefined ? body.resaleDealId : current.resaleDealId;

  const status = paid <= 0
    ? 'Pending'
    : (gteMoney(paid, amount) ? 'Paid' : 'Partial');

  await MarginBill.updateOne(
    { id },
    {
      $set: {
        resaleDealId,
        amount,
        billDate,
        description,
        remark: description,
        status,
        updatedAt: new Date(),
      },
    },
  );
  const updated = await MarginBill.findOne({ id }).lean();
  return stripId(updated);
};

const deleteBill = async (id, userId) => {
  const bill = await MarginBill.findOne({ id }).lean();
  if (!bill) return { error: 'Bill not found', status: 404 };

  const childPayments = await MarginPayment
    .find({ billId: id, isDeleted: { $ne: true } })
    .lean();
  for (const cp of childPayments) {
    const t = await Transaction.findOne({
      sourceType: 'MARGIN_PAYMENT',
      sourceId: cp.id,
      isReversed: { $ne: true },
      isReversal: { $ne: true },
    }).lean();
    if (t) await createReversalTransaction(t, userId, 'Margin bill deleted');
  }

  await MarginBill.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  await MarginPayment.updateMany({ billId: id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  return { message: 'Margin bill deleted' };
};

const listBillPayments = async (billId) => {
  const payments = await MarginPayment
    .find(notDeleted({ billId }))
    .sort({ paymentDate: -1 })
    .lean();
  return payments.map(stripId);
};

const addBillPayment = async (billId, body, userId) => {
  const bill = await MarginBill.findOne({ id: billId }).lean();
  if (!bill) return { error: 'Bill not found', status: 404 };

  let accountId = body.accountId;
  if (!accountId) {
    const defaultAccount = await Account.findOne({ isDefault: true }).lean();
    accountId = defaultAccount?.id;
  }

  const amount = parseFloat(body.amount) || 0;
  if (!(amount > 0)) {
    return { error: 'Payment amount must be greater than zero', status: 400 };
  }
  const billAmount = bill.amount ?? 0;
  const proposedPaid = addMoney(bill.paidAmount || 0, amount);
  if (!gteMoney(billAmount, proposedPaid)) {
    return {
      error: `Payment exceeds margin balance (bill ${billAmount}, already paid ${bill.paidAmount || 0}, attempted ${amount})`,
      status: 400,
    };
  }

  const payment = {
    id: uuidv4(),
    billId,
    societyId: bill.societyId,
    accountId,
    amount,
    paymentDate: body.paymentDate,
    paymentMode: body.paymentMode || 'Cash',
    referenceNo: body.referenceNo || '',
    remark: body.remark || '',
    createdBy: userId,
    createdAt: new Date(),
  };

  await MarginPayment.create(payment);

  const updated = await MarginBill.findOneAndUpdate(
    { id: billId },
    { $inc: { paidAmount: amount } },
    { new: true },
  ).lean();
  const status = eqMoney(updated.paidAmount || 0, billAmount) || gteMoney(updated.paidAmount || 0, billAmount)
    ? 'Paid'
    : 'Partial';
  await MarginBill.updateOne({ id: billId }, { $set: { status } });

  // Daybook label: pull the resold flat + buyer for context. No vendor name
  // since margin doesn't have a recipient.
  const deal = bill.resaleDealId
    ? await ResaleDeal.findOne({ id: bill.resaleDealId }).lean()
    : null;
  const inv = deal?.inventoryId
    ? await Inventory.findOne({ id: deal.inventoryId }).lean()
    : null;
  const partyLabel = inv?.inventoryNumber
    ? `Margin payout - ${inv.type || ''} ${inv.inventoryNumber}`.trim()
    : 'Margin payout';

  await createTransaction({
    txnDate: payment.paymentDate,
    societyId: bill.societyId,
    accountId,
    direction: 'OUT',
    amount,
    paymentMode: payment.paymentMode,
    partyType: 'Margin',
    partyName: partyLabel,
    sourceType: 'MARGIN_PAYMENT',
    sourceId: payment.id,
    remark: payment.remark || partyLabel,
  }, userId);

  return payment;
};

const deleteBillPayment = async (id, userId) => {
  const payment = await MarginPayment.findOne({ id }).lean();
  if (!payment) return { error: 'Payment not found', status: 404 };

  const originalTxn = await Transaction.findOne({ sourceType: 'MARGIN_PAYMENT', sourceId: id }).lean();
  if (originalTxn) {
    await createReversalTransaction(originalTxn, userId, 'Margin payment deleted');
  }

  const updated = await MarginBill.findOneAndUpdate(
    { id: payment.billId },
    { $inc: { paidAmount: -(payment.amount || 0) } },
    { new: true },
  ).lean();
  if (updated) {
    const billAmount = updated.amount ?? 0;
    const newPaid = Math.max(0, updated.paidAmount || 0);
    const status = newPaid <= 0
      ? 'Pending'
      : (gteMoney(newPaid, billAmount) ? 'Paid' : 'Partial');
    await MarginBill.updateOne(
      { id: payment.billId },
      { $set: { status, paidAmount: newPaid } },
    );
  }

  await MarginPayment.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  return { message: 'Margin payment deleted with reversal' };
};

// Edit a margin bill payment. Mirror of commissions.updateBillPayment —
// totals-affecting edits (amount/mode/account/date) reverse the original
// daybook txn and write a fresh one; pure remark edits update in place.
const updateBillPayment = async (id, body, userId) => {
  const payment = await MarginPayment.findOne({ id }).lean();
  if (!payment) return { error: 'Payment not found', status: 404 };
  if (payment.isDeleted) return { error: 'Payment is deleted', status: 400 };

  const bill = await MarginBill.findOne({ id: payment.billId }).lean();
  if (!bill) return { error: 'Parent bill not found', status: 404 };

  const incomingAmount = body.amount !== undefined ? parseFloat(body.amount) : payment.amount;
  if (!(incomingAmount > 0)) {
    return { error: 'Payment amount must be greater than zero', status: 400 };
  }
  const newAmount = Number(incomingAmount);
  const newPaymentDate = body.paymentDate || body.entryDate || payment.paymentDate;
  const newPaymentMode = body.paymentMode || payment.paymentMode;
  const newAccountId = body.accountId || payment.accountId;
  const newReferenceNo = body.referenceNo !== undefined ? body.referenceNo : (payment.referenceNo || '');
  const newRemark = body.remark !== undefined ? body.remark : (payment.remark || '');

  const totalsAffectingChange =
    !eqMoney(newAmount, payment.amount || 0)
    || newPaymentMode !== payment.paymentMode
    || newAccountId !== payment.accountId
    || newPaymentDate !== payment.paymentDate;

  if (!eqMoney(newAmount, payment.amount || 0)) {
    const billAmount = bill.amount ?? 0;
    const otherPaid = (bill.paidAmount || 0) - (payment.amount || 0);
    if (!gteMoney(billAmount, otherPaid + newAmount)) {
      return {
        error: `Updated amount exceeds margin balance (bill ${billAmount}, other payments ${otherPaid}, attempted ${newAmount})`,
        status: 400,
      };
    }
  }

  if (totalsAffectingChange) {
    const originalTxn = await Transaction.findOne({
      sourceType: 'MARGIN_PAYMENT',
      sourceId: id,
      isReversed: { $ne: true },
      isReversal: { $ne: true },
    }).lean();
    if (originalTxn) {
      await createReversalTransaction(originalTxn, userId, 'Margin payment edited');
    }

    const delta = newAmount - (payment.amount || 0);
    const updatedBill = await MarginBill.findOneAndUpdate(
      { id: payment.billId },
      { $inc: { paidAmount: delta } },
      { new: true },
    ).lean();

    await MarginPayment.updateOne(
      { id },
      {
        $set: {
          amount: newAmount,
          paymentDate: newPaymentDate,
          paymentMode: newPaymentMode,
          accountId: newAccountId,
          referenceNo: newReferenceNo,
          remark: newRemark,
          updatedAt: new Date(),
        },
      },
    );

    if (updatedBill) {
      const billAmount = updatedBill.amount ?? 0;
      const newPaid = Math.max(0, updatedBill.paidAmount || 0);
      const status = newPaid <= 0
        ? 'Pending'
        : (gteMoney(newPaid, billAmount) ? 'Paid' : 'Partial');
      await MarginBill.updateOne(
        { id: payment.billId },
        { $set: { status } },
      );

      const deal = updatedBill.resaleDealId
        ? await ResaleDeal.findOne({ id: updatedBill.resaleDealId }).lean()
        : null;
      const inv = deal?.inventoryId
        ? await Inventory.findOne({ id: deal.inventoryId }).lean()
        : null;
      const partyLabel = inv?.inventoryNumber
        ? `Margin payout - ${inv.type || ''} ${inv.inventoryNumber}`.trim()
        : 'Margin payout';

      await createTransaction({
        txnDate: newPaymentDate,
        societyId: updatedBill.societyId,
        accountId: newAccountId,
        direction: 'OUT',
        amount: newAmount,
        paymentMode: newPaymentMode,
        partyType: 'Margin',
        partyName: partyLabel,
        sourceType: 'MARGIN_PAYMENT',
        sourceId: id,
        remark: newRemark || partyLabel,
      }, userId);
    }
  } else {
    await MarginPayment.updateOne(
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

  const fresh = await MarginPayment.findOne({ id }).lean();
  return { message: 'Margin payment updated', payment: fresh };
};

module.exports = { listBills, createBill, updateBill, deleteBill, listBillPayments, addBillPayment, deleteBillPayment, updateBillPayment };
