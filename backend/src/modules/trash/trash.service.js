const {
  Sale, Inventory, ExpenseBill, Partner, Customer, Loan,
  Purchase, Vendor, CommissionBill, MarginBill, ResaleDeal, CustomerPayment,
  SalePaymentEntry, PurchasePaymentEntry, ExpensePayment, CommissionPayment,
  MarginPayment,
  PartnerLedgerEntry, ResaleBuyerPayment, ResaleSellerPayout, LoanRepayment,
  Party, Society, SocietyPhase, Transaction,
} = require('../../models');

// One source of truth for every collection that participates in soft-delete /
// trash. Each entry maps:
//   slug          — what the URL filter (?type=) and restore/purge route accept.
//                   Matches the existing FE filter values where they exist.
//   collection    — legacy URL alias (the underlying mongo collection name).
//   label         — human-readable badge text on the FE.
//   model         — the Mongoose model.
const TRASH_BUCKETS = [
  { slug: 'societies',             collection: 'societies',                label: 'Society',              model: Society },
  { slug: 'societyPhases',         collection: 'society_phases',           label: 'Society Phase',        model: SocietyPhase },
  { slug: 'sales',                 collection: 'sales',                    label: 'Sale',                 model: Sale },
  { slug: 'salePayments',          collection: 'sale_payment_entries',     label: 'Sale Payment',         model: SalePaymentEntry },
  { slug: 'inventory',             collection: 'inventory',                label: 'Inventory',            model: Inventory },
  { slug: 'purchases',             collection: 'purchases',                label: 'Purchase',             model: Purchase },
  { slug: 'purchasePayments',      collection: 'purchase_payment_entries', label: 'Purchase Payment',     model: PurchasePaymentEntry },
  { slug: 'partners',              collection: 'partners',                 label: 'Partner',              model: Partner },
  { slug: 'partnerLedgerEntries',  collection: 'partner_ledger_entries',   label: 'Partner Ledger Entry', model: PartnerLedgerEntry },
  { slug: 'customers',             collection: 'customers',                label: 'Customer',             model: Customer },
  { slug: 'customerPayments',      collection: 'customer_payments',        label: 'Customer Payment',     model: CustomerPayment },
  { slug: 'vendors',               collection: 'vendors',                  label: 'Vendor',               model: Vendor },
  { slug: 'expenseBills',          collection: 'expense_bills',            label: 'Expense Bill',         model: ExpenseBill },
  { slug: 'expensePayments',       collection: 'expense_payments',         label: 'Expense Payment',      model: ExpensePayment },
  { slug: 'commissionBills',       collection: 'commission_bills',         label: 'Commission Bill',      model: CommissionBill },
  { slug: 'commissionPayments',    collection: 'commission_payments',      label: 'Commission Payment',   model: CommissionPayment },
  { slug: 'marginBills',           collection: 'margin_bills',             label: 'Margin Bill',          model: MarginBill },
  { slug: 'marginPayments',        collection: 'margin_payments',          label: 'Margin Payment',       model: MarginPayment },
  { slug: 'resaleDeals',           collection: 'resale_deals',             label: 'Resale Deal',          model: ResaleDeal },
  { slug: 'resaleBuyerPayments',   collection: 'resale_buyer_payments',    label: 'Resale Buyer Payment', model: ResaleBuyerPayment },
  { slug: 'resaleSellerPayouts',   collection: 'resale_seller_payouts',    label: 'Resale Seller Payout', model: ResaleSellerPayout },
  { slug: 'parties',               collection: 'parties',                  label: 'Party',                model: Party },
  { slug: 'loans',                 collection: 'loans',                    label: 'Loan',                 model: Loan },
  { slug: 'loanRepayments',        collection: 'loan_repayments',          label: 'Loan Repayment',       model: LoanRepayment },
];

// Lookup table accepting either slug or collection name → bucket. Both forms
// are accepted so the legacy /api/admin/restore/:collection/:id URLs (which
// the frontend recycle-bin dialog uses) keep working alongside the cleaner
// /api/trash/:type/:id form.
const BUCKETS_BY_KEY = TRASH_BUCKETS.reduce((acc, b) => {
  acc[b.slug] = b;
  acc[b.collection] = b;
  return acc;
}, {});

// For each bucket, the parent record(s) that must be alive before the row
// can be restored. Without this guard a Sale could be restored after its
// Society was permanently purged, leaving the Sale referencing a missing
// parent (broken listings, orphan daybook entries, etc.). Each entry:
//   field  — the foreign-key field on this bucket's row
//   parent — the slug of the parent bucket (used to resolve the model)
//   label  — friendly name shown in the error message
const PARENT_REFS = {
  societyPhases:        [{ field: 'societyId', parent: 'societies',       label: 'Society' }],
  sales:                [{ field: 'societyId', parent: 'societies',       label: 'Society' }],
  inventory:            [{ field: 'societyId', parent: 'societies',       label: 'Society' }],
  purchases:            [{ field: 'societyId', parent: 'societies',       label: 'Society' }],
  partners:             [{ field: 'societyId', parent: 'societies',       label: 'Society' }],
  vendors:              [{ field: 'societyId', parent: 'societies',       label: 'Society' }],
  customers:            [{ field: 'societyId', parent: 'societies',       label: 'Society' }],

  salePayments:         [{ field: 'saleId',       parent: 'sales',           label: 'Sale' }],
  purchasePayments:     [{ field: 'purchaseId',   parent: 'purchases',       label: 'Purchase' }],
  expensePayments:      [{ field: 'billId',       parent: 'expenseBills',    label: 'Expense Bill' }],
  commissionPayments:   [{ field: 'billId',       parent: 'commissionBills', label: 'Commission Bill' }],
  marginPayments:       [{ field: 'billId',       parent: 'marginBills',     label: 'Margin Bill' }],
  marginBills:          [{ field: 'resaleDealId', parent: 'resaleDeals',     label: 'Resale Deal' }],
  customerPayments:     [{ field: 'customerId',   parent: 'customers',       label: 'Customer' }],
  partnerLedgerEntries: [{ field: 'partnerId',    parent: 'partners',        label: 'Partner' }],
  loans:                [{ field: 'partyId',      parent: 'parties',         label: 'Party' }],
  loanRepayments:       [{ field: 'loanId',       parent: 'loans',           label: 'Loan' }],
  resaleBuyerPayments:  [{ field: 'dealId',       parent: 'resaleDeals',     label: 'Resale Deal' }],
  resaleSellerPayouts:  [{ field: 'dealId',       parent: 'resaleDeals',     label: 'Resale Deal' }],
  expenseBills:         [{ field: 'vendorId',     parent: 'vendors',         label: 'Vendor' }],
  commissionBills:      [{ field: 'brokerVendorId', parent: 'vendors',       label: 'Broker Vendor' }],
};

// Verify every required parent for a record is still alive (not in trash).
// Returns null when all parents are alive (or when no parent ref applies),
// or { error, status } when one is missing — the restore caller forwards
// that to the controller as a 409.
const checkParentsAlive = async (slug, doc) => {
  const refs = PARENT_REFS[slug];
  if (!refs || !doc) return null;
  for (const ref of refs) {
    const fkValue = doc[ref.field];
    if (!fkValue) continue; // optional FK, nothing to check
    const parentBucket = BUCKETS_BY_KEY[ref.parent];
    if (!parentBucket) continue;
    const parentAlive = await parentBucket.model.findOne({
      id: fkValue,
      isDeleted: { $ne: true },
    }).lean();
    if (!parentAlive) {
      return {
        error: `Cannot restore: parent ${ref.label} is in trash or permanently deleted. Restore the ${ref.label} first.`,
        status: 409,
      };
    }
  }
  return null;
};

const stripId = ({ _id, ...rest }) => rest;

// List every soft-deleted record across all buckets, newest first. Pass
// `query.type` (slug or collection name) to scope the listing.
const list = async (query = {}) => {
  const requested = query.type && BUCKETS_BY_KEY[query.type]
    ? [BUCKETS_BY_KEY[query.type]]
    : TRASH_BUCKETS;

  const records = [];
  const summary = {};

  for (const bucket of requested) {
    const deleted = await bucket.model.find({ isDeleted: true }).sort({ deletedAt: -1 }).lean();
    deleted.forEach((d) => {
      records.push({
        ...d,
        _collection: bucket.collection,
        _collectionName: bucket.slug,
        _collectionLabel: bucket.label,
      });
    });
    if (deleted.length > 0) summary[bucket.label] = deleted.length;
  }

  records.sort((a, b) => {
    const ad = a.deletedAt ? new Date(a.deletedAt).getTime() : 0;
    const bd = b.deletedAt ? new Date(b.deletedAt).getTime() : 0;
    return bd - ad;
  });

  return {
    records: records.map(stripId),
    summary,
    total: records.length,
    types: TRASH_BUCKETS.map(({ slug, label }) => ({ slug, label })),
  };
};

const RESTORE_UPDATE = {
  $set: { isDeleted: false },
  $unset: { deletedAt: '', deletedBy: '', deletedReason: '' },
};

// When a society is restored, bring back every child that was soft-deleted as
// part of the same cascade (i.e. tagged with deletedReason 'Society deleted'
// in societies.service.remove). Matching on societyId + deletedReason ensures
// children that were independently trashed earlier stay in trash.
const cascadeRestoreSocietyChildren = async (societyId) => {
  const filter = { societyId, isDeleted: true, deletedReason: 'Society deleted' };
  const childModels = [Sale, Purchase, ExpenseBill, Vendor, Inventory, Partner, SocietyPhase];

  const restoredSales = await Sale.find(filter, { id: 1 }).lean();
  const saleIds = restoredSales.map(s => s.id);

  let restored = 0;
  for (const Model of childModels) {
    const result = await Model.updateMany(filter, RESTORE_UPDATE);
    restored += result.modifiedCount || 0;
  }

  if (saleIds.length > 0) {
    const result = await SalePaymentEntry.updateMany(
      { saleId: { $in: saleIds }, isDeleted: true, deletedReason: 'Society deleted' },
      RESTORE_UPDATE,
    );
    restored += result.modifiedCount || 0;
  }

  // Un-void the daybook transactions that society.remove voided so the
  // restored society's history reappears in the daybook.
  const txnResult = await Transaction.updateMany(
    { societyId, isVoided: true, voidedReason: 'Society deleted' },
    {
      $set: { isVoided: false },
      $unset: { voidedAt: '', voidedReason: '' },
    },
  );
  restored += txnResult.modifiedCount || 0;

  return restored;
};

const restore = async (typeKey, id) => {
  const bucket = BUCKETS_BY_KEY[typeKey];
  if (!bucket) return { error: 'Unknown trash type', status: 400 };

  // Pre-flight: load the trashed doc and verify every required parent is
  // still alive. Without this guard a Sale could be restored after its
  // Society was permanently purged, leaving an orphan referencing a
  // missing parent. Skip for societies (top of the chain — no parents).
  const trashedDoc = await bucket.model.findOne({ id }).lean();
  if (!trashedDoc) return { error: 'Record not found', status: 404 };
  if (bucket.slug !== 'societies') {
    const parentErr = await checkParentsAlive(bucket.slug, trashedDoc);
    if (parentErr) return parentErr;
  }

  const result = await bucket.model.updateOne({ id }, RESTORE_UPDATE);
  if (result.matchedCount === 0) return { error: 'Record not found', status: 404 };

  if (bucket.slug === 'societies') {
    const cascadeCount = await cascadeRestoreSocietyChildren(id);
    return { message: `Society restored along with ${cascadeCount} related record(s)` };
  }

  // When a sale is restored, mark its inventory unit as Sold again so the
  // unit doesn't show up as Available even though it now has an active sale
  // pointing at it.
  if (bucket.slug === 'sales') {
    const sale = await Sale.findOne({ id }).lean();
    if (sale && sale.inventoryId && sale.status !== 'TRANSFERRED') {
      await Inventory.updateOne(
        { id: sale.inventoryId },
        { $set: { status: 'Sold', soldDate: sale.saleDate || new Date().toISOString().slice(0, 10) } },
      );
    }
  }

  return { message: 'Record restored' };
};

const purge = async (typeKey, id) => {
  const bucket = BUCKETS_BY_KEY[typeKey];
  if (!bucket) return { error: 'Unknown trash type', status: 400 };

  const result = await bucket.model.deleteOne({ id, isDeleted: true });
  if (result.deletedCount === 0) return { error: 'Record not found in trash', status: 404 };
  return { message: 'Record permanently deleted' };
};

// Bulk: empty the entire trash (or one bucket if `typeKey` provided).
const empty = async (typeKey) => {
  const buckets = typeKey
    ? (BUCKETS_BY_KEY[typeKey] ? [BUCKETS_BY_KEY[typeKey]] : null)
    : TRASH_BUCKETS;
  if (!buckets) return { error: 'Unknown trash type', status: 400 };

  let removed = 0;
  for (const bucket of buckets) {
    const result = await bucket.model.deleteMany({ isDeleted: true });
    removed += result.deletedCount || 0;
  }
  return { message: `Permanently deleted ${removed} record(s)`, removed };
};

module.exports = { list, restore, purge, empty, TRASH_BUCKETS, BUCKETS_BY_KEY };
