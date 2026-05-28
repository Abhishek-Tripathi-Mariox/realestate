// Filter out "orphan" transactions — ones whose underlying parent record
// (the sale, purchase, bill, payment, etc. that originally produced them)
// has been soft-deleted. Without this filter, deleting a sale leaves its
// payment transactions sitting in the daybook, inflating Total IN.
//
// Each entry in PARENT_CHAINS describes the chain of soft-deletable parent
// records for one sourceType. The transaction's sourceId points at the
// FIRST link in the chain. A transaction is "alive" only if every doc
// along the chain is still alive (no isDeleted=true anywhere).
//
// Reversal transactions (`<TYPE>_REVERSAL`) carry `sourceId = originalTxn.id`
// — not the original parent's id — so we resolve them by hopping to the
// original transaction first and then walking its parent chain. That keeps
// the daybook consistent in views that display reversals (e.g. txnStatus
// = "all"): if a parent is killed, both the original AND its reversal get
// dropped instead of leaving the reversal alone, which would otherwise
// flip the visible balance.

const {
  Sale, SalePaymentEntry, Purchase, PurchasePaymentEntry,
  ExpenseBill, ExpensePayment, CommissionBill, CommissionPayment,
  CustomerPayment, ResaleDeal, ResaleBuyerPayment, ResaleSellerPayout,
  Partner, PartnerLedgerEntry, Loan, LoanRepayment,
  Transaction, BankOperation,
} = require('../models');

// Each chain step: { model, link } where `link` is the field on this doc
// that points at the next layer's id. The last step has no link.
const PARENT_CHAINS = {
  SALE_PAYMENT:               [{ model: SalePaymentEntry, link: 'saleId' }, { model: Sale }],
  SALE_WITHDRAWAL:            [{ model: SalePaymentEntry, link: 'saleId' }, { model: Sale }],
  PROFIT_PAYOUT:              [{ model: SalePaymentEntry, link: 'saleId' }, { model: Sale }],
  PURCHASE_PAYMENT:           [{ model: PurchasePaymentEntry, link: 'purchaseId' }, { model: Purchase }],
  EXPENSE_PAYMENT:            [{ model: ExpensePayment, link: 'billId' }, { model: ExpenseBill }],
  EXPENSE_BILL:               [{ model: ExpenseBill }],
  COMMISSION_PAYMENT:         [{ model: CommissionPayment, link: 'billId' }, { model: CommissionBill }],
  COMMISSION_BILL:            [{ model: CommissionBill }],
  BROKER_COMMISSION:          [{ model: CommissionBill }],
  CUSTOMER_PAYMENT:           [{ model: CustomerPayment }],
  PARTNER_CAPITAL:            [{ model: PartnerLedgerEntry, link: 'partnerId' }, { model: Partner }],
  RESALE_BUYER_PAYMENT:       [{ model: ResaleBuyerPayment, link: 'dealId' }, { model: ResaleDeal }],
  RESALE_SELLER_PAYOUT:       [{ model: ResaleSellerPayout, link: 'dealId' }, { model: ResaleDeal }],
  RESALE_COMPANY_COMMISSION:  [{ model: ResaleDeal }],
  LOAN_BORROWED:              [{ model: Loan }],
  LOAN_GIVEN:                 [{ model: Loan }],
  LOAN_BORROWED_REPAYMENT:    [{ model: LoanRepayment, link: 'loanId' }, { model: Loan }],
  LOAN_GIVEN_REPAYMENT:       [{ model: LoanRepayment, link: 'loanId' }, { model: Loan }],
  BANK_WITHDRAWAL:            [{ model: BankOperation }],
  BANK_TRANSFER:              [{ model: BankOperation }],
};

// Return the set of sourceIds (for one sourceType) whose full parent chain
// is still alive — every doc at every layer must have isDeleted != true.
// `cache` is an optional Map shared across calls within one request to
// avoid re-issuing identical (model, ids) lookups; pass {} to disable.
const aliveSourceIdsFor = async (sourceType, sourceIds, cache) => {
  const chain = PARENT_CHAINS[sourceType];
  if (!chain || sourceIds.length === 0) return new Set(sourceIds);

  const fetchAlive = async (model, ids) => {
    const cacheKey = cache ? `${model.modelName}|${[...ids].sort().join(',')}` : null;
    if (cache && cache.has(cacheKey)) return cache.get(cacheKey);
    const docs = await model.find({
      id: { $in: ids },
      isDeleted: { $ne: true },
    }).lean();
    if (cache) cache.set(cacheKey, docs);
    return docs;
  };

  let surviving = await fetchAlive(chain[0].model, sourceIds);
  for (let i = 1; i < chain.length; i += 1) {
    const prevLink = chain[i - 1].link;
    if (!prevLink) break;
    const nextIds = [...new Set(surviving.map((d) => d[prevLink]).filter(Boolean))];
    if (nextIds.length === 0) { surviving = []; break; }
    const nextDocs = await fetchAlive(chain[i].model, nextIds);
    const aliveNextIds = new Set(nextDocs.map((d) => d.id));
    surviving = surviving.filter((d) => aliveNextIds.has(d[prevLink]));
  }

  return new Set(surviving.map((d) => d.id));
};

// Given a list of already-loaded transactions, return only the ones whose
// parent chain is still alive. Transactions with no parent reference, or
// with a sourceType we don't know how to validate, are kept as-is.
//
// Reversal rows have `sourceType: '<X>_REVERSAL'` and point at the original
// transaction id; we resolve those to the original's parent chain first
// so a reversal disappears alongside its original when the parent dies.
const filterAliveTransactions = async (transactions, cache = new Map()) => {
  // Step 1: bucket each txn by the sourceType we'll actually validate
  // against. For reversal rows, look up the original txn and use its
  // sourceType + sourceId in place.
  const reversalRows = transactions.filter(
    (t) => t.sourceType && t.sourceType.endsWith('_REVERSAL') && t.originalTxnId,
  );
  const originalById = {};
  if (reversalRows.length) {
    const originalIds = reversalRows.map((t) => t.originalTxnId).filter(Boolean);
    const originals = await Transaction.find({ id: { $in: originalIds } }).lean();
    originals.forEach((o) => { originalById[o.id] = o; });
  }
  // For each transaction, decide which (sourceType, sourceId) drives its
  // alive check. Default = the row's own; for reversals = the original's.
  const probeFor = (t) => {
    if (t.sourceType && t.sourceType.endsWith('_REVERSAL') && t.originalTxnId) {
      const orig = originalById[t.originalTxnId];
      if (orig) return { sourceType: orig.sourceType, sourceId: orig.sourceId };
    }
    return { sourceType: t.sourceType, sourceId: t.sourceId };
  };

  // Step 2: collect distinct (sourceType, sourceId) probes.
  const bySourceType = {};
  for (const t of transactions) {
    const { sourceType, sourceId } = probeFor(t);
    if (!sourceType || !PARENT_CHAINS[sourceType] || !sourceId) continue;
    if (!bySourceType[sourceType]) bySourceType[sourceType] = new Set();
    bySourceType[sourceType].add(sourceId);
  }

  const aliveBySourceType = {};
  for (const [sourceType, idSet] of Object.entries(bySourceType)) {
    aliveBySourceType[sourceType] = await aliveSourceIdsFor(sourceType, [...idSet], cache);
  }

  return transactions.filter((t) => {
    const { sourceType, sourceId } = probeFor(t);
    if (!sourceType || !PARENT_CHAINS[sourceType] || !sourceId) return true;
    return aliveBySourceType[sourceType]?.has(sourceId);
  });
};

module.exports = { filterAliveTransactions, PARENT_CHAINS };
