// Filter out "orphan" transactions — ones whose underlying parent record
// (the sale, purchase, bill, payment, etc. that originally produced them)
// has been soft-deleted. Without this filter, deleting a sale leaves its
// payment transactions sitting in the daybook, inflating Total IN.
//
// Each entry in PARENT_CHAINS describes the chain of soft-deletable parent
// records for one sourceType. The transaction's sourceId points at the
// FIRST link in the chain. A transaction is "alive" only if every doc
// along the chain is still alive (no isDeleted=true anywhere).

const {
  Sale, SalePaymentEntry, Purchase, PurchasePaymentEntry,
  ExpenseBill, ExpensePayment, CommissionBill, CommissionPayment,
  CustomerPayment, ResaleDeal, ResaleBuyerPayment, ResaleSellerPayout,
  Partner, PartnerLedgerEntry, Loan, LoanRepayment,
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
};

// Return the set of sourceIds (for one sourceType) whose full parent chain
// is still alive — every doc at every layer must have isDeleted != true.
const aliveSourceIdsFor = async (sourceType, sourceIds) => {
  const chain = PARENT_CHAINS[sourceType];
  if (!chain || sourceIds.length === 0) return new Set(sourceIds);

  // Layer 0: load the immediate parents and keep only the alive ones.
  const layer0Docs = await chain[0].model.find({
    id: { $in: sourceIds },
    isDeleted: { $ne: true },
  }).lean();
  let surviving = layer0Docs;

  // Walk the rest of the chain; at each step, look up the next-layer doc
  // by following the previous step's `link` field.
  for (let i = 1; i < chain.length; i += 1) {
    const prevLink = chain[i - 1].link;
    if (!prevLink) break;
    const nextIds = [...new Set(surviving.map((d) => d[prevLink]).filter(Boolean))];
    if (nextIds.length === 0) { surviving = []; break; }
    const nextDocs = await chain[i].model.find({
      id: { $in: nextIds },
      isDeleted: { $ne: true },
    }).lean();
    const aliveNextIds = new Set(nextDocs.map((d) => d.id));
    surviving = surviving.filter((d) => aliveNextIds.has(d[prevLink]));
  }

  return new Set(surviving.map((d) => d.id));
};

// Given a list of already-loaded transactions, return only the ones whose
// parent chain is still alive. Transactions with no parent reference, or
// with a sourceType we don't know how to validate, are kept as-is.
const filterAliveTransactions = async (transactions) => {
  const bySourceType = {};
  for (const t of transactions) {
    if (!t.sourceType || !PARENT_CHAINS[t.sourceType] || !t.sourceId) continue;
    if (!bySourceType[t.sourceType]) bySourceType[t.sourceType] = new Set();
    bySourceType[t.sourceType].add(t.sourceId);
  }

  const aliveBySourceType = {};
  for (const [sourceType, idSet] of Object.entries(bySourceType)) {
    aliveBySourceType[sourceType] = await aliveSourceIdsFor(sourceType, [...idSet]);
  }

  return transactions.filter((t) => {
    if (!t.sourceType || !PARENT_CHAINS[t.sourceType] || !t.sourceId) return true;
    return aliveBySourceType[t.sourceType]?.has(t.sourceId);
  });
};

module.exports = { filterAliveTransactions, PARENT_CHAINS };
