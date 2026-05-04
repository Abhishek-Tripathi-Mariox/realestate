const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./admin.service');

const requireSuperAdmin = (req, res) => {
  if (req.user.role !== 'super_admin') {
    res.status(403).json({ error: 'Super Admin only' });
    return false;
  }
  return true;
};

const sendOrError = (res, result) => {
  if (result && result.error) return res.status(result.status || 500).json({ error: result.error });
  res.json(result);
};

const recycleBin = asyncHandler(async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  res.json(await service.recycleBin(req.query));
});

const restore = asyncHandler(async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  sendOrError(res, await service.restore(req.params.collection, req.params.id));
});

const auditLogs = asyncHandler(async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  res.json(await service.auditLogs(req.query));
});

const permanentDelete = asyncHandler(async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  sendOrError(res, await service.permanentDelete(req.params.collection, req.params.id));
});

const cleanupOrphans = asyncHandler(async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  res.json(await service.cleanupOrphans());
});

module.exports = { recycleBin, restore, auditLogs, permanentDelete, cleanupOrphans };
