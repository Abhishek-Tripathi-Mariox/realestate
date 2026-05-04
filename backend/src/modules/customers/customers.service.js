const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const {
  Customer, Sale, CustomerPayment, PaymentAllocation, Inventory,
} = require('../../models');

const stripId = ({ _id, ...rest }) => rest;

const list = async (query) => {
  const filter = notDeleted();
  if (query.societyId) filter.societyId = query.societyId;
  const customers = await Customer.find(filter).lean();
  return customers.map(stripId);
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
    const allocations = await PaymentAllocation.find({ saleId: s.id }).lean();
    const allocatedAmount = allocations.reduce((sum, a) => sum + (a.amount || 0), 0);
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
  const allocations = paymentIds.length
    ? await PaymentAllocation.find({ paymentId: { $in: paymentIds } }).lean()
    : [];

  const inventoryIds = [...new Set(sales.map(s => s.inventoryId).filter(Boolean))];
  const inventories = inventoryIds.length
    ? await Inventory.find({ id: { $in: inventoryIds } }).lean()
    : [];
  const inventoryById = Object.fromEntries(inventories.map(i => [i.id, i]));
  const saleById = Object.fromEntries(sales.map(s => [s.id, s]));

  const saleEntries = sales.map(s => {
    const allocatedForSale = allocations.filter(a => a.saleId === s.id).reduce((sum, a) => sum + (a.amount || 0), 0);
    const inv = s.inventoryId ? inventoryById[s.inventoryId] : null;
    return {
      id: `sale-${s.id}`,
      date: s.saleDate || s.createdAt,
      type: 'SALE',
      description: `Sale - ${inv?.inventoryNumber || 'Unit'}`,
      debit: s.finalAmount || 0,
      credit: 0,
      pendingBalance: (s.finalAmount || 0) - allocatedForSale,
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
      type: 'PAYMENT',
      description: `Payment via ${p.paymentMode || 'Cash'}${p.referenceNo ? ` (${p.referenceNo})` : ''}`,
      debit: 0,
      credit: p.amount || 0,
      allocationDetails,
      status,
    };
  });

  const ledger = [...saleEntries, ...paymentEntries]
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  let running = 0;
  for (const e of ledger) {
    running += (e.debit || 0) - (e.credit || 0);
    e.runningBalance = running;
  }

  const totalSales = sales.reduce((s, x) => s + (x.finalAmount || 0), 0);
  const totalPayments = payments.reduce((s, x) => s + (x.amount || 0), 0);
  const totalAllocated = allocations.reduce((s, x) => s + (x.amount || 0), 0);
  const unallocatedPayments = payments.reduce((s, x) => s + (x.unallocatedAmount != null ? x.unallocatedAmount : 0), 0);

  return {
    summary: {
      totalSales,
      totalPayments,
      totalAllocated,
      outstandingBalance: totalSales - totalAllocated,
      unallocatedPayments,
    },
    ledger,
  };
};

module.exports = { list, create, update, remove, listSales, ledger };
