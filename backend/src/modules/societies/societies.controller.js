const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./societies.service');

const requireSuperAdmin = (req, res) => {
  if (req.user.role !== 'super_admin') {
    res.status(403).json({ error: 'Only Super Admin can perform this action' });
    return false;
  }
  return true;
};

const sendOrError = (res, result) => {
  if (result && result.error) return res.status(result.status || 500).json({ error: result.error });
  res.json(result);
};

const list = asyncHandler(async (req, res) => {
  res.json(await service.list());
});

const create = asyncHandler(async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  sendOrError(res, await service.create(req.body));
});

const update = asyncHandler(async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const result = await service.update(req.params.id, req.body);
  if (!result) return res.status(404).json({ error: 'Society not found' });
  sendOrError(res, result);
});

const remove = asyncHandler(async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  await service.remove(req.params.id);
  res.json({ message: 'Society and all related data deleted' });
});

const summary = asyncHandler(async (req, res) => {
  res.json(await service.summary(req.params.id));
});

module.exports = { list, create, update, remove, summary };
