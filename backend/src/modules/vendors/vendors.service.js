const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { Vendor, Transaction } = require('../../models');

const stripId = ({ _id, ...rest }) => rest;

const list = async (query) => {
  const filter = notDeleted();
  if (query.societyId) filter.societyId = query.societyId;
  const vendors = await Vendor.find(filter).lean();
  return vendors.map(stripId);
};

const create = async (body) => {
  const vendor = {
    id: uuidv4(),
    societyId: body.societyId,
    name: body.name,
    type: body.type,
    phone: body.phone || '',
    address: body.address || '',
    notes: body.notes || '',
    createdAt: new Date(),
  };
  await Vendor.create(vendor);
  return vendor;
};

const update = async (id, body) => {
  const update = { ...body, updatedAt: new Date() };
  delete update.id;
  delete update._id;
  await Vendor.updateOne({ id }, { $set: update });
  const updated = await Vendor.findOne({ id }).lean();
  if (!updated) return null;
  return stripId(updated);
};

const remove = async (id) => {
  await Vendor.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
};

const ledger = async (vendorId) => {
  const vendor = await Vendor.findOne({ id: vendorId }).lean();
  if (!vendor) return { error: 'Vendor not found', status: 404 };

  const txns = await Transaction.find({
    partyType: 'Vendor',
    partyName: vendor.name,
    direction: 'OUT',
    isReversal: { $ne: true },
  }).sort({ txnDate: -1 }).lean();

  return txns.map(t => ({
    id: t.id,
    date: t.txnDate || t.createdAt,
    source: t.sourceType === 'COMMISSION_PAYMENT' ? 'COMMISSION' : 'EXPENSE',
    reference: t.referenceNo || t.sourceId || '',
    amount: t.amount || 0,
    paymentMode: t.paymentMode || 'Cash',
    remark: t.remark || '',
  }));
};

module.exports = { list, create, update, remove, ledger };
