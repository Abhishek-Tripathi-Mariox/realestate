const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { pick } = require('../../utils/pick');
const {
  Customer, Sale, CustomerPayment, PaymentAllocation, Inventory, SalePaymentEntry,
  ResaleDeal, ResaleBuyerPayment,
} = require('../../models');

// Fields a client may set on update — explicit allowlist guards against
// mass-assignment via PUT body (id, isDeleted, denormalized totals, etc.).
const CUSTOMER_UPDATABLE = ['name', 'phone', 'email', 'address', 'notes'];

const stripId = ({ _id, ...rest }) => rest;
const isSaleCreditEntryType = (t) => t === 'SALE_PAYMENT' || t === 'TRANSFER_IN';
const signedSaleDelta = (entry) => {
  const t = entry?.entryType || 'SALE_PAYMENT';
  return isSaleCreditEntryType(t) ? (entry.amount || 0) : -(entry.amount || 0);
};

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
  //
  // TRANSFER_IN / TRANSFER_OUT are deliberately excluded from the customer
  // master totals here: a flat-to-flat transfer moves money the customer
  // already paid, it isn't a fresh inflow. Counting TRANSFER_IN as credit
  // would inflate "Total Paid" on the customer card. They still appear on
  // the per-sale balance and on the customer ledger drawer (where they
  // help the user trace what moved between flats).
  const isTransferType = (t) => t === 'TRANSFER_IN' || t === 'TRANSFER_OUT';
  const saleEntryCreditBySale = {};
  const saleEntryDebitBySale = {};
  for (const e of allSaleEntries) {
    if (isTransferType(e.entryType)) continue;
    const delta = signedSaleDelta(e);
    if (delta > 0) saleEntryCreditBySale[e.saleId] = (saleEntryCreditBySale[e.saleId] || 0) + delta;
    else saleEntryDebitBySale[e.saleId] = (saleEntryDebitBySale[e.saleId] || 0) + Math.abs(delta);
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
  const patch = { ...pick(body, CUSTOMER_UPDATABLE), updatedAt: new Date() };
  await Customer.updateOne({ id }, { $set: patch });
  const updated = await Customer.findOne({ id }).lean();
  if (!updated) return null;
  return stripId(updated);
};

const remove = async (id) => {
  // Cascade soft-delete: customer's sales, payments, sale-payment entries
  // and allocations all need to disappear together. Otherwise the customer
  // is gone from the master list but their sales (and the underlying daybook
  // IN transactions) still inflate every total. The aliveTransactions filter
  // handles the daybook side once parents are flagged deleted.
  const stamp = { isDeleted: true, deletedAt: new Date(), deletedReason: 'Customer deleted' };

  const sales = await Sale.find(notDeleted({ customerId: id }), { id: 1, inventoryId: 1, status: 1 }).lean();
  const saleIds = sales.map(s => s.id);
  const payments = await CustomerPayment.find(notDeleted({ customerId: id }), { id: 1 }).lean();
  const paymentIds = payments.map(p => p.id);

  if (saleIds.length) {
    await SalePaymentEntry.updateMany(
      { saleId: { $in: saleIds }, isDeleted: { $ne: true } },
      { $set: stamp },
    );
    await Sale.updateMany({ id: { $in: saleIds } }, { $set: stamp });

    // Free the inventory units for any non-TRANSFERRED sales — same logic
    // as sales.remove for a single sale.
    const inventoryIds = [...new Set(
      sales.filter(s => s.status !== 'TRANSFERRED' && s.inventoryId).map(s => s.inventoryId),
    )];
    if (inventoryIds.length) {
      await Inventory.updateMany(
        { id: { $in: inventoryIds } },
        { $set: { status: 'Available', soldDate: null } },
      );
    }
  }

  if (paymentIds.length) {
    // Drop allocations entirely (mirrors customerPayments.remove behaviour).
    await PaymentAllocation.deleteMany({ paymentId: { $in: paymentIds } });
    await CustomerPayment.updateMany(
      { id: { $in: paymentIds } },
      { $set: stamp },
    );
  }

  await Customer.updateOne({ id }, { $set: stamp });
  return { message: `Customer deleted (${saleIds.length} sale(s) and ${paymentIds.length} payment(s) cascaded)` };
};

const listSales = async (customerId) => {
  // Once a flat is resold its original Sale row is stamped status=TRANSFERRED
  // (see resales.service.create). Drop those from the allocation modal so a
  // customer who has already exited the deal via resale doesn't get charged
  // again on the unit they no longer own. The resale flow now owns payment
  // tracking for that flat and the new buyer will see it in their own list.
  const sales = (await Sale.find(notDeleted({ customerId })).lean())
    .filter(s => s.status !== 'TRANSFERRED' && s.paymentStatus !== 'Transferred');
  const saleRows = await Promise.all(sales.map(async (s) => {
    const inventory = s.inventoryId ? await Inventory.findOne({ id: s.inventoryId }).lean() : null;
    const [allocations, saleEntries] = await Promise.all([
      PaymentAllocation.find({ saleId: s.id }).lean(),
      SalePaymentEntry.find(notDeleted({ saleId: s.id })).lean(),
    ]);
    const ledgerNet = saleEntries.reduce((sum, e) => sum + signedSaleDelta(e), 0);
    const allocatedAmount = allocations.reduce((sum, a) => sum + (a.amount || 0), 0)
      + ledgerNet;
    return {
      ...stripId(s),
      _isResale: false,
      inventoryNumber: inventory?.inventoryNumber || 'N/A',
      inventoryType: inventory?.type || '',
      phase: inventory?.phase || '',
      allocatedAmount,
      pendingBalance: (s.finalAmount || 0) - allocatedAmount,
    };
  }));

  // Resale rows: ResaleDeal has no buyerCustomerId yet, so match on the
  // customer's name (case-insensitive, trimmed). The user expects to see
  // every resale flat this person has bought — the allocation table treats
  // them just like a sale row.
  const customer = await Customer.findOne({ id: customerId }).lean();
  let resaleRows = [];
  if (customer?.name) {
    const target = customer.name.trim().toLowerCase();
    const resaleDeals = await ResaleDeal.find(notDeleted({})).lean();
    const matchedDeals = resaleDeals.filter(d =>
      (d.buyerName || '').trim().toLowerCase() === target);

    if (matchedDeals.length) {
      const dealIds = matchedDeals.map(d => d.id);
      const invIds = matchedDeals.map(d => d.inventoryId).filter(Boolean);
      const [inventories, buyerPayments, dealAllocations] = await Promise.all([
        invIds.length ? Inventory.find({ id: { $in: invIds } }).lean() : [],
        ResaleBuyerPayment.find(notDeleted({ dealId: { $in: dealIds } })).lean(),
        PaymentAllocation.find({ resaleDealId: { $in: dealIds } }).lean(),
      ]);
      const invById = Object.fromEntries(inventories.map(i => [i.id, i]));
      const paidByDeal = buyerPayments.reduce((acc, p) => {
        acc[p.dealId] = (acc[p.dealId] || 0) + (p.amount || 0);
        return acc;
      }, {});
      const allocByDeal = dealAllocations.reduce((acc, a) => {
        acc[a.resaleDealId] = (acc[a.resaleDealId] || 0) + (a.amount || 0);
        return acc;
      }, {});

      resaleRows = matchedDeals.map(d => {
        const inv = d.inventoryId ? invById[d.inventoryId] : null;
        const finalAmount = d.buyerPurchaseAmount || d.resalePrice || 0;
        const allocatedAmount = (paidByDeal[d.id] || 0) + (allocByDeal[d.id] || 0);
        return {
          ...stripId(d),
          _isResale: true,
          // Normalize to the sale shape so the frontend renders both kinds
          // uniformly — the same table, the same inputs, the same maxAmount
          // math. `finalAmount` is what the buyer is supposed to pay for the
          // resale (buyerPurchaseAmount falls back to resalePrice).
          finalAmount,
          inventoryNumber: inv?.inventoryNumber || 'N/A',
          inventoryType: inv?.type || '',
          phase: inv?.phase || '',
          allocatedAmount,
          pendingBalance: finalAmount - allocatedAmount,
        };
      });
    }
  }

  return [...saleRows, ...resaleRows];
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
    e => (e.entryType || 'SALE_PAYMENT') === 'SALE_PAYMENT' || e.entryType === 'TRANSFER_IN',
  );
  const saleLedgerDebitEntries = allLedgerEntries.filter(
    e => e.entryType === 'WITHDRAWAL' || e.entryType === 'PROFIT_PAYOUT' || e.entryType === 'TRANSFER_OUT',
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
    const isTransferIn = e.entryType === 'TRANSFER_IN';
    const label = isTransferIn ? 'Transfer In' : 'Payment';
    return {
      id: `sale-pay-${e.id}`,
      date: e.paymentDate || e.createdAt,
      createdAt: e.createdAt,
      type: 'PAYMENT',
      description: `${label} via ${e.paymentMode || 'Cash'}${e.referenceNo ? ` (${e.referenceNo})` : ''} — ${inv?.inventoryNumber || 'Unit'}`,
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
    const label = e.entryType === 'PROFIT_PAYOUT'
      ? 'Profit Payout'
      : e.entryType === 'TRANSFER_OUT'
      ? 'Transfer Out'
      : 'Withdrawal';
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
