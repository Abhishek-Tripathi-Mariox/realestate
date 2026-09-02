const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { pick } = require('../../utils/pick');
const {
  Vendor, Transaction, ExpenseBill, ExpensePayment, CommissionBill,
  VendorAdvance, VendorAdvanceWork,
} = require('../../models');

const VENDOR_UPDATABLE = ['name', 'type', 'phone', 'address', 'notes'];

const stripId = ({ _id, ...rest }) => rest;

const list = async (query) => {
  const filter = notDeleted();
  // `scope=company` returns only company-level vendors (societyId
  // null/missing/empty). Used by the dedicated Company Vendor Ledger tab.
  if (query.scope === 'company') {
    Object.assign(filter, {
      $or: [
        { societyId: null },
        { societyId: { $exists: false } },
        { societyId: '' },
      ],
    });
  } else if (query.societyId) {
    filter.societyId = query.societyId;
  }
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

// Full vendor ledger — bills + payments merged, running balance computed
// server-side over the whole dataset, then filtered/paginated. Running
// balance MUST be computed before filtering so each row's balance reflects
// the vendor's true cumulative debt at that entry's date (matches what the
// old client-side implementation did).
const ledgerEntries = async (vendorId, query) => {
  const vendor = await Vendor.findOne({ id: vendorId }).lean();
  if (!vendor) return { error: 'Vendor not found', status: 404 };

  // Scope: company-level (societyId null) vs a specific society. Mirrors the
  // /expense-bills scoping in expenses.service.js listBills.
  const billFilter = { vendorId };
  const scope = (query.scope || '').toUpperCase();
  if (scope === 'COMPANY') {
    billFilter.societyId = null;
  } else if (query.societyId) {
    billFilter.societyId = query.societyId;
  }

  const bills = await ExpenseBill.find(notDeleted(billFilter)).lean();
  const billIds = bills.map((b) => b.id);
  const payments = billIds.length > 0
    ? await ExpensePayment.find(notDeleted({ billId: { $in: billIds } })).lean()
    : [];

  // Advances are the mirror of bills — money paid first, then work logged
  // against them. Their creation posts a daybook OUT, their work items are
  // pure ledger consumption (no money moves). Both feed the same running
  // balance so the vendor's true position stays right.
  const advanceFilter = { vendorId };
  if (scope === 'COMPANY') advanceFilter.societyId = null;
  else if (query.societyId) advanceFilter.societyId = query.societyId;
  const advances = await VendorAdvance.find(notDeleted(advanceFilter)).lean();
  const advanceIds = advances.map((a) => a.id);
  const advanceWorks = advanceIds.length > 0
    ? await VendorAdvanceWork.find(notDeleted({ advanceId: { $in: advanceIds } })).lean()
    : [];

  const workEntries = bills.map((b) => {
    const categoryName = b.category || '';
    const isLabour = /labour/i.test(categoryName);
    const amount = b.amount || 0;
    return {
      id: `work-${b.id}`,
      sourceId: b.id,
      raw: {
        ...stripId(b),
        categoryName,
        totalPaid: b.paidAmount || 0,
        balance: Math.max(0, amount - (b.paidAmount || 0)),
      },
      date: b.billDate || b.createdAt,
      createdAt: b.createdAt || b.billDate,
      type: 'WORK',
      subType: isLabour ? 'LABOUR' : 'WORK',
      description: b.description || categoryName || (isLabour ? 'Labour' : 'Work'),
      categoryName,
      workValue: amount,
      paymentAmount: 0,
      reference: '',
    };
  });

  const paymentEntries = payments.map((p) => {
    const isWithdrawal = p.type === 'WITHDRAWAL';
    return {
      id: p.id,
      sourceId: p.id,
      raw: { ...stripId(p), billId: p.billId },
      billId: p.billId,
      date: p.paymentDate || p.createdAt,
      createdAt: p.createdAt || p.paymentDate,
      type: isWithdrawal ? 'WITHDRAWAL' : 'PAYMENT',
      subType: isWithdrawal ? 'WITHDRAWAL' : 'PAYMENT',
      description: p.remark || (isWithdrawal ? 'Withdrawal' : 'Payment made'),
      categoryName: '',
      workValue: 0,
      // Withdrawals show as negative payment so running balance grows back —
      // the vendor received less net, so we owe more.
      paymentAmount: isWithdrawal ? -(p.amount || 0) : (p.amount || 0),
      paymentMode: p.paymentMode || 'Cash',
      reference: p.referenceNo || '',
    };
  });

  // Advance = payment out with no work (workValue=0, paymentAmount=+amount).
  // Balance drops (goes negative in the vendor-owes-us direction) — matches
  // the reality that we've pre-paid the vendor.
  const advanceEntries = advances.map((a) => ({
    id: `advance-${a.id}`,
    sourceId: a.id,
    raw: {
      ...stripId(a),
      workedAmount: advanceWorks
        .filter((w) => w.advanceId === a.id)
        .reduce((s, w) => s + (w.amount || 0), 0),
    },
    date: a.advanceDate || a.createdAt,
    createdAt: a.createdAt || a.advanceDate,
    type: 'ADVANCE',
    subType: 'ADVANCE',
    description: a.remark || 'Advance payment',
    categoryName: '',
    workValue: 0,
    paymentAmount: a.amount || 0,
    paymentMode: a.paymentMode || 'Cash',
    reference: a.referenceNo || '',
  }));

  // Advance work = work value logged against an advance (workValue=+amount,
  // paymentAmount=0). Balance rises back toward zero as the advance is
  // consumed.
  const advanceWorkEntries = advanceWorks.map((w) => ({
    id: `advance-work-${w.id}`,
    sourceId: w.id,
    raw: { ...stripId(w) },
    advanceId: w.advanceId,
    date: w.workDate || w.createdAt,
    createdAt: w.createdAt || w.workDate,
    type: 'ADVANCE_WORK',
    subType: 'ADVANCE_WORK',
    description: w.description || w.category || 'Work against advance',
    categoryName: w.category || '',
    workValue: w.amount || 0,
    paymentAmount: 0,
    reference: '',
  }));

  const merged = [...workEntries, ...paymentEntries, ...advanceEntries, ...advanceWorkEntries].sort((a, b) => {
    const da = new Date(a.date).getTime() || 0;
    const db = new Date(b.date).getTime() || 0;
    if (da !== db) return da - db;
    const ca = new Date(a.createdAt).getTime() || 0;
    const cb = new Date(b.createdAt).getTime() || 0;
    return ca - cb;
  });
  let running = 0;
  const withBalance = merged.map((e) => {
    running += (e.workValue || 0) - (e.paymentAmount || 0);
    return { ...e, amount: e.paymentAmount, balance: running };
  }).reverse();

  const filterType = query.filterType || 'all';
  const filterFrom = query.filterFrom || '';
  const filterTo = query.filterTo || '';
  const search = (query.search || '').toLowerCase();
  const filtered = withBalance.filter((e) => {
    if (filterType !== 'all') {
      if (filterType === 'LABOUR') {
        if (e.subType !== 'LABOUR') return false;
      } else if (filterType === 'WORK') {
        if (e.type !== 'WORK' || e.subType === 'LABOUR') return false;
      } else if (filterType === 'ADVANCE') {
        if (e.type !== 'ADVANCE' && e.type !== 'ADVANCE_WORK') return false;
      } else if (e.type !== filterType) {
        return false;
      }
    }
    if (filterFrom && new Date(e.date) < new Date(filterFrom)) return false;
    if (filterTo && new Date(e.date) > new Date(filterTo)) return false;
    if (search) {
      const hay = `${e.description || ''} ${e.categoryName || ''} ${e.reference || ''} ${e.paymentMode || ''}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.max(1, parseInt(query.pageSize, 10) || 10);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIdx = (page - 1) * pageSize;
  const entries = filtered.slice(startIdx, startIdx + pageSize);

  return { entries, total, totalPages, page, pageSize };
};

module.exports = { list, create, update, remove, ledger, ledgerEntries };
