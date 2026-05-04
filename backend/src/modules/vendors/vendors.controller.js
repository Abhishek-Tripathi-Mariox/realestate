const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./vendors.service');

const list = asyncHandler(async (req, res) => {
  res.json(await service.list(req.query));
});

const create = asyncHandler(async (req, res) => {
  res.json(await service.create(req.body));
});

const update = asyncHandler(async (req, res) => {
  const updated = await service.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Vendor not found' });
  res.json(updated);
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id);
  res.json({ message: 'Vendor deleted' });
});

const ledger = asyncHandler(async (req, res) => {
  const result = await service.ledger(req.params.id);
  if (result && result.error) return res.status(result.status || 500).json({ error: result.error });
  res.json(result);
});

module.exports = { list, create, update, remove, ledger };
