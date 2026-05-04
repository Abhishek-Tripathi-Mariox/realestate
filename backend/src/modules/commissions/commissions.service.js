const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { createTransaction, createReversalTransaction } = require('../../utils/transactions');
const {
  CommissionBill, CommissionPayment, Account, Transaction, Vendor,
} = require('../../models');

const stripId = ({ _id, ...rest }) => rest;

const listBills = async (query) => {
  const filter = notDeleted();
  if (query.societyId) filter.societyId = query.societyId;
  const bills = await CommissionBill.find(filter).sort({ billDate: -1 }).lean();
  return bills.map(stripId);
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
      isReversal: { $ne: true },
    }).lean();
    if (t) await createReversalTransaction(t, userId, 'Commission bill deleted');
  }
  const directTxn = await Transaction.findOne({
    sourceType: 'COMMISSION_PAYMENT',
    sourceId: id,
    isReversal: { $ne: true },
  }).lean();
  if (directTxn) await createReversalTransaction(directTxn, userId, 'Commission bill deleted');

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

  const newPaid = (bill.paidAmount || 0) + amount;
  const status = newPaid >= (bill.amount || 0) ? 'Paid' : 'Partial';
  await CommissionBill.updateOne({ id: billId }, { $set: { paidAmount: newPaid, status } });

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

  const bill = await CommissionBill.findOne({ id: payment.billId }).lean();
  if (bill) {
    const newPaid = Math.max(0, (bill.paidAmount || 0) - (payment.amount || 0));
    const status = newPaid <= 0 ? 'Pending' : (newPaid >= (bill.amount || 0) ? 'Paid' : 'Partial');
    await CommissionBill.updateOne({ id: payment.billId }, { $set: { paidAmount: newPaid, status } });
  }

  await CommissionPayment.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  return { message: 'Commission payment deleted with reversal' };
};

module.exports = { listBills, createBill, deleteBill, listBillPayments, addBillPayment, deleteBillPayment };
