const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./customerPayments.service');

const sendOrError = (res, result) => {
  if (result && result.error) return res.status(result.status || 500).json({ error: result.error });
  res.json(result);
};

const list = asyncHandler(async (req, res) => {
  res.json(await service.list(req.query));
});

const create = asyncHandler(async (req, res) => {
  sendOrError(res, await service.create(req.body, req.user.userId));
});

const update = asyncHandler(async (req, res) => {
  sendOrError(res, await service.update(req.params.id, req.body, req.user.userId));
});

const remove = asyncHandler(async (req, res) => {
  sendOrError(res, await service.remove(req.params.id, req.user.userId));
});

const listAllocations = asyncHandler(async (req, res) => {
  res.json(await service.listAllocations(req.params.id));
});

const setAllocations = asyncHandler(async (req, res) => {
  sendOrError(res, await service.setAllocations(req.params.id, req.body, req.user.userId));
});

module.exports = { list, create, update, remove, listAllocations, setAllocations };
