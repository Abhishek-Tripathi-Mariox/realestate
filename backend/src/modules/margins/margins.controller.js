const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./margins.service');

const sendOrError = (res, result) => {
  if (result && result.error) return res.status(result.status || 500).json({ error: result.error });
  res.json(result);
};

const listBills = asyncHandler(async (req, res) => {
  res.json(await service.listBills(req.query));
});

const createBill = asyncHandler(async (req, res) => {
  sendOrError(res, await service.createBill(req.body));
});

const deleteBill = asyncHandler(async (req, res) => {
  sendOrError(res, await service.deleteBill(req.params.id, req.user.userId));
});

const updateBill = asyncHandler(async (req, res) => {
  const updated = await service.updateBill(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Margin bill not found' });
  if (updated.error) return res.status(updated.status || 500).json({ error: updated.error });
  res.json(updated);
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

const updateBillPayment = asyncHandler(async (req, res) => {
  sendOrError(res, await service.updateBillPayment(req.params.id, req.body, req.user.userId));
});

module.exports = { listBills, createBill, updateBill, deleteBill, listBillPayments, addBillPayment, deleteBillPayment, updateBillPayment };
