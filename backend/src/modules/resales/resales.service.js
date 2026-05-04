const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { createTransaction, createReversalTransaction } = require('../../utils/transactions');
const {
  ResaleDeal, ResaleBuyerPayment, ResaleSellerPayout, Account, Transaction,
  Inventory, InventoryOwnershipHistory,
} = require('../../models');

const stripId = ({ _id, ...rest }) => rest;

const list = async (query) => {
  const filter = notDeleted();
  if (query.societyId) filter.societyId = query.societyId;
  const deals = await ResaleDeal.find(filter).lean();
  return deals.map(stripId);
};

const create = async (body) => {
  const resalePrice = Number(body.resalePrice) || 0;
  const transferCharges = Number(body.transferCharges) || 0;
  const brokerage = Number(body.brokerage) || 0;
  const otherCharges = Number(body.otherCharges) || 0;
  // companyCommission defaults to total of all charge fields when not given.
  const companyCommission = Number(body.companyCommission ?? (transferCharges + brokerage + otherCharges)) || 0;

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
    dealDate: body.dealDate || null,
    notes: body.notes || '',
    status: 'Active',
    createdAt: new Date(),
  };
  await ResaleDeal.create(deal);
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
  return payments.map(stripId);
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

  const amount = parseFloat(body.amount) || 0;
  const payout = {
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

module.exports = {
  list, create, remove, closeDeal,
  listBuyerPayments, addBuyerPayment, deleteBuyerPayment,
  listSellerPayouts, addSellerPayout, deleteSellerPayout,
};
