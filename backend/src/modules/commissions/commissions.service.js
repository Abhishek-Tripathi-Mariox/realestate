const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { addMoney, gteMoney, eqMoney } = require('../../utils/money');
const { createTransaction, createReversalTransaction } = require('../../utils/transactions');
const {
  CommissionBill, CommissionPayment, Account, Transaction, Vendor,
  Sale, Inventory, Customer,
} = require('../../models');

const stripId = ({ _id, ...rest }) => rest;

const listBills = async (query) => {
  const filter = notDeleted();
  if (query.societyId) filter.societyId = query.societyId;
  const bills = await CommissionBill.find(filter).sort({ billDate: -1 }).lean();
  if (bills.length === 0) return [];

  // Join Sale → Customer + Inventory in batch so the table can render
  // Sale (Customer) and Inventory columns plus the totalPaid/balance aliases
  // the FE reads.
  const saleIds = [...new Set(bills.map(b => b.saleId).filter(Boolean))];
  const sales = saleIds.length ? await Sale.find({ id: { $in: saleIds } }).lean() : [];
  const saleById = Object.fromEntries(sales.map(s => [s.id, s]));

  const inventoryIds = [...new Set(sales.map(s => s.inventoryId).filter(Boolean))];
  const inventories = inventoryIds.length
    ? await Inventory.find({ id: { $in: inventoryIds } }).lean()
    : [];
  const inventoryById = Object.fromEntries(inventories.map(i => [i.id, i]));

  const customerIds = [...new Set(sales.map(s => s.customerId).filter(Boolean))];
  const customers = customerIds.length
    ? await Customer.find({ id: { $in: customerIds } }).lean()
    : [];
  const customerById = Object.fromEntries(customers.map(c => [c.id, c]));

  return bills.map((b) => {
    const sale = b.saleId ? saleById[b.saleId] : null;
    const inv = sale?.inventoryId ? inventoryById[sale.inventoryId] : null;
    const customer = sale?.customerId ? customerById[sale.customerId] : null;
    const amount = b.amount ?? b.commissionAmount ?? 0;
    const paid = b.paidAmount || 0;
    return {
      ...stripId(b),
      customerName: customer?.name || sale?.buyerName || '',
      inventoryName: inv?.inventoryNumber || '',
      totalPaid: paid,
      balance: Math.max(0, amount - paid),
      status: (b.status || 'Pending').toUpperCase(),
    };
  });
};

const createBill = async (body) => {
  // Frontend sends `brokerVendorId, commissionAmount, commissionDate, remark`.
  // Older callers may use `brokerName, amount, billDate, description`.
  let brokerName = body.brokerName || '';
  if (!brokerName && body.brokerVendorId) {
    const broker = await Vendor.findOne({ id: body.brokerVendorId }).lean();
    brokerName = broker?.name || '';
  }

  const amount = Number(body.commissionAmount ?? body.amount) || 0;
  const billDate = body.commissionDate || body.billDate || null;
  const description = body.remark || body.description || '';

  const bill = {
    id: uuidv4(),
    societyId: body.societyId,
    brokerVendorId: body.brokerVendorId || null,
    brokerName,
    saleId: body.saleId,
    amount,
    commissionAmount: amount,        // legacy alias for FE reads
    billDate,
    commissionDate: billDate,        // legacy alias
    description,
    remark: description,             // legacy alias
    paidAmount: 0,
    status: 'Pending',
    createdAt: new Date(),
  };
  await CommissionBill.create(bill);
  return bill;
};

// Edit a commission bill. Allow broker / sale / amount / date /
// description changes. Amount can't drop below already-paid (would make
// balance negative). No daybook reversal — bills don't write txns, only
// their payments do.
const updateBill = async (id, body) => {
  const current = await CommissionBill.findOne({ id }).lean();
  if (!current) return null;
  if (current.isDeleted) return { error: 'Bill is deleted', status: 400 };

  let brokerName = body.brokerName !== undefined ? body.brokerName : current.brokerName;
  if (body.brokerVendorId && body.brokerVendorId !== current.brokerVendorId && !body.brokerName) {
    const broker = await Vendor.findOne({ id: body.brokerVendorId }).lean();
    if (broker) brokerName = broker.name;
  }

  const incomingAmount = body.commissionAmount ?? body.amount;
  const amount = incomingAmount !== undefined
    ? Number(incomingAmount)
    : (current.amount ?? current.commissionAmount ?? 0);
  if (!(amount > 0)) {
    return { error: 'Commission amount must be greater than zero', status: 400 };
  }
  const paid = current.paidAmount || 0;
  if (amount < paid) {
    return {
      error: `Commission amount (${amount}) cannot be less than already paid (${paid}). Reverse some payments first.`,
      status: 400,
    };
  }

  const billDate = body.commissionDate || body.billDate || current.billDate;
  const description = body.remark !== undefined
    ? body.remark
    : (body.description !== undefined ? body.description : current.description);
  const saleId = body.saleId !== undefined ? body.saleId : current.saleId;

  const status = paid <= 0
    ? 'Pending'
    : (gteMoney(paid, amount) ? 'Paid' : 'Partial');

  await CommissionBill.updateOne(
    { id },
    {
      $set: {
        brokerVendorId: body.brokerVendorId !== undefined ? body.brokerVendorId : current.brokerVendorId,
        brokerName,
        saleId,
        amount,
        commissionAmount: amount,
        billDate,
        commissionDate: billDate,
        description,
        remark: description,
        status,
        updatedAt: new Date(),
      },
    },
  );
  const updated = await CommissionBill.findOne({ id }).lean();
  return stripId(updated);
};

const deleteBill = async (id, userId) => {
  const bill = await CommissionBill.findOne({ id }).lean();
  if (!bill) return { error: 'Bill not found', status: 404 };

  const childPayments = await CommissionPayment
    .find({ billId: id, isDeleted: { $ne: true } })
    .lean();
  for (const cp of childPayments) {
    const t = await Transaction.findOne({
      sourceType: 'COMMISSION_PAYMENT',
      sourceId: cp.id,
      isReversed: { $ne: true },
      isReversal: { $ne: true },
    }).lean();
    if (t) await createReversalTransaction(t, userId, 'Commission bill deleted');
  }
  // Note: removed the legacy "directTxn" lookup keyed by bill id — no
  // current code path creates such a transaction (commission txns are
  // always keyed by the payment row id), and the lookup risked
  // double-reversing if anyone ever did create one. The aliveTransactions
  // filter handles any stragglers via the BROKER_COMMISSION chain.

  await CommissionBill.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  await CommissionPayment.updateMany({ billId: id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  return { message: 'Commission bill deleted' };
};

const listBillPayments = async (billId) => {
  const payments = await CommissionPayment
    .find(notDeleted({ billId }))
    .sort({ paymentDate: -1 })
    .lean();
  return payments.map(stripId);
};

const addBillPayment = async (billId, body, userId) => {
  const bill = await CommissionBill.findOne({ id: billId }).lean();
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
  const billAmount = bill.amount ?? bill.commissionAmount ?? 0;
  const proposedPaid = addMoney(bill.paidAmount || 0, amount);
  if (!gteMoney(billAmount, proposedPaid)) {
    return {
      error: `Payment exceeds commission balance (bill ${billAmount}, already paid ${bill.paidAmount || 0}, attempted ${amount})`,
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

  await CommissionPayment.create(payment);

  const updated = await CommissionBill.findOneAndUpdate(
    { id: billId },
    { $inc: { paidAmount: amount } },
    { new: true },
  ).lean();
  const status = eqMoney(updated.paidAmount || 0, billAmount) || gteMoney(updated.paidAmount || 0, billAmount)
    ? 'Paid'
    : 'Partial';
  await CommissionBill.updateOne({ id: billId }, { $set: { status } });

  await createTransaction({
    txnDate: payment.paymentDate,
    societyId: bill.societyId,
    accountId,
    direction: 'OUT',
    amount,
    paymentMode: payment.paymentMode,
    partyType: 'Vendor',
    partyName: bill.brokerName,
    sourceType: 'COMMISSION_PAYMENT',
    sourceId: payment.id,
    remark: payment.remark || `Commission - ${bill.brokerName}`,
  }, userId);

  return payment;
};

const deleteBillPayment = async (id, userId) => {
  const payment = await CommissionPayment.findOne({ id }).lean();
  if (!payment) return { error: 'Payment not found', status: 404 };

  const originalTxn = await Transaction.findOne({ sourceType: 'COMMISSION_PAYMENT', sourceId: id }).lean();
  if (originalTxn) {
    await createReversalTransaction(originalTxn, userId, 'Commission payment deleted');
  }

  const updated = await CommissionBill.findOneAndUpdate(
    { id: payment.billId },
    { $inc: { paidAmount: -(payment.amount || 0) } },
    { new: true },
  ).lean();
  if (updated) {
    const billAmount = updated.amount ?? updated.commissionAmount ?? 0;
    const newPaid = Math.max(0, updated.paidAmount || 0);
    const status = newPaid <= 0
      ? 'Pending'
      : (gteMoney(newPaid, billAmount) ? 'Paid' : 'Partial');
    await CommissionBill.updateOne(
      { id: payment.billId },
      { $set: { status, paidAmount: newPaid } },
    );
  }

  await CommissionPayment.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  return { message: 'Commission payment deleted with reversal' };
};

// Edit a commission bill payment. Mirror of expenses.updateBillPayment —
// totals-affecting edits (amount/mode/account/date) reverse the original
// daybook txn and write a fresh one; pure remark edits update in place.
const updateBillPayment = async (id, body, userId) => {
  const payment = await CommissionPayment.findOne({ id }).lean();
  if (!payment) return { error: 'Payment not found', status: 404 };
  if (payment.isDeleted) return { error: 'Payment is deleted', status: 400 };

  const bill = await CommissionBill.findOne({ id: payment.billId }).lean();
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
    const billAmount = bill.amount ?? bill.commissionAmount ?? 0;
    const otherPaid = (bill.paidAmount || 0) - (payment.amount || 0);
    if (!gteMoney(billAmount, otherPaid + newAmount)) {
      return {
        error: `Updated amount exceeds commission balance (bill ${billAmount}, other payments ${otherPaid}, attempted ${newAmount})`,
        status: 400,
      };
    }
  }

  if (totalsAffectingChange) {
    const originalTxn = await Transaction.findOne({
      sourceType: 'COMMISSION_PAYMENT',
      sourceId: id,
      isReversed: { $ne: true },
      isReversal: { $ne: true },
    }).lean();
    if (originalTxn) {
      await createReversalTransaction(originalTxn, userId, 'Commission payment edited');
    }

    const delta = newAmount - (payment.amount || 0);
    const updatedBill = await CommissionBill.findOneAndUpdate(
      { id: payment.billId },
      { $inc: { paidAmount: delta } },
      { new: true },
    ).lean();

    await CommissionPayment.updateOne(
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
      const billAmount = updatedBill.amount ?? updatedBill.commissionAmount ?? 0;
      const newPaid = Math.max(0, updatedBill.paidAmount || 0);
      const status = newPaid <= 0
        ? 'Pending'
        : (gteMoney(newPaid, billAmount) ? 'Paid' : 'Partial');
      await CommissionBill.updateOne(
        { id: payment.billId },
        { $set: { status } },
      );

      await createTransaction({
        txnDate: newPaymentDate,
        societyId: updatedBill.societyId,
        accountId: newAccountId,
        direction: 'OUT',
        amount: newAmount,
        paymentMode: newPaymentMode,
        partyType: 'Vendor',
        partyName: updatedBill.brokerName,
        sourceType: 'COMMISSION_PAYMENT',
        sourceId: id,
        remark: newRemark || `Commission - ${updatedBill.brokerName}`,
      }, userId);
    }
  } else {
    await CommissionPayment.updateOne(
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

  const fresh = await CommissionPayment.findOne({ id }).lean();
  return { message: 'Commission payment updated', payment: fresh };
};

module.exports = { listBills, createBill, updateBill, deleteBill, listBillPayments, addBillPayment, deleteBillPayment, updateBillPayment };
