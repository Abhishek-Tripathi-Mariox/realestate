const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { createTransaction, createReversalTransaction } = require('../../utils/transactions');
const {
  CustomerPayment, Customer, Account, PaymentAllocation, Transaction,
  Sale, SalePaymentEntry, ResaleDeal, ResaleBuyerPayment,
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

  // Self-heal: drop allocations whose target (sale or resale deal) has been
  // (soft-)deleted, so a payment whose target was removed shows the freed-up
  // money as unallocated again — even if PaymentAllocation cleanup wasn't
  // run at delete time.
  const allocSaleIds = [...new Set(rawAllocations.map(a => a.saleId).filter(Boolean))];
  const allocResaleIds = [...new Set(rawAllocations.map(a => a.resaleDealId).filter(Boolean))];
  const [liveSales, liveResaleDeals] = await Promise.all([
    allocSaleIds.length
      ? Sale.find(notDeleted({ id: { $in: allocSaleIds } })).lean()
      : Promise.resolve([]),
    allocResaleIds.length
      ? ResaleDeal.find(notDeleted({ id: { $in: allocResaleIds } })).lean()
      : Promise.resolve([]),
  ]);
  const liveSaleIds = new Set(liveSales.map(s => s.id));
  const liveResaleIds = new Set(liveResaleDeals.map(d => d.id));
  const allocations = rawAllocations.filter(a => {
    if (a.saleId) return liveSaleIds.has(a.saleId);
    if (a.resaleDealId) return liveResaleIds.has(a.resaleDealId);
    return false;
  });

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

// Edit a customer payment in place. Reverse-and-repost pattern (same as the
// resale buyer/seller edits): the daybook is append-only, so the prior IN
// entry is reversed and a fresh one is posted off the updated values. Keeps
// account balances correct and the audit trail clean. Allocations are NOT
// touched here — the unallocatedAmount is recomputed from the live allocation
// total against the new payment amount, and the call is rejected if shrinking
// below what's already allocated.
const update = async (id, body, userId) => {
  const existing = await CustomerPayment.findOne(notDeleted({ id })).lean();
  if (!existing) return { error: 'Payment not found', status: 404 };

  const customerId = body.customerId !== undefined ? body.customerId : existing.customerId;
  const customer = await Customer.findOne({ id: customerId }).lean();
  if (!customer) return { error: 'Customer not found', status: 404 };

  const amount = body.amount !== undefined ? Number(body.amount) || 0 : existing.amount;
  if (!(amount > 0)) return { error: 'Amount must be greater than 0', status: 400 };

  // Sum of live allocations against this payment — if user is shrinking the
  // amount below what's already been allocated to sales, the math breaks. Tell
  // them to free up allocations first instead of silently corrupting the
  // unallocated balance.
  const allocs = await PaymentAllocation.find({ paymentId: id }).lean();
  const allocSaleIds = [...new Set(allocs.map(a => a.saleId).filter(Boolean))];
  const liveSales = allocSaleIds.length
    ? await Sale.find(notDeleted({ id: { $in: allocSaleIds } })).lean()
    : [];
  const liveSaleIds = new Set(liveSales.map(s => s.id));
  const allocatedAmount = allocs
    .filter(a => liveSaleIds.has(a.saleId))
    .reduce((sum, a) => sum + (a.amount || 0), 0);
  if (amount + 0.01 < allocatedAmount) {
    return {
      error: `New amount ₹${amount} is less than already allocated ₹${allocatedAmount}. Free up allocations first.`,
      status: 400,
    };
  }

  let accountId = body.accountId !== undefined ? body.accountId : existing.accountId;
  if (!accountId) {
    const defaultAccount = await Account.findOne({ isDefault: true }).lean();
    accountId = defaultAccount?.id;
  }

  const referenceNo = body.referenceNo ?? body.reference ?? existing.referenceNo ?? '';
  const update = {
    customerId,
    amount,
    accountId,
    paymentDate: body.paymentDate || existing.paymentDate,
    paymentMode: body.paymentMode || existing.paymentMode || 'Cash',
    referenceNo,
    reference: referenceNo,
    remark: body.remark !== undefined ? body.remark : (existing.remark || ''),
    unallocatedAmount: Math.max(0, amount - allocatedAmount),
    societyId: body.societyId || existing.societyId || customer.societyId,
    updatedAt: new Date(),
  };

  await CustomerPayment.updateOne({ id }, { $set: update });

  // Reverse the prior IN daybook entry, then post a fresh one with the new
  // account / mode / amount / date. The reversal pair nets to zero on the
  // OLD account; the new entry posts the live amount on the NEW one.
  const originalTxn = await Transaction.findOne({
    sourceType: 'CUSTOMER_PAYMENT',
    sourceId: id,
    isReversal: { $ne: true },
    isReversed: { $ne: true },
  }).lean();
  if (originalTxn) {
    await createReversalTransaction(originalTxn, userId, 'Customer payment edited');
  }
  await createTransaction({
    txnDate: update.paymentDate,
    societyId: update.societyId,
    accountId,
    direction: 'IN',
    amount,
    paymentMode: update.paymentMode,
    partyType: 'Customer',
    partyName: customer.name,
    sourceType: 'CUSTOMER_PAYMENT',
    sourceId: id,
    remark: update.remark || `Customer payment - ${customer.name}`,
  }, userId);

  return { ...existing, ...update };
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

  // Bucket incoming rows by target. Each row must carry exactly one of
  // saleId / resaleDealId — the frontend stamps whichever applies from the
  // `_isResale` flag on each row.
  const incomingBySale = {};
  const incomingByResaleDeal = {};
  for (const a of incoming) {
    const amt = parseFloat(a.amount) || 0;
    if (amt <= 0) continue;
    if (a.saleId) {
      incomingBySale[a.saleId] = (incomingBySale[a.saleId] || 0) + amt;
    } else if (a.resaleDealId) {
      incomingByResaleDeal[a.resaleDealId] = (incomingByResaleDeal[a.resaleDealId] || 0) + amt;
    }
  }

  // Per-sale cap: each new allocation, combined with the sale's existing net
  // ledger balance and OTHER payments' allocations, must not push that sale's
  // total paid past its finalAmount. Stops typo over-allocation (e.g. typing
  // an extra zero on a single line) from bypassing the per-payment check.
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
      const isCredit = t === 'SALE_PAYMENT' || t === 'TRANSFER_IN';
      const delta = isCredit ? (e.amount || 0) : -(e.amount || 0);
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

  // Per-resale-deal cap — same shape as the sale cap. The deal's "already
  // paid" is ResaleBuyerPayment rows + PaymentAllocations from OTHER
  // payments. Without this guard you could over-allocate by typing too many
  // zeros and silently drive `pendingBalance` negative on the resale.
  const incomingResaleIds = Object.keys(incomingByResaleDeal);
  if (incomingResaleIds.length) {
    const [resaleDeals, otherDealAllocs, buyerPayments] = await Promise.all([
      ResaleDeal.find(notDeleted({ id: { $in: incomingResaleIds } })).lean(),
      PaymentAllocation.find({
        resaleDealId: { $in: incomingResaleIds },
        paymentId: { $ne: paymentId },
      }).lean(),
      ResaleBuyerPayment.find(notDeleted({ dealId: { $in: incomingResaleIds } })).lean(),
    ]);
    const dealById = Object.fromEntries(resaleDeals.map(d => [d.id, d]));
    const otherAllocByDeal = otherDealAllocs.reduce((acc, a) => {
      acc[a.resaleDealId] = (acc[a.resaleDealId] || 0) + (a.amount || 0);
      return acc;
    }, {});
    const buyerPaidByDeal = buyerPayments.reduce((acc, p) => {
      acc[p.dealId] = (acc[p.dealId] || 0) + (p.amount || 0);
      return acc;
    }, {});

    for (const dealId of incomingResaleIds) {
      const deal = dealById[dealId];
      if (!deal) {
        return { error: `Resale deal ${dealId} not found`, status: 400 };
      }
      const dealTotal = deal.buyerPurchaseAmount || deal.resalePrice || 0;
      const alreadyPaid = (buyerPaidByDeal[dealId] || 0) + (otherAllocByDeal[dealId] || 0);
      const remaining = dealTotal - alreadyPaid;
      const requested = incomingByResaleDeal[dealId];
      if (requested > remaining + 0.01) {
        const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;
        return {
          error: `Allocation ${fmt(requested)} for resale exceeds its remaining balance ${fmt(remaining)}.`,
          status: 400,
        };
      }
    }
  }

  await PaymentAllocation.deleteMany({ paymentId });

  const docs = incoming
    .filter(a => parseFloat(a.amount) > 0 && (a.saleId || a.resaleDealId))
    .map(a => ({
      id: uuidv4(),
      paymentId,
      saleId: a.saleId || null,
      resaleDealId: a.resaleDealId || null,
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

module.exports = { list, create, update, remove, listAllocations, setAllocations };
