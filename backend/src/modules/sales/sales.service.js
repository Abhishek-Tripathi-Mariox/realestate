const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { createTransaction, createReversalTransaction } = require('../../utils/transactions');
const { pick } = require('../../utils/pick');
const { gteMoney, eqMoney } = require('../../utils/money');
const {
  Sale, SalePaymentEntry, Inventory, Customer, Account, Transaction,
  PaymentAllocation, CustomerPayment, ResaleDeal,
} = require('../../models');

// Allow customer/buyer info, price/discount tweaks, notes — but NOT
// amountPaid, paymentStatus, isDeleted, status (TRANSFERRED tag), etc.
const SALE_UPDATABLE = [
  'customerId', 'buyerName', 'buyerContact', 'saleDate',
  'dealPrice', 'agreedPrice', 'discount', 'notes',
];

const stripId = ({ _id, ...rest }) => rest;

const listForSociety = async (societyId) => {
  const sales = await Sale.find(notDeleted({ societyId })).lean();
  const saleIds = sales.map(s => s.id);
  // Pull allocations from the customer-payment flow so a sale's totalPaid
  // reflects every rupee — whether it came in via the per-sale Sale Ledger
  // (Sale.amountPaid) or via Record Customer Payment + allocate.
  const allocations = saleIds.length
    ? await PaymentAllocation.find({ saleId: { $in: saleIds } }).lean()
    : [];
  const allocatedBySale = allocations.reduce((acc, a) => {
    acc[a.saleId] = (acc[a.saleId] || 0) + (a.amount || 0);
    return acc;
  }, {});

  // Recompute the net per-sale ledger balance directly from SalePaymentEntry so
  // legacy rows (where Sale.amountPaid only tracked credits, not withdrawals or
  // profit payouts) self-heal here without a migration.
  const ledgerEntries = saleIds.length
    ? await SalePaymentEntry.find(notDeleted({ saleId: { $in: saleIds } })).lean()
    : [];
  const ledgerNetBySale = ledgerEntries.reduce((acc, e) => {
    const type = e.entryType || 'SALE_PAYMENT';
    const delta = type === 'SALE_PAYMENT' ? (e.amount || 0) : -(e.amount || 0);
    acc[e.saleId] = (acc[e.saleId] || 0) + delta;
    return acc;
  }, {});

  // Self-heal older sales whose resale deal predates the TRANSFERRED-marking
  // logic: if a non-deleted ResaleDeal points at this sale, treat it as
  // transferred even if the Sale row wasn't updated at the time.
  const resaleDeals = saleIds.length
    ? await ResaleDeal.find(notDeleted({ originalSaleId: { $in: saleIds } })).lean()
    : [];
  const dealBySaleId = Object.fromEntries(resaleDeals.map(d => [d.originalSaleId, d]));

  // Bulk-fetch related inventory and customers in one query each instead of
  // firing per-sale findOne() calls (was N+1 → now 2 queries regardless of
  // result size).
  const inventoryIds = [...new Set(sales.map(s => s.inventoryId).filter(Boolean))];
  const customerIds = [...new Set(sales.map(s => s.customerId).filter(Boolean))];
  const [inventoryDocs, customerDocs] = await Promise.all([
    inventoryIds.length ? Inventory.find({ id: { $in: inventoryIds } }).lean() : [],
    customerIds.length ? Customer.find({ id: { $in: customerIds } }).lean() : [],
  ]);
  const inventoryById = Object.fromEntries(inventoryDocs.map(i => [i.id, i]));
  const customerById = Object.fromEntries(customerDocs.map(c => [c.id, c]));

  const enrichedSales = sales.map((sale) => {
    const inventory = inventoryById[sale.inventoryId] || null;
    const customer = sale.customerId ? customerById[sale.customerId] : null;
    const totalPaid = (ledgerNetBySale[sale.id] || 0) + (allocatedBySale[sale.id] || 0);
    const linkedDeal = dealBySaleId[sale.id];
    const isTransferred = sale.status === 'TRANSFERRED' || Boolean(linkedDeal);
    if (linkedDeal) {
      sale.status = 'TRANSFERRED';
      sale.resaleDealId = sale.resaleDealId || linkedDeal.id;
      sale.transferredTo = sale.transferredTo || linkedDeal.buyerName;
    }
    // TRANSFERRED sales are owned by a resale deal now — show no pending
    // balance against the original sale so the Sales tab and its summary
    // don't keep counting it as outstanding.
    const balance = isTransferred ? 0 : (sale.finalAmount || 0) - totalPaid;
    return {
      ...sale,
      inventoryNumber: inventory?.inventoryNumber || 'N/A',
      inventoryType: inventory?.type || 'N/A',
      phase: inventory?.phase || 'N/A',
      customerName: customer?.name || sale.buyerName || 'N/A',
      customerPhone: customer?.phone || sale.buyerContact || '',
      totalPaid,
      balance,
    };
  });

  const totalAmount = enrichedSales.reduce((sum, s) => sum + (s.finalAmount || 0), 0);
  const totalReceived = enrichedSales.reduce((sum, s) => sum + s.totalPaid, 0);
  const totalPending = enrichedSales.reduce((sum, s) => sum + (s.balance || 0), 0);
  const summary = {
    totalSales: enrichedSales.length,
    count: enrichedSales.length,                // alias the FE Sales-tab card reads
    totalAmount,
    totalDealAmount: totalAmount,               // alias the FE Sales-tab card reads
    totalReceived,
    totalPending,
  };

  return { sales: enrichedSales.map(stripId), summary };
};

const create = async (societyId, body, userId) => {
  // Frontend uses `dealPrice`; older callers may send `agreedPrice`. Accept both.
  const dealPrice = Number(body.dealPrice ?? body.agreedPrice) || 0;
  const discount = Number(body.discount) || 0;

  const sale = {
    id: uuidv4(),
    societyId,
    inventoryId: body.inventoryId,
    customerId: body.customerId || null,
    buyerName: body.buyerName,
    buyerContact: body.buyerContact,
    saleDate: body.saleDate,
    dealPrice,
    discount,
    finalAmount: dealPrice - discount,
    amountPaid: 0,
    status: 'Booked',
    paymentStatus: 'Pending',
    notes: body.notes || '',
    createdBy: userId,
    createdAt: new Date(),
  };

  await Sale.create(sale);
  await Inventory.updateOne(
    { id: body.inventoryId },
    { $set: { status: 'Sold', soldDate: body.saleDate } },
  );

  return sale;
};

const getById = async (id) => {
  const sale = await Sale.findOne(notDeleted({ id })).lean();
  if (!sale) return null;

  // Self-heal legacy rows whose resale deal predates the TRANSFERRED-marking
  // logic so the ledger view picks the read-only/transferred treatment.
  if (sale.status !== 'TRANSFERRED') {
    const linkedDeal = await ResaleDeal.findOne(notDeleted({ originalSaleId: id })).lean();
    if (linkedDeal) {
      sale.status = 'TRANSFERRED';
      sale.resaleDealId = sale.resaleDealId || linkedDeal.id;
      sale.transferredTo = sale.transferredTo || linkedDeal.buyerName;
    }
  }

  const inventory = sale.inventoryId
    ? await Inventory.findOne({ id: sale.inventoryId }).lean()
    : null;
  const customer = sale.customerId
    ? await Customer.findOne({ id: sale.customerId }).lean()
    : null;

  const paymentEntries = await SalePaymentEntry
    .find(notDeleted({
      saleId: id,
      // $nin (not $or) so the entryType filter isn't overwritten by
      // notDeleted()'s own $or via object-spread last-key-wins.
      entryType: { $nin: ['WITHDRAWAL', 'PROFIT_PAYOUT'] },
    }))
    .sort({ paymentDate: -1 })
    .lean();

  // Bulk-fetch all referenced accounts in one query instead of per-payment.
  const accountIds = [...new Set(paymentEntries.map(p => p.accountId).filter(Boolean))];
  const accountDocs = accountIds.length
    ? await Account.find({ id: { $in: accountIds } }).lean()
    : [];
  const accountById = Object.fromEntries(accountDocs.map(a => [a.id, a]));
  const payments = paymentEntries.map((p) => ({
    ...stripId(p),
    accountName: (p.accountId && accountById[p.accountId]?.name) || '-',
  }));

  const allocations = await PaymentAllocation.find({ saleId: id }).lean();
  const allocatedTotal = allocations.reduce((sum, a) => sum + (a.amount || 0), 0);

  // Recompute net ledger balance from entries (credits minus withdrawals /
  // profit payouts) so legacy rows with stale Sale.amountPaid self-heal.
  const allEntries = await SalePaymentEntry.find(notDeleted({ saleId: id })).lean();
  const ledgerNet = allEntries.reduce((sum, e) => {
    const type = e.entryType || 'SALE_PAYMENT';
    return sum + (type === 'SALE_PAYMENT' ? (e.amount || 0) : -(e.amount || 0));
  }, 0);

  const totalPaid = ledgerNet + allocatedTotal;
  const balance = sale.status === 'TRANSFERRED' ? 0 : (sale.finalAmount || 0) - totalPaid;

  return {
    ...stripId(sale),
    inventory: inventory ? stripId(inventory) : null,
    inventoryNumber: inventory?.inventoryNumber || 'N/A',
    customerName: customer?.name || sale.buyerName || 'N/A',
    customerPhone: customer?.phone || sale.buyerContact || '',
    customerAddress: customer?.address || '',
    totalPaid,
    balance,
    payments,
  };
};

const update = async (id, body) => {
  const safe = pick(body, SALE_UPDATABLE);
  const updates = { ...safe, updatedAt: new Date() };
  const incomingPrice = safe.dealPrice ?? safe.agreedPrice;
  if (incomingPrice !== undefined || safe.discount !== undefined) {
    const sale = await Sale.findOne({ id }).lean();
    const dealPrice = Number(incomingPrice ?? sale.dealPrice ?? sale.agreedPrice) || 0;
    const discount = Number(safe.discount ?? sale.discount) || 0;
    updates.dealPrice = dealPrice;
    updates.discount = discount;
    updates.finalAmount = dealPrice - discount;
    delete updates.agreedPrice;
  }
  await Sale.updateOne({ id }, { $set: updates });
  const updated = await Sale.findOne({ id }).lean();
  if (!updated) return null;
  return stripId(updated);
};

const remove = async (id) => {
  const sale = await Sale.findOne({ id }).lean();

  // Free up the inventory unit so it can be re-sold. Skip when the sale was
  // already transferred via a resale deal — the unit is owned by someone
  // else now and shouldn't be flipped back to Available.
  if (sale && sale.inventoryId && sale.status !== 'TRANSFERRED') {
    // Make sure no other live sale or resale deal still references this
    // inventory before we mark it Available — guards against accidental
    // double-bookings (or a corrupt history) clobbering an active sale.
    const otherSale = await Sale.findOne(notDeleted({
      inventoryId: sale.inventoryId,
      id: { $ne: id },
      status: { $ne: 'TRANSFERRED' },
    })).lean();
    const liveDeal = await ResaleDeal.findOne(notDeleted({
      inventoryId: sale.inventoryId,
    })).lean();

    if (!otherSale && !liveDeal) {
      const result = await Inventory.updateOne(
        { id: sale.inventoryId },
        { $set: { status: 'Available', soldDate: null } },
      );
      if (result.matchedCount === 0) {
        console.warn(`[sales.remove] inventory ${sale.inventoryId} not found while freeing sale ${id}`);
      }
    }
  }

  // Free up any customer-payment allocations pointing to this sale and bump
  // up unallocatedAmount on each affected payment, otherwise the deployed
  // funds stay "stuck" against a deleted sale and can't be reallocated.
  const allocations = await PaymentAllocation.find({ saleId: id }).lean();
  if (allocations.length) {
    const affectedPaymentIds = [...new Set(allocations.map(a => a.paymentId).filter(Boolean))];
    await PaymentAllocation.deleteMany({ saleId: id });
    for (const pid of affectedPaymentIds) {
      const payment = await CustomerPayment.findOne({ id: pid }).lean();
      if (!payment) continue;
      const remaining = await PaymentAllocation.find({ paymentId: pid }).lean();
      const totalAllocated = remaining.reduce((s, a) => s + (a.amount || 0), 0);
      const unallocatedAmount = (payment.amount || 0) - totalAllocated;
      await CustomerPayment.updateOne(
        { id: pid },
        { $set: { unallocatedAmount, updatedAt: new Date() } },
      );
    }
  }

  // Soft-delete child sale-payment ledger entries so they disappear from the
  // sale-ledger views alongside the parent sale. Leaving them live keeps
  // stale entries hanging around with a missing parent.
  await SalePaymentEntry.updateMany(
    { saleId: id, isDeleted: { $ne: true } },
    { $set: { isDeleted: true, deletedAt: new Date(), deletedReason: 'Sale deleted' } },
  );

  await Sale.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
};

const listPayments = async (saleId) => {
  const payments = await SalePaymentEntry
    .find(notDeleted({ saleId }))
    .sort({ paymentDate: -1 })
    .lean();
  return payments.map(stripId);
};

const addPayment = async (saleId, body, userId) => {
  const sale = await Sale.findOne({ id: saleId }).lean();
  if (!sale) return { error: 'Sale not found', status: 404 };

  let accountId = body.accountId;
  if (!accountId) {
    const defaultAccount = await Account.findOne({ isDefault: true }).lean();
    accountId = defaultAccount?.id;
  }

  const amount = Number(body.amount) || 0;
  if (!(amount > 0)) {
    return { error: 'Payment amount must be greater than zero', status: 400 };
  }
  const payment = {
    id: uuidv4(),
    saleId,
    societyId: sale.societyId,
    accountId,
    amount,
    paymentDate: body.paymentDate,
    paymentMode: body.paymentMode || 'Cash',
    referenceNo: body.referenceNo || '',
    remark: body.remark || '',
    createdBy: userId,
    createdAt: new Date(),
  };

  await SalePaymentEntry.create(payment);

  // Atomic counter — two concurrent payments would otherwise race and
  // lose one update with the read-modify-write pattern.
  const updated = await Sale.findOneAndUpdate(
    { id: saleId },
    { $inc: { amountPaid: amount } },
    { new: true },
  ).lean();
  const paymentStatus = gteMoney(updated.amountPaid || 0, sale.finalAmount || 0)
    || eqMoney(updated.amountPaid || 0, sale.finalAmount || 0)
    ? 'Paid'
    : 'Partial';
  await Sale.updateOne({ id: saleId }, { $set: { paymentStatus } });

  await createTransaction({
    txnDate: body.paymentDate,
    societyId: sale.societyId,
    accountId,
    direction: 'IN',
    amount,
    paymentMode: body.paymentMode || 'Cash',
    partyType: 'Customer',
    partyName: sale.buyerName,
    sourceType: 'SALE_PAYMENT',
    sourceId: payment.id,
    remark: body.remark || `Sale payment - ${sale.buyerName}`,
  }, userId);

  return payment;
};

const listLedger = async (saleId) => {
  const [entries, allocations] = await Promise.all([
    SalePaymentEntry.find(notDeleted({ saleId })).lean(),
    PaymentAllocation.find({ saleId }).lean(),
  ]);

  // Surface allocations from the customer-payment flow as ledger entries so
  // both flows are visible in one place.
  const paymentIds = [...new Set(allocations.map(a => a.paymentId).filter(Boolean))];
  const customerPayments = paymentIds.length
    ? await CustomerPayment.find({ id: { $in: paymentIds } }).lean()
    : [];
  const paymentById = Object.fromEntries(customerPayments.map(p => [p.id, p]));

  const allocationEntries = allocations.map(a => {
    const p = paymentById[a.paymentId] || {};
    return {
      id: `alloc-${a.id}`,
      saleId,
      entryType: 'SALE_PAYMENT',
      amount: a.amount || 0,
      paymentDate: p.paymentDate || a.createdAt,
      paymentMode: p.paymentMode || 'Cash',
      accountId: p.accountId || null,
      referenceNo: p.referenceNo || '',
      remark: p.remark || `Allocated from customer payment${p.referenceNo ? ` (${p.referenceNo})` : ''}`,
      createdAt: a.createdAt,
      source: 'CUSTOMER_PAYMENT_ALLOCATION',
      sourcePaymentId: a.paymentId,
    };
  });

  const merged = [...entries.map(stripId), ...allocationEntries]
    .sort((a, b) => new Date(b.paymentDate || b.createdAt) - new Date(a.paymentDate || a.createdAt));

  return { entries: merged };
};

const addLedgerEntry = async (saleId, body, userId) => {
  const sale = await Sale.findOne({ id: saleId }).lean();
  if (!sale) return { error: 'Sale not found', status: 404 };

  let accountId = body.accountId;
  if (!accountId) {
    const defaultAccount = await Account.findOne({ isDefault: true }).lean();
    accountId = defaultAccount?.id;
  }

  const entryType = body.entryType || 'SALE_PAYMENT';
  const amount = parseFloat(body.amount) || 0;

  if (amount <= 0) {
    return { error: 'Amount must be greater than zero', status: 400 };
  }

  // Block SALE_PAYMENT credits that would push the net running balance past
  // the sale's final amount — protects against typos like adding an extra
  if (entryType === 'SALE_PAYMENT') {
    const existingEntries = await SalePaymentEntry
      .find(notDeleted({ saleId }))
      .lean();
    const allocations = await PaymentAllocation.find({ saleId }).lean();
    const currentNet = existingEntries.reduce((sum, e) => {
      const t = e.entryType || 'SALE_PAYMENT';
      return sum + (t === 'SALE_PAYMENT' ? (e.amount || 0) : -(e.amount || 0));
    }, 0) + allocations.reduce((sum, a) => sum + (a.amount || 0), 0);
    const remaining = (sale.finalAmount || 0) - currentNet;
    if (remaining <= 0) {
      return {
        error: 'Sale is already fully paid — no further sale payments can be added.',
        status: 400,
      };
    }
    if (amount > remaining) {
      const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;
      return {
        error: `Amount ${fmt(amount)} exceeds remaining Sale Due of ${fmt(remaining)}.`,
        status: 400,
      };
    }
  }

  const entry = {
    id: uuidv4(),
    saleId,
    societyId: sale.societyId,
    accountId,
    entryType,
    amount,
    paymentDate: body.paymentDate,
    paymentMode: body.paymentMode || 'Cash',
    referenceNo: body.referenceNo || '',
    remark: body.remark || '',
    createdBy: userId,
    createdAt: new Date(),
  };

  await SalePaymentEntry.create(entry);

  // amountPaid stores the NET ledger balance: credits in minus debits out.
  // SALE_PAYMENT increases it; WITHDRAWAL / PROFIT_PAYOUT decrease it so the
  // Sales tab's totalPaid stays in sync with the Sale Ledger's running balance.
  // Use $inc so concurrent ledger entries can't lose updates.
  const delta = entryType === 'SALE_PAYMENT' ? amount : -amount;
  const updatedSale = await Sale.findOneAndUpdate(
    { id: saleId },
    { $inc: { amountPaid: delta } },
    { new: true },
  ).lean();
  const newAmountPaid = updatedSale.amountPaid || 0;
  const paymentStatus = newAmountPaid <= 0
    ? 'Pending'
    : (gteMoney(newAmountPaid, sale.finalAmount || 0) ? 'Paid' : 'Partial');
  await Sale.updateOne({ id: saleId }, { $set: { paymentStatus } });

  const direction = entryType === 'SALE_PAYMENT' ? 'IN' : 'OUT';
  await createTransaction({
    txnDate: body.paymentDate,
    societyId: sale.societyId,
    accountId,
    direction,
    amount,
    paymentMode: body.paymentMode || 'Cash',
    partyType: 'Customer',
    partyName: sale.buyerName,
    sourceType: 'SALE_PAYMENT',
    sourceId: entry.id,
    remark: body.remark || `${entryType} - ${sale.buyerName}`,
  }, userId);

  return entry;
};

const deleteSalePayment = async (id, userId) => {
  const entry = await SalePaymentEntry.findOne({ id }).lean();
  if (!entry) return { error: 'Entry not found', status: 404 };

  const originalTxn = await Transaction.findOne({ sourceType: 'SALE_PAYMENT', sourceId: id }).lean();
  if (originalTxn) {
    await createReversalTransaction(originalTxn, userId, 'Sale ledger entry deleted');
  }

  // Reverse the original delta on the sale's net amountPaid: SALE_PAYMENT
  // additions get subtracted; WITHDRAWAL / PROFIT_PAYOUT debits get added back.
  // Atomic $inc avoids the read-modify-write race when several payments are
  // deleted concurrently.
  const entryType = entry.entryType || 'SALE_PAYMENT';
  const reverseDelta = entryType === 'SALE_PAYMENT' ? -(entry.amount || 0) : (entry.amount || 0);
  const updatedSale = await Sale.findOneAndUpdate(
    { id: entry.saleId },
    { $inc: { amountPaid: reverseDelta } },
    { new: true },
  ).lean();
  if (updatedSale) {
    const newAmountPaid = updatedSale.amountPaid || 0;
    const paymentStatus = newAmountPaid <= 0
      ? 'Pending'
      : (gteMoney(newAmountPaid, updatedSale.finalAmount || 0) ? 'Paid' : 'Partial');
    await Sale.updateOne({ id: entry.saleId }, { $set: { paymentStatus } });
  }

  await SalePaymentEntry.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  return { message: 'Sale ledger entry deleted' };
};

const listUnassigned = async (societyId) => {
  const filter = notDeleted({ $or: [{ customerId: null }, { customerId: '' }, { customerId: { $exists: false } }] });
  if (societyId) filter.societyId = societyId;
  const sales = await Sale.find(filter).lean();
  const inventoryIds = [...new Set(sales.map(s => s.inventoryId).filter(Boolean))];
  const inventoryDocs = inventoryIds.length
    ? await Inventory.find({ id: { $in: inventoryIds } }).lean()
    : [];
  const inventoryById = Object.fromEntries(inventoryDocs.map(i => [i.id, i]));
  const enriched = sales.map((s) => ({
    ...s,
    inventoryNumber: (s.inventoryId && inventoryById[s.inventoryId]?.inventoryNumber) || 'N/A',
  }));
  return enriched.map(stripId);
};

const assignCustomer = async (saleId, customerId) => {
  if (!customerId) return { error: 'customerId required', status: 400 };
  const customer = await Customer.findOne({ id: customerId }).lean();
  if (!customer) return { error: 'Customer not found', status: 404 };

  await Sale.updateOne(
    { id: saleId },
    { $set: { customerId, buyerName: customer.name, updatedAt: new Date() } },
  );
  const updated = await Sale.findOne({ id: saleId }).lean();
  if (!updated) return { error: 'Sale not found', status: 404 };
  return stripId(updated);
};

module.exports = {
  listForSociety, create, getById, update, remove,
  listPayments, addPayment,
  listLedger, addLedgerEntry, deleteSalePayment,
  listUnassigned, assignCustomer,
};
