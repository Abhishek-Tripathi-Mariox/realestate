const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./trash.service');

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

const list = asyncHandler(async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  res.json(await service.list(req.query));
});

const restore = asyncHandler(async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  sendOrError(res, await service.restore(req.params.type, req.params.id));
});

const purge = asyncHandler(async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  sendOrError(res, await service.purge(req.params.type, req.params.id));
});

const empty = asyncHandler(async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  sendOrError(res, await service.empty(req.query.type || null));
});

module.exports = { list, restore, purge, empty };
