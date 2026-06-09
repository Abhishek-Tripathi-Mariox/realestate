const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { roundPaise, addMoney, subMoney, gteMoney, eqMoney } = require('../../utils/money');
const { createTransaction, createReversalTransaction } = require('../../utils/transactions');
const {
  ExpenseBill, ExpensePayment, Account, Transaction, Vendor, ExpenseCategory,
  CommissionBill, CommissionPayment, MarginPayment,
} = require('../../models');

const stripId = ({ _id, ...rest }) => rest;

// ============ Expense Bills ============

const listBills = async (query) => {
  const filter = notDeleted();
  if (query.societyId) filter.societyId = query.societyId;
  if (query.scope === 'COMPANY') filter.societyId = null;

  const bills = await ExpenseBill.find(filter).sort({ billDate: -1 }).lean();
  return bills.map((b) => {
    const amount = b.amount ?? b.billAmount ?? 0;
    const paid = b.paidAmount || 0;
    return {
      ...stripId(b),
      categoryName: b.category || '',          // FE reads categoryName
      totalPaid: paid,                         // FE reads totalPaid
      balance: Math.max(0, amount - paid),     // FE reads balance
      status: (b.status || 'Pending').toUpperCase(), // FE checks 'PAID'/'PARTIAL'
    };
  });
};

const createBill = async (body, userId) => {
  // Frontend sends `categoryId, billAmount, vendorId` — look up the readable
  // names so the saved row carries human-readable data for downstream listings.
  let vendorName = body.vendorName || '';
  if (!vendorName && body.vendorId) {
    const vendor = await Vendor.findOne({ id: body.vendorId }).lean();
    vendorName = vendor?.name || '';
  }

  let category = body.category || '';
  if (!category && body.categoryId) {
    const cat = await ExpenseCategory.findOne({ id: body.categoryId }).lean();
    category = cat?.name || '';
  }

  const amount = Number(body.billAmount ?? body.amount) || 0;

  const bill = {
    id: uuidv4(),
    societyId: body.scope === 'COMPANY' ? null : body.societyId,
    scope: body.scope || 'SOCIETY',
    vendorId: body.vendorId || null,
    vendorName,
    categoryId: body.categoryId || null,
    category,
    amount,
    billAmount: amount,                          // legacy alias for FE reads
    billDate: body.billDate || body.expenseDate,
    description: body.description || body.remark || '',
    paidAmount: 0,
    status: 'Pending',
    createdBy: userId,
    createdAt: new Date(),
  };

  await ExpenseBill.create(bill);

  return bill;
};

// Update an existing expense bill. Allow vendor / category / amount /
// date / description edits. Amount can't go below already-paid (otherwise
// the balance math would go negative). No daybook reversal needed because
// the bill itself doesn't write a transaction — only its payments do.
const updateBill = async (id, body) => {
  const current = await ExpenseBill.findOne({ id }).lean();
  if (!current) return null;
  if (current.isDeleted) return { error: 'Bill is deleted', status: 400 };

  let vendorName = body.vendorName !== undefined ? body.vendorName : current.vendorName;
  if (body.vendorId && body.vendorId !== current.vendorId && !body.vendorName) {
    const vendor = await Vendor.findOne({ id: body.vendorId }).lean();
    if (vendor) vendorName = vendor.name;
  }

  let category = body.category !== undefined ? body.category : current.category;
  if (body.categoryId && body.categoryId !== current.categoryId && !body.category) {
    const cat = await ExpenseCategory.findOne({ id: body.categoryId }).lean();
    if (cat) category = cat.name;
  }

  const incomingAmount = body.billAmount ?? body.amount;
  const amount = incomingAmount !== undefined
    ? Number(incomingAmount)
    : (current.amount ?? current.billAmount ?? 0);
  if (!(amount > 0)) {
    return { error: 'Bill amount must be greater than zero', status: 400 };
  }
  const paid = current.paidAmount || 0;
  if (amount < paid) {
    return {
      error: `Bill amount (${amount}) cannot be less than already paid (${paid}). Reverse some payments first.`,
      status: 400,
    };
  }

  const billDate = body.billDate || body.expenseDate || current.billDate;
  const description = body.description !== undefined
    ? body.description
    : (body.remark !== undefined ? body.remark : current.description);

  // Recompute status against the new amount in case the cap moved.
  const status = paid <= 0
    ? 'Pending'
    : (gteMoney(paid, amount) ? 'Paid' : 'Partial');

  await ExpenseBill.updateOne(
    { id },
    {
      $set: {
        vendorId: body.vendorId !== undefined ? body.vendorId : current.vendorId,
        vendorName,
        categoryId: body.categoryId !== undefined ? body.categoryId : current.categoryId,
        category,
        amount,
        billAmount: amount,
        billDate,
        description,
        status,
        updatedAt: new Date(),
      },
    },
  );
  const updated = await ExpenseBill.findOne({ id }).lean();
  return stripId(updated);
};

const deleteBill = async (id, userId) => {
  const bill = await ExpenseBill.findOne({ id }).lean();
  if (!bill) return { error: 'Bill not found', status: 404 };

  // Each ExpensePayment row got its own daybook txn keyed by the payment's
  // own id (see addBillPayment: sourceId = payment.id). The previous code
  // looked up `sourceId = bill.id` which only matched quick-expense txns —
  // payments via "Add Payment" were left live in the daybook. Enumerate
  // the children, reverse each, then soft-delete them alongside the bill.
  const livePayments = await ExpensePayment.find({
    billId: id,
    isDeleted: { $ne: true },
  }).lean();
  for (const p of livePayments) {
    const txn = await Transaction.findOne({
      sourceType: 'EXPENSE_PAYMENT',
      sourceId: p.id,
      isReversed: { $ne: true },
      isReversal: { $ne: true },
    }).lean();
    if (txn) await createReversalTransaction(txn, userId, 'Expense bill deleted');
  }

  // Quick-expense bills carry their own direct txn keyed by the bill id.
  const directTxn = await Transaction.findOne({
    sourceType: { $in: ['EXPENSE_PAYMENT', 'QUICK_EXPENSE'] },
    sourceId: id,
    isReversed: { $ne: true },
    isReversal: { $ne: true },
  }).lean();
  if (directTxn) await createReversalTransaction(directTxn, userId, 'Expense bill deleted');

  if (livePayments.length) {
    await ExpensePayment.updateMany(
      { billId: id, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, deletedAt: new Date(), deletedReason: 'Bill deleted' } },
    );
  }
  await ExpenseBill.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  return { message: `Expense bill deleted (${livePayments.length} payment(s) reversed)` };
};

// ============ Expenses listing (transactions-backed) ============

const listExpenses = async (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.max(1, Math.min(500, parseInt(query.limit) || 50));
  const skip = (page - 1) * limit;

  const scope = (query.scope || '').toUpperCase();

  // Scope-aware source-type rules:
  //   COMPANY tab → company-level expenses only (no society, no commissions).
  //   SOCIETY tab → society expenses + broker COMMISSION_PAYMENTs that belong
  //     to that society (a commission is tied to a sale, and the sale lives
  //     under a society — so the cost is a society expense, not a company one).
  // Summary filter — keeps ALL outgoing transactions (incl. bill payments) so
  // the "Total Paid" / Cash / Bank cards reflect real money out. Row filter
  // below narrows to standalone Quick Expenses, since each expense bill is
  // shown as a single virtual row with its payments collapsed into the drawer.
  const summaryFilter = {
    direction: 'OUT',
    isVoided: { $ne: true },
    isReversal: { $ne: true },
    isReversed: { $ne: true },
  };
  // Commission flows have their own ledger now, so we drop them from the
  // Expense Ledger summary too — otherwise commission payments would inflate
  // the "Total Paid" and "Bank/Other" cards on this page.
  // Margin payments live on their own Margin Ledger page; including them
  // here previously made the "Total Paid" card disagree with the Quick+Bills
  // breakdown the user sees. Keep this page focused on standalone Quick
  // Expenses and Add-Bill payments only.
  if (scope === 'COMPANY') {
    summaryFilter.sourceType = { $in: ['EXPENSE_PAYMENT', 'QUICK_EXPENSE'] };
    summaryFilter.$or = [{ societyId: null }, { societyId: { $exists: false } }];
  } else if (scope === 'SOCIETY') {
    summaryFilter.sourceType = { $in: ['EXPENSE_PAYMENT', 'QUICK_EXPENSE'] };
    if (query.societyId && query.societyId !== 'all') {
      summaryFilter.societyId = query.societyId;
    } else {
      summaryFilter.societyId = { $ne: null };
    }
  } else {
    summaryFilter.sourceType = { $in: ['EXPENSE_PAYMENT', 'QUICK_EXPENSE'] };
    if (query.societyId && query.societyId !== 'all') {
      summaryFilter.societyId = query.societyId;
    }
  }

  if (query.accountId && query.accountId !== 'all') summaryFilter.accountId = query.accountId;
  if (query.paymentMode && query.paymentMode !== 'all') summaryFilter.paymentMode = query.paymentMode;

  if (query.startDate || query.endDate) {
    summaryFilter.txnDate = {};
    if (query.startDate) summaryFilter.txnDate.$gte = query.startDate;
    if (query.endDate) summaryFilter.txnDate.$lte = query.endDate;
  }

  // Row filter — keep only QUICK_EXPENSE and MARGIN_PAYMENT here. Commission
  // bills/payments live on their own Commission Ledger page; surfacing them
  // here would just duplicate that view. Expense bill payments are collapsed
  // into virtual bill rows below (one bill = one row), so we drop the raw
  // EXPENSE_PAYMENT txns from this listing too.
  const excludedFromRows = ['EXPENSE_PAYMENT', 'COMMISSION_PAYMENT'];
  const rowSourceTypes = (summaryFilter.sourceType.$in || []).filter(t => !excludedFromRows.includes(t));
  const filter = { ...summaryFilter, sourceType: { $in: rowSourceTypes } };

  const total = await Transaction.countDocuments(filter);

  const txns = await Transaction
    .find(filter)
    .sort({ txnDate: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // For MARGIN_PAYMENT / COMMISSION_PAYMENT rows, `sourceId` is the payment
  // record id — resolve to parent billId so the FE can open the Payments
  // drawer and show "this much was billed / this much paid" context.
  const marginPaymentIds = txns.filter(t => t.sourceType === 'MARGIN_PAYMENT' && t.sourceId).map(t => t.sourceId);
  const commissionPaymentIds = txns.filter(t => t.sourceType === 'COMMISSION_PAYMENT' && t.sourceId).map(t => t.sourceId);
  const [marginPayDocs, commissionPayDocs] = await Promise.all([
    marginPaymentIds.length ? MarginPayment.find({ id: { $in: marginPaymentIds } }).lean() : [],
    commissionPaymentIds.length ? CommissionPayment.find({ id: { $in: commissionPaymentIds } }).lean() : [],
  ]);
  const paymentToBill = new Map();
  marginPayDocs.forEach(p => paymentToBill.set(p.id, p.billId));
  commissionPayDocs.forEach(p => paymentToBill.set(p.id, p.billId));

  const transactions = txns.map(t => {
    const base = { ...stripId(t), status: 'PAID' };
    const billId = paymentToBill.get(t.sourceId);
    if (billId) base.billId = billId;
    return base;
  });

  const summaryAgg = await Transaction.aggregate([
    { $match: summaryFilter },
    {
      $group: {
        _id: null,
        totalExpense: { $sum: '$amount' },
        cashExpense: { $sum: { $cond: [{ $eq: ['$paymentMode', 'Cash'] }, '$amount', 0] } },
        bankExpense: { $sum: { $cond: [{ $ne: ['$paymentMode', 'Cash'] }, '$amount', 0] } },
        // Break the grand total down by where the OUT came from. Users want
        // to verify both Quick Expenses AND Add-Bill payments contribute to
        // the same "Total Paid" card — without this split the card is a
        // black box.
        quickExpensePaid: { $sum: { $cond: [{ $eq: ['$sourceType', 'QUICK_EXPENSE'] }, '$amount', 0] } },
        billPaymentPaid: { $sum: { $cond: [{ $eq: ['$sourceType', 'EXPENSE_PAYMENT'] }, '$amount', 0] } },
        quickExpenseCount: { $sum: { $cond: [{ $eq: ['$sourceType', 'QUICK_EXPENSE'] }, 1, 0] } },
        billPaymentCount: { $sum: { $cond: [{ $eq: ['$sourceType', 'EXPENSE_PAYMENT'] }, 1, 0] } },
        transactionCount: { $sum: 1 },
      },
    },
  ]);

  const summary = summaryAgg[0]
    ? {
        totalExpense: roundPaise(summaryAgg[0].totalExpense),
        cashExpense: roundPaise(summaryAgg[0].cashExpense),
        bankExpense: roundPaise(summaryAgg[0].bankExpense),
        quickExpensePaid: roundPaise(summaryAgg[0].quickExpensePaid),
        billPaymentPaid: roundPaise(summaryAgg[0].billPaymentPaid),
        quickExpenseCount: summaryAgg[0].quickExpenseCount,
        billPaymentCount: summaryAgg[0].billPaymentCount,
        transactionCount: summaryAgg[0].transactionCount,
      }
    : {
        totalExpense: 0, cashExpense: 0, bankExpense: 0,
        quickExpensePaid: 0, billPaymentPaid: 0,
        quickExpenseCount: 0, billPaymentCount: 0, transactionCount: 0,
      };

  // Synthesize virtual rows for unpaid expense + commission bill balances so
  // this page also surfaces "money owed", not just "money spent". The amount
  // shown is the still-outstanding balance, and the status field lets the FE
  // tell paid transactions apart from pending bills.
  const billFilter = notDeleted();
  if (scope === 'COMPANY') {
    billFilter.$or = [{ societyId: null }, { societyId: { $exists: false } }];
  } else if (query.societyId && query.societyId !== 'all') {
    billFilter.societyId = query.societyId;
  }
  if (query.startDate || query.endDate) {
    billFilter.billDate = {};
    if (query.startDate) billFilter.billDate.$gte = query.startDate;
    if (query.endDate) billFilter.billDate.$lte = query.endDate;
  }

  // Show ALL expense bills (paid + unpaid) as single virtual rows — the
  // drawer collapses each bill's payments inside it, so the table stays
  // "one bill = one row". The amount shown is the full bill amount; the
  // FE uses billAmount/totalPaid/balance to render the status badge.
  let allExpenseBills = await ExpenseBill.find(billFilter).lean();

  // The Commission Ledger reuses the ExpenseBill model — bills it creates
  // have vendor.type='Commission' (and category='Commission' since vendor
  // type doubles as the bill category). Filter those out so they don't
  // double-up on this Expense Ledger page.
  if (allExpenseBills.length) {
    const vendorIds = [...new Set(allExpenseBills.map(b => b.vendorId).filter(Boolean))];
    const commissionVendorIds = new Set(
      vendorIds.length
        ? (await Vendor.find({ id: { $in: vendorIds }, type: 'Commission' }).lean()).map(v => v.id)
        : []
    );
    allExpenseBills = allExpenseBills.filter(b => {
      if (b.vendorId && commissionVendorIds.has(b.vendorId)) return false;
      if ((b.category || '').toLowerCase() === 'commission') return false;
      return true;
    });
  }

  // (Old) CommissionBill virtual rows are no longer surfaced here — those
  // live on the Commission Ledger / Commissions tab.

  const buildBillRow = (b) => {
    const amount = b.amount ?? b.billAmount ?? 0;
    const paid = b.paidAmount || 0;
    const balance = Math.max(0, amount - paid);
    const rawStatus = (b.status || 'Pending').toUpperCase();
    let status;
    if (rawStatus === 'PAID' || balance === 0) status = 'PAID';
    else if (rawStatus === 'PARTIAL' || paid > 0) status = 'PARTIAL';
    else status = 'PENDING';

    return {
      id: `bill-${b.id}`,
      _isBill: true,
      sourceType: 'EXPENSE_BILL',
      sourceId: b.id,
      billId: b.id,
      txnDate: b.billDate || null,
      // Freshness signal — used as a tiebreaker when merging with quick
      // expenses so a bill touched today (e.g. "Add to Bill") bubbles up
      // above bills with the same billDate but no recent activity.
      updatedAt: b.updatedAt || b.createdAt || null,
      createdAt: b.createdAt || null,
      societyId: b.societyId || null,
      scope: b.scope || (b.societyId ? 'SOCIETY' : 'COMPANY'),
      accountId: null,
      direction: 'OUT',
      amount,
      billAmount: amount,
      totalPaid: paid,
      balance,
      paymentMode: '-',
      partyType: 'Vendor',
      partyName: b.vendorName || '',
      referenceNo: b.category || '',
      remark: b.description || b.remark || '',
      status,
    };
  };

  let billRows = allExpenseBills.map(buildBillRow).filter(r => r.amount > 0);

  // Account / payment-mode filters can't be evaluated against bills (they
  // describe the payment, not the bill) — drop bill rows when those filters
  // are active so the table doesn't mix filter scopes.
  if (query.paymentMode && query.paymentMode !== 'all') billRows = [];
  if (query.accountId && query.accountId !== 'all') billRows = [];

  // Pending totals from outstanding bill balances (PENDING + PARTIAL).
  const totalPending = roundPaise(billRows.reduce((s, r) => s + r.balance, 0));
  summary.totalPending = totalPending;
  summary.pendingCount = billRows.filter(r => r.balance > 0).length;
  // Total rows visible = bills + quick expenses (overrides the txn-only count
  // computed above so the "# Transactions" card matches what the user sees).
  summary.transactionCount = billRows.length + transactions.length;

  // Sort by date desc so bills + quick expenses interleave naturally. When
  // two rows share the same date, fall back to the most recent activity
  // timestamp (updatedAt for bills — captures "Add to Bill" mutations —
  // createdAt for quick-expense transactions) so the row the user just
  // touched lands at the top of its date group.
  const merged = [...billRows, ...transactions].sort((a, b) => {
    const da = a.txnDate || ''
    const db = b.txnDate || ''
    if (da !== db) return db.localeCompare(da);
    const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return tb - ta;
  });

  return {
    transactions: merged,
    summary,
    total: merged.length,
    pagination: { page, limit, total: merged.length, totalPages: 1 },
  };
};

// Edit a quick expense (the standalone OUT txn created via /api/daybook with
// sourceType=QUICK_EXPENSE). Bills aren't involved here — we reverse the old
// txn for audit and post a fresh one with the new values. The frontend keeps
// pointing at the same row id by using the new txn's id from the response.
const updateExpense = async (id, body, userId) => {
  const original = await Transaction.findOne({ id }).lean();
  if (!original) return { error: 'Expense not found', status: 404 };
  // Block edits on rows that aren't standalone quick expenses — those go
  // through the bill / payment edit paths and have stricter invariants.
  if (original.sourceType !== 'QUICK_EXPENSE') {
    return { error: 'This entry isn\'t a quick expense — edit it from its bill / payment view', status: 400 };
  }
  if (original.isReversed || original.isReversal || original.isVoided) {
    return { error: 'Cannot edit a reversed / voided entry', status: 400 };
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Amount must be greater than 0', status: 400 };
  }
  const accountId = body.accountId || original.accountId;
  if (!accountId) return { error: 'Account is required', status: 400 };
  const account = await Account.findOne({ id: accountId }).lean();
  if (!account) return { error: 'Account not found', status: 400 };

  await createReversalTransaction(original, userId, 'Quick expense edited');

  const replacement = await createTransaction({
    txnDate: body.txnDate || original.txnDate,
    societyId: body.scope === 'COMPANY' ? null : (body.societyId || original.societyId),
    accountId,
    direction: 'OUT',
    amount,
    paymentMode: body.paymentMode || original.paymentMode || 'Cash',
    partyType: original.partyType || 'Vendor',
    partyName: body.partyName || body.vendorName || original.partyName || '',
    sourceType: 'QUICK_EXPENSE',
    sourceId: null,
    referenceNo: body.referenceNo || body.category || original.referenceNo || '',
    remark: body.remark || original.remark || '',
  }, userId);

  return { message: 'Expense updated', id: replacement.id, previousId: original.id };
};

const deleteExpense = async (id, userId) => {
  let txn = await Transaction.findOne({ id }).lean();
  let bill = null;
  if (txn) {
    bill = await ExpenseBill.findOne({ id: txn.sourceId }).lean();
  } else {
    bill = await ExpenseBill.findOne({ id }).lean();
    if (bill) {
      txn = await Transaction.findOne({
        sourceId: bill.id,
        sourceType: { $in: ['EXPENSE_PAYMENT', 'QUICK_EXPENSE'] },
      }).lean();
    }
  }

  if (!txn && !bill) return { error: 'Expense not found', status: 404 };

  if (txn) await createReversalTransaction(txn, userId, 'Expense deleted');
  if (bill) {
    await ExpenseBill.updateOne(
      { id: bill.id },
      { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: userId } },
    );
  }

  return { message: 'Expense deleted', id };
};

const quickExpense = async (body, userId) => {
  let accountId = body.accountId;
  if (!accountId) {
    const defaultAccount = await Account.findOne({ isDefault: true }).lean();
    accountId = defaultAccount?.id;
  }

  const expense = {
    id: uuidv4(),
    societyId: body.scope === 'COMPANY' ? null : body.societyId,
    scope: body.scope || 'SOCIETY',
    vendorName: body.vendorName || 'Cash Expense',
    category: body.category,
    amount: Number(body.amount) || 0,
    billDate: body.expenseDate,
    description: body.remark || '',
    paidAmount: body.amount,
    status: 'Paid',
    createdBy: userId,
    createdAt: new Date(),
  };

  await ExpenseBill.create(expense);

  await createTransaction({
    txnDate: expense.billDate,
    societyId: expense.societyId,
    accountId,
    direction: 'OUT',
    amount: expense.amount,
    paymentMode: body.paymentMode || 'Cash',
    partyType: 'Vendor',
    partyName: expense.vendorName,
    sourceType: 'EXPENSE_PAYMENT',
    sourceId: expense.id,
    referenceNo: expense.category || '',
    remark: `${expense.category} - ${expense.vendorName}`,
  }, userId);

  return expense;
};

// ============ Expense bill payments ============

const listBillPayments = async (billId) => {
  // Newest first by paymentDate, then by createdAt so same-day entries show
  // the most recently created row at the top (additions logged after the
  // fact land above earlier payments on the same date).
  const payments = await ExpensePayment
    .find(notDeleted({ billId }))
    .sort({ paymentDate: -1, createdAt: -1 })
    .lean();
  return payments.map(stripId);
};

const addBillPayment = async (billId, body, userId) => {
  const bill = await ExpenseBill.findOne({ id: billId }).lean();
  if (!bill) return { error: 'Bill not found', status: 404 };

  const isAddition = body.type === 'ADDITION';

  // Account is required so we never silently write a txn with no account —
  // that produces "Unknown" rows in the daybook and breaks balance reports.
  // ADDITION rows don't move money, so they don't need an account.
  let accountId = body.accountId;
  if (!isAddition) {
    if (!accountId) {
      const defaultAccount = await Account.findOne({ isDefault: true }).lean();
      accountId = defaultAccount?.id;
    }
    if (!accountId) {
      return { error: 'Account is required', status: 400 };
    }
    // Verify the account exists — guards against stale/typoed ids on the FE.
    const accountDoc = await Account.findOne({ id: accountId }).lean();
    if (!accountDoc) {
      return { error: 'Selected account not found', status: 400 };
    }
  } else {
    accountId = null;
  }

  const amount = parseFloat(body.amount) || 0;
  if (!(amount > 0)) {
    return { error: 'Amount must be greater than zero', status: 400 };
  }

  // `type=WITHDRAWAL` lets the vendor return money already paid — useful when
  // a payment was excessive or work was cancelled. Stored as a normal
  // ExpensePayment row with type=WITHDRAWAL; bill.paidAmount is decremented
  // and the daybook transaction flips to IN so the account balance recovers.
  // `type=ADDITION` bumps the bill's billAmount (no money moves, no daybook
  // entry) so each "Add to Bill" action is its own ledger row.
  const isWithdrawal = body.type === 'WITHDRAWAL';
  const billAmount = bill.amount ?? bill.billAmount ?? 0;
  const currentPaid = bill.paidAmount || 0;

  if (isAddition) {
    // Additions just grow the bill — no upper cap, only a positivity check
    // (already enforced above).
  } else if (isWithdrawal) {
    if (amount > currentPaid + 0.0001) {
      return {
        error: `Withdrawal exceeds paid amount (paid ${currentPaid}, attempted ${amount})`,
        status: 400,
      };
    }
  } else {
    const proposedPaid = addMoney(currentPaid, amount);
    if (!gteMoney(billAmount, proposedPaid)) {
      return {
        error: `Payment exceeds bill balance (bill ${billAmount}, already paid ${currentPaid}, attempted ${amount})`,
        status: 400,
      };
    }
  }

  const payment = {
    id: uuidv4(),
    billId,
    societyId: bill.societyId,
    accountId,
    amount,                                  // always stored positive
    type: isAddition ? 'ADDITION' : (isWithdrawal ? 'WITHDRAWAL' : 'PAYMENT'),
    paymentDate: body.paymentDate,
    paymentMode: isAddition ? '' : (body.paymentMode || 'Cash'),
    referenceNo: body.referenceNo || '',
    remark: body.remark || '',
    createdBy: userId,
    createdAt: new Date(),
  };

  await ExpensePayment.create(payment);

  if (isAddition) {
    // Bump the bill's amount; paid stays where it is. Re-derive status from
    // the new (larger) bill so a previously PAID bill flips to PARTIAL when
    // a fresh addition outpaces what's been paid so far.
    const updated = await ExpenseBill.findOneAndUpdate(
      { id: billId },
      { $inc: { billAmount: amount, amount: amount } },
      { new: true },
    ).lean();
    if (updated) {
      const newBillAmount = updated.amount ?? updated.billAmount ?? 0;
      const paid = Math.max(0, updated.paidAmount || 0);
      let status;
      if (paid <= 0) status = 'Pending';
      else if (gteMoney(paid, newBillAmount)) status = 'Paid';
      else status = 'Partial';
      await ExpenseBill.updateOne({ id: billId }, { $set: { status } });
    }
    // No daybook transaction — no money moved. Return the ledger row.
    return payment;
  }

  // Withdrawals subtract from paid; payments add. Either way the $inc keeps
  // concurrent writes safe and we recompute the status from the new value.
  const delta = isWithdrawal ? -amount : amount;
  const updated = await ExpenseBill.findOneAndUpdate(
    { id: billId },
    { $inc: { paidAmount: delta } },
    { new: true },
  ).lean();
  const newPaid = Math.max(0, updated.paidAmount || 0);
  let status;
  if (newPaid <= 0) status = 'Pending';
  else if (gteMoney(newPaid, billAmount)) status = 'Paid';
  else status = 'Partial';
  await ExpenseBill.updateOne({ id: billId }, { $set: { status, paidAmount: newPaid } });

  await createTransaction({
    txnDate: payment.paymentDate,
    societyId: bill.societyId,
    accountId,
    // Withdrawal returns money to the company account, so the daybook
    // entry is IN (money coming back). Regular payments stay OUT.
    direction: isWithdrawal ? 'IN' : 'OUT',
    amount,
    paymentMode: payment.paymentMode,
    partyType: 'Vendor',
    partyName: bill.vendorName,
    sourceType: 'EXPENSE_PAYMENT',
    sourceId: payment.id,
    remark: payment.remark || `${isWithdrawal ? 'Withdrawal' : 'Payment'} - ${bill.category || ''} - ${bill.vendorName || ''}`.trim(),
  }, userId);

  return payment;
};

const deleteBillPayment = async (id, userId) => {
  const payment = await ExpensePayment.findOne({ id }).lean();
  if (!payment) return { error: 'Payment not found', status: 404 };

  const wasAddition = payment.type === 'ADDITION';
  const wasWithdrawal = payment.type === 'WITHDRAWAL';

  // Additions never produced a daybook entry, so there's nothing to reverse
  // there — just shrink the bill amount back. Payments / withdrawals reverse
  // their original txn first.
  if (!wasAddition) {
    const originalTxn = await Transaction.findOne({ sourceType: 'EXPENSE_PAYMENT', sourceId: id }).lean();
    if (originalTxn) {
      await createReversalTransaction(originalTxn, userId, 'Expense payment deleted');
    }
  }

  if (wasAddition) {
    // Pull the bill amount back down by the addition amount; paid stays put.
    const updated = await ExpenseBill.findOneAndUpdate(
      { id: payment.billId },
      { $inc: { billAmount: -(payment.amount || 0), amount: -(payment.amount || 0) } },
      { new: true },
    ).lean();
    if (updated) {
      const newBillAmount = Math.max(0, updated.amount ?? updated.billAmount ?? 0);
      const paid = Math.max(0, updated.paidAmount || 0);
      const status = paid <= 0
        ? 'Pending'
        : (gteMoney(paid, newBillAmount) ? 'Paid' : 'Partial');
      await ExpenseBill.updateOne(
        { id: payment.billId },
        { $set: { status, billAmount: newBillAmount, amount: newBillAmount } },
      );
    }
  } else {
    // Deleting a regular payment decrements paidAmount; deleting a withdrawal
    // adds the money back to paidAmount (because the withdrawal originally
    // subtracted it).
    const delta = wasWithdrawal ? (payment.amount || 0) : -(payment.amount || 0);
    const updated = await ExpenseBill.findOneAndUpdate(
      { id: payment.billId },
      { $inc: { paidAmount: delta } },
      { new: true },
    ).lean();
    if (updated) {
      const billAmount = updated.amount ?? updated.billAmount ?? 0;
      const newPaid = Math.max(0, updated.paidAmount || 0);
      const status = newPaid <= 0
        ? 'Pending'
        : (gteMoney(newPaid, billAmount) ? 'Paid' : 'Partial');
      await ExpenseBill.updateOne(
        { id: payment.billId },
        { $set: { status, paidAmount: newPaid } },
      );
    }
  }

  await ExpensePayment.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  return { message: wasAddition ? 'Bill addition removed' : 'Expense payment deleted with reversal' };
};

// Edit an existing expense bill payment. For totals-affecting changes
// (amount / mode / account / date) we reverse the original daybook txn
// and write a fresh one so cash balances and the aliveTransactions filter
// stay correct. Pure remark edits update in place.
const updateBillPayment = async (id, body, userId) => {
  const payment = await ExpensePayment.findOne({ id }).lean();
  if (!payment) return { error: 'Payment not found', status: 404 };
  if (payment.isDeleted) return { error: 'Payment is deleted', status: 400 };

  const bill = await ExpenseBill.findOne({ id: payment.billId }).lean();
  if (!bill) return { error: 'Parent bill not found', status: 404 };

  const incomingAmount = body.amount !== undefined ? parseFloat(body.amount) : payment.amount;
  if (!(incomingAmount > 0)) {
    return { error: 'Amount must be greater than zero', status: 400 };
  }
  const newAmount = Number(incomingAmount);
  const newPaymentDate = body.paymentDate || body.entryDate || payment.paymentDate;
  const newPaymentMode = body.paymentMode || payment.paymentMode;
  const newAccountId = body.accountId || payment.accountId;
  const newReferenceNo = body.referenceNo !== undefined ? body.referenceNo : (payment.referenceNo || '');
  const newRemark = body.remark !== undefined ? body.remark : (payment.remark || '');

  // Type of this row stays put on edit — we don't let a user flip
  // PAYMENT ↔ WITHDRAWAL via update, since that would invert the direction
  // and balance semantics. (User can delete + re-add if they really want to.)
  const isWithdrawal = payment.type === 'WITHDRAWAL';

  const totalsAffectingChange =
    !eqMoney(newAmount, payment.amount || 0)
    || newPaymentMode !== payment.paymentMode
    || newAccountId !== payment.accountId
    || newPaymentDate !== payment.paymentDate;

  // Re-validate when amount changes — the cap differs by type:
  //   • PAYMENT    → total of other payments + new must not exceed bill amount
  //   • WITHDRAWAL → withdrawal can't exceed what's been paid (excluding self)
  if (!eqMoney(newAmount, payment.amount || 0)) {
    const billAmount = bill.amount ?? bill.billAmount ?? 0;
    if (isWithdrawal) {
      // paidAmount currently reflects (other payments − other withdrawals − this withdrawal).
      // Adding back this withdrawal's own contribution gives us the cap.
      const paidExcludingSelf = (bill.paidAmount || 0) + (payment.amount || 0);
      if (newAmount > paidExcludingSelf + 0.0001) {
        return {
          error: `Withdrawal exceeds paid amount (paid excluding self ${paidExcludingSelf}, attempted ${newAmount})`,
          status: 400,
        };
      }
    } else {
      const otherPaid = (bill.paidAmount || 0) - (payment.amount || 0);
      if (!gteMoney(billAmount, otherPaid + newAmount)) {
        return {
          error: `Updated amount exceeds bill balance (bill ${billAmount}, other payments ${otherPaid}, attempted ${newAmount})`,
          status: 400,
        };
      }
    }
  }

  if (totalsAffectingChange) {
    const originalTxn = await Transaction.findOne({
      sourceType: 'EXPENSE_PAYMENT',
      sourceId: id,
      isReversed: { $ne: true },
      isReversal: { $ne: true },
    }).lean();
    if (originalTxn) {
      await createReversalTransaction(originalTxn, userId, 'Expense payment edited');
    }

    // Withdrawals subtract from paidAmount, so the bill-delta flips sign.
    const rawDelta = newAmount - (payment.amount || 0);
    const billDelta = isWithdrawal ? -rawDelta : rawDelta;
    const updatedBill = await ExpenseBill.findOneAndUpdate(
      { id: payment.billId },
      { $inc: { paidAmount: billDelta } },
      { new: true },
    ).lean();

    await ExpensePayment.updateOne(
      { id },
      {
        $set: {
          amount: newAmount,
          paymentDate: newPaymentDate,
          paymentMode: newPaymentMode,
          accountId: newAccountId,
          referenceNo: newReferenceNo,
          remark: newRemark,
          updatedAt: new Date(),
        },
      },
    );

    if (updatedBill) {
      const billAmount = updatedBill.amount ?? updatedBill.billAmount ?? 0;
      const newPaid = Math.max(0, updatedBill.paidAmount || 0);
      const status = newPaid <= 0
        ? 'Pending'
        : (gteMoney(newPaid, billAmount) ? 'Paid' : 'Partial');
      await ExpenseBill.updateOne(
        { id: payment.billId },
        { $set: { status, paidAmount: newPaid } },
      );

      await createTransaction({
        txnDate: newPaymentDate,
        societyId: updatedBill.societyId,
        accountId: newAccountId,
        // Withdrawal returns money — replacement txn must mirror that.
        direction: isWithdrawal ? 'IN' : 'OUT',
        amount: newAmount,
        paymentMode: newPaymentMode,
        partyType: 'Vendor',
        partyName: updatedBill.vendorName,
        sourceType: 'EXPENSE_PAYMENT',
        sourceId: id,
        remark: newRemark || `${isWithdrawal ? 'Withdrawal' : 'Payment'} - ${updatedBill.category || ''} - ${updatedBill.vendorName || ''}`.trim(),
      }, userId);
    }
  } else {
    await ExpensePayment.updateOne(
      { id },
      {
        $set: {
          referenceNo: newReferenceNo,
          remark: newRemark,
          updatedAt: new Date(),
        },
      },
    );
  }

  const fresh = await ExpensePayment.findOne({ id }).lean();
  return { message: 'Expense payment updated', payment: fresh };
};

module.exports = {
  listBills, createBill, updateBill, deleteBill,
  listExpenses, updateExpense, deleteExpense, quickExpense,
  listBillPayments, addBillPayment, updateBillPayment, deleteBillPayment,
};
