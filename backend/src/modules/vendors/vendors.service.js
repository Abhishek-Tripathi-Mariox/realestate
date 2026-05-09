const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { pick } = require('../../utils/pick');
const { Vendor, Transaction, ExpenseBill, CommissionBill } = require('../../models');

const VENDOR_UPDATABLE = ['name', 'type', 'phone', 'address', 'notes'];

const stripId = ({ _id, ...rest }) => rest;

const list = async (query) => {
  const filter = notDeleted();
  if (query.societyId) filter.societyId = query.societyId;
  const vendors = await Vendor.find(filter).lean();
  if (vendors.length === 0) return [];

  // Pull non-deleted bills bucketed by vendor — but scope to the society
  // when the caller passed one, otherwise the entire bills collection
  // gets loaded into memory just to enrich a per-society vendor list.
  const billFilter = query.societyId ? { societyId: query.societyId } : {};
  const [expenseBills, commissionBills] = await Promise.all([
    ExpenseBill
      .find(notDeleted(billFilter), { vendorId: 1, vendorName: 1, amount: 1, billAmount: 1, paidAmount: 1 })
      .lean(),
    CommissionBill
      .find(notDeleted(billFilter), { brokerVendorId: 1, brokerName: 1, amount: 1, commissionAmount: 1, paidAmount: 1 })
      .lean(),
  ]);

  const totals = {};
  const bump = (key, paid, amount) => {
    if (!key) return;
    const t = totals[key] || { totalPaid: 0, totalDue: 0 };
    t.totalPaid += paid;
    t.totalDue += Math.max(0, amount - paid);
    totals[key] = t;
  };
  for (const b of expenseBills) {
    const paid = b.paidAmount || 0;
    const amount = b.amount || b.billAmount || 0;
    if (b.vendorId) bump(`id:${b.vendorId}`, paid, amount);
    if (b.vendorName) bump(`name:${b.vendorName}`, paid, amount);
  }
  for (const b of commissionBills) {
    const paid = b.paidAmount || 0;
    const amount = b.amount || b.commissionAmount || 0;
    if (b.brokerVendorId) bump(`id:${b.brokerVendorId}`, paid, amount);
    if (b.brokerName) bump(`name:${b.brokerName}`, paid, amount);
  }

  return vendors.map((v) => {
    const byId = totals[`id:${v.id}`];
    const byName = byId ? null : totals[`name:${v.name}`];
    const t = byId || byName || { totalPaid: 0, totalDue: 0 };
    return { ...stripId(v), totalPaid: t.totalPaid, totalDue: t.totalDue };
  });
};

const create = async (body) => {
  const vendor = {
    id: uuidv4(),
    societyId: body.societyId,
    name: body.name,
    type: body.type,
    phone: body.phone || '',
    address: body.address || '',
    notes: body.notes || '',
    createdAt: new Date(),
  };
  await Vendor.create(vendor);
  return vendor;
};

const update = async (id, body) => {
  const patch = { ...pick(body, VENDOR_UPDATABLE), updatedAt: new Date() };
  await Vendor.updateOne({ id }, { $set: patch });
  const updated = await Vendor.findOne({ id }).lean();
  if (!updated) return null;
  return stripId(updated);
};

const remove = async (id) => {
  const vendor = await Vendor.findOne({ id }).lean();
  if (!vendor) return { error: 'Vendor not found', status: 404 };

  // Block delete when there are unpaid bills — those represent live money
  // owed; the user should settle or void them explicitly first.
  const unpaidExpense = await ExpenseBill.countDocuments({
    vendorId: id,
    isDeleted: { $ne: true },
    $expr: { $gt: [{ $ifNull: ['$amount', 0] }, { $ifNull: ['$paidAmount', 0] }] },
  });
  const unpaidCommission = await CommissionBill.countDocuments({
    brokerVendorId: id,
    isDeleted: { $ne: true },
    $expr: { $gt: [{ $ifNull: ['$amount', 0] }, { $ifNull: ['$paidAmount', 0] }] },
  });
  if (unpaidExpense + unpaidCommission > 0) {
    return {
      error: `Vendor has ${unpaidExpense + unpaidCommission} unpaid bill(s). Settle or delete those first.`,
      status: 409,
    };
  }

  // Cascade soft-delete fully-paid bills (payments stay reversible via
  // trash). The aliveTransactions filter drops their daybook OUT entries
  // automatically once the bills are flagged.
  const stamp = { isDeleted: true, deletedAt: new Date(), deletedReason: 'Vendor deleted' };
  await ExpenseBill.updateMany({ vendorId: id, isDeleted: { $ne: true } }, { $set: stamp });
  await CommissionBill.updateMany({ brokerVendorId: id, isDeleted: { $ne: true } }, { $set: stamp });
  await Vendor.updateOne({ id }, { $set: stamp });
  return { message: 'Vendor and bills cascaded to trash' };
};

const ledger = async (vendorId) => {
  const vendor = await Vendor.findOne({ id: vendorId }).lean();
  if (!vendor) return { error: 'Vendor not found', status: 404 };

  const txns = await Transaction.find({
    partyType: 'Vendor',
    partyName: vendor.name,
    direction: 'OUT',
    isReversal: { $ne: true },
  }).sort({ txnDate: -1 }).lean();

  return txns.map(t => ({
    id: t.id,
    date: t.txnDate || t.createdAt,
    source: t.sourceType === 'COMMISSION_PAYMENT' ? 'COMMISSION' : 'EXPENSE',
    reference: t.referenceNo || t.sourceId || '',
    amount: t.amount || 0,
    paymentMode: t.paymentMode || 'Cash',
    remark: t.remark || '',
  }));
};

module.exports = { list, create, update, remove, ledger };
