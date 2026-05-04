const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { createTransaction, createReversalTransaction } = require('../../utils/transactions');
const {
  Party, Loan, LoanRepayment, Account, Transaction,
} = require('../../models');

const LOAN_PAYMENT_MODES = ['Cash', 'Bank Transfer', 'Cheque', 'RTGS', 'UPI'];
const PHONE_RX = /^[0-9+\-\s()]{7,20}$/;

const isFiniteNumber = (v) => Number.isFinite(v) && !Number.isNaN(v);

const validateDateNotFuture = (dateStr, label = 'Date') => {
  if (!dateStr) return `${label} is required`;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return `${label} is invalid`;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (d.getTime() > today.getTime()) return `${label} cannot be in the future`;
  return null;
};

const stripId = ({ _id, ...rest }) => rest;

// ============ Parties ============

const listParties = async () => {
  const parties = await Party.find(notDeleted()).lean();

  const enriched = await Promise.all(parties.map(async (party) => {
    const borrowLoans = await Loan.find({ partyId: party.id, direction: 'BORROWED', isDeleted: { $ne: true } }).lean();
    const givenLoans = await Loan.find({ partyId: party.id, direction: 'GIVEN', isDeleted: { $ne: true } }).lean();

    const totalBorrowed = borrowLoans.reduce((sum, l) => sum + l.principalAmount, 0);
    const totalBorrowRepaid = borrowLoans.reduce((sum, l) => sum + (l.totalRepaid || 0), 0);
    const totalGiven = givenLoans.reduce((sum, l) => sum + l.principalAmount, 0);
    const totalGivenReceived = givenLoans.reduce((sum, l) => sum + (l.totalRepaid || 0), 0);

    return {
      ...party,
      totalBorrowed,
      totalBorrowRepaid,
      totalGiven,
      totalGivenReceived,
      openBorrowLoans: borrowLoans.filter(l => l.status === 'OPEN').length,
      openGivenLoans: givenLoans.filter(l => l.status === 'OPEN').length,
      totalLoans: borrowLoans.length + givenLoans.length,
    };
  }));

  return enriched.map(stripId);
};

const createParty = async (body) => {
  const name = (body.name || '').trim();
  const phone = (body.phone || '').trim();
  const address = (body.address || '').trim();
  const notes = (body.notes || '').trim();

  if (name.length < 2) return { error: 'Name must be at least 2 characters', status: 400 };
  if (name.length > 100) return { error: 'Name must be 100 characters or less', status: 400 };
  if (phone && !PHONE_RX.test(phone)) return { error: 'Phone format is invalid (digits, spaces, +, -, () allowed; 7–20 chars)', status: 400 };
  if (address.length > 250) return { error: 'Address must be 250 characters or less', status: 400 };
  if (notes.length > 500) return { error: 'Notes must be 500 characters or less', status: 400 };

  const existing = await Party.findOne(notDeleted({ name })).lean();
  if (existing) return { error: 'A party with this name already exists', status: 409 };

  const party = { id: uuidv4(), name, phone, address, notes, createdAt: new Date() };
  await Party.create(party);
  return party;
};

const removeParty = async (id) => {
  await Party.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
};

const partyLedger = async (partyId) => {
  const loans = await Loan.find({ partyId, isDeleted: { $ne: true } }).lean();
  const repayments = await LoanRepayment.find({ partyId, isDeleted: { $ne: true } }).lean();

  let entries = [];
  loans.forEach(loan => {
    entries.push({
      id: loan.id,
      date: loan.loanDate,
      type: 'LOAN',
      direction: loan.direction,
      description: loan.direction === 'BORROWED' ? 'Borrowed' : 'Given',
      credit: loan.direction === 'BORROWED' ? loan.principalAmount : 0,
      debit: loan.direction === 'GIVEN' ? loan.principalAmount : 0,
    });
  });
  repayments.forEach(r => {
    const loan = loans.find(l => l.id === r.loanId);
    entries.push({
      id: r.id,
      date: r.repaymentDate,
      type: 'REPAYMENT',
      direction: loan?.direction || 'UNKNOWN',
      description: loan?.direction === 'BORROWED' ? 'Repaid' : 'Received',
      credit: loan?.direction === 'GIVEN' ? r.amount : 0,
      debit: loan?.direction === 'BORROWED' ? r.amount : 0,
    });
  });

  entries.sort((a, b) => new Date(a.date) - new Date(b.date));

  let balance = 0;
  entries = entries.map(e => {
    balance += e.credit - e.debit;
    return { ...e, balance };
  });

  const borrowLoans = loans.filter(l => l.direction === 'BORROWED');
  const givenLoans = loans.filter(l => l.direction === 'GIVEN');

  const summary = {
    totalBorrowed: borrowLoans.reduce((s, l) => s + l.principalAmount, 0),
    totalBorrowRepaid: borrowLoans.reduce((s, l) => s + (l.totalRepaid || 0), 0),
    borrowBalance: borrowLoans.reduce((s, l) => s + l.principalAmount - (l.totalRepaid || 0), 0),
    totalGiven: givenLoans.reduce((s, l) => s + l.principalAmount, 0),
    totalGivenReceived: givenLoans.reduce((s, l) => s + (l.totalRepaid || 0), 0),
    givenBalance: givenLoans.reduce((s, l) => s + l.principalAmount - (l.totalRepaid || 0), 0),
    netBalance: balance,
  };

  return { entries, summary };
};

// ============ Loans ============

const listLoans = async (query) => {
  const filter = notDeleted();
  if (query.direction) filter.direction = query.direction;
  if (query.status && query.status !== 'all') filter.status = query.status;
  if (query.partyId && query.partyId !== 'all') filter.partyId = query.partyId;

  const loans = await Loan.find(filter).lean();
  const enriched = await Promise.all(loans.map(async (loan) => {
    const party = await Party.findOne({ id: loan.partyId }).lean();
    const account = await Account.findOne({ id: loan.accountId }).lean();
    return {
      ...loan,
      partyName: party?.name || 'Unknown',
      accountName: account?.name || 'Unknown',
    };
  }));
  return enriched.map(stripId);
};

const createLoan = async (body, userId) => {
  const direction = body.direction;
  if (!['BORROWED', 'GIVEN'].includes(direction)) {
    return { error: 'Direction must be BORROWED or GIVEN', status: 400 };
  }

  if (!body.partyId) return { error: 'Party is required', status: 400 };
  const party = await Party.findOne(notDeleted({ id: body.partyId })).lean();
  if (!party) return { error: 'Party not found', status: 404 };

  const principalAmount = parseFloat(body.principalAmount);
  if (!isFiniteNumber(principalAmount) || principalAmount <= 0) {
    return { error: 'Principal amount must be a positive number', status: 400 };
  }
  if (principalAmount > 1e12) {
    return { error: 'Principal amount is unrealistically large', status: 400 };
  }

  const dateErr = validateDateNotFuture(body.loanDate, 'Loan date');
  if (dateErr) return { error: dateErr, status: 400 };

  if (!body.accountId) return { error: 'Account is required', status: 400 };
  const account = await Account.findOne(notDeleted({ id: body.accountId })).lean();
  if (!account) return { error: 'Account not found', status: 404 };
  if (account.scope && account.scope !== 'COMPANY') {
    return { error: 'Account must be a company-level account for loans', status: 400 };
  }

  const paymentMode = body.paymentMode || 'Bank Transfer';
  if (!LOAN_PAYMENT_MODES.includes(paymentMode)) {
    return { error: `Payment mode must be one of: ${LOAN_PAYMENT_MODES.join(', ')}`, status: 400 };
  }

  const purpose = (body.purpose || '').trim();
  if (purpose.length > 500) {
    return { error: 'Purpose must be 500 characters or less', status: 400 };
  }

  const loan = {
    id: uuidv4(),
    partyId: body.partyId,
    direction,
    principalAmount,
    loanDate: body.loanDate,
    accountId: body.accountId,
    purpose,
    paymentMode,
    totalRepaid: 0,
    balancePrincipal: principalAmount,
    status: 'OPEN',
    createdBy: userId,
    createdAt: new Date(),
  };

  await Loan.create(loan);

  const txnDirection = direction === 'BORROWED' ? 'IN' : 'OUT';
  const sourceType = direction === 'BORROWED' ? 'LOAN_BORROWED' : 'LOAN_GIVEN';

  await createTransaction({
    txnDate: loan.loanDate,
    societyId: null,
    accountId: loan.accountId,
    direction: txnDirection,
    amount: loan.principalAmount,
    paymentMode: loan.paymentMode,
    partyType: 'Party',
    partyName: party.name,
    sourceType,
    sourceId: loan.id,
    remark: purpose || `Loan ${direction.toLowerCase()} - ${party.name}`,
  }, userId);

  return { ...loan, partyName: party.name };
};

const removeLoan = async (id, userId) => {
  const loan = await Loan.findOne({ id }).lean();
  if (!loan) return { error: 'Loan not found', status: 404 };

  const sourceType = loan.direction === 'BORROWED' ? 'LOAN_BORROWED' : 'LOAN_GIVEN';
  const originalTxn = await Transaction.findOne({ sourceType, sourceId: id }).lean();
  if (originalTxn) {
    await createReversalTransaction(originalTxn, userId, 'Loan deleted');
  }

  const repayments = await LoanRepayment.find({ loanId: id }).lean();
  for (const r of repayments) {
    const repaySourceType = loan.direction === 'BORROWED' ? 'LOAN_BORROWED_REPAYMENT' : 'LOAN_GIVEN_REPAYMENT';
    const repayTxn = await Transaction.findOne({ sourceType: repaySourceType, sourceId: r.id }).lean();
    if (repayTxn) {
      await createReversalTransaction(repayTxn, userId, 'Loan deleted');
    }
  }

  await LoanRepayment.updateMany({ loanId: id }, { $set: { isDeleted: true } });
  await Loan.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });

  return { message: 'Loan deleted with reversals' };
};

const listRepayments = async (loanId) => {
  const repayments = await LoanRepayment
    .find(notDeleted({ loanId }))
    .sort({ repaymentDate: -1 })
    .lean();
  const enriched = await Promise.all(repayments.map(async (r) => {
    const account = await Account.findOne({ id: r.accountId }).lean();
    return { ...r, accountName: account?.name || 'Unknown' };
  }));
  return enriched.map(stripId);
};

const createRepayment = async (loanId, body, userId) => {
  const loan = await Loan.findOne(notDeleted({ id: loanId })).lean();
  if (!loan) return { error: 'Loan not found', status: 404 };

  if (loan.status === 'CLOSED') {
    return { error: 'Loan is already closed; no further repayments allowed', status: 400 };
  }

  const amount = parseFloat(body.amount);
  if (!isFiniteNumber(amount) || amount <= 0) {
    return { error: 'Repayment amount must be a positive number', status: 400 };
  }
  const balance = Number(loan.balancePrincipal) || 0;
  if (amount > balance + 0.005) {
    return {
      error: `Repayment amount (${amount}) exceeds outstanding balance (${balance.toFixed(2)})`,
      status: 400,
    };
  }

  const dateErr = validateDateNotFuture(body.repaymentDate, 'Repayment date');
  if (dateErr) return { error: dateErr, status: 400 };
  if (new Date(body.repaymentDate) < new Date(loan.loanDate)) {
    return { error: 'Repayment date cannot be before the loan date', status: 400 };
  }

  if (!body.accountId) return { error: 'Account is required', status: 400 };
  const account = await Account.findOne(notDeleted({ id: body.accountId })).lean();
  if (!account) return { error: 'Account not found', status: 404 };
  if (account.scope && account.scope !== 'COMPANY') {
    return { error: 'Account must be a company-level account for loan repayments', status: 400 };
  }

  const paymentMode = body.paymentMode || 'Cash';
  if (!LOAN_PAYMENT_MODES.includes(paymentMode)) {
    return { error: `Payment mode must be one of: ${LOAN_PAYMENT_MODES.join(', ')}`, status: 400 };
  }

  const remark = (body.remark || '').trim();
  if (remark.length > 500) return { error: 'Remark must be 500 characters or less', status: 400 };

  const party = await Party.findOne({ id: loan.partyId }).lean();

  const repayment = {
    id: uuidv4(),
    loanId,
    partyId: loan.partyId,
    amount,
    repaymentDate: body.repaymentDate,
    accountId: body.accountId,
    paymentMode,
    remark,
    createdBy: userId,
    createdAt: new Date(),
  };

  await LoanRepayment.create(repayment);

  const newTotalRepaid = (loan.totalRepaid || 0) + amount;
  const newBalance = loan.principalAmount - newTotalRepaid;
  const newStatus = newBalance <= 0.005 ? 'CLOSED' : 'OPEN';

  await Loan.updateOne(
    { id: loanId },
    { $set: { totalRepaid: newTotalRepaid, balancePrincipal: Math.max(0, newBalance), status: newStatus } },
  );

  const txnDirection = loan.direction === 'BORROWED' ? 'OUT' : 'IN';
  const sourceType = loan.direction === 'BORROWED' ? 'LOAN_BORROWED_REPAYMENT' : 'LOAN_GIVEN_REPAYMENT';

  await createTransaction({
    txnDate: repayment.repaymentDate,
    societyId: null,
    accountId: repayment.accountId,
    direction: txnDirection,
    amount,
    paymentMode,
    partyType: 'Party',
    partyName: party?.name || 'Unknown',
    sourceType,
    sourceId: repayment.id,
    remark: remark || `Loan repayment - ${party?.name || ''}`.trim(),
  }, userId);

  return repayment;
};

const deleteRepayment = async (loanId, repaymentId, userId) => {
  const repayment = await LoanRepayment.findOne({ id: repaymentId }).lean();
  if (!repayment) return { error: 'Repayment not found', status: 404 };

  const loan = await Loan.findOne({ id: loanId }).lean();

  const sourceType = loan?.direction === 'BORROWED' ? 'LOAN_BORROWED_REPAYMENT' : 'LOAN_GIVEN_REPAYMENT';
  const originalTxn = await Transaction.findOne({ sourceType, sourceId: repaymentId }).lean();
  if (originalTxn) {
    await createReversalTransaction(originalTxn, userId, 'Repayment deleted');
  }

  if (loan) {
    const newTotalRepaid = Math.max(0, (loan.totalRepaid || 0) - repayment.amount);
    const newBalance = loan.principalAmount - newTotalRepaid;
    await Loan.updateOne(
      { id: loanId },
      { $set: { totalRepaid: newTotalRepaid, balancePrincipal: newBalance, status: 'OPEN' } },
    );
  }

  await LoanRepayment.updateOne({ id: repaymentId }, { $set: { isDeleted: true, deletedAt: new Date() } });
  return { message: 'Repayment deleted with reversal' };
};

module.exports = {
  listParties, createParty, removeParty, partyLedger,
  listLoans, createLoan, removeLoan,
  listRepayments, createRepayment, deleteRepayment,
};
