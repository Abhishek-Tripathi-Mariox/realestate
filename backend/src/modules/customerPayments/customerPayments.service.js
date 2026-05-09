const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { createTransaction, createReversalTransaction } = require('../../utils/transactions');
const {
  CustomerPayment, Customer, Account, PaymentAllocation, Transaction,
  Sale, SalePaymentEntry,
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
  const rawAllocations = paymentIds.length
    ? await PaymentAllocation.find({ paymentId: { $in: paymentIds } }).lean()
    : [];

  // Self-heal: drop allocations whose sale has been (soft-)deleted, so a
  // payment whose sale was removed shows the freed-up money as unallocated
  // again — even if PaymentAllocation cleanup wasn't run at delete time.
  const allocSaleIds = [...new Set(rawAllocations.map(a => a.saleId).filter(Boolean))];
  const liveSales = allocSaleIds.length
    ? await Sale.find(notDeleted({ id: { $in: allocSaleIds } })).lean()
    : [];
  const liveSaleIds = new Set(liveSales.map(s => s.id));
  const allocations = rawAllocations.filter(a => liveSaleIds.has(a.saleId));

  const allocatedByPayment = allocations.reduce((acc, a) => {
    acc[a.paymentId] = (acc[a.paymentId] || 0) + (a.amount || 0);
    return acc;
  }, {});

  // Bulk-fetch customers/accounts in two queries instead of N+N findOnes.
  const customerIds = [...new Set(payments.map(p => p.customerId).filter(Boolean))];
  const accountIds = [...new Set(payments.map(p => p.accountId).filter(Boolean))];
  const [customerDocs, accountDocs] = await Promise.all([
    customerIds.length ? Customer.find({ id: { $in: customerIds } }).lean() : [],
    accountIds.length ? Account.find({ id: { $in: accountIds } }).lean() : [],
  ]);
  const customerById = Object.fromEntries(customerDocs.map(c => [c.id, c]));
  const accountById = Object.fromEntries(accountDocs.map(a => [a.id, a]));

  const enriched = payments.map((p) => {
    const customer = customerById[p.customerId];
    const account = accountById[p.accountId];
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
  });

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

  // Per-sale cap: each new allocation, combined with the sale's existing net
  // ledger balance and OTHER payments' allocations, must not push that sale's
  // total paid past its finalAmount. Stops typo over-allocation (e.g. typing
  // an extra zero on a single line) from bypassing the per-payment check.
  const incomingBySale = {};
  for (const a of incoming) {
    const amt = parseFloat(a.amount) || 0;
    if (amt > 0 && a.saleId) {
      incomingBySale[a.saleId] = (incomingBySale[a.saleId] || 0) + amt;
    }
  }
  const incomingSaleIds = Object.keys(incomingBySale);
  if (incomingSaleIds.length) {
    const [sales, otherAllocs, ledgerEntries] = await Promise.all([
      // Only allocate against live sales — without notDeleted, money could
      // be allocated to a trashed sale and the per-sale cap check would
      // succeed against stale finalAmount.
      Sale.find(notDeleted({ id: { $in: incomingSaleIds } })).lean(),
      // Existing allocations for these sales from OTHER payments — the current
      // payment's rows are about to be replaced, so exclude them from the cap.
      PaymentAllocation.find({
        saleId: { $in: incomingSaleIds },
        paymentId: { $ne: paymentId },
      }).lean(),
      SalePaymentEntry.find(notDeleted({ saleId: { $in: incomingSaleIds } })).lean(),
    ]);
    const saleById = Object.fromEntries(sales.map(s => [s.id, s]));
    const otherAllocBySale = otherAllocs.reduce((acc, a) => {
      acc[a.saleId] = (acc[a.saleId] || 0) + (a.amount || 0);
      return acc;
    }, {});
    const ledgerNetBySale = ledgerEntries.reduce((acc, e) => {
      const t = e.entryType || 'SALE_PAYMENT';
      const delta = t === 'SALE_PAYMENT' ? (e.amount || 0) : -(e.amount || 0);
      acc[e.saleId] = (acc[e.saleId] || 0) + delta;
      return acc;
    }, {});

    for (const saleId of incomingSaleIds) {
      const sale = saleById[saleId];
      if (!sale) {
        return { error: `Sale ${saleId} not found`, status: 400 };
      }
      const alreadyPaid = (ledgerNetBySale[saleId] || 0) + (otherAllocBySale[saleId] || 0);
      const remaining = (sale.finalAmount || 0) - alreadyPaid;
      const requested = incomingBySale[saleId];
      if (requested > remaining + 0.01) {
        const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;
        return {
          error: `Allocation ${fmt(requested)} for sale exceeds its remaining balance ${fmt(remaining)}.`,
          status: 400,
        };
      }
    }
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
