const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./commissions.service');

const sendOrError = (res, result) => {
  if (result && result.error) return res.status(result.status || 500).json({ error: result.error });
  res.json(result);
};

const listBills = asyncHandler(async (req, res) => {
  res.json(await service.listBills(req.query));
});

const createBill = asyncHandler(async (req, res) => {
  res.json(await service.createBill(req.body));
});

const deleteBill = asyncHandler(async (req, res) => {
  sendOrError(res, await service.deleteBill(req.params.id, req.user.userId));
});

const listBillPayments = asyncHandler(async (req, res) => {
  res.json(await service.listBillPayments(req.params.billId));
});

const addBillPayment = asyncHandler(async (req, res) => {
  sendOrError(res, await service.addBillPayment(req.params.billId, req.body, req.user.userId));
});

const deleteBillPayment = asyncHandler(async (req, res) => {
  sendOrError(res, await service.deleteBillPayment(req.params.id, req.user.userId));
});

module.exports = { listBills, createBill, deleteBill, listBillPayments, addBillPayment, deleteBillPayment };
