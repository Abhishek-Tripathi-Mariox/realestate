const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./expenses.service');

const sendOrError = (res, result) => {
  if (result && result.error) return res.status(result.status || 500).json({ error: result.error });
  res.json(result);
};

const listBills = asyncHandler(async (req, res) => {
  res.json(await service.listBills(req.query));
});

const createBill = asyncHandler(async (req, res) => {
  res.json(await service.createBill(req.body, req.user.userId));
});

const deleteBill = asyncHandler(async (req, res) => {
  sendOrError(res, await service.deleteBill(req.params.id, req.user.userId));
});

const updateBill = asyncHandler(async (req, res) => {
  const updated = await service.updateBill(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Bill not found' });
  if (updated.error) return res.status(updated.status || 500).json({ error: updated.error });
  res.json(updated);
});

const listExpenses = asyncHandler(async (req, res) => {
  res.json(await service.listExpenses(req.query));
});

const deleteExpense = asyncHandler(async (req, res) => {
  sendOrError(res, await service.deleteExpense(req.params.id, req.user.userId));
});

const updateExpense = asyncHandler(async (req, res) => {
  sendOrError(res, await service.updateExpense(req.params.id, req.body, req.user.userId));
});

const quickExpense = asyncHandler(async (req, res) => {
  res.json(await service.quickExpense(req.body, req.user.userId));
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

module.exports = {
  listBills, createBill, updateBill, deleteBill,
  listExpenses, updateExpense, deleteExpense, quickExpense,
  listBillPayments, addBillPayment, updateBillPayment, deleteBillPayment,
};
