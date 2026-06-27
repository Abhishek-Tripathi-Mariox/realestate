const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./bank.service');

const sendOrError = (res, result) => {
  if (result && result.error) return res.status(result.status || 500).json({ error: result.error });
  res.json(result);
};

const listOperations = asyncHandler(async (req, res) => res.json(await service.listOperations(req.query)));
const summary = asyncHandler(async (req, res) => res.json(await service.summary(req.query)));
const createWithdrawal = asyncHandler(async (req, res) => sendOrError(res, await service.createWithdrawal(req.body, req.user.userId)));
const createTransfer = asyncHandler(async (req, res) => sendOrError(res, await service.createTransfer(req.body, req.user.userId)));
const createDirectPayment = asyncHandler(async (req, res) => sendOrError(res, await service.createDirectPayment(req.body, req.user.userId)));
const updateOperation = asyncHandler(async (req, res) => sendOrError(res, await service.updateOperation(req.params.id, req.body, req.user.userId)));
const removeOperation = asyncHandler(async (req, res) => sendOrError(res, await service.removeOperation(req.params.id, req.user.userId)));

module.exports = {
  listOperations,
  summary,
  createWithdrawal,
  createTransfer,
  createDirectPayment,
  updateOperation,
  removeOperation,
};
