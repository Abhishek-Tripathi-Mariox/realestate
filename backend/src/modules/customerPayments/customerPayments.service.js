const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { createTransaction, createReversalTransaction } = require('../../utils/transactions');
const {
  CustomerPayment, Customer, Account, PaymentAllocation, Transaction,
} = require('../../models');

const list = async (query) => {
  const filter = notDeleted();
  if (query.societyId) filter.societyId = query.societyId;
  if (query.customerId) filter.customerId = query.customerId;

  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 10;
  const skip = (page - 1) * limit;

  const total = await CustomerPayment.countDocuments(filter);
  const payments = await CustomerPayment
    .find(filter)
    .sort({ paymentDate: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const paymentIds = payments.map(p => p.id);
  const allocations = paymentIds.length
    ? await PaymentAllocation.find({ paymentId: { $in: paymentIds } }).lean()
    : [];
  const allocatedByPayment = allocations.reduce((acc, a) => {
    acc[a.paymentId] = (acc[a.paymentId] || 0) + (a.amount || 0);
    return acc;
  }, {});

  const enriched = await Promise.all(payments.map(async (p) => {
    const customer = await Customer.findOne({ id: p.customerId }).lean();
    const account = await Account.findOne({ id: p.accountId }).lean();
    const allocatedAmount = allocatedByPayment[p.id] || 0;
    const unallocatedAmount = Math.max(0, (p.amount || 0) - allocatedAmount);
    let status = 'PENDING';
    if (allocatedAmount >= (p.amount || 0) - 0.01) status = 'FULLY_ALLOCATED';
    else if (allocatedAmount > 0) status = 'PARTIALLY_ALLOCATED';
    return {
      ...p,
      customerName: customer?.name || 'N/A',
      accountName: account?.name || 'N/A',
      allocatedAmount,
      unallocatedAmount,
      status,
    };
  }));

  return {
    data: enriched.map(({ _id, ...rest }) => rest),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const create = async (body, userId) => {
  const customer = await Customer.findOne({ id: body.customerId }).lean();
  if (!customer) return { error: 'Customer not found', status: 404 };

  let accountId = body.accountId;
  if (!accountId) {
    const defaultAccount = await Account.findOne({ isDefault: true }).lean();
    accountId = defaultAccount?.id;
  }

  const amount = Number(body.amount) || 0;
  // Frontend's CustomerPaymentForm sends `reference`; old callers send `referenceNo`.
  const referenceNo = body.referenceNo ?? body.reference ?? '';
  const payment = {
    id: uuidv4(),
    customerId: body.customerId,
    societyId: body.societyId || customer.societyId,
    accountId,
    amount,
    paymentDate: body.paymentDate,
    paymentMode: body.paymentMode || 'Cash',
    referenceNo,
    reference: referenceNo,                // legacy alias for FE reads
    remark: body.remark || '',
    unallocatedAmount: amount,
    createdBy: userId,
    createdAt: new Date(),
  };

  await CustomerPayment.create(payment);

  await createTransaction({
    txnDate: body.paymentDate,
    societyId: payment.societyId,
    accountId,
    direction: 'IN',
    amount,
    paymentMode: body.paymentMode || 'Cash',
    partyType: 'Customer',
    partyName: customer.name,
    sourceType: 'CUSTOMER_PAYMENT',
    sourceId: payment.id,
    remark: body.remark || `Customer payment - ${customer.name}`,
  }, userId);

  return payment;
};

const remove = async (id, userId) => {
  const payment = await CustomerPayment.findOne({ id }).lean();
  if (!payment) return { error: 'Payment not found', status: 404 };

  const originalTxn = await Transaction.findOne({ sourceType: 'CUSTOMER_PAYMENT', sourceId: id }).lean();
  if (originalTxn) {
    await createReversalTransaction(originalTxn, userId, 'Customer payment deleted');
  }

  await CustomerPayment.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  await PaymentAllocation.deleteMany({ paymentId: id });

  return { message: 'Payment deleted with reversal' };
};

const listAllocations = async (paymentId) => {
  const allocations = await PaymentAllocation.find({ paymentId }).lean();
  return allocations.map(({ _id, ...rest }) => ({ ...rest, allocatedAmount: rest.amount }));
};

const setAllocations = async (paymentId, body, userId) => {
  const payment = await CustomerPayment.findOne({ id: paymentId }).lean();
  if (!payment) return { error: 'Payment not found', status: 404 };

  const incoming = Array.isArray(body.allocations) ? body.allocations : [];
  const totalAllocated = incoming.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
  if (totalAllocated > (payment.amount || 0) + 0.01) {
    return { error: `Allocation total (${totalAllocated}) exceeds payment amount (${payment.amount})`, status: 400 };
  }

  await PaymentAllocation.deleteMany({ paymentId });

  const docs = incoming
    .filter(a => parseFloat(a.amount) > 0 && a.saleId)
    .map(a => ({
      id: uuidv4(),
      paymentId,
      saleId: a.saleId,
      amount: parseFloat(a.amount),
      createdBy: userId,
      createdAt: new Date(),
    }));
  if (docs.length) await PaymentAllocation.insertMany(docs);

  const unallocatedAmount = (payment.amount || 0) - totalAllocated;
  await CustomerPayment.updateOne(
    { id: paymentId },
    { $set: { unallocatedAmount, updatedAt: new Date() } },
  );

  return { message: 'Allocations saved', count: docs.length, unallocatedAmount };
};

module.exports = { list, create, remove, listAllocations, setAllocations };
