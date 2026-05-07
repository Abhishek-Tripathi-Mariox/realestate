const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const {
  Customer, Sale, CustomerPayment, PaymentAllocation, Inventory, SalePaymentEntry,
} = require('../../models');

const stripId = ({ _id, ...rest }) => rest;

const list = async (query) => {
  const filter = notDeleted();
  if (query.societyId) filter.societyId = query.societyId;
  const customers = await Customer.find(filter).lean();
  if (customers.length === 0) return [];

  const customerIds = customers.map(c => c.id);
  const [sales, payments] = await Promise.all([
    Sale.find(notDeleted({ customerId: { $in: customerIds } })).lean(),
    CustomerPayment.find(notDeleted({ customerId: { $in: customerIds } })).lean(),
  ]);
  const paymentIds = payments.map(p => p.id);
  const saleIds = sales.map(s => s.id);
  const [allocations, allSaleEntries] = await Promise.all([
    paymentIds.length
      ? PaymentAllocation.find({ paymentId: { $in: paymentIds } }).lean()
      : Promise.resolve([]),
    saleIds.length
      ? SalePaymentEntry.find(notDeleted({ saleId: { $in: saleIds } })).lean()
      : Promise.resolve([]),
  ]);

  const salesByCustomer = sales.reduce((acc, s) => {
    (acc[s.customerId] = acc[s.customerId] || []).push(s);
    return acc;
  }, {});
  const paymentsByCustomer = payments.reduce((acc, p) => {
    (acc[p.customerId] = acc[p.customerId] || []).push(p);
    return acc;
  }, {});
  // Self-heal: drop allocations whose sale was (soft-)deleted so freed-up
  // money shows as unallocated again (and stays in totalPaid via the payment
  // amount itself). `sales` already contains only non-deleted sales for these
  // customers, so its ids are the canonical "live" set.
  const liveSaleIds = new Set(sales.map(s => s.id));
  const liveAllocations = allocations.filter(a => liveSaleIds.has(a.saleId));
  const allocationsByPayment = liveAllocations.reduce((acc, a) => {
    acc[a.paymentId] = (acc[a.paymentId] || 0) + (a.amount || 0);
    return acc;
  }, {});

  // Split sale-ledger entries: SALE_PAYMENT (or legacy entries with no
  // entryType) count as credits; WITHDRAWAL / PROFIT_PAYOUT debit the sale's
  // running balance — they're refunds / payouts that take money back out.
  const saleEntryCreditBySale = {};
  const saleEntryDebitBySale = {};
  for (const e of allSaleEntries) {
    const type = e.entryType || 'SALE_PAYMENT';
    if (type === 'SALE_PAYMENT') {
      saleEntryCreditBySale[e.saleId] = (saleEntryCreditBySale[e.saleId] || 0) + (e.amount || 0);
    } else {
      saleEntryDebitBySale[e.saleId] = (saleEntryDebitBySale[e.saleId] || 0) + (e.amount || 0);
    }
  }

  return customers.map((c) => {
    const cSales = salesByCustomer[c.id] || [];
    const cPayments = paymentsByCustomer[c.id] || [];
    const totalSaleAmount = cSales.reduce((s, x) => s + (x.finalAmount || 0), 0);
    // Pull from BOTH payment flows so the customer master reflects every rupee:
    //  - customer-level payments (CustomerPayment)
    //  - per-sale ledger payments (SalePaymentEntry, only for this customer's sales)
    const customerPaymentTotal = cPayments.reduce((s, x) => s + (x.amount || 0), 0);
    const saleLedgerPaymentTotal = cSales.reduce((s, x) => s + (saleEntryCreditBySale[x.id] || 0), 0);
    const saleLedgerDebitTotal = cSales.reduce((s, x) => s + (saleEntryDebitBySale[x.id] || 0), 0);
    const totalPaid = customerPaymentTotal + saleLedgerPaymentTotal;
    // Compute from live allocations rather than the stored
    // CustomerPayment.unallocatedAmount, which can be stale after a sale
    // delete leaves orphan allocations behind.
    const unallocatedAmount = cPayments.reduce((s, p) => {
      const allocated = allocationsByPayment[p.id] || 0;
      return s + Math.max(0, (p.amount || 0) - allocated);
    }, 0);
    return {
      ...stripId(c),
      salesCount: cSales.length,
      totalSaleAmount,
      totalPaid,
      // Withdrawals/profit-payouts add back to the outstanding because that
      // money has been pulled out of the sale's deposit pool again.
      balance: totalSaleAmount - totalPaid + saleLedgerDebitTotal,
      unallocatedAmount,
    };
  });
};

const create = async (body, userId) => {
  const customer = {
    id: uuidv4(),
    societyId: body.societyId,
    name: body.name,
    phone: body.phone || '',
    email: body.email || '',
    address: body.address || '',
    notes: body.notes || '',
    createdBy: userId,
    createdAt: new Date(),
  };
  await Customer.create(customer);
  return customer;
};

const update = async (id, body) => {
  await Customer.updateOne({ id }, { $set: { ...body, updatedAt: new Date() } });
  const updated = await Customer.findOne({ id }).lean();
  if (!updated) return null;
  return stripId(updated);
};

const remove = async (id) => {
  await Customer.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
};

const listSales = async (customerId) => {
  const sales = await Sale.find(notDeleted({ customerId })).lean();
  const enriched = await Promise.all(sales.map(async (s) => {
    const inventory = s.inventoryId ? await Inventory.findOne({ id: s.inventoryId }).lean() : null;
    const [allocations, saleEntries] = await Promise.all([
      PaymentAllocation.find({ saleId: s.id }).lean(),
      SalePaymentEntry.find(notDeleted({
        saleId: s.id,
        // $nin instead of $or — see list() for why (notDeleted's $or would
        // overwrite this one and let withdrawals leak in as payments).
        entryType: { $nin: ['WITHDRAWAL', 'PROFIT_PAYOUT'] },
      })).lean(),
    ]);
    const allocatedAmount = allocations.reduce((sum, a) => sum + (a.amount || 0), 0)
      + saleEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
    return {
      ...s,
      inventoryNumber: inventory?.inventoryNumber || 'N/A',
      allocatedAmount,
      pendingBalance: (s.finalAmount || 0) - allocatedAmount,
    };
  }));
  return enriched.map(stripId);
};

const ledger = async (customerId) => {
  const sales = await Sale.find(notDeleted({ customerId })).lean();
  const payments = await CustomerPayment.find(notDeleted({ customerId })).lean();
  const paymentIds = payments.map(p => p.id);
  const saleIds = sales.map(s => s.id);
  const [allocations, allLedgerEntries] = await Promise.all([
    paymentIds.length
      ? PaymentAllocation.find({ paymentId: { $in: paymentIds } }).lean()
      : Promise.resolve([]),
    saleIds.length
      ? SalePaymentEntry.find(notDeleted({ saleId: { $in: saleIds } })).lean()
      : Promise.resolve([]),
  ]);

  // Split sale-ledger entries: credits (SALE_PAYMENT or legacy entries with
  // no entryType) vs debits (WITHDRAWAL / PROFIT_PAYOUT). Both need to surface
  // on the customer's ledger so the running balance matches the Sale Ledger.
  const saleLedgerEntries = allLedgerEntries.filter(
    e => (e.entryType || 'SALE_PAYMENT') === 'SALE_PAYMENT',
  );
  const saleLedgerDebitEntries = allLedgerEntries.filter(
    e => e.entryType === 'WITHDRAWAL' || e.entryType === 'PROFIT_PAYOUT',
  );

  const inventoryIds = [...new Set(sales.map(s => s.inventoryId).filter(Boolean))];
  const inventories = inventoryIds.length
    ? await Inventory.find({ id: { $in: inventoryIds } }).lean()
    : [];
  const inventoryById = Object.fromEntries(inventories.map(i => [i.id, i]));
  const saleById = Object.fromEntries(sales.map(s => [s.id, s]));

  const saleLedgerAmountBySale = saleLedgerEntries.reduce((acc, e) => {
    acc[e.saleId] = (acc[e.saleId] || 0) + (e.amount || 0);
    return acc;
  }, {});

  const saleEntries = sales.map(s => {
    const allocatedForSale = allocations.filter(a => a.saleId === s.id).reduce((sum, a) => sum + (a.amount || 0), 0);
    const directlyPaidForSale = saleLedgerAmountBySale[s.id] || 0;
    const inv = s.inventoryId ? inventoryById[s.inventoryId] : null;
    return {
      id: `sale-${s.id}`,
      date: s.saleDate || s.createdAt,
      createdAt: s.createdAt,
      type: 'SALE',
      description: `Sale - ${inv?.inventoryNumber || 'Unit'}`,
      debit: s.finalAmount || 0,
      credit: 0,
      pendingBalance: (s.finalAmount || 0) - allocatedForSale - directlyPaidForSale,
    };
  });

  const paymentEntries = payments.map(p => {
    const paymentAllocs = allocations.filter(a => a.paymentId === p.id);
    const allocationDetails = paymentAllocs.map(a => {
      const sale = saleById[a.saleId];
      const inv = sale?.inventoryId ? inventoryById[sale.inventoryId] : null;
      return { inventoryNumber: inv?.inventoryNumber || 'N/A', amount: a.amount || 0 };
    });
    const unalloc = p.unallocatedAmount != null ? p.unallocatedAmount : ((p.amount || 0) - paymentAllocs.reduce((s, a) => s + (a.amount || 0), 0));
    let status = 'PENDING';
    if (unalloc <= 0) status = 'FULLY_ALLOCATED';
    else if (unalloc < (p.amount || 0)) status = 'PARTIAL';
    return {
      id: `pay-${p.id}`,
      date: p.paymentDate || p.createdAt,
      createdAt: p.createdAt,
      type: 'PAYMENT',
      description: `Payment via ${p.paymentMode || 'Cash'}${p.referenceNo ? ` (${p.referenceNo})` : ''}`,
      debit: 0,
      credit: p.amount || 0,
      allocationDetails,
      status,
    };
  });

  // Sale-ledger payments (from the per-sale Sale Ledger drawer) — surface them
  // here so a customer's ledger view is complete regardless of which flow was
  // used to record the payment.
  const saleLedgerPaymentEntries = saleLedgerEntries.map(e => {
    const sale = saleById[e.saleId];
    const inv = sale?.inventoryId ? inventoryById[sale.inventoryId] : null;
    return {
      id: `sale-pay-${e.id}`,
      date: e.paymentDate || e.createdAt,
      createdAt: e.createdAt,
      type: 'PAYMENT',
      description: `Payment via ${e.paymentMode || 'Cash'}${e.referenceNo ? ` (${e.referenceNo})` : ''} — ${inv?.inventoryNumber || 'Unit'}`,
      debit: 0,
      credit: e.amount || 0,
      allocationDetails: [{ inventoryNumber: inv?.inventoryNumber || 'N/A', amount: e.amount || 0 }],
      status: 'FULLY_ALLOCATED',
    };
  });

  // Surface withdrawals and profit payouts as debit rows so the customer
  // ledger mirrors what the Sale Ledger drawer shows: money taken out of the
  // sale's deposit pool reverses part of an earlier credit.
  const saleLedgerDebitRows = saleLedgerDebitEntries.map(e => {
    const sale = saleById[e.saleId];
    const inv = sale?.inventoryId ? inventoryById[sale.inventoryId] : null;
    const label = e.entryType === 'PROFIT_PAYOUT' ? 'Profit Payout' : 'Withdrawal';
    return {
      id: `sale-debit-${e.id}`,
      date: e.paymentDate || e.createdAt,
      createdAt: e.createdAt,
      type: e.entryType,
      description: `${label} via ${e.paymentMode || 'Cash'}${e.referenceNo ? ` (${e.referenceNo})` : ''} — ${inv?.inventoryNumber || 'Unit'}`,
      debit: e.amount || 0,
      credit: 0,
      allocationDetails: [{ inventoryNumber: inv?.inventoryNumber || 'N/A', amount: e.amount || 0 }],
      status: 'DEBIT',
    };
  });

  // Sort chronologically. When two rows share the same payment/sale date
  // (common — multiple ledger entries on the same day) fall back to
  // createdAt so the running balance follows the actual sequence in which
  // the entries were recorded, matching what the Sale Ledger drawer shows.
  const ledger = [...saleEntries, ...paymentEntries, ...saleLedgerPaymentEntries, ...saleLedgerDebitRows]
    .sort((a, b) => {
      const dateDiff = new Date(a.date) - new Date(b.date);
      if (dateDiff !== 0) return dateDiff;
      const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return aCreated - bCreated;
    });

  let running = 0;
  for (const e of ledger) {
    running += (e.debit || 0) - (e.credit || 0);
    e.runningBalance = running;
  }

  const totalSales = sales.reduce((s, x) => s + (x.finalAmount || 0), 0);
  const totalCustomerPayments = payments.reduce((s, x) => s + (x.amount || 0), 0);
  const totalSaleLedgerPayments = saleLedgerEntries.reduce((s, x) => s + (x.amount || 0), 0);
  const totalSaleLedgerDebits = saleLedgerDebitEntries.reduce((s, x) => s + (x.amount || 0), 0);
  const totalPayments = totalCustomerPayments + totalSaleLedgerPayments;
  // Withdrawals & profit payouts cancel part of the allocation: net money
  // actually retained against this customer's sales.
  const totalAllocated = allocations.reduce((s, x) => s + (x.amount || 0), 0)
    + totalSaleLedgerPayments
    - totalSaleLedgerDebits;
  const unallocatedPayments = payments.reduce((s, x) => s + (x.unallocatedAmount != null ? x.unallocatedAmount : 0), 0);

  return {
    summary: {
      totalSales,
      totalPayments,
      totalAllocated,
      totalWithdrawals: totalSaleLedgerDebits,
      outstandingBalance: totalSales - totalAllocated,
      unallocatedPayments,
    },
    ledger,
  };
};

module.exports = { list, create, update, remove, listSales, ledger };
