const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./accounts.service');

const list = asyncHandler(async (req, res) => {
  res.json(await service.list(req.query));
});

const create = asyncHandler(async (req, res) => {
  res.json(await service.create(req.body));
});

const update = asyncHandler(async (req, res) => {
  const updated = await service.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Account not found' });
  res.json(updated);
});

const updateOpeningBalance = asyncHandler(async (req, res) => {
  res.json(await service.updateOpeningBalance(req.params.id, req.body));
});

const remove = asyncHandler(async (req, res) => {
  const result = await service.remove(req.params.id);
  if (result?.error) return res.status(result.status || 500).json({ error: result.error });
  res.json(result || { message: 'Account deleted' });
});

const setDefault = asyncHandler(async (req, res) => {
  const result = await service.setDefault(req.params.id);
  if (result?.error) return res.status(result.status || 500).json({ error: result.error });
  res.json(result);
});

module.exports = { list, create, update, updateOpeningBalance, setDefault, remove };
