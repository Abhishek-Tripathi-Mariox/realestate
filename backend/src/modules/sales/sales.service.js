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
  'sqft', 'ratePerSqft', 'discountPercent',
  'dealPrice', 'agreedPrice', 'discount', 'notes',
];

const stripId = ({ _id, ...rest }) => rest;

// Credit-side entry types contribute positively to a sale's net amountPaid:
// regular SALE_PAYMENT receipts and the IN leg of an internal inter-sale
// transfer. Everything else (WITHDRAWAL, PROFIT_PAYOUT, TRANSFER_OUT)
// reduces it.
const isCreditEntryType = (t) => t === 'SALE_PAYMENT' || t === 'TRANSFER_IN';
const signedDelta = (entry) => {
  const t = entry?.entryType || 'SALE_PAYMENT';
  return isCreditEntryType(t) ? (entry.amount || 0) : -(entry.amount || 0);
};

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
    acc[e.saleId] = (acc[e.saleId] || 0) + signedDelta(e);
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
  const sqft = Number(body.sqft) || 0;
  const ratePerSqft = Number(body.ratePerSqft) || 0;
  const discountPercent = Number(body.discountPercent) || 0;

  const sale = {
    id: uuidv4(),
    societyId,
    inventoryId: body.inventoryId,
    customerId: body.customerId || null,
    buyerName: body.buyerName,
    buyerContact: body.buyerContact,
    saleDate: body.saleDate,
    sqft,
    ratePerSqft,
    discountPercent,
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
      // notDeleted()'s own $or via object-spread last-key-wins. Excludes
      // debit-side types from the "Payments" list view; the running net
      // balance is recomputed from all entries below.
      entryType: { $nin: ['WITHDRAWAL', 'PROFIT_PAYOUT', 'TRANSFER_OUT'] },
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

  // Recompute net ledger balance from entries (credits minus debits) so
  // legacy rows with stale Sale.amountPaid self-heal.
  const allEntries = await SalePaymentEntry.find(notDeleted({ saleId: id })).lean();
  const ledgerNet = allEntries.reduce((sum, e) => sum + signedDelta(e), 0);

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

  // Prefer the Customer record's name when `sale.buyerName` is empty
  // (some flows create the Sale with only a customerId, so buyerName is
  // blank and the daybook party column ends up looking like "Customer:"
  // with no name behind it).
  let displayName = (sale.buyerName || '').trim();
  if (!displayName && sale.customerId) {
    const customer = await Customer.findOne({ id: sale.customerId }).lean();
    if (customer?.name) displayName = customer.name;
  }
  await createTransaction({
    txnDate: body.paymentDate,
    societyId: sale.societyId,
    accountId,
    direction: 'IN',
    amount,
    paymentMode: body.paymentMode || 'Cash',
    partyType: 'Customer',
    partyName: displayName || 'Customer',
    sourceType: 'SALE_PAYMENT',
    sourceId: payment.id,
    remark: body.remark || `Sale payment - ${displayName || 'customer'}`,
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

  // For TRANSFER_OUT / TRANSFER_IN entries, attach a human-readable label of
  // the OTHER side (counterpart sale's inventory + customer/buyer) so the FE
  // can show "Internal → Flat 102" instead of just "Internal" — important
  // when there are several transfers and the table can't tell them apart.
  const transferGroupIds = entries
    .filter(e => e.transferGroupId && (e.entryType === 'TRANSFER_OUT' || e.entryType === 'TRANSFER_IN'))
    .map(e => e.transferGroupId);
  let counterpartLabelByEntryId = {};
  if (transferGroupIds.length > 0) {
    const siblings = await SalePaymentEntry
      .find({ transferGroupId: { $in: transferGroupIds }, saleId: { $ne: saleId }, isDeleted: { $ne: true } })
      .lean();
    const counterpartSaleIds = [...new Set(siblings.map(s => s.saleId).filter(Boolean))];
    const counterpartSales = counterpartSaleIds.length
      ? await Sale.find({ id: { $in: counterpartSaleIds } }).lean()
      : [];
    const inventoryIds = [...new Set(counterpartSales.map(s => s.inventoryId).filter(Boolean))];
    const inventories = inventoryIds.length
      ? await Inventory.find({ id: { $in: inventoryIds } }).lean()
      : [];
    const saleById = Object.fromEntries(counterpartSales.map(s => [s.id, s]));
    const invById = Object.fromEntries(inventories.map(i => [i.id, i]));
    const labelByGroup = {};
    for (const sib of siblings) {
      const cSale = saleById[sib.saleId];
      if (!cSale) continue;
      const inv = invById[cSale.inventoryId];
      const flat = inv ? `${inv.type || ''} ${inv.inventoryNumber || ''}`.trim() : null;
      const buyer = cSale.buyerName || '';
      labelByGroup[sib.transferGroupId] = {
        otherSaleId: cSale.id,
        otherInventoryLabel: flat || `Sale ${cSale.id.slice(0, 6)}`,
        otherBuyerName: buyer,
      };
    }
    for (const e of entries) {
      if (e.transferGroupId && labelByGroup[e.transferGroupId]) {
        counterpartLabelByEntryId[e.id] = labelByGroup[e.transferGroupId];
      }
    }
  }

  const merged = [
    ...entries.map(e => {
      const stripped = stripId(e);
      const cp = counterpartLabelByEntryId[e.id];
      return cp ? { ...stripped, ...cp } : stripped;
    }),
    ...allocationEntries,
  ].sort((a, b) => {
    // Primary: paymentDate DESC. Tie-break by createdAt DESC so two entries
    // on the same date show the latest-recorded one first (e.g. a transfer
    // recorded after a same-day payment appears above the payment).
    const dateDiff = new Date(b.paymentDate || b.createdAt) - new Date(a.paymentDate || a.createdAt);
    if (dateDiff !== 0) return dateDiff;
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

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
  if (entryType === 'TRANSFER_IN' || entryType === 'TRANSFER_OUT') {
    return { error: 'Transfer entries must be created via /sales/:id/transfer', status: 400 };
  }
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
    const currentNet = existingEntries.reduce((sum, e) => sum + signedDelta(e), 0)
      + allocations.reduce((sum, a) => sum + (a.amount || 0), 0);
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
  const delta = isCreditEntryType(entryType) ? amount : -amount;
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

  const direction = isCreditEntryType(entryType) ? 'IN' : 'OUT';
  // Same fallback as addPayment above — the ledger flow also lands with
  // an empty partyName when only customerId was captured on the Sale.
  let displayName = (sale.buyerName || '').trim();
  if (!displayName && sale.customerId) {
    const customer = await Customer.findOne({ id: sale.customerId }).lean();
    if (customer?.name) displayName = customer.name;
  }
  await createTransaction({
    txnDate: body.paymentDate,
    societyId: sale.societyId,
    accountId,
    direction,
    amount,
    paymentMode: body.paymentMode || 'Cash',
    partyType: 'Customer',
    partyName: displayName || 'Customer',
    sourceType: 'SALE_PAYMENT',
    sourceId: entry.id,
    remark: body.remark || `${entryType} - ${displayName || 'customer'}`,
  }, userId);

  return entry;
};
// Internal inter-sale transfer: moves a paid amount from one of a
// customer's sales to another sale of the SAME customer. No cash actually
// moves, so no daybook transaction is written. Records a paired
// TRANSFER_OUT (source) + TRANSFER_IN (destination) on the ledger, linked
// by a shared transferGroupId so they can be deleted together later.
const transferBetweenSales = async (sourceSaleId, body, userId) => {
  const destinationSaleId = body.destinationSaleId;
  if (!destinationSaleId) {
    return { error: 'destinationSaleId is required', status: 400 };
  }
  if (destinationSaleId === sourceSaleId) {
    return { error: 'Source and destination must be different sales', status: 400 };
  }
  const amount = parseFloat(body.amount) || 0;
  if (!(amount > 0)) {
    return { error: 'Amount must be greater than zero', status: 400 };
  }

  const [source, destination] = await Promise.all([
    Sale.findOne({ id: sourceSaleId }).lean(),
    Sale.findOne({ id: destinationSaleId }).lean(),
  ]);
  if (!source || source.isDeleted) return { error: 'Source sale not found', status: 404 };
  if (!destination || destination.isDeleted) return { error: 'Destination sale not found', status: 404 };
  if (source.status === 'TRANSFERRED' || destination.status === 'TRANSFERRED') {
    return { error: 'Transferred sales can\'t participate in internal transfers', status: 400 };
  }
  // Cross-customer transfers are allowed — the operator decides whether the
  // move makes sense. Daybook stays untouched either way (no cash movement).

  // Source must have enough net paid balance to hand over.
  const sourceEntries = await SalePaymentEntry.find(notDeleted({ saleId: sourceSaleId })).lean();
  const sourceAllocs = await PaymentAllocation.find({ saleId: sourceSaleId }).lean();
  const sourcePaid = sourceEntries.reduce((s, e) => s + signedDelta(e), 0)
    + sourceAllocs.reduce((s, a) => s + (a.amount || 0), 0);
  if (amount > sourcePaid + 0.01) {
    const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;
    return {
      error: `Transfer ${fmt(amount)} exceeds source sale's paid balance ${fmt(sourcePaid)}.`,
      status: 400,
    };
  }

  // Destination must have remaining capacity.
  const destEntries = await SalePaymentEntry.find(notDeleted({ saleId: destinationSaleId })).lean();
  const destAllocs = await PaymentAllocation.find({ saleId: destinationSaleId }).lean();
  const destPaid = destEntries.reduce((s, e) => s + signedDelta(e), 0)
    + destAllocs.reduce((s, a) => s + (a.amount || 0), 0);
  const destRemaining = (destination.finalAmount || 0) - destPaid;
  if (amount > destRemaining + 0.01) {
    const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;
    return {
      error: `Transfer ${fmt(amount)} exceeds destination sale's remaining due ${fmt(destRemaining)}.`,
      status: 400,
    };
  }

  const transferGroupId = uuidv4();
  const transferDate = body.transferDate || body.paymentDate || new Date().toISOString().slice(0, 10);
  const remark = body.remark || '';

  const outEntry = {
    id: uuidv4(),
    saleId: sourceSaleId,
    societyId: source.societyId,
    accountId: null,
    entryType: 'TRANSFER_OUT',
    amount,
    paymentDate: transferDate,
    paymentMode: 'Internal',
    transferGroupId,
    referenceNo: '',
    remark: remark || `Transfer to sale ${destinationSaleId}`,
    createdBy: userId,
    createdAt: new Date(),
  };
  const inEntry = {
    id: uuidv4(),
    saleId: destinationSaleId,
    societyId: destination.societyId,
    accountId: null,
    entryType: 'TRANSFER_IN',
    amount,
    paymentDate: transferDate,
    paymentMode: 'Internal',
    transferGroupId,
    referenceNo: '',
    remark: remark || `Transfer from sale ${sourceSaleId}`,
    createdBy: userId,
    createdAt: new Date(),
  };
  await SalePaymentEntry.insertMany([outEntry, inEntry]);

  // Apply the signed deltas to both sales' amountPaid. No daybook txns — no
  // cash actually moved.
  const [updatedSource, updatedDest] = await Promise.all([
    Sale.findOneAndUpdate({ id: sourceSaleId }, { $inc: { amountPaid: -amount } }, { new: true }).lean(),
    Sale.findOneAndUpdate({ id: destinationSaleId }, { $inc: { amountPaid: amount } }, { new: true }).lean(),
  ]);
  const recomputeStatus = (sale) => {
    if (!sale) return null;
    const paid = sale.amountPaid || 0;
    if (paid <= 0) return 'Pending';
    return gteMoney(paid, sale.finalAmount || 0) ? 'Paid' : 'Partial';
  };
  await Promise.all([
    Sale.updateOne({ id: sourceSaleId }, { $set: { paymentStatus: recomputeStatus(updatedSource) } }),
    Sale.updateOne({ id: destinationSaleId }, { $set: { paymentStatus: recomputeStatus(updatedDest) } }),
  ]);

  return {
    message: 'Transfer recorded',
    transferGroupId,
    source: { entryId: outEntry.id, saleId: sourceSaleId, amountPaid: updatedSource?.amountPaid || 0 },
    destination: { entryId: inEntry.id, saleId: destinationSaleId, amountPaid: updatedDest?.amountPaid || 0 },
  };
};

// Edit a previously-recorded transfer pair atomically. Destination sale is
// fixed — to move money to a different sale, delete the transfer and create
// a new one. Amount / date / remark can be adjusted; both legs and both
// sales' amountPaid stay in sync, and per-sale caps (source can give, dest
// can receive) are re-checked against everything ELSE on each sale.
const updateTransfer = async (transferGroupId, body) => {
  if (!transferGroupId) return { error: 'transferGroupId is required', status: 400 };
  const legs = await SalePaymentEntry
    .find(notDeleted({ transferGroupId }))
    .lean();
  if (legs.length !== 2) {
    return { error: 'Transfer pair not found or incomplete', status: 404 };
  }
  const outLeg = legs.find(l => l.entryType === 'TRANSFER_OUT');
  const inLeg = legs.find(l => l.entryType === 'TRANSFER_IN');
  if (!outLeg || !inLeg) {
    return { error: 'Transfer pair is malformed', status: 400 };
  }

  const newAmount = body.amount !== undefined ? parseFloat(body.amount) : outLeg.amount;
  if (!(newAmount > 0)) {
    return { error: 'Amount must be greater than zero', status: 400 };
  }
  const newDate = body.transferDate || body.paymentDate || outLeg.paymentDate;
  const newRemark = body.remark !== undefined ? body.remark : (outLeg.remark || '');

  const [sourceSale, destSale] = await Promise.all([
    Sale.findOne({ id: outLeg.saleId }).lean(),
    Sale.findOne({ id: inLeg.saleId }).lean(),
  ]);
  if (!sourceSale || sourceSale.isDeleted) return { error: 'Source sale not found', status: 404 };
  if (!destSale || destSale.isDeleted) return { error: 'Destination sale not found', status: 404 };

  const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

  // Re-validate source: with this transfer's contribution stripped out, the
  // remaining net paid must still be >= newAmount.
  const [sourceEntries, sourceAllocs] = await Promise.all([
    SalePaymentEntry.find(notDeleted({ saleId: sourceSale.id, id: { $ne: outLeg.id } })).lean(),
    PaymentAllocation.find({ saleId: sourceSale.id }).lean(),
  ]);
  const sourcePaidExcludingThis = sourceEntries.reduce((s, e) => s + signedDelta(e), 0)
    + sourceAllocs.reduce((s, a) => s + (a.amount || 0), 0);
  if (newAmount > sourcePaidExcludingThis + 0.01) {
    return {
      error: `Transfer ${fmt(newAmount)} exceeds source sale's available balance ${fmt(sourcePaidExcludingThis)}.`,
      status: 400,
    };
  }

  // Re-validate destination: with this transfer's contribution stripped out,
  // the remaining capacity (finalAmount - other paid) must still be >= newAmount.
  const [destEntries, destAllocs] = await Promise.all([
    SalePaymentEntry.find(notDeleted({ saleId: destSale.id, id: { $ne: inLeg.id } })).lean(),
    PaymentAllocation.find({ saleId: destSale.id }).lean(),
  ]);
  const destPaidExcludingThis = destEntries.reduce((s, e) => s + signedDelta(e), 0)
    + destAllocs.reduce((s, a) => s + (a.amount || 0), 0);
  const destRemaining = (destSale.finalAmount || 0) - destPaidExcludingThis;
  if (newAmount > destRemaining + 0.01) {
    return {
      error: `Transfer ${fmt(newAmount)} exceeds destination sale's remaining due ${fmt(destRemaining)}.`,
      status: 400,
    };
  }

  // Apply signed deltas to both sales' amountPaid: source loses (newAmount -
  // oldAmount); destination gains the same.
  const oldAmount = outLeg.amount || 0;
  const sourceDelta = -(newAmount - oldAmount);
  const destDelta = newAmount - oldAmount;
  const [updatedSource, updatedDest] = await Promise.all([
    sourceDelta === 0
      ? sourceSale
      : Sale.findOneAndUpdate({ id: sourceSale.id }, { $inc: { amountPaid: sourceDelta } }, { new: true }).lean(),
    destDelta === 0
      ? destSale
      : Sale.findOneAndUpdate({ id: destSale.id }, { $inc: { amountPaid: destDelta } }, { new: true }).lean(),
  ]);

  const recomputeStatus = (sale) => {
    if (!sale) return null;
    const paid = sale.amountPaid || 0;
    if (paid <= 0) return 'Pending';
    return gteMoney(paid, sale.finalAmount || 0) ? 'Paid' : 'Partial';
  };
  await Promise.all([
    Sale.updateOne({ id: sourceSale.id }, { $set: { paymentStatus: recomputeStatus(updatedSource) } }),
    Sale.updateOne({ id: destSale.id }, { $set: { paymentStatus: recomputeStatus(updatedDest) } }),
    SalePaymentEntry.updateOne(
      { id: outLeg.id },
      { $set: { amount: newAmount, paymentDate: newDate, remark: newRemark, updatedAt: new Date() } },
    ),
    SalePaymentEntry.updateOne(
      { id: inLeg.id },
      { $set: { amount: newAmount, paymentDate: newDate, remark: newRemark, updatedAt: new Date() } },
    ),
  ]);

  return {
    message: 'Transfer updated',
    transferGroupId,
    amount: newAmount,
    source: { saleId: sourceSale.id, amountPaid: updatedSource?.amountPaid || 0 },
    destination: { saleId: destSale.id, amountPaid: updatedDest?.amountPaid || 0 },
  };
};

const deleteSalePayment = async (id, userId) => {
  const entry = await SalePaymentEntry.findOne({ id }).lean();
  if (!entry) return { error: 'Entry not found', status: 404 };

  // Internal transfers are paired — deleting one side requires deleting the
  // other so both sales' amountPaid stay in sync. No daybook txn was written
  // for either leg, so no reversal txn either.
  if (entry.transferGroupId && (entry.entryType === 'TRANSFER_OUT' || entry.entryType === 'TRANSFER_IN')) {
    const siblings = await SalePaymentEntry
      .find({ transferGroupId: entry.transferGroupId, isDeleted: { $ne: true } })
      .lean();
    for (const leg of siblings) {
      const legDelta = isCreditEntryType(leg.entryType) ? -(leg.amount || 0) : (leg.amount || 0);
      const updated = await Sale.findOneAndUpdate(
        { id: leg.saleId },
        { $inc: { amountPaid: legDelta } },
        { new: true },
      ).lean();
      if (updated) {
        const newPaid = updated.amountPaid || 0;
        const paymentStatus = newPaid <= 0
          ? 'Pending'
          : (gteMoney(newPaid, updated.finalAmount || 0) ? 'Paid' : 'Partial');
        await Sale.updateOne({ id: leg.saleId }, { $set: { paymentStatus } });
      }
    }
    await SalePaymentEntry.updateMany(
      { transferGroupId: entry.transferGroupId, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, deletedAt: new Date(), deletedReason: 'Transfer reversed' } },
    );
    return { message: 'Transfer reversed (both legs deleted)' };
  }

  const originalTxn = await Transaction.findOne({ sourceType: 'SALE_PAYMENT', sourceId: id }).lean();
  if (originalTxn) {
    await createReversalTransaction(originalTxn, userId, 'Sale ledger entry deleted');
  }

  // Reverse the original delta on the sale's net amountPaid: SALE_PAYMENT
  // additions get subtracted; WITHDRAWAL / PROFIT_PAYOUT debits get added back.
  // Atomic $inc avoids the read-modify-write race when several payments are
  // deleted concurrently.
  const entryType = entry.entryType || 'SALE_PAYMENT';
  const reverseDelta = isCreditEntryType(entryType) ? -(entry.amount || 0) : (entry.amount || 0);
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

// Edit a sale-payment / withdrawal / profit-payout ledger entry. For
// totals-affecting changes (amount / type / mode / account / date) we
// reverse the original daybook txn and write a fresh one so the audit
// trail and account balances stay correct. Pure remark / referenceNo
// changes update in place.
const updateSalePayment = async (id, body, userId) => {
  const entry = await SalePaymentEntry.findOne({ id }).lean();
  if (!entry) return { error: 'Entry not found', status: 404 };
  if (entry.isDeleted) return { error: 'Entry is deleted', status: 400 };

  // Transfer entries are paired — editing one in isolation would desync the
  // other side. Allow remark-only edits in place; everything else must be
  // done by deleting (which deletes both sides) and recording a new transfer.
  if (entry.entryType === 'TRANSFER_OUT' || entry.entryType === 'TRANSFER_IN') {
    const onlyRemark =
      body.remark !== undefined
      && body.amount === undefined
      && body.entryType === undefined
      && body.type === undefined
      && body.paymentMode === undefined
      && body.accountId === undefined
      && body.paymentDate === undefined
      && body.entryDate === undefined;
    if (!onlyRemark) {
      return {
        error: 'Transfer entries can only be edited by remark. Delete the transfer and record a new one for any other change.',
        status: 400,
      };
    }
    await SalePaymentEntry.updateOne(
      { id },
      { $set: { remark: body.remark, updatedAt: new Date() } },
    );
    const fresh = await SalePaymentEntry.findOne({ id }).lean();
    return { message: 'Transfer entry remark updated', entry: fresh };
  }

  const sale = await Sale.findOne({ id: entry.saleId }).lean();
  if (!sale) return { error: 'Parent sale not found', status: 404 };

  const incomingAmount = body.amount !== undefined ? parseFloat(body.amount) : entry.amount;
  if (!(incomingAmount > 0)) {
    return { error: 'Amount must be greater than zero', status: 400 };
  }
  const newAmount = Number(incomingAmount);
  const newEntryType = body.entryType || body.type || entry.entryType || 'SALE_PAYMENT';
  const newPaymentDate = body.paymentDate || body.entryDate || entry.paymentDate;
  const newPaymentMode = body.paymentMode || entry.paymentMode;
  const newAccountId = body.accountId || entry.accountId;
  const newReferenceNo = body.referenceNo !== undefined ? body.referenceNo : (entry.referenceNo || '');
  const newRemark = body.remark !== undefined ? body.remark : (entry.remark || '');

  const oldType = entry.entryType || 'SALE_PAYMENT';
  const totalsAffectingChange =
    !eqMoney(newAmount, entry.amount || 0)
    || newEntryType !== oldType
    || newPaymentMode !== entry.paymentMode
    || newAccountId !== entry.accountId
    || newPaymentDate !== entry.paymentDate;

  // Re-validate the per-sale cap when the new entry is a SALE_PAYMENT
  // credit. Skip the check for pure remark edits because the net is
  // unchanged. Subtract the entry's OWN current contribution before
  // checking — otherwise editing-without-changing-amount would falsely
  // double-count itself.
  if (totalsAffectingChange && newEntryType === 'SALE_PAYMENT') {
    const otherEntries = await SalePaymentEntry
      .find(notDeleted({ saleId: entry.saleId, id: { $ne: id } }))
      .lean();
    const allocations = await PaymentAllocation.find({ saleId: entry.saleId }).lean();
    const otherNet = otherEntries.reduce((sum, e) => sum + signedDelta(e), 0)
      + allocations.reduce((sum, a) => sum + (a.amount || 0), 0);
    const remaining = (sale.finalAmount || 0) - otherNet;
    if (remaining <= 0) {
      return { error: 'Sale is already fully paid by other entries.', status: 400 };
    }
    if (newAmount > remaining + 0.01) {
      const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;
      return {
        error: `Amount ${fmt(newAmount)} exceeds remaining Sale Due of ${fmt(remaining)}.`,
        status: 400,
      };
    }
  }

  if (totalsAffectingChange) {
    const originalTxn = await Transaction.findOne({
      sourceType: 'SALE_PAYMENT',
      sourceId: id,
      isReversed: { $ne: true },
      isReversal: { $ne: true },
    }).lean();
    if (originalTxn) {
      await createReversalTransaction(originalTxn, userId, 'Sale ledger entry edited');
    }

    // Net delta on Sale.amountPaid: (new contribution) - (old contribution)
    const oldDelta = isCreditEntryType(oldType) ? (entry.amount || 0) : -(entry.amount || 0);
    const newDelta = isCreditEntryType(newEntryType) ? newAmount : -newAmount;
    const netDelta = newDelta - oldDelta;
    const updatedSale = await Sale.findOneAndUpdate(
      { id: entry.saleId },
      { $inc: { amountPaid: netDelta } },
      { new: true },
    ).lean();

    await SalePaymentEntry.updateOne(
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

    if (updatedSale) {
      const newAmountPaid = updatedSale.amountPaid || 0;
      const paymentStatus = newAmountPaid <= 0
        ? 'Pending'
        : (gteMoney(newAmountPaid, updatedSale.finalAmount || 0) ? 'Paid' : 'Partial');
      await Sale.updateOne({ id: entry.saleId }, { $set: { paymentStatus } });

      const direction = isCreditEntryType(newEntryType) ? 'IN' : 'OUT';
      await createTransaction({
        txnDate: newPaymentDate,
        societyId: updatedSale.societyId,
        accountId: newAccountId,
        direction,
        amount: newAmount,
        paymentMode: newPaymentMode,
        partyType: 'Customer',
        partyName: updatedSale.buyerName,
        sourceType: 'SALE_PAYMENT',
        sourceId: id,
        referenceNo: newReferenceNo,
        remark: newRemark || `${newEntryType} - ${updatedSale.buyerName}`,
      }, userId);
    }
  } else {
    await SalePaymentEntry.updateOne(
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

  const fresh = await SalePaymentEntry.findOne({ id }).lean();
  return { message: 'Sale ledger entry updated', entry: fresh };
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
  listLedger, addLedgerEntry, deleteSalePayment, updateSalePayment,
  transferBetweenSales, updateTransfer,
  listUnassigned, assignCustomer,
};
