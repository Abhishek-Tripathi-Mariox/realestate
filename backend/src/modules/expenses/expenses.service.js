const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { roundPaise, addMoney, subMoney, gteMoney, eqMoney } = require('../../utils/money');
const { createTransaction, createReversalTransaction } = require('../../utils/transactions');
const {
  ExpenseBill, ExpensePayment, Account, Transaction, Vendor, ExpenseCategory,
  CommissionBill,
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
  const filter = {
    direction: 'OUT',
    isVoided: { $ne: true },
    isReversal: { $ne: true },
    isReversed: { $ne: true },
  };
  if (scope === 'COMPANY') {
    filter.sourceType = { $in: ['EXPENSE_PAYMENT', 'QUICK_EXPENSE'] };
    filter.$or = [{ societyId: null }, { societyId: { $exists: false } }];
  } else if (scope === 'SOCIETY') {
    filter.sourceType = { $in: ['EXPENSE_PAYMENT', 'QUICK_EXPENSE', 'COMMISSION_PAYMENT', 'MARGIN_PAYMENT'] };
    if (query.societyId && query.societyId !== 'all') {
      filter.societyId = query.societyId;
    } else {
      filter.societyId = { $ne: null };
    }
  } else {
    filter.sourceType = { $in: ['EXPENSE_PAYMENT', 'QUICK_EXPENSE', 'COMMISSION_PAYMENT', 'MARGIN_PAYMENT'] };
    if (query.societyId && query.societyId !== 'all') {
      filter.societyId = query.societyId;
    }
  }

  if (query.accountId && query.accountId !== 'all') filter.accountId = query.accountId;
  if (query.paymentMode && query.paymentMode !== 'all') filter.paymentMode = query.paymentMode;

  if (query.startDate || query.endDate) {
    filter.txnDate = {};
    if (query.startDate) filter.txnDate.$gte = query.startDate;
    if (query.endDate) filter.txnDate.$lte = query.endDate;
  }

  const total = await Transaction.countDocuments(filter);

  const txns = await Transaction
    .find(filter)
    .sort({ txnDate: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const transactions = txns.map(t => ({ ...stripId(t), status: 'PAID' }));

  const summaryAgg = await Transaction.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalExpense: { $sum: '$amount' },
        cashExpense: { $sum: { $cond: [{ $eq: ['$paymentMode', 'Cash'] }, '$amount', 0] } },
        bankExpense: { $sum: { $cond: [{ $ne: ['$paymentMode', 'Cash'] }, '$amount', 0] } },
        transactionCount: { $sum: 1 },
      },
    },
  ]);

  const summary = summaryAgg[0]
    ? {
        totalExpense: roundPaise(summaryAgg[0].totalExpense),
        cashExpense: roundPaise(summaryAgg[0].cashExpense),
        bankExpense: roundPaise(summaryAgg[0].bankExpense),
        transactionCount: summaryAgg[0].transactionCount,
      }
    : { totalExpense: 0, cashExpense: 0, bankExpense: 0, transactionCount: 0 };

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

  const expenseBillQuery = { ...billFilter, status: { $ne: 'Paid' } };
  const openExpenseBills = await ExpenseBill.find(expenseBillQuery).lean();

  // Commission bills surface under SOCIETY scope (the sale they're tied to
  // belongs to a society, so the cost is a society expense). COMPANY scope
  // never carries them.
  let openCommissionBills = [];
  if (scope === 'SOCIETY' || scope === '') {
    const commissionFilter = notDeleted({ status: { $ne: 'Paid' } });
    if (query.societyId && query.societyId !== 'all') {
      commissionFilter.societyId = query.societyId;
    } else if (scope === 'SOCIETY') {
      commissionFilter.societyId = { $ne: null };
    }
    if (query.startDate || query.endDate) {
      commissionFilter.billDate = {};
      if (query.startDate) commissionFilter.billDate.$gte = query.startDate;
      if (query.endDate) commissionFilter.billDate.$lte = query.endDate;
    }
    openCommissionBills = await CommissionBill.find(commissionFilter).lean();
  }

  const pendingRows = [
    ...openExpenseBills.map((b) => {
      const amount = b.amount ?? b.billAmount ?? 0;
      const balance = Math.max(0, amount - (b.paidAmount || 0));
      return {
        id: `bill-${b.id}`,
        _isBill: true,
        sourceType: 'EXPENSE_BILL',
        sourceId: b.id,
        txnDate: b.billDate || null,
        societyId: b.societyId || null,
        scope: b.scope || (b.societyId ? 'SOCIETY' : 'COMPANY'),
        accountId: null,
        direction: 'OUT',
        amount: balance,
        paymentMode: '-',
        partyType: 'Vendor',
        partyName: b.vendorName || '',
        referenceNo: b.category || '',
        remark: b.description || b.remark || '',
        status: ((b.status || 'Pending').toUpperCase() === 'PARTIAL') ? 'PARTIAL' : 'PENDING',
      };
    }),
    ...openCommissionBills.map((b) => {
      const amount = b.amount ?? b.commissionAmount ?? 0;
      const balance = Math.max(0, amount - (b.paidAmount || 0));
      return {
        id: `bill-${b.id}`,
        _isBill: true,
        sourceType: 'COMMISSION_BILL',
        sourceId: b.id,
        txnDate: b.billDate || b.commissionDate || null,
        societyId: b.societyId || null,
        scope: 'SOCIETY',
        accountId: null,
        direction: 'OUT',
        amount: balance,
        paymentMode: '-',
        partyType: 'Vendor',
        partyName: b.brokerName || '',
        referenceNo: 'Commission',
        remark: b.description || b.remark || '',
        status: ((b.status || 'Pending').toUpperCase() === 'PARTIAL') ? 'PARTIAL' : 'PENDING',
      };
    }),
  ].filter(r => r.amount > 0);

  if (query.paymentMode && query.paymentMode !== 'all') {
    // pending rows have no payment mode yet — drop them when the user filters by mode
    pendingRows.length = 0;
  }
  if (query.accountId && query.accountId !== 'all') {
    pendingRows.length = 0;
  }

  const totalPending = roundPaise(pendingRows.reduce((s, r) => s + r.amount, 0));
  summary.totalPending = totalPending;
  summary.pendingCount = pendingRows.length;

  // Surface pending rows on page 1 so the user sees them without paginating.
  // Real transactions still drive the `total`/pagination.
  const merged = page === 1 ? [...pendingRows, ...transactions] : transactions;

  return {
    transactions: merged,
    summary,
    total,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
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
  const payments = await ExpensePayment
    .find(notDeleted({ billId }))
    .sort({ paymentDate: -1 })
    .lean();
  return payments.map(stripId);
};

const addBillPayment = async (billId, body, userId) => {
  const bill = await ExpenseBill.findOne({ id: billId }).lean();
  if (!bill) return { error: 'Bill not found', status: 404 };

  let accountId = body.accountId;
  if (!accountId) {
    const defaultAccount = await Account.findOne({ isDefault: true }).lean();
    accountId = defaultAccount?.id;
  }

  const amount = parseFloat(body.amount) || 0;
  if (!(amount > 0)) {
    return { error: 'Payment amount must be greater than zero', status: 400 };
  }

  // Over-payment guard — without this, typing an extra zero on a 1L bill
  // creates a 10L OUT transaction with no warning. addMoney/gteMoney use
  // integer-paise math so this doesn't false-positive on float drift.
  const billAmount = bill.amount ?? bill.billAmount ?? 0;
  const proposedPaid = addMoney(bill.paidAmount || 0, amount);
  if (!gteMoney(billAmount, proposedPaid)) {
    return {
      error: `Payment exceeds bill balance (bill ${billAmount}, already paid ${bill.paidAmount || 0}, attempted ${amount})`,
      status: 400,
    };
  }

  const payment = {
    id: uuidv4(),
    billId,
    societyId: bill.societyId,
    accountId,
    amount,
    paymentDate: body.paymentDate,
    paymentMode: body.paymentMode || 'Cash',
    referenceNo: body.referenceNo || '',
    remark: body.remark || '',
    createdBy: userId,
    createdAt: new Date(),
  };

  await ExpensePayment.create(payment);

  // Atomic increment so two concurrent payments can't lose an update.
  // Recompute status from the returned doc using paise-safe comparison.
  const updated = await ExpenseBill.findOneAndUpdate(
    { id: billId },
    { $inc: { paidAmount: amount } },
    { new: true },
  ).lean();
  const status = eqMoney(updated.paidAmount || 0, billAmount) || gteMoney(updated.paidAmount || 0, billAmount)
    ? 'Paid'
    : 'Partial';
  await ExpenseBill.updateOne({ id: billId }, { $set: { status } });

  await createTransaction({
    txnDate: payment.paymentDate,
    societyId: bill.societyId,
    accountId,
    direction: 'OUT',
    amount,
    paymentMode: payment.paymentMode,
    partyType: 'Vendor',
    partyName: bill.vendorName,
    sourceType: 'EXPENSE_PAYMENT',
    sourceId: payment.id,
    remark: payment.remark || `${bill.category} - ${bill.vendorName}`,
  }, userId);

  return payment;
};

const deleteBillPayment = async (id, userId) => {
  const payment = await ExpensePayment.findOne({ id }).lean();
  if (!payment) return { error: 'Payment not found', status: 404 };

  const originalTxn = await Transaction.findOne({ sourceType: 'EXPENSE_PAYMENT', sourceId: id }).lean();
  if (originalTxn) {
    await createReversalTransaction(originalTxn, userId, 'Expense payment deleted');
  }

  // Atomic decrement; recompute status from the returned document.
  const updated = await ExpenseBill.findOneAndUpdate(
    { id: payment.billId },
    { $inc: { paidAmount: -(payment.amount || 0) } },
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

  await ExpensePayment.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  return { message: 'Expense payment deleted with reversal' };
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
    return { error: 'Payment amount must be greater than zero', status: 400 };
  }
  const newAmount = Number(incomingAmount);
  const newPaymentDate = body.paymentDate || body.entryDate || payment.paymentDate;
  const newPaymentMode = body.paymentMode || payment.paymentMode;
  const newAccountId = body.accountId || payment.accountId;
  const newReferenceNo = body.referenceNo !== undefined ? body.referenceNo : (payment.referenceNo || '');
  const newRemark = body.remark !== undefined ? body.remark : (payment.remark || '');

  const totalsAffectingChange =
    !eqMoney(newAmount, payment.amount || 0)
    || newPaymentMode !== payment.paymentMode
    || newAccountId !== payment.accountId
    || newPaymentDate !== payment.paymentDate;

  // Re-validate over-payment when amount changes. Subtract this payment's
  // OWN current contribution before checking the cap.
  if (!eqMoney(newAmount, payment.amount || 0)) {
    const billAmount = bill.amount ?? bill.billAmount ?? 0;
    const otherPaid = (bill.paidAmount || 0) - (payment.amount || 0);
    if (!gteMoney(billAmount, otherPaid + newAmount)) {
      return {
        error: `Updated amount exceeds bill balance (bill ${billAmount}, other payments ${otherPaid}, attempted ${newAmount})`,
        status: 400,
      };
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

    const delta = newAmount - (payment.amount || 0);
    const updatedBill = await ExpenseBill.findOneAndUpdate(
      { id: payment.billId },
      { $inc: { paidAmount: delta } },
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
        { $set: { status } },
      );

      await createTransaction({
        txnDate: newPaymentDate,
        societyId: updatedBill.societyId,
        accountId: newAccountId,
        direction: 'OUT',
        amount: newAmount,
        paymentMode: newPaymentMode,
        partyType: 'Vendor',
        partyName: updatedBill.vendorName,
        sourceType: 'EXPENSE_PAYMENT',
        sourceId: id,
        remark: newRemark || `${updatedBill.category} - ${updatedBill.vendorName}`,
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
  listExpenses, deleteExpense, quickExpense,
  listBillPayments, addBillPayment, updateBillPayment, deleteBillPayment,
};
