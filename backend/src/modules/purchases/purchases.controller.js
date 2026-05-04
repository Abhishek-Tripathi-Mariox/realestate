const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./purchases.service');

const sendOrError = (res, result) => {
  if (result && result.error) return res.status(result.status || 500).json({ error: result.error });
  res.json(result);
};

const listForSociety = asyncHandler(async (req, res) => {
  res.json(await service.listForSociety(req.params.societyId));
});

const create = asyncHandler(async (req, res) => {
  res.json(await service.create(req.params.societyId, req.body));
});

const remove = asyncHandler(async (req, res) => {
  sendOrError(res, await service.remove(req.params.id, req.user.userId));
});

const listPayments = asyncHandler(async (req, res) => {
  res.json(await service.listPayments(req.params.purchaseId));
});

const addPayment = asyncHandler(async (req, res) => {
  sendOrError(res, await service.addPayment(req.params.purchaseId, req.body, req.user.userId));
});

const deletePayment = asyncHandler(async (req, res) => {
  sendOrError(res, await service.deletePayment(req.params.id, req.user.userId));
});

module.exports = { listForSociety, create, remove, listPayments, addPayment, deletePayment };
