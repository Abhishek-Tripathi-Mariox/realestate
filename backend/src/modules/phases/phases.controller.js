const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./phases.service');

const listForSociety = asyncHandler(async (req, res) => {
  res.json(await service.listForSociety(req.params.societyId));
});

const create = asyncHandler(async (req, res) => {
  res.json(await service.create(req.params.societyId, req.body));
});

const update = asyncHandler(async (req, res) => {
  const updated = await service.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Phase not found' });
  res.json(updated);
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id);
  res.json({ message: 'Phase deleted' });
});

module.exports = { listForSociety, create, update, remove };
