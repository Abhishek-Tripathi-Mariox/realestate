const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { pick } = require('../../utils/pick');
const { createTransaction, createReversalTransaction } = require('../../utils/transactions');
const {
  VendorAdvance, VendorAdvanceWork, Vendor, Account, Transaction,
} = require('../../models');

const stripId = ({ _id, ...rest }) => rest;

const ADVANCE_UPDATABLE = ['paymentMode', 'referenceNo', 'remark', 'advanceDate'];
const WORK_UPDATABLE = ['workDate', 'category', 'description', 'amount'];

// ============ Advances ============

const listAdvances = async (query) => {
  const filter = {};
  if (query.vendorId) filter.vendorId = query.vendorId;
  if (query.scope === 'COMPANY') filter.societyId = null;
  else if (query.societyId) filter.societyId = query.societyId;

  const advances = await VendorAdvance.find(notDeleted(filter)).sort({ advanceDate: -1, createdAt: -1 }).lean();
  if (advances.length === 0) return [];

  const ids = advances.map((a) => a.id);
  const works = await VendorAdvanceWork.find(notDeleted({ advanceId: { $in: ids } })).lean();
  const workByAdvance = {};
  for (const w of works) {
    workByAdvance[w.advanceId] = (workByAdvance[w.advanceId] || 0) + (w.amount || 0);
  }
  return advances.map((a) => {
    const workedAmount = workByAdvance[a.id] || 0;
    return {
      ...stripId(a),
      workedAmount,
      remainingAmount: Math.max(0, (a.amount || 0) - workedAmount),
      status: workedAmount >= (a.amount || 0) ? 'FULFILLED' : (workedAmount > 0 ? 'PARTIAL' : 'OPEN'),
    };
  });
};

const createAdvance = async (vendorId, body, userId) => {
  const vendor = await Vendor.findOne({ id: vendorId, isDeleted: { $ne: true } }).lean();
  if (!vendor) return { error: 'Vendor not found', status: 404 };

  const amount = parseFloat(body.amount) || 0;
  if (!(amount > 0)) return { error: 'Amount must be greater than zero', status: 400 };

  let accountId = body.accountId;
  if (!accountId) {
    const defaultAccount = await Account.findOne({ isDefault: true }).lean();
    accountId = defaultAccount?.id;
  }
  if (!accountId) return { error: 'Account is required', status: 400 };
  const accountDoc = await Account.findOne({ id: accountId }).lean();
  if (!accountDoc) return { error: 'Selected account not found', status: 400 };

  // Scope: use vendor's own scope. If vendor is company-scoped, advance is
  // company-scoped too (societyId=null). Otherwise inherits vendor's society.
  const societyId = vendor.societyId || null;

  const advance = {
    id: uuidv4(),
    vendorId,
    vendorName: vendor.name,
    societyId,
    accountId,
    amount,
    advanceDate: body.advanceDate || new Date().toISOString().split('T')[0],
    paymentMode: body.paymentMode || 'Cash',
    referenceNo: body.referenceNo || '',
    remark: body.remark || '',
    createdBy: userId,
    createdAt: new Date(),
  };
  await VendorAdvance.create(advance);

  await createTransaction({
    txnDate: advance.advanceDate,
    societyId,
    accountId,
    direction: 'OUT',
    amount,
    paymentMode: advance.paymentMode,
    partyType: 'Vendor',
    partyName: vendor.name,
    sourceType: 'VENDOR_ADVANCE',
    sourceId: advance.id,
    referenceNo: advance.referenceNo,
    remark: advance.remark || `Advance to ${vendor.name}`,
  }, userId);

  return stripId(advance);
};

const updateAdvance = async (advanceId, body, userId) => {
  const advance = await VendorAdvance.findOne({ id: advanceId, isDeleted: { $ne: true } }).lean();
  if (!advance) return { error: 'Advance not found', status: 404 };

  const patch = { ...pick(body, ADVANCE_UPDATABLE), updatedAt: new Date() };

  // Amount edit: needs daybook reversal + new txn (money changed). Also
  // must not shrink below already-consumed work.
  const newAmount = body.amount !== undefined ? parseFloat(body.amount) : null;
  const newAccountId = body.accountId || advance.accountId;
  const amountChanged = newAmount !== null && newAmount !== advance.amount;
  const accountChanged = newAccountId !== advance.accountId;

  if (amountChanged || accountChanged) {
    if (newAmount !== null && !(newAmount > 0)) {
      return { error: 'Amount must be greater than zero', status: 400 };
    }
    // Guard: can't shrink below consumed work
    if (newAmount !== null) {
      const worked = await VendorAdvanceWork
        .find(notDeleted({ advanceId }))
        .lean();
      const consumed = worked.reduce((s, w) => s + (w.amount || 0), 0);
      if (newAmount < consumed) {
        return {
          error: `Advance amount can't drop below ₹${consumed} already consumed by work entries`,
          status: 400,
        };
      }
    }
    if (newAccountId) {
      const accountDoc = await Account.findOne({ id: newAccountId }).lean();
      if (!accountDoc) return { error: 'Selected account not found', status: 400 };
    }
    // Reverse old daybook txn and write a fresh one with the new numbers.
    const originalTxn = await Transaction.findOne({
      sourceType: 'VENDOR_ADVANCE',
      sourceId: advanceId,
      isReversal: { $ne: true },
      isReversed: { $ne: true },
    }).lean();
    if (originalTxn) {
      await createReversalTransaction(originalTxn, userId, 'Advance edited');
    }
    patch.amount = newAmount !== null ? newAmount : advance.amount;
    patch.accountId = newAccountId;

    await createTransaction({
      txnDate: body.advanceDate || advance.advanceDate,
      societyId: advance.societyId,
      accountId: newAccountId,
      direction: 'OUT',
      amount: patch.amount,
      paymentMode: body.paymentMode || advance.paymentMode,
      partyType: 'Vendor',
      partyName: advance.vendorName,
      sourceType: 'VENDOR_ADVANCE',
      sourceId: advanceId,
      referenceNo: body.referenceNo !== undefined ? body.referenceNo : advance.referenceNo,
      remark: (body.remark !== undefined ? body.remark : advance.remark) || `Advance to ${advance.vendorName}`,
    }, userId);
  }

  await VendorAdvance.updateOne({ id: advanceId }, { $set: patch });
  const updated = await VendorAdvance.findOne({ id: advanceId }).lean();
  return stripId(updated);
};

const deleteAdvance = async (advanceId, userId) => {
  const advance = await VendorAdvance.findOne({ id: advanceId, isDeleted: { $ne: true } }).lean();
  if (!advance) return { error: 'Advance not found', status: 404 };

  // Reverse daybook OUT txn so account balance recovers.
  const originalTxn = await Transaction.findOne({
    sourceType: 'VENDOR_ADVANCE',
    sourceId: advanceId,
    isReversal: { $ne: true },
    isReversed: { $ne: true },
  }).lean();
  if (originalTxn) {
    await createReversalTransaction(originalTxn, userId, 'Advance deleted');
  }

  const stamp = { isDeleted: true, deletedAt: new Date(), deletedBy: userId };
  // Cascade soft-delete work entries so they don't linger against a dead
  // advance and confuse the ledger.
  await VendorAdvanceWork.updateMany({ advanceId, isDeleted: { $ne: true } }, { $set: stamp });
  await VendorAdvance.updateOne({ id: advanceId }, { $set: stamp });
  return { message: 'Advance deleted' };
};

// ============ Work against advance ============

const addWork = async (advanceId, body, userId) => {
  const advance = await VendorAdvance.findOne({ id: advanceId, isDeleted: { $ne: true } }).lean();
  if (!advance) return { error: 'Advance not found', status: 404 };

  const amount = parseFloat(body.amount) || 0;
  if (!(amount > 0)) return { error: 'Amount must be greater than zero', status: 400 };

  // Optional cap: don't allow work to exceed the advance amount. Comment
  // out this block if over-billing should be allowed with the excess going
  // to the vendor as owed.
  const existing = await VendorAdvanceWork.find(notDeleted({ advanceId })).lean();
  const consumed = existing.reduce((s, w) => s + (w.amount || 0), 0);
  if (consumed + amount > advance.amount) {
    return {
      error: `Work exceeds advance remaining (advance ₹${advance.amount}, already used ₹${consumed}, trying ₹${amount})`,
      status: 400,
    };
  }

  const work = {
    id: uuidv4(),
    advanceId,
    vendorId: advance.vendorId,
    societyId: advance.societyId,
    amount,
    workDate: body.workDate || new Date().toISOString().split('T')[0],
    category: body.category || '',
    description: body.description || '',
    createdBy: userId,
    createdAt: new Date(),
  };
  await VendorAdvanceWork.create(work);
  return stripId(work);
};

const updateWork = async (advanceId, workId, body, userId) => {
  const work = await VendorAdvanceWork.findOne({ id: workId, isDeleted: { $ne: true } }).lean();
  if (!work || work.advanceId !== advanceId) return { error: 'Work entry not found', status: 404 };

  const patch = { ...pick(body, WORK_UPDATABLE), updatedAt: new Date() };

  if (body.amount !== undefined) {
    const newAmount = parseFloat(body.amount) || 0;
    if (!(newAmount > 0)) return { error: 'Amount must be greater than zero', status: 400 };
    const advance = await VendorAdvance.findOne({ id: advanceId }).lean();
    const others = await VendorAdvanceWork.find(notDeleted({ advanceId, id: { $ne: workId } })).lean();
    const consumedOthers = others.reduce((s, w) => s + (w.amount || 0), 0);
    if (consumedOthers + newAmount > (advance?.amount || 0)) {
      return {
        error: `Work exceeds advance remaining (advance ₹${advance.amount}, others ₹${consumedOthers}, trying ₹${newAmount})`,
        status: 400,
      };
    }
    patch.amount = newAmount;
  }

  await VendorAdvanceWork.updateOne({ id: workId }, { $set: patch });
  const updated = await VendorAdvanceWork.findOne({ id: workId }).lean();
  return stripId(updated);
};

const deleteWork = async (advanceId, workId, userId) => {
  const work = await VendorAdvanceWork.findOne({ id: workId, isDeleted: { $ne: true } }).lean();
  if (!work || work.advanceId !== advanceId) return { error: 'Work entry not found', status: 404 };

  const stamp = { isDeleted: true, deletedAt: new Date(), deletedBy: userId };
  await VendorAdvanceWork.updateOne({ id: workId }, { $set: stamp });
  return { message: 'Work entry deleted' };
};

const listWork = async (advanceId) => {
  const works = await VendorAdvanceWork
    .find(notDeleted({ advanceId }))
    .sort({ workDate: -1, createdAt: -1 })
    .lean();
  return works.map(stripId);
};

module.exports = {
  listAdvances,
  createAdvance,
  updateAdvance,
  deleteAdvance,
  addWork,
  updateWork,
  deleteWork,
  listWork,
};
