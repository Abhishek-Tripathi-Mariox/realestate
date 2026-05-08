const {
  Sale, Inventory, ExpenseBill, Partner, Customer,
  Purchase, CommissionBill, ResaleDeal, CustomerPayment,
  AuditLog, User, SocietyPhase, Society,
} = require('../../models');
const trashService = require('../trash/trash.service');

const ORPHAN_CLEANUP_MODELS = [
  Inventory, Purchase, Sale, Partner, Customer, ExpenseBill,
  CommissionBill, ResaleDeal, CustomerPayment, SocietyPhase,
];

// Recycle-bin endpoints are kept on /api/admin for backward compatibility with
// the existing frontend dialog. Real logic lives in modules/trash so both
// /api/admin/recycle-bin and /api/trash share one source of truth.
const recycleBin = async (query = {}) => {
  const { records, summary, total } = await trashService.list(query);
  return { records, summary, total };
};

const restore = (collection, id) => trashService.restore(collection, id);

const auditLogs = async (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.max(1, Math.min(200, parseInt(query.limit) || 50));
  const skip = (page - 1) * limit;

  const filter = {};
  if (query.entityType && query.entityType !== 'all') filter.entityType = query.entityType;
  if (query.action && query.action !== 'all') filter.action = query.action;
  if (query.userId && query.userId !== 'all') filter.userId = query.userId;

  if (query.startDate || query.endDate) {
    filter.timestamp = {};
    if (query.startDate) filter.timestamp.$gte = new Date(query.startDate);
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setHours(23, 59, 59, 999);
      filter.timestamp.$lte = end;
    }
  }

  if (query.q && String(query.q).trim()) {
    const rx = new RegExp(String(query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { entityType: rx },
      { entityId: rx },
      { reason: rx },
      { userName: rx },
    ];
  }

  const total = await AuditLog.countDocuments(filter);
  const logs = await AuditLog
    .find(filter)
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const userIds = [...new Set(logs.map(l => l.userId).filter(Boolean))];
  let userMap = {};
  if (userIds.length > 0) {
    const users = await User.find({ id: { $in: userIds } }).lean();
    users.forEach(u => { userMap[u.id] = { name: u.name, email: u.email, role: u.role }; });
  }

  const enriched = logs.map(({ _id, ...rest }) => ({
    ...rest,
    userName: rest.userName || userMap[rest.userId]?.name || 'System',
    userEmail: userMap[rest.userId]?.email || null,
  }));

  const entityTypes = (await AuditLog.distinct('entityType')).filter(Boolean).sort();
  const actions = (await AuditLog.distinct('action')).filter(Boolean).sort();

  return {
    logs: enriched,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    filters: { entityTypes, actions },
  };
};

const permanentDelete = (collection, id) => trashService.purge(collection, id);

const cleanupOrphans = async () => {
  const societyIds = (await Society.find({}, { id: 1 }).lean()).map(s => s.id);
  let removed = 0;

  for (const Model of ORPHAN_CLEANUP_MODELS) {
    const result = await Model.updateMany(
      { societyId: { $nin: [...societyIds, null] }, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, deletedAt: new Date(), deletedReason: 'Orphan cleanup' } },
    );
    removed += result.modifiedCount || 0;
  }

  return { message: `Cleanup complete. Marked ${removed} orphan record(s) as deleted.`, removed };
};

module.exports = { recycleBin, restore, auditLogs, permanentDelete, cleanupOrphans };
