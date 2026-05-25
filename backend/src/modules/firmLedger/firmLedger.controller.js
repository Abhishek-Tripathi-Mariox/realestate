const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./firmLedger.service');

const sendOrError = (res, result) => {
  if (result && result.error) return res.status(result.status || 500).json({ error: result.error });
  res.json(result);
};

const listTransactions = asyncHandler(async (req, res) => res.json(await service.listTransactions(req.query)));
const summary = asyncHandler(async (req, res) => res.json(await service.summary(req.query)));
const createTransaction = asyncHandler(async (req, res) => sendOrError(res, await service.createTransaction(req.body, req.user.userId)));
const updateTransaction = asyncHandler(async (req, res) => sendOrError(res, await service.updateTransaction(req.params.id, req.body, req.user.userId)));
const removeTransaction = asyncHandler(async (req, res) => sendOrError(res, await service.removeTransaction(req.params.id, req.user.userId)));

module.exports = {
  listTransactions, summary, createTransaction, updateTransaction, removeTransaction,
};
