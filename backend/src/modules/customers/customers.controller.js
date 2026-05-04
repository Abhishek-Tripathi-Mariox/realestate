const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./customers.service');

const list = asyncHandler(async (req, res) => {
  res.json(await service.list(req.query));
});

const create = asyncHandler(async (req, res) => {
  res.json(await service.create(req.body, req.user.userId));
});

const update = asyncHandler(async (req, res) => {
  const updated = await service.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Customer not found' });
  res.json(updated);
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id);
  res.json({ message: 'Customer deleted' });
});

const listSales = asyncHandler(async (req, res) => {
  res.json(await service.listSales(req.params.id));
});

const ledger = asyncHandler(async (req, res) => {
  res.json(await service.ledger(req.params.id));
});

module.exports = { list, create, update, remove, listSales, ledger };
