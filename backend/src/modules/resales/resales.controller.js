const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./resales.service');

const sendOrError = (res, result) => {
  if (result && result.error) return res.status(result.status || 500).json({ error: result.error });
  res.json(result);
};

const list = asyncHandler(async (req, res) => {
  res.json(await service.list(req.query));
});

const create = asyncHandler(async (req, res) => {
  res.json(await service.create(req.body));
});

const updateDeal = asyncHandler(async (req, res) => {
  sendOrError(res, await service.updateDeal(req.params.dealId, req.body));
});

const remove = asyncHandler(async (req, res) => {
  sendOrError(res, await service.remove(req.params.dealId, req.user.userId));
});

const closeDeal = asyncHandler(async (req, res) => {
  sendOrError(res, await service.closeDeal(req.params.dealId, req.user.userId));
});

const listBuyerPayments = asyncHandler(async (req, res) => {
  res.json(await service.listBuyerPayments(req.params.dealId));
});

const addBuyerPayment = asyncHandler(async (req, res) => {
  sendOrError(res, await service.addBuyerPayment(req.params.dealId, req.body, req.user.userId));
});

const deleteBuyerPayment = asyncHandler(async (req, res) => {
  sendOrError(res, await service.deleteBuyerPayment(req.params.paymentId, req.user.userId));
});

const updateBuyerPayment = asyncHandler(async (req, res) => {
  sendOrError(res, await service.updateBuyerPayment(req.params.paymentId, req.body, req.user.userId));
});

const listSellerPayouts = asyncHandler(async (req, res) => {
  res.json(await service.listSellerPayouts(req.params.dealId));
});

const addSellerPayout = asyncHandler(async (req, res) => {
  sendOrError(res, await service.addSellerPayout(req.params.dealId, req.body, req.user.userId));
});

const deleteSellerPayout = asyncHandler(async (req, res) => {
  sendOrError(res, await service.deleteSellerPayout(req.params.payoutId, req.user.userId));
});

const updateSellerPayout = asyncHandler(async (req, res) => {
  sendOrError(res, await service.updateSellerPayout(req.params.payoutId, req.body, req.user.userId));
});

module.exports = {
  list, create, updateDeal, remove, closeDeal,
  listBuyerPayments, addBuyerPayment, deleteBuyerPayment, updateBuyerPayment,
  listSellerPayouts, addSellerPayout, deleteSellerPayout, updateSellerPayout,
};
