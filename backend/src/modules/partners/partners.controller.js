const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./partners.service');

const sendOrError = (res, result) => {
  if (result && result.error) return res.status(result.status || 500).json({ error: result.error });
  res.json(result);
};

const listForSociety = asyncHandler(async (req, res) => {
  res.json(await service.listForSociety(req.params.societyId));
});

const create = asyncHandler(async (req, res) => {
  sendOrError(res, await service.create(req.params.societyId, req.body));
});

const update = asyncHandler(async (req, res) => {
  const updated = await service.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Partner not found' });
  if (updated.error) return res.status(updated.status || 500).json({ error: updated.error });
  res.json(updated);
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id);
  res.json({ message: 'Partner deleted' });
});

const listLedger = asyncHandler(async (req, res) => {
  res.json(await service.listLedger(req.params.partnerId));
});

const addLedgerEntry = asyncHandler(async (req, res) => {
  sendOrError(res, await service.addLedgerEntry(req.params.partnerId, req.body, req.user.userId));
});

const updateLedgerEntry = asyncHandler(async (req, res) => {
  sendOrError(res, await service.updateLedgerEntry(req.params.id, req.body, req.user.userId));
});

const deleteLedgerEntry = asyncHandler(async (req, res) => {
  sendOrError(res, await service.deleteLedgerEntry(req.params.id, req.user.userId));
});

module.exports = {
  listForSociety, create, update, remove,
  listLedger, addLedgerEntry, updateLedgerEntry, deleteLedgerEntry,
};
