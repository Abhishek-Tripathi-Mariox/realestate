const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { createTransaction, createReversalTransaction } = require('../../utils/transactions');
const {
  Sale, SalePaymentEntry, Inventory, Customer, Account, Transaction,
} = require('../../models');

const stripId = ({ _id, ...rest }) => rest;

const listForSociety = async (societyId) => {
  const sales = await Sale.find(notDeleted({ societyId })).lean();

  const enrichedSales = await Promise.all(sales.map(async (sale) => {
    const inventory = await Inventory.findOne({ id: sale.inventoryId }).lean();
    const customer = sale.customerId ? await Customer.findOne({ id: sale.customerId }).lean() : null;
    const totalPaid = sale.amountPaid || 0;
    return {
      ...sale,
      inventoryNumber: inventory?.inventoryNumber || 'N/A',
      inventoryType: inventory?.type || 'N/A',
      phase: inventory?.phase || 'N/A',
      customerName: customer?.name || sale.buyerName || 'N/A',
      customerPhone: customer?.phone || sale.buyerContact || '',
      totalPaid,
      balance: (sale.finalAmount || 0) - totalPaid,
    };
  }));

  const summary = {
    totalSales: enrichedSales.length,
    totalAmount: enrichedSales.reduce((sum, s) => sum + (s.finalAmount || 0), 0),
    totalReceived: enrichedSales.reduce((sum, s) => sum + (s.amountPaid || 0), 0),
    totalPending: enrichedSales.reduce((sum, s) => sum + ((s.finalAmount || 0) - (s.amountPaid || 0)), 0),
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

  const inventory = sale.inventoryId
    ? await Inventory.findOne({ id: sale.inventoryId }).lean()
    : null;
  const customer = sale.customerId
    ? await Customer.findOne({ id: sale.customerId }).lean()
    : null;

  const paymentEntries = await SalePaymentEntry
    .find(notDeleted({
      saleId: id,
      $or: [{ entryType: 'SALE_PAYMENT' }, { entryType: { $exists: false } }],
    }))
    .sort({ paymentDate: -1 })
    .lean();

  const payments = await Promise.all(paymentEntries.map(async (p) => {
    const account = p.accountId ? await Account.findOne({ id: p.accountId }).lean() : null;
    return { ...stripId(p), accountName: account?.name || '-' };
  }));

  const totalPaid = sale.amountPaid || 0;
  const balance = (sale.finalAmount || 0) - totalPaid;

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
  const updates = { ...body, updatedAt: new Date() };
  const incomingPrice = body.dealPrice ?? body.agreedPrice;
  if (incomingPrice !== undefined || body.discount !== undefined) {
    const sale = await Sale.findOne({ id }).lean();
    const dealPrice = Number(incomingPrice ?? sale.dealPrice ?? sale.agreedPrice) || 0;
    const discount = Number(body.discount ?? sale.discount) || 0;
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
  if (sale) {
    await Inventory.updateOne(
      { id: sale.inventoryId },
      { $set: { status: 'Available', soldDate: null } },
    );
  }
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

  const newAmountPaid = (sale.amountPaid || 0) + amount;
  const paymentStatus = newAmountPaid >= sale.finalAmount ? 'Paid' : 'Partial';
  await Sale.updateOne({ id: saleId }, { $set: { amountPaid: newAmountPaid, paymentStatus } });

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
  const entries = await SalePaymentEntry
    .find(notDeleted({ saleId }))
    .sort({ paymentDate: -1 })
    .lean();
  return { entries: entries.map(stripId) };
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

  if (entryType === 'SALE_PAYMENT') {
    const newAmountPaid = (sale.amountPaid || 0) + amount;
    const paymentStatus = newAmountPaid >= sale.finalAmount ? 'Paid' : 'Partial';
    await Sale.updateOne({ id: saleId }, { $set: { amountPaid: newAmountPaid, paymentStatus } });
  }

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

  if ((entry.entryType || 'SALE_PAYMENT') === 'SALE_PAYMENT') {
    const sale = await Sale.findOne({ id: entry.saleId }).lean();
    if (sale) {
      const newAmountPaid = Math.max(0, (sale.amountPaid || 0) - (entry.amount || 0));
      const paymentStatus = newAmountPaid <= 0 ? 'Pending' : (newAmountPaid >= sale.finalAmount ? 'Paid' : 'Partial');
      await Sale.updateOne({ id: entry.saleId }, { $set: { amountPaid: newAmountPaid, paymentStatus } });
    }
  }

  await SalePaymentEntry.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  return { message: 'Sale ledger entry deleted' };
};

const listUnassigned = async (societyId) => {
  const filter = notDeleted({ $or: [{ customerId: null }, { customerId: '' }, { customerId: { $exists: false } }] });
  if (societyId) filter.societyId = societyId;
  const sales = await Sale.find(filter).lean();
  const enriched = await Promise.all(sales.map(async (s) => {
    const inventory = s.inventoryId ? await Inventory.findOne({ id: s.inventoryId }).lean() : null;
    return { ...s, inventoryNumber: inventory?.inventoryNumber || 'N/A' };
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
