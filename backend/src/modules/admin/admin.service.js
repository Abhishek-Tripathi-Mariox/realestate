const {
  Sale, Inventory, ExpenseBill, Partner, Customer, Loan, Society,
  Purchase, Vendor, CommissionBill, ResaleDeal, CustomerPayment,
  SalePaymentEntry, PurchasePaymentEntry, ExpensePayment, CommissionPayment,
  PartnerLedgerEntry, ResaleBuyerPayment, ResaleSellerPayout, LoanRepayment,
  AuditLog, User, SocietyPhase, Party,
} = require('../../models');

// One source of truth for every collection that participates in soft-delete /
// trash. Each entry maps:
//   slug          — what the URL filter (?type=) and restore/permanent-delete
//                   route accept. Matches the existing FE filter values where
//                   they exist (sales, inventory, partners, expenseBills,
//                   commissionBills, loans).
//   collection    — the underlying mongo collection name (legacy URL alias).
//   label         — human-readable badge text on the FE.
//   model         — the Mongoose model.
const TRASH_BUCKETS = [
  { slug: 'sales',                 collection: 'sales',                   label: 'Sale',                   model: Sale },
  { slug: 'salePayments',          collection: 'sale_payment_entries',    label: 'Sale Payment',           model: SalePaymentEntry },
  { slug: 'inventory',             collection: 'inventory',               label: 'Inventory',              model: Inventory },
  { slug: 'purchases',             collection: 'purchases',               label: 'Purchase',               model: Purchase },
  { slug: 'purchasePayments',      collection: 'purchase_payment_entries', label: 'Purchase Payment',      model: PurchasePaymentEntry },
  { slug: 'partners',              collection: 'partners',                label: 'Partner',                model: Partner },
  { slug: 'partnerLedgerEntries',  collection: 'partner_ledger_entries',  label: 'Partner Ledger Entry',   model: PartnerLedgerEntry },
  { slug: 'customers',             collection: 'customers',               label: 'Customer',               model: Customer },
  { slug: 'customerPayments',      collection: 'customer_payments',       label: 'Customer Payment',       model: CustomerPayment },
  { slug: 'vendors',               collection: 'vendors',                 label: 'Vendor',                 model: Vendor },
  { slug: 'expenseBills',          collection: 'expense_bills',           label: 'Expense Bill',           model: ExpenseBill },
  { slug: 'expensePayments',       collection: 'expense_payments',        label: 'Expense Payment',        model: ExpensePayment },
  { slug: 'commissionBills',       collection: 'commission_bills',        label: 'Commission Bill',        model: CommissionBill },
  { slug: 'commissionPayments',    collection: 'commission_payments',     label: 'Commission Payment',     model: CommissionPayment },
  { slug: 'resaleDeals',           collection: 'resale_deals',            label: 'Resale Deal',            model: ResaleDeal },
  { slug: 'resaleBuyerPayments',   collection: 'resale_buyer_payments',   label: 'Resale Buyer Payment',   model: ResaleBuyerPayment },
  { slug: 'resaleSellerPayouts',   collection: 'resale_seller_payouts',   label: 'Resale Seller Payout',   model: ResaleSellerPayout },
  { slug: 'parties',               collection: 'parties',                 label: 'Party',                  model: Party },
  { slug: 'loans',                 collection: 'loans',                   label: 'Loan',                   model: Loan },
  { slug: 'loanRepayments',        collection: 'loan_repayments',         label: 'Loan Repayment',         model: LoanRepayment },
];

// Lookup table accepting either slug or collection name → bucket.
const BUCKETS_BY_KEY = TRASH_BUCKETS.reduce((acc, b) => {
  acc[b.slug] = b;
  acc[b.collection] = b;
  return acc;
}, {});

const ORPHAN_CLEANUP_MODELS = [
  Inventory, Purchase, Sale, Partner, Customer, ExpenseBill,
  CommissionBill, ResaleDeal, CustomerPayment, SocietyPhase,
];

const recycleBin = async (query = {}) => {
  // Optional filter — frontend Select sends a slug like "sales" / "expenseBills".
  const requested = query.type && BUCKETS_BY_KEY[query.type] ? [BUCKETS_BY_KEY[query.type]] : TRASH_BUCKETS;

  const records = [];
  const summary = {};

  for (const bucket of requested) {
    const deleted = await bucket.model.find({ isDeleted: true }).sort({ deletedAt: -1 }).lean();
    deleted.forEach(d => {
      records.push({
        ...d,
        _collection: bucket.collection,        // legacy field (older callers)
        _collectionName: bucket.slug,          // FE uses this for restore/delete URLs
        _collectionLabel: bucket.label,        // FE renders as Badge text
      });
    });
    if (deleted.length > 0) summary[bucket.label] = deleted.length;
  }

  // Newest first overall, so the most recently deleted items are on top
  // regardless of which bucket they came from.
  records.sort((a, b) => {
    const ad = a.deletedAt ? new Date(a.deletedAt).getTime() : 0;
    const bd = b.deletedAt ? new Date(b.deletedAt).getTime() : 0;
    return bd - ad;
  });

  return {
    records: records.map(({ _id, ...rest }) => rest),
    summary,
    total: records.length,
  };
};

const restore = async (collection, id) => {
  const bucket = BUCKETS_BY_KEY[collection];
  if (!bucket) return { error: 'Collection not allowed', status: 400 };

  await bucket.model.updateOne(
    { id },
    { $set: { isDeleted: false }, $unset: { deletedAt: '', deletedBy: '', deletedReason: '' } },
  );
  return { message: 'Record restored' };
};

const auditLogs = async (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.max(1, Math.min(200, parseInt(query.limit) || 50));
  const skip = (page - 1) * limit;

  const filter = {};
  if (query.entityType && query.entityType !== 'all') filter.entityType = query.entityType;
  if (query.action && query.action !== 'all') filter.action = query.action;
  if (query.userId && query.userId !== 'all') filter.userId = query.userId;

  if (query.startDate || query.endDate) {
    filter.timestamp = {};
    if (query.startDate) filter.timestamp.$gte = new Date(query.startDate);
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setHours(23, 59, 59, 999);
      filter.timestamp.$lte = end;
    }
  }

  if (query.q && String(query.q).trim()) {
    const rx = new RegExp(String(query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { entityType: rx },
      { entityId: rx },
      { reason: rx },
      { userName: rx },
    ];
  }

  const total = await AuditLog.countDocuments(filter);
  const logs = await AuditLog
    .find(filter)
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const userIds = [...new Set(logs.map(l => l.userId).filter(Boolean))];
  let userMap = {};
  if (userIds.length > 0) {
    const users = await User.find({ id: { $in: userIds } }).lean();
    users.forEach(u => { userMap[u.id] = { name: u.name, email: u.email, role: u.role }; });
  }

  const enriched = logs.map(({ _id, ...rest }) => ({
    ...rest,
    userName: rest.userName || userMap[rest.userId]?.name || 'System',
    userEmail: userMap[rest.userId]?.email || null,
  }));

  const entityTypes = (await AuditLog.distinct('entityType')).filter(Boolean).sort();
  const actions = (await AuditLog.distinct('action')).filter(Boolean).sort();

  return {
    logs: enriched,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    filters: { entityTypes, actions },
  };
};

const permanentDelete = async (collection, id) => {
  const bucket = BUCKETS_BY_KEY[collection];
  if (!bucket) return { error: 'Collection not allowed', status: 400 };
  const result = await bucket.model.deleteOne({ id });
  if (result.deletedCount === 0) return { error: 'Record not found', status: 404 };
  return { message: 'Record permanently deleted' };
};

const cleanupOrphans = async () => {
  const societyIds = (await Society.find({}, { id: 1 }).lean()).map(s => s.id);
  let removed = 0;

  for (const Model of ORPHAN_CLEANUP_MODELS) {
    const result = await Model.updateMany(
      { societyId: { $nin: [...societyIds, null] }, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, deletedAt: new Date(), deletedReason: 'Orphan cleanup' } },
    );
    removed += result.modifiedCount || 0;
  }

  return { message: `Cleanup complete. Marked ${removed} orphan record(s) as deleted.`, removed };
};

module.exports = { recycleBin, restore, auditLogs, permanentDelete, cleanupOrphans };
