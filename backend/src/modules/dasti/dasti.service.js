const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { createTransaction: createDaybookTxn, createReversalTransaction } = require('../../utils/transactions');
const { Firm, DastiPerson, DastiTransaction, FirmTransaction, Account, Transaction } = require('../../models');

// sourceType used on the daybook entry that mirrors a DastiTransaction. The
// dasti row's `id` is stored as the daybook txn's `sourceId` so we can find +
// reverse it on update / delete.
const DASTI_SOURCE_TYPE = 'DASTI_TRANSACTION';

const DASTI_PAYMENT_MODES = ['Cash', 'Bank Transfer', 'Cheque', 'RTGS', 'UPI'];
const PHONE_RX = /^[0-9+\-\s()]{7,20}$/;

const stripId = ({ _id, ...rest }) => rest;

// ============================================================ Firms ============

const listFirms = async () => {
  const firms = await Firm.find(notDeleted()).sort({ name: 1 }).lean();
  if (firms.length === 0) return [];

  // Bulk-pull every live firm transaction so we can attach per-firm totals to
  // the listing in one round-trip (mirrors how listPersons works for dasti).
  const ids = firms.map(f => f.id);
  const txns = await FirmTransaction
    .find({ firmId: { $in: ids }, isDeleted: { $ne: true } }, { firmId: 1, type: 1, amount: 1 })
    .lean();
  const byFirm = txns.reduce((acc, t) => {
    (acc[t.firmId] = acc[t.firmId] || []).push(t);
    return acc;
  }, {});

  return firms.map((f) => {
    const list = byFirm[f.id] || [];
    const totalIn = list.filter(t => t.type === 'IN').reduce((s, t) => s + (t.amount || 0), 0);
    const totalOut = list.filter(t => t.type === 'OUT').reduce((s, t) => s + (t.amount || 0), 0);
    return { ...stripId(f), totalIn, totalOut, balance: totalIn - totalOut, txnCount: list.length };
  });
};

const getFirm = async (id) => {
  const firm = await Firm.findOne(notDeleted({ id })).lean();
  if (!firm) return { error: 'Firm not found', status: 404 };
  return stripId(firm);
};

const createFirm = async (body, userId) => {
  const name = (body.name || '').trim();
  const remark = (body.remark || '').trim();
  if (name.length < 1) return { error: 'Firm name is required', status: 400 };
  if (name.length > 100) return { error: 'Firm name must be 100 characters or less', status: 400 };

  const existing = await Firm.findOne(notDeleted({ name })).lean();
  if (existing) return { error: 'A firm with this name already exists', status: 409 };

  const firm = {
    id: uuidv4(),
    name,
    remark,
    createdBy: userId,
    createdAt: new Date(),
  };
  await Firm.create(firm);
  return firm;
};

const updateFirm = async (id, body) => {
  const firm = await Firm.findOne(notDeleted({ id })).lean();
  if (!firm) return { error: 'Firm not found', status: 404 };

  const update = { updatedAt: new Date() };
  if (body.name !== undefined) {
    const name = (body.name || '').trim();
    if (name.length < 1) return { error: 'Firm name is required', status: 400 };
    if (name.length > 100) return { error: 'Firm name must be 100 characters or less', status: 400 };
    const dupe = await Firm.findOne(notDeleted({ name, id: { $ne: id } })).lean();
    if (dupe) return { error: 'A firm with this name already exists', status: 409 };
    update.name = name;
  }
  if (body.remark !== undefined) update.remark = (body.remark || '').trim();

  await Firm.updateOne({ id }, { $set: update });
  return { ...firm, ...update };
};

const removeFirm = async (id) => {
  // Block delete when there are live transactions tagged to this firm —
  // dropping it would orphan rows from both the Dasti Ledger (firm tag) and
  // the Firm Ledger (firm as primary subject).
  const [dastiCount, firmCount] = await Promise.all([
    DastiTransaction.countDocuments({ firmId: id, isDeleted: { $ne: true } }),
    FirmTransaction.countDocuments({ firmId: id, isDeleted: { $ne: true } }),
  ]);
  if (dastiCount > 0 || firmCount > 0) {
    const parts = [];
    if (dastiCount) parts.push(`${dastiCount} dasti`);
    if (firmCount) parts.push(`${firmCount} firm-ledger`);
    return {
      error: `Firm has ${parts.join(' + ')} transaction(s). Remove or retag them first.`,
      status: 409,
    };
  }
  await Firm.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  return { message: 'Firm deleted' };
};

// ====================================================== Dasti Persons ============

const listPersons = async () => {
  const persons = await DastiPerson.find(notDeleted()).sort({ name: 1 }).lean();
  if (persons.length === 0) return [];

  // Pull every live transaction in one shot, then bucket by person — avoids
  // 2·N round-trips when there are many partners.
  const ids = persons.map(p => p.id);
  const txns = await DastiTransaction
    .find({ personId: { $in: ids }, isDeleted: { $ne: true } })
    .lean();

  const byPerson = txns.reduce((acc, t) => {
    (acc[t.personId] = acc[t.personId] || []).push(t);
    return acc;
  }, {});

  return persons.map((p) => {
    const list = byPerson[p.id] || [];
    const totalIn = list.filter(t => t.type === 'IN').reduce((s, t) => s + (t.amount || 0), 0);
    const totalOut = list.filter(t => t.type === 'OUT').reduce((s, t) => s + (t.amount || 0), 0);
    // Net balance from the firm's perspective: positive = firm owes person back;
    // negative = person still owes firm. Mirrors the screenshot's "BAL" chip.
    return { ...stripId(p), totalIn, totalOut, balance: totalIn - totalOut, txnCount: list.length };
  });
};

const getPerson = async (id) => {
  const person = await DastiPerson.findOne(notDeleted({ id })).lean();
  if (!person) return { error: 'Person not found', status: 404 };
  return stripId(person);
};

const createPerson = async (body, userId) => {
  const name = (body.name || '').trim();
  const mobile = (body.mobile || '').trim();
  const remark = (body.remark || '').trim();

  if (name.length < 2) return { error: 'Name must be at least 2 characters', status: 400 };
  if (name.length > 100) return { error: 'Name must be 100 characters or less', status: 400 };
  if (mobile && !PHONE_RX.test(mobile)) return { error: 'Mobile format is invalid', status: 400 };
  if (remark.length > 500) return { error: 'Remark must be 500 characters or less', status: 400 };

  const existing = await DastiPerson.findOne(notDeleted({ name })).lean();
  if (existing) return { error: 'A person with this name already exists', status: 409 };

  const person = {
    id: uuidv4(),
    name,
    mobile,
    remark,
    createdBy: userId,
    createdAt: new Date(),
  };
  await DastiPerson.create(person);
  return person;
};

const updatePerson = async (id, body) => {
  const person = await DastiPerson.findOne(notDeleted({ id })).lean();
  if (!person) return { error: 'Person not found', status: 404 };

  const update = { updatedAt: new Date() };
  if (body.name !== undefined) {
    const name = (body.name || '').trim();
    if (name.length < 2) return { error: 'Name must be at least 2 characters', status: 400 };
    if (name.length > 100) return { error: 'Name must be 100 characters or less', status: 400 };
    const dupe = await DastiPerson.findOne(notDeleted({ name, id: { $ne: id } })).lean();
    if (dupe) return { error: 'A person with this name already exists', status: 409 };
    update.name = name;
  }
  if (body.mobile !== undefined) {
    const mobile = (body.mobile || '').trim();
    if (mobile && !PHONE_RX.test(mobile)) return { error: 'Mobile format is invalid', status: 400 };
    update.mobile = mobile;
  }
  if (body.remark !== undefined) update.remark = (body.remark || '').trim();

  await DastiPerson.updateOne({ id }, { $set: update });
  return { ...person, ...update };
};

const removePerson = async (id, userId) => {
  // Cascade-soft-delete this person's transactions so the global ledger does
  // not surface orphan rows tied to a deleted account. Each live dasti entry
  // gets its mirror daybook txn reversed so the account balances back out.
  const liveTxns = await DastiTransaction.find({ personId: id, isDeleted: { $ne: true } }, { id: 1 }).lean();
  for (const t of liveTxns) {
    await reverseDaybookForDasti(t.id, userId, 'Dasti person deleted');
  }
  const stamp = { isDeleted: true, deletedAt: new Date() };
  await DastiTransaction.updateMany({ personId: id, isDeleted: { $ne: true } }, { $set: stamp });
  await DastiPerson.updateOne({ id }, { $set: stamp });
  return { message: 'Person deleted' };
};

// =================================================== Dasti Transactions ============

const buildTxnFilter = (query) => {
  const filter = notDeleted();
  if (query.personId && query.personId !== 'all') filter.personId = query.personId;
  if (query.firmId && query.firmId !== 'all') {
    if (query.firmId === 'none') filter.$or = [{ firmId: null }, { firmId: '' }, { firmId: { $exists: false } }];
    else filter.firmId = query.firmId;
  }
  if (query.type && query.type !== 'all') filter.type = query.type;
  if (query.paymentMode && query.paymentMode !== 'all') filter.paymentMode = query.paymentMode;
  if (query.from || query.to) {
    filter.txnDate = {};
    if (query.from) filter.txnDate.$gte = query.from;
    if (query.to) filter.txnDate.$lte = query.to;
  }
  return filter;
};

const listTransactions = async (query) => {
  const filter = buildTxnFilter(query);
  const txns = await DastiTransaction.find(filter).sort({ txnDate: -1, createdAt: -1 }).lean();

  // Optional client-side search on note (cheap enough for dasti volumes).
  const search = (query.search || '').toLowerCase().trim();
  const filtered = search
    ? txns.filter(t => (t.note || '').toLowerCase().includes(search))
    : txns;

  return filtered.map(stripId);
};

const summary = async (query) => {
  const filter = buildTxnFilter(query);
  const txns = await DastiTransaction.find(filter, { type: 1, amount: 1, personId: 1 }).lean();
  const totalIn = txns.filter(t => t.type === 'IN').reduce((s, t) => s + (t.amount || 0), 0);
  const totalOut = txns.filter(t => t.type === 'OUT').reduce((s, t) => s + (t.amount || 0), 0);
  // PEOPLE OWE FIRM = OUT-IN positive; FIRM OWES PEOPLE = IN-OUT positive.
  // The FE shows whichever side is non-negative.
  return {
    totalIn,
    totalOut,
    netBalance: totalIn - totalOut,
    activities: new Set(txns.map(t => t.personId)).size,
    txnCount: txns.length,
  };
};

const validateTxnInput = async (body) => {
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Amount must be positive', status: 400 };
  if (!body.personId) return { error: 'Person is required', status: 400 };
  if (!body.accountId) return { error: 'Account is required', status: 400 };
  if (!['IN', 'OUT'].includes(body.type)) return { error: 'Type must be IN or OUT', status: 400 };
  if (!body.txnDate) return { error: 'Transaction date is required', status: 400 };
  if (body.paymentMode && !DASTI_PAYMENT_MODES.includes(body.paymentMode)) {
    return { error: `Payment mode must be one of: ${DASTI_PAYMENT_MODES.join(', ')}`, status: 400 };
  }
  const person = await DastiPerson.findOne(notDeleted({ id: body.personId })).lean();
  if (!person) return { error: 'Person not found', status: 404 };
  const account = await Account.findOne({ id: body.accountId }).lean();
  if (!account) return { error: 'Account not found', status: 404 };
  if (body.firmId) {
    const firm = await Firm.findOne(notDeleted({ id: body.firmId })).lean();
    if (!firm) return { error: 'Firm not found', status: 404 };
  }
  return null;
};

// Mirror a DastiTransaction onto the daybook so the chosen Cash/Bank account
// actually reflects the cash movement. The dasti row's `id` is the daybook
// txn's `sourceId`, letting us find + reverse it on update / delete.
const postDaybookForDasti = async (txn, person, userId) => {
  await createDaybookTxn({
    txnDate: txn.txnDate,
    societyId: null,                        // dasti is company-wide
    accountId: txn.accountId,
    direction: txn.type,                    // IN credits the account; OUT debits
    amount: txn.amount,
    paymentMode: txn.paymentMode,
    partyType: 'DastiPerson',
    partyName: person?.name || '',
    sourceType: DASTI_SOURCE_TYPE,
    sourceId: txn.id,
    remark: txn.note || `Dasti ${txn.type} — ${person?.name || ''}`,
  }, userId);
};

const reverseDaybookForDasti = async (dastiTxnId, userId, reason) => {
  const original = await Transaction.findOne({
    sourceType: DASTI_SOURCE_TYPE,
    sourceId: dastiTxnId,
    isReversal: { $ne: true },
    isReversed: { $ne: true },
  }).lean();
  if (original) await createReversalTransaction(original, userId, reason);
};

const createTransaction = async (body, userId) => {
  const err = await validateTxnInput(body);
  if (err) return err;
  const txn = {
    id: uuidv4(),
    personId: body.personId,
    firmId: body.firmId || null,
    accountId: body.accountId,
    type: body.type,
    amount: Number(body.amount),
    paymentMode: body.paymentMode || 'Cash',
    txnDate: body.txnDate,
    note: (body.note || '').trim(),
    createdBy: userId,
    createdAt: new Date(),
  };
  await DastiTransaction.create(txn);
  // Best-effort daybook mirror — if it fails the dasti row stays (so the
  // user's data isn't lost) but the bank balance will be off. Surfacing the
  // error keeps that visible instead of silently swallowed.
  const person = await DastiPerson.findOne({ id: txn.personId }).lean();
  await postDaybookForDasti(txn, person, userId);
  return txn;
};

const updateTransaction = async (id, body, userId) => {
  const existing = await DastiTransaction.findOne(notDeleted({ id })).lean();
  if (!existing) return { error: 'Transaction not found', status: 404 };
  // Re-validate the merged shape so partial updates can't slip through with
  // an invalid amount/type/etc.
  const merged = { ...existing, ...body };
  const err = await validateTxnInput(merged);
  if (err) return err;

  const update = { updatedAt: new Date() };
  ['personId', 'firmId', 'accountId', 'type', 'paymentMode', 'txnDate', 'note'].forEach(k => {
    if (body[k] !== undefined) update[k] = body[k];
  });
  if (body.amount !== undefined) update.amount = Number(body.amount);
  if (update.firmId === '') update.firmId = null;

  await DastiTransaction.updateOne({ id }, { $set: update });
  // Daybook can't be edited in place (would lose the audit trail), so we
  // reverse the prior entry and post a fresh one off the updated values.
  await reverseDaybookForDasti(id, userId, 'Dasti entry updated');
  const updated = { ...existing, ...update };
  const person = await DastiPerson.findOne({ id: updated.personId }).lean();
  await postDaybookForDasti(updated, person, userId);
  return updated;
};

const removeTransaction = async (id, userId) => {
  const existing = await DastiTransaction.findOne(notDeleted({ id })).lean();
  if (!existing) return { error: 'Transaction not found', status: 404 };
  await DastiTransaction.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  await reverseDaybookForDasti(id, userId, 'Dasti entry deleted');
  return { message: 'Transaction deleted' };
};

module.exports = {
  listFirms, getFirm, createFirm, updateFirm, removeFirm,
  listPersons, getPerson, createPerson, updatePerson, removePerson,
  listTransactions, summary, createTransaction, updateTransaction, removeTransaction,
};
