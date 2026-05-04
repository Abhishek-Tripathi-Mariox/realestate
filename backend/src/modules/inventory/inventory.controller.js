const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./inventory.service');

const listForSociety = asyncHandler(async (req, res) => {
  res.json(await service.listForSociety(req.params.societyId));
});

const create = asyncHandler(async (req, res) => {
  res.json(await service.create(req.params.societyId, req.body));
});

const update = asyncHandler(async (req, res) => {
  const updated = await service.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Inventory not found' });
  res.json(updated);
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id);
  res.json({ message: 'Inventory deleted' });
});

const listGlobalAdmin = asyncHandler(async (req, res) => {
  if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  res.json(await service.listGlobalAdmin(req.query));
});

const listGlobal = asyncHandler(async (req, res) => {
  res.json(await service.listGlobal());
});

module.exports = { listForSociety, create, update, remove, listGlobalAdmin, listGlobal };
