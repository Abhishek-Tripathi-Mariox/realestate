const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { createTransaction, createReversalTransaction } = require('../../utils/transactions');
const {
  ResaleDeal, ResaleBuyerPayment, ResaleSellerPayout, Account, Transaction,
  Inventory, InventoryOwnershipHistory, Sale, PaymentAllocation, CustomerPayment,
} = require('../../models');

const stripId = ({ _id, ...rest }) => rest;

const list = async (query) => {
  const filter = notDeleted();
  if (query.societyId) filter.societyId = query.societyId;
  const deals = await ResaleDeal.find(filter).lean();

  const inventoryIds = [...new Set(deals.map(d => d.inventoryId).filter(Boolean))];
  const inventories = inventoryIds.length
    ? await Inventory.find({ id: { $in: inventoryIds } }).lean()
    : [];
  const inventoryById = Object.fromEntries(inventories.map(i => [i.id, i]));

  const dealIds = deals.map(d => d.id);
  const [buyerPayments, sellerPayouts, dealAllocations] = await Promise.all([
    dealIds.length
      ? ResaleBuyerPayment.find(notDeleted({ dealId: { $in: dealIds } })).lean()
      : Promise.resolve([]),
    dealIds.length
      ? ResaleSellerPayout.find(notDeleted({ dealId: { $in: dealIds } })).lean()
      : Promise.resolve([]),
    // PaymentAllocations targeting these deals count toward `buyerPaid` —
    // they came in via the Customer Payment allocation modal (instead of
    // the resale-buyer-payment drawer) but they're still real cash received.
    dealIds.length
      ? PaymentAllocation.find({ resaleDealId: { $in: dealIds } }).lean()
      : Promise.resolve([]),
  ]);
  const buyerPaidByDeal = buyerPayments.reduce((acc, p) => {
    acc[p.dealId] = (acc[p.dealId] || 0) + (p.amount || 0);
    return acc;
  }, {});
  const allocPaidByDeal = dealAllocations.reduce((acc, a) => {
    acc[a.resaleDealId] = (acc[a.resaleDealId] || 0) + (a.amount || 0);
    return acc;
  }, {});
  const sellerPaidByDeal = sellerPayouts.reduce((acc, p) => {
    acc[p.dealId] = (acc[p.dealId] || 0) + (p.amount || 0);
    return acc;
  }, {});

  return deals.map((d) => {
    const inv = d.inventoryId ? inventoryById[d.inventoryId] : null;
    const buyerAmount = d.buyerPurchaseAmount || d.resalePrice || 0;
    const sellerAmount = d.sellerPayoutAmount || Math.max(0, (d.resalePrice || 0) - (d.companyCommission || 0));
    const buyerPaid = (buyerPaidByDeal[d.id] || 0) + (allocPaidByDeal[d.id] || 0);
    const sellerPaid = sellerPaidByDeal[d.id] || 0;
    const buyerStatus = buyerPaid <= 0 ? 'PENDING' : (buyerPaid >= buyerAmount - 0.01 ? 'PAID' : 'PARTIAL');
    const sellerStatus = sellerPaid <= 0 ? 'PENDING' : (sellerPaid >= sellerAmount - 0.01 ? 'PAID' : 'PARTIAL');
    return {
      ...stripId(d),
      inventoryName: inv?.inventoryNumber || '-',
      inventoryNumber: inv?.inventoryNumber || '-',
      buyerPaid,
      sellerPaid,
      buyerStatus,
      sellerStatus,
    };
  });
};

const create = async (body) => {
  const resalePrice = Number(body.resalePrice) || 0;
  const transferCharges = Number(body.transferCharges) || 0;
  const brokerage = Number(body.brokerage) || 0;
  const otherCharges = Number(body.otherCharges) || 0;
  // companyCommission defaults to total of all charge fields when not given.
  const companyCommission = Number(body.companyCommission ?? (transferCharges + brokerage + otherCharges)) || 0;

  // Derive seller/buyer amounts so the resale-payments drawer can read them
  // directly without recomputing. Three sources, in priority order:
  //   1. Caller-supplied originalSalePrice/originalSalePaid (legacy path)
  //   2. previousResaleDealId — chained resale (Bhanu→Monu→Sonu): the seller
  //      is the previous deal's buyer, "original" price = that deal's
  //      resalePrice, "original" paid = how much that buyer has already paid
  //      against the previous deal.
  //   3. originalSaleId — first-hop resale off a Sale record.
  let originalSalePrice = Number(body.originalSalePrice) || 0;
  let originalSalePaid = Number(body.originalSalePaid) || 0;
  let previousDeal = null;
  if (body.previousResaleDealId) {
    previousDeal = await ResaleDeal.findOne({ id: body.previousResaleDealId }).lean();
    if (!previousDeal || previousDeal.isDeleted) {
      return { error: 'Previous resale deal not found', status: 404 };
    }
    if (!originalSalePrice) originalSalePrice = Number(previousDeal.resalePrice) || 0;
    if (!originalSalePaid) {
      const buyerPayments = await ResaleBuyerPayment
        .find(notDeleted({ dealId: previousDeal.id }))
        .lean();
      originalSalePaid = buyerPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    }
  } else if (body.originalSaleId && (!originalSalePrice || !originalSalePaid)) {
    const originalSale = await Sale.findOne({ id: body.originalSaleId }).lean();
    if (originalSale) {
      if (!originalSalePrice) originalSalePrice = Number(originalSale.finalAmount) || 0;
      if (!originalSalePaid) originalSalePaid = Number(originalSale.amountPaid) || 0;
    }
  }

  const buyerPurchaseAmount = resalePrice;
  const grossProfit = resalePrice - originalSalePrice;
  const netProfit = grossProfit - companyCommission;
  const sellerPayoutPrincipal = originalSalePaid;
  const sellerPayoutProfit = netProfit;
  const sellerPayoutAmount = Math.max(0, sellerPayoutPrincipal + sellerPayoutProfit);

  const deal = {
    id: uuidv4(),
    societyId: body.societyId,
    inventoryId: body.inventoryId,
    sellerCustomerId: body.sellerCustomerId || null,
    sellerName: body.sellerName,
    sellerPhone: body.sellerPhone || '',
    buyerCustomerId: body.buyerCustomerId || null,
    buyerName: body.buyerName,
    buyerPhone: body.buyerPhone || '',
    resalePrice,
    transferCharges,
    brokerage,
    otherCharges,
    chargesNotes: body.chargesNotes || '',
    companyCommission,
    originalSaleId: body.originalSaleId || null,
    previousResaleDealId: body.previousResaleDealId || null,
    originalSalePrice,
    originalSalePaid,
    buyerPurchaseAmount,
    sellerPayoutPrincipal,
    sellerPayoutProfit,
    sellerPayoutAmount,
    netProfit,
    dealDate: body.dealDate || null,
    notes: body.notes || '',
    status: 'Active',
    createdAt: new Date(),
  };
  await ResaleDeal.create(deal);

  // Mark the original Sale as TRANSFERRED so the Sales tab stops showing it
  // as an active booking with a pending balance — the resale flow now owns
  // payment tracking for this unit.
  if (deal.originalSaleId) {
    await Sale.updateOne(
      { id: deal.originalSaleId },
      {
        $set: {
          status: 'TRANSFERRED',
          paymentStatus: 'Transferred',
          resaleDealId: deal.id,
          transferredTo: deal.buyerName,
          transferredAt: new Date(),
          updatedAt: new Date(),
        },
      },
    );
  }

  // Chained resale: mark the previous deal as TRANSFERRED so it stops being
  // the "current" deal for this inventory. Its buyer (this deal's seller)
  // has now exited the chain.
  if (deal.previousResaleDealId) {
    await ResaleDeal.updateOne(
      { id: deal.previousResaleDealId },
      {
        $set: {
          status: 'TRANSFERRED',
          closedAt: new Date(),
          nextResaleDealId: deal.id,
          updatedAt: new Date(),
        },
      },
    );
  }

  return deal;
};

const remove = async (dealId, userId) => {
  const deal = await ResaleDeal.findOne({ id: dealId }).lean();
  if (!deal) return { error: 'Deal not found', status: 404 };

  const buyerPayments = await ResaleBuyerPayment.find({ dealId }).lean();
  const sellerPayouts = await ResaleSellerPayout.find({ dealId }).lean();

  for (const p of buyerPayments) {
    const t = await Transaction.findOne({
      sourceType: 'RESALE_BUYER_PAYMENT',
      sourceId: p.id,
      isReversal: { $ne: true },
    }).lean();
    if (t) await createReversalTransaction(t, userId, 'Resale deal deleted');
  }
  for (const p of sellerPayouts) {
    const t = await Transaction.findOne({
      sourceType: 'RESALE_SELLER_PAYOUT',
      sourceId: p.id,
      isReversal: { $ne: true },
    }).lean();
    if (t) await createReversalTransaction(t, userId, 'Resale deal deleted');
  }

  await ResaleBuyerPayment.updateMany({ dealId }, { $set: { isDeleted: true, deletedAt: new Date() } });
  await ResaleSellerPayout.updateMany({ dealId }, { $set: { isDeleted: true, deletedAt: new Date() } });
  await ResaleDeal.updateOne({ id: dealId }, { $set: { isDeleted: true, deletedAt: new Date() } });

  // Revert the original Sale back to Booked so the unit's prior sale becomes
  // active again on the Sales tab.
  if (deal.originalSaleId) {
    await Sale.updateOne(
      { id: deal.originalSaleId },
      {
        $set: { status: 'Booked', updatedAt: new Date() },
        $unset: { resaleDealId: '', transferredTo: '', transferredAt: '' },
      },
    );
  }

  // Chained delete: if this deal was a continuation of another resale, flip
  // the previous deal back to Active so it once again represents the
  // current ownership of the unit.
  if (deal.previousResaleDealId) {
    await ResaleDeal.updateOne(
      { id: deal.previousResaleDealId },
      {
        $set: { status: 'Active', updatedAt: new Date() },
        $unset: { closedAt: '', nextResaleDealId: '' },
      },
    );
  }

  return { message: 'Resale deal deleted with reversal' };
};

const closeDeal = async (dealId, userId) => {
  const deal = await ResaleDeal.findOne({ id: dealId }).lean();
  if (!deal) return { error: 'Deal not found', status: 404 };
  if (deal.status === 'TRANSFERRED' || deal.status === 'Closed') {
    return { error: 'Deal already closed', status: 400 };
  }

  await ResaleDeal.updateOne(
    { id: dealId },
    { $set: { status: 'TRANSFERRED', closedAt: new Date(), closedBy: userId } },
  );

  if (deal.inventoryId) {
    await InventoryOwnershipHistory.create({
      id: uuidv4(),
      inventoryId: deal.inventoryId,
      previousOwner: deal.sellerName,
      newOwner: deal.buyerName,
      dealId: deal.id,
      transferDate: new Date(),
      transferredBy: userId,
    });
    await Inventory.updateOne(
      { id: deal.inventoryId },
      { $set: { currentOwner: deal.buyerName, status: 'Resold', updatedAt: new Date() } },
    );
  }

  return { message: 'Deal closed and ownership transferred' };
};

const listBuyerPayments = async (dealId) => {
  const payments = await ResaleBuyerPayment
    .find(notDeleted({ dealId }))
    .sort({ paymentDate: -1 })
    .lean();

  // Surface customer-payment allocations as virtual rows alongside the
  // direct buyer payments so the drawer shows where every rupee in
  // `buyerPaid` came from. They're read-only here — edits go through the
  // Customer Payments page (the allocation modal). Marked with
  // `_isAllocation: true` so the FE can dim / disable the action buttons.
  const allocations = await PaymentAllocation.find({ resaleDealId: dealId }).lean();
  let allocRows = [];
  if (allocations.length) {
    const paymentIds = [...new Set(allocations.map(a => a.paymentId))];
    const customerPayments = paymentIds.length
      ? await CustomerPayment.find({ id: { $in: paymentIds } }).lean()
      : [];
    const cpById = Object.fromEntries(customerPayments.map(p => [p.id, p]));
    allocRows = allocations.map(a => {
      const cp = cpById[a.paymentId];
      return {
        id: `alloc-${a.id}`,
        _isAllocation: true,
        allocationId: a.id,
        paymentId: a.paymentId,
        dealId,
        accountId: cp?.accountId,
        amount: a.amount,
        paymentDate: cp?.paymentDate || a.createdAt,
        paymentMode: cp?.paymentMode || 'Cash',
        referenceNo: cp?.referenceNo || '',
        remark: `From customer payment${cp?.remark ? ` — ${cp.remark}` : ''}`,
        createdAt: a.createdAt,
      };
    });
  }

  const merged = [...payments.map(stripId), ...allocRows].sort((a, b) => {
    const da = a.paymentDate || a.createdAt || '';
    const db = b.paymentDate || b.createdAt || '';
    return db.localeCompare ? db.localeCompare(da) : (db > da ? 1 : -1);
  });
  return merged;
};

const addBuyerPayment = async (dealId, body, userId) => {
  const deal = await ResaleDeal.findOne({ id: dealId }).lean();
  if (!deal) return { error: 'Deal not found', status: 404 };

  let accountId = body.accountId;
  if (!accountId) {
    const defaultAccount = await Account.findOne({ isDefault: true }).lean();
    accountId = defaultAccount?.id;
  }

  const amount = parseFloat(body.amount) || 0;
  const payment = {
    id: uuidv4(),
    dealId,
    societyId: deal.societyId,
    accountId,
    amount,
    paymentDate: body.paymentDate,
    paymentMode: body.paymentMode || 'Cash',
    referenceNo: body.referenceNo || '',
    remark: body.remark || '',
    createdBy: userId,
    createdAt: new Date(),
  };

  await ResaleBuyerPayment.create(payment);

  await createTransaction({
    txnDate: payment.paymentDate,
    societyId: deal.societyId,
    accountId,
    direction: 'IN',
    amount,
    paymentMode: payment.paymentMode,
    partyType: 'Customer',
    partyName: deal.buyerName,
    sourceType: 'RESALE_BUYER_PAYMENT',
    sourceId: payment.id,
    remark: payment.remark || `Resale buyer payment - ${deal.buyerName}`,
  }, userId);

  return payment;
};

const deleteBuyerPayment = async (paymentId, userId) => {
  const payment = await ResaleBuyerPayment.findOne({ id: paymentId }).lean();
  if (!payment) return { error: 'Payment not found', status: 404 };

  const originalTxn = await Transaction.findOne({ sourceType: 'RESALE_BUYER_PAYMENT', sourceId: paymentId }).lean();
  if (originalTxn) {
    await createReversalTransaction(originalTxn, userId, 'Resale buyer payment deleted');
  }

  await ResaleBuyerPayment.updateOne({ id: paymentId }, { $set: { isDeleted: true, deletedAt: new Date() } });
  return { message: 'Buyer payment deleted with reversal' };
};
// Edit a buyer payment in place. Same reverse-and-repost pattern delete uses —
// the daybook is append-only, so the prior IN entry is reversed and a fresh
// one is posted off the updated values. Keeps the account balance correct and
// the audit trail clean.
const updateBuyerPayment = async (paymentId, body, userId) => {
  const existing = await ResaleBuyerPayment.findOne(notDeleted({ id: paymentId })).lean();
  if (!existing) return { error: 'Payment not found', status: 404 };
  const deal = await ResaleDeal.findOne({ id: existing.dealId }).lean();
  if (!deal) return { error: 'Deal not found', status: 404 };

  const amount = body.amount !== undefined ? parseFloat(body.amount) || 0 : existing.amount;
  if (!(amount > 0)) return { error: 'Amount must be greater than 0', status: 400 };

  let accountId = body.accountId !== undefined ? body.accountId : existing.accountId;
  if (!accountId) {
    const defaultAccount = await Account.findOne({ isDefault: true }).lean();
    accountId = defaultAccount?.id;
  }

  const update = {
    amount,
    accountId,
    paymentDate: body.paymentDate || existing.paymentDate,
    paymentMode: body.paymentMode || existing.paymentMode || 'Cash',
    referenceNo: body.referenceNo !== undefined ? body.referenceNo : (existing.referenceNo || ''),
    remark: body.remark !== undefined ? body.remark : (existing.remark || ''),
    updatedAt: new Date(),
  };

  await ResaleBuyerPayment.updateOne({ id: paymentId }, { $set: update });

  // Reverse the prior daybook IN entry and post a fresh one with new values.
  const originalTxn = await Transaction.findOne({
    sourceType: 'RESALE_BUYER_PAYMENT',
    sourceId: paymentId,
    isReversal: { $ne: true },
    isReversed: { $ne: true },
  }).lean();
  if (originalTxn) {
    await createReversalTransaction(originalTxn, userId, 'Resale buyer payment edited');
  }
  await createTransaction({
    txnDate: update.paymentDate,
    societyId: deal.societyId,
    accountId,
    direction: 'IN',
    amount,
    paymentMode: update.paymentMode,
    partyType: 'Customer',
    partyName: deal.buyerName,
    sourceType: 'RESALE_BUYER_PAYMENT',
    sourceId: paymentId,
    remark: update.remark || `Resale buyer payment - ${deal.buyerName}`,
  }, userId);

  return { ...existing, ...update };
};

const listSellerPayouts = async (dealId) => {
  const payouts = await ResaleSellerPayout
    .find(notDeleted({ dealId }))
    .sort({ paymentDate: -1 })
    .lean();
  return payouts.map(stripId);
};

const addSellerPayout = async (dealId, body, userId) => {
  const deal = await ResaleDeal.findOne({ id: dealId }).lean();
  if (!deal) return { error: 'Deal not found', status: 404 };

  let accountId = body.accountId;
  if (!accountId) {
    const defaultAccount = await Account.findOne({ isDefault: true }).lean();
    accountId = defaultAccount?.id;
  }

  // Frontend form sends payoutDate/payoutMode/reference/principalAmount/
  // profitAmount/chargesDeducted; older callers may send the legacy
  // paymentDate/paymentMode/referenceNo. Accept both and store every field
  // so the Seller Payout Breakdown (Principal Paid / Profit Paid) and the
  // history table can read them back correctly.
  const amount = parseFloat(body.amount) || 0;
  const principalAmount = parseFloat(body.principalAmount) || 0;
  const profitAmount = parseFloat(body.profitAmount) || 0;
  const chargesDeducted = parseFloat(body.chargesDeducted) || 0;
  const paymentDate = body.payoutDate || body.paymentDate || null;
  const paymentMode = body.payoutMode || body.paymentMode || 'Cash';
  const referenceNo = body.reference ?? body.referenceNo ?? '';

  const payout = {
    id: uuidv4(),
    dealId,
    societyId: deal.societyId,
    accountId,
    amount,
    principalAmount,
    profitAmount,
    chargesDeducted,
    paymentDate,
    payoutDate: paymentDate,            // alias so legacy FE reads still work
    paymentMode,
    payoutMode: paymentMode,            // alias for the same reason
    referenceNo,
    reference: referenceNo,
    remark: body.remark || '',
    createdBy: userId,
    createdAt: new Date(),
  };

  await ResaleSellerPayout.create(payout);

  await createTransaction({
    txnDate: payout.paymentDate,
    societyId: deal.societyId,
    accountId,
    direction: 'OUT',
    amount,
    paymentMode: payout.paymentMode,
    partyType: 'Vendor',
    partyName: deal.sellerName,
    sourceType: 'RESALE_SELLER_PAYOUT',
    sourceId: payout.id,
    remark: payout.remark || `Resale seller payout - ${deal.sellerName}`,
  }, userId);

  return payout;
};

const deleteSellerPayout = async (payoutId, userId) => {
  const payout = await ResaleSellerPayout.findOne({ id: payoutId }).lean();
  if (!payout) return { error: 'Payout not found', status: 404 };

  const originalTxn = await Transaction.findOne({ sourceType: 'RESALE_SELLER_PAYOUT', sourceId: payoutId }).lean();
  if (originalTxn) {
    await createReversalTransaction(originalTxn, userId, 'Resale seller payout deleted');
  }

  await ResaleSellerPayout.updateOne({ id: payoutId }, { $set: { isDeleted: true, deletedAt: new Date() } });
  return { message: 'Seller payout deleted with reversal' };
};

// Edit a seller payout in place. Daybook is reversed-and-reposted just like
// updateBuyerPayment so account balance + audit trail stay correct. Accepts
// both legacy (paymentDate/paymentMode/referenceNo) and new (payoutDate/
// payoutMode/reference) field names — mirrors addSellerPayout.
const updateSellerPayout = async (payoutId, body, userId) => {
  const existing = await ResaleSellerPayout.findOne(notDeleted({ id: payoutId })).lean();
  if (!existing) return { error: 'Payout not found', status: 404 };
  const deal = await ResaleDeal.findOne({ id: existing.dealId }).lean();
  if (!deal) return { error: 'Deal not found', status: 404 };

  const principalAmount = body.principalAmount !== undefined
    ? parseFloat(body.principalAmount) || 0
    : (existing.principalAmount || 0);
  const profitAmount = body.profitAmount !== undefined
    ? parseFloat(body.profitAmount) || 0
    : (existing.profitAmount || 0);
  const chargesDeducted = body.chargesDeducted !== undefined
    ? parseFloat(body.chargesDeducted) || 0
    : (existing.chargesDeducted || 0);
  // amount can be sent explicitly OR derived from principal+profit-charges,
  // matching what addSellerPayout's caller (the drawer form) computes.
  const amount = body.amount !== undefined
    ? parseFloat(body.amount) || 0
    : Math.max(0, principalAmount + profitAmount - chargesDeducted);
  if (!(amount > 0)) return { error: 'Total payout must be greater than 0', status: 400 };

  let accountId = body.accountId !== undefined ? body.accountId : existing.accountId;
  if (!accountId) {
    const defaultAccount = await Account.findOne({ isDefault: true }).lean();
    accountId = defaultAccount?.id;
  }

  const paymentDate = body.payoutDate || body.paymentDate || existing.paymentDate;
  const paymentMode = body.payoutMode || body.paymentMode || existing.paymentMode || 'Cash';
  const referenceNo = body.reference ?? body.referenceNo ?? existing.referenceNo ?? '';

  const update = {
    amount,
    principalAmount,
    profitAmount,
    chargesDeducted,
    accountId,
    paymentDate,
    payoutDate: paymentDate,
    paymentMode,
    payoutMode: paymentMode,
    referenceNo,
    reference: referenceNo,
    remark: body.remark !== undefined ? body.remark : (existing.remark || ''),
    updatedAt: new Date(),
  };

  await ResaleSellerPayout.updateOne({ id: payoutId }, { $set: update });

  // Reverse the prior daybook OUT entry and post a fresh one with new values.
  const originalTxn = await Transaction.findOne({
    sourceType: 'RESALE_SELLER_PAYOUT',
    sourceId: payoutId,
    isReversal: { $ne: true },
    isReversed: { $ne: true },
  }).lean();
  if (originalTxn) {
    await createReversalTransaction(originalTxn, userId, 'Resale seller payout edited');
  }
  await createTransaction({
    txnDate: paymentDate,
    societyId: deal.societyId,
    accountId,
    direction: 'OUT',
    amount,
    paymentMode,
    partyType: 'Vendor',
    partyName: deal.sellerName,
    sourceType: 'RESALE_SELLER_PAYOUT',
    sourceId: payoutId,
    remark: update.remark || `Resale seller payout - ${deal.sellerName}`,
  }, userId);

  return { ...existing, ...update };
};

module.exports = {
  list, create, remove, closeDeal,
  listBuyerPayments, addBuyerPayment, deleteBuyerPayment, updateBuyerPayment,
  listSellerPayouts, addSellerPayout, deleteSellerPayout, updateSellerPayout,
};
