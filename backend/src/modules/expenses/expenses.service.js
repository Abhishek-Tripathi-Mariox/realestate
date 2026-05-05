const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { roundPaise } = require('../../utils/money');
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

const deleteBill = async (id, userId) => {
  const bill = await ExpenseBill.findOne({ id }).lean();
  if (!bill) return { error: 'Bill not found', status: 404 };

  const originalTxn = await Transaction.findOne({ sourceType: 'EXPENSE_PAYMENT', sourceId: id }).lean();
  if (originalTxn) {
    await createReversalTransaction(originalTxn, userId, 'Expense bill deleted');
  }

  await ExpenseBill.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  return { message: 'Expense bill deleted with reversal' };
};

// ============ Expenses listing (transactions-backed) ============

const listExpenses = async (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.max(1, Math.min(500, parseInt(query.limit) || 50));
  const skip = (page - 1) * limit;

  const scope = (query.scope || '').toUpperCase();

  // Scope-aware source-type rules:
  //   SOCIETY tab → only expense outflows for that society.
  //   COMPANY tab → company-level expenses (no societyId) + every commission
  //     payout regardless of society, since broker commissions are paid out
  //     of the company bank, not the society's account.
  const filter = {
    direction: 'OUT',
    isVoided: { $ne: true },
    isReversal: { $ne: true },
    isReversed: { $ne: true },
  };
  if (scope === 'COMPANY') {
    filter.$or = [
      {
        sourceType: { $in: ['EXPENSE_PAYMENT', 'QUICK_EXPENSE'] },
        $or: [{ societyId: null }, { societyId: { $exists: false } }],
      },
      { sourceType: 'COMMISSION_PAYMENT' },
    ];
  } else if (scope === 'SOCIETY') {
    filter.sourceType = { $in: ['EXPENSE_PAYMENT', 'QUICK_EXPENSE'] };
    if (query.societyId && query.societyId !== 'all') {
      filter.societyId = query.societyId;
    } else {
      filter.societyId = { $ne: null };
    }
  } else {
    filter.sourceType = { $in: ['EXPENSE_PAYMENT', 'QUICK_EXPENSE'] };
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

  // Expense bills follow the scope filter normally; commission bills only
  // surface in the COMPANY tab since they're paid out of the company bank.
  const expenseBillQuery = { ...billFilter, status: { $ne: 'Paid' } };
  const openExpenseBills = await ExpenseBill.find(expenseBillQuery).lean();

  let openCommissionBills = [];
  if (scope === 'COMPANY') {
    const commissionFilter = notDeleted({ status: { $ne: 'Paid' } });
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
        scope: 'COMPANY',
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

  const newPaid = (bill.paidAmount || 0) + amount;
  const status = newPaid >= (bill.amount || 0) ? 'Paid' : 'Partial';
  await ExpenseBill.updateOne({ id: billId }, { $set: { paidAmount: newPaid, status } });

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

  const bill = await ExpenseBill.findOne({ id: payment.billId }).lean();
  if (bill) {
    const newPaid = Math.max(0, (bill.paidAmount || 0) - (payment.amount || 0));
    const status = newPaid <= 0 ? 'Pending' : (newPaid >= (bill.amount || 0) ? 'Paid' : 'Partial');
    await ExpenseBill.updateOne({ id: payment.billId }, { $set: { paidAmount: newPaid, status } });
  }

  await ExpensePayment.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  return { message: 'Expense payment deleted with reversal' };
};

module.exports = {
  listBills, createBill, deleteBill,
  listExpenses, deleteExpense, quickExpense,
  listBillPayments, addBillPayment, deleteBillPayment,
};
