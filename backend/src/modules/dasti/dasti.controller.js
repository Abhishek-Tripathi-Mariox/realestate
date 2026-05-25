const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./dasti.service');

const sendOrError = (res, result) => {
  if (result && result.error) return res.status(result.status || 500).json({ error: result.error });
  res.json(result);
};

// Firms
const listFirms = asyncHandler(async (req, res) => res.json(await service.listFirms()));
const getFirm = asyncHandler(async (req, res) => sendOrError(res, await service.getFirm(req.params.id)));
const createFirm = asyncHandler(async (req, res) => sendOrError(res, await service.createFirm(req.body, req.user.userId)));
const updateFirm = asyncHandler(async (req, res) => sendOrError(res, await service.updateFirm(req.params.id, req.body)));
const removeFirm = asyncHandler(async (req, res) => sendOrError(res, await service.removeFirm(req.params.id)));

// Persons
const listPersons = asyncHandler(async (req, res) => res.json(await service.listPersons()));
const getPerson = asyncHandler(async (req, res) => sendOrError(res, await service.getPerson(req.params.id)));
const createPerson = asyncHandler(async (req, res) => sendOrError(res, await service.createPerson(req.body, req.user.userId)));
const updatePerson = asyncHandler(async (req, res) => sendOrError(res, await service.updatePerson(req.params.id, req.body)));
const removePerson = asyncHandler(async (req, res) => sendOrError(res, await service.removePerson(req.params.id, req.user.userId)));

// Transactions
const listTransactions = asyncHandler(async (req, res) => res.json(await service.listTransactions(req.query)));
const summary = asyncHandler(async (req, res) => res.json(await service.summary(req.query)));
const createTransaction = asyncHandler(async (req, res) => sendOrError(res, await service.createTransaction(req.body, req.user.userId)));
const updateTransaction = asyncHandler(async (req, res) => sendOrError(res, await service.updateTransaction(req.params.id, req.body, req.user.userId)));
const removeTransaction = asyncHandler(async (req, res) => sendOrError(res, await service.removeTransaction(req.params.id, req.user.userId)));

module.exports = {
  listFirms, getFirm, createFirm, updateFirm, removeFirm,
  listPersons, getPerson, createPerson, updatePerson, removePerson,
  listTransactions, summary, createTransaction, updateTransaction, removeTransaction,
};
