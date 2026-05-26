const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./notes.service');

const sendOrError = (res, result) => {
  if (result && result.error) return res.status(result.status || 500).json({ error: result.error });
  res.json(result);
};

const list = asyncHandler(async (req, res) => res.json(await service.list(req.query)));
const getOne = asyncHandler(async (req, res) => sendOrError(res, await service.getOne(req.params.id)));
const create = asyncHandler(async (req, res) => sendOrError(res, await service.create(req.body, req.user.userId)));
const update = asyncHandler(async (req, res) => sendOrError(res, await service.update(req.params.id, req.body)));
const remove = asyncHandler(async (req, res) => sendOrError(res, await service.remove(req.params.id)));

module.exports = { list, getOne, create, update, remove };
