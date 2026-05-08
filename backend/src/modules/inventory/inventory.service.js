const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { Inventory, Society } = require('../../models');

const stripId = ({ _id, ...rest }) => rest;

const listForSociety = async (societyId) => {
  const inventory = await Inventory.find(notDeleted({ societyId })).lean();
  return inventory.map(stripId);
};

// Compute totalPrice only when both inputs are real numbers — the inventory
// form doesn't always collect pricePerSqft, in which case totalPrice stays 0.
const computeTotalPrice = (area, pricePerSqft) => {
  const a = Number(area);
  const p = Number(pricePerSqft);
  if (!Number.isFinite(a) || !Number.isFinite(p)) return 0;
  return a * p;
};

const create = async (societyId, body) => {
  const inventoryNumber = (body.inventoryNumber || '').trim();
  if (!inventoryNumber) return { error: 'Inventory number is required', status: 400 };

  const existing = await Inventory.findOne(notDeleted({ societyId, inventoryNumber })).lean();
  if (existing) {
    return { error: `Inventory number "${inventoryNumber}" already exists in this society`, status: 409 };
  }

  const area = body.area != null ? Number(body.area) : null;
  const pricePerSqft = body.pricePerSqft != null ? Number(body.pricePerSqft) : null;

  const item = {
    id: uuidv4(),
    societyId,
    inventoryNumber,
    type: body.type,
    phase: body.phase || '',
    area,
    pricePerSqft,
    totalPrice: computeTotalPrice(area, pricePerSqft),
    status: 'Available',
    floor: body.floor || null,
    facing: body.facing || '',
    notes: body.notes || '',
    createdAt: new Date(),
  };
  await Inventory.create(item);
  return item;
};

const update = async (id, body) => {
  const current = await Inventory.findOne({ id }).lean();
  if (!current) return null;

  const updates = { ...body, updatedAt: new Date() };

  if (body.inventoryNumber !== undefined) {
    const inventoryNumber = (body.inventoryNumber || '').trim();
    if (!inventoryNumber) return { error: 'Inventory number is required', status: 400 };
    if (inventoryNumber !== current.inventoryNumber) {
      const clash = await Inventory.findOne(notDeleted({
        societyId: current.societyId,
        inventoryNumber,
        id: { $ne: id },
      })).lean();
      if (clash) {
        return { error: `Inventory number "${inventoryNumber}" already exists in this society`, status: 409 };
      }
    }
    updates.inventoryNumber = inventoryNumber;
  }

  if (body.area !== undefined || body.pricePerSqft !== undefined) {
    const area = body.area !== undefined ? Number(body.area) : current.area;
    const pricePerSqft = body.pricePerSqft !== undefined ? Number(body.pricePerSqft) : current.pricePerSqft;
    updates.totalPrice = computeTotalPrice(area, pricePerSqft);
  }
  await Inventory.updateOne({ id }, { $set: updates });
  const updated = await Inventory.findOne({ id }).lean();
  if (!updated) return null;
  return stripId(updated);
};

const remove = async (id) => {
  await Inventory.updateOne({ id }, { $set: { isDeleted: true, deletedAt: new Date() } });
};

const listGlobalAdmin = async (query) => {
  const {
    societyId, status, type, q,
    page = 1, limit = 50,
    sort = 'createdAt', order = 'desc',
  } = query;

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.max(1, Math.min(500, parseInt(limit) || 50));
  const skip = (pageNum - 1) * limitNum;
  const sortDirection = order === 'asc' ? 1 : -1;

  const societies = await Society.find({}).lean();
  const societyMap = {};
  societies.forEach(s => { societyMap[s.id] = s; });

  const filter = { isDeleted: { $ne: true } };
  if (societyId && societyId !== 'all') filter.societyId = societyId;
  if (status && status !== 'all') filter.status = status;
  if (type && type !== 'all') filter.type = type;

  if (q && q.trim()) {
    const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const matchingSocietyIds = societies
      .filter(s => rx.test(s.name || ''))
      .map(s => s.id);

    filter.$or = [
      { inventoryNumber: rx },
      { type: rx },
      { currentOwner: rx },
      { facing: rx },
      { floor: rx },
      { notes: rx },
    ];
    if (matchingSocietyIds.length > 0) {
      filter.$or.push({ societyId: { $in: matchingSocietyIds } });
    }
  }

  const total = await Inventory.countDocuments(filter);

  const items = await Inventory
    .find(filter)
    .sort({ [sort]: sortDirection })
    .skip(skip)
    .limit(limitNum)
    .lean();

  const inventory = items.map(({ _id, ...rest }) => ({
    ...rest,
    societyName: societyMap[rest.societyId]?.name || 'Unknown',
    societyLocation: societyMap[rest.societyId]?.location || '',
  }));

  const summaryAgg = await Inventory.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        available: { $sum: { $cond: [{ $eq: ['$status', 'Available'] }, 1, 0] } },
        sold: { $sum: { $cond: [{ $eq: ['$status', 'Sold'] }, 1, 0] } },
        booked: { $sum: { $cond: [{ $eq: ['$status', 'Booked'] }, 1, 0] } },
        blocked: { $sum: { $cond: [{ $eq: ['$status', 'Blocked'] }, 1, 0] } },
      },
    },
  ]);
  const summary = summaryAgg[0]
    ? { total: summaryAgg[0].total, available: summaryAgg[0].available, sold: summaryAgg[0].sold, booked: summaryAgg[0].booked, blocked: summaryAgg[0].blocked }
    : { total: 0, available: 0, sold: 0, booked: 0, blocked: 0 };

  const types = (await Inventory.distinct('type', { isDeleted: { $ne: true } }))
    .filter(Boolean).sort();
  const distinctStatuses = (await Inventory.distinct('status', { isDeleted: { $ne: true } }))
    .filter(Boolean);
  const statuses = distinctStatuses.length > 0 ? distinctStatuses : ['Available', 'Sold', 'Booked', 'Blocked'];

  return {
    inventory,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    summary,
    filters: { types, statuses },
  };
};

// Paginated by default — without `?page=&limit=` callers get capped to a
// sane window instead of dumping the entire collection, which used to OOM
// large clients and stall response serialization.
const listGlobal = async (query = {}) => {
  const pageNum = Math.max(1, parseInt(query.page) || 1);
  const limitNum = Math.max(1, Math.min(500, parseInt(query.limit) || 100));
  const skip = (pageNum - 1) * limitNum;

  const filter = notDeleted();
  const [inventory, total, societies] = await Promise.all([
    Inventory.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    Inventory.countDocuments(filter),
    Society.find({}).lean(),
  ]);
  const societyMap = {};
  societies.forEach(s => societyMap[s.id] = s.name);

  const enriched = inventory.map(item => ({
    ...item,
    societyName: societyMap[item.societyId] || 'Unknown',
  }));

  return {
    inventory: enriched.map(stripId),
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  };
};

module.exports = { listForSociety, create, update, remove, listGlobalAdmin, listGlobal };
