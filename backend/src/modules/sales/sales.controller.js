const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./sales.service');

const sendOrError = (res, result) => {
  if (result && result.error) return res.status(result.status || 500).json({ error: result.error });
  res.json(result);
};

const listForSociety = asyncHandler(async (req, res) => {
  res.json(await service.listForSociety(req.params.societyId));
});

const create = asyncHandler(async (req, res) => {
  res.json(await service.create(req.params.societyId, req.body, req.user.userId));
});

const getById = asyncHandler(async (req, res) => {
  const sale = await service.getById(req.params.id);
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  res.json(sale);
});

const update = asyncHandler(async (req, res) => {
  const updated = await service.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Sale not found' });
  res.json(updated);
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id);
  res.json({ message: 'Sale deleted' });
});

const listPayments = asyncHandler(async (req, res) => {
  res.json(await service.listPayments(req.params.saleId));
});

const addPayment = asyncHandler(async (req, res) => {
  sendOrError(res, await service.addPayment(req.params.saleId, req.body, req.user.userId));
});

const listLedger = asyncHandler(async (req, res) => {
  res.json(await service.listLedger(req.params.saleId));
});

const addLedgerEntry = asyncHandler(async (req, res) => {
  sendOrError(res, await service.addLedgerEntry(req.params.saleId, req.body, req.user.userId));
});

const deleteSalePayment = asyncHandler(async (req, res) => {
  sendOrError(res, await service.deleteSalePayment(req.params.id, req.user.userId));
});

const updateSalePayment = asyncHandler(async (req, res) => {
  sendOrError(res, await service.updateSalePayment(req.params.id, req.body, req.user.userId));
});

const transferBetweenSales = asyncHandler(async (req, res) => {
  sendOrError(res, await service.transferBetweenSales(req.params.saleId, req.body, req.user.userId));
});

const updateTransfer = asyncHandler(async (req, res) => {
  sendOrError(res, await service.updateTransfer(req.params.transferGroupId, req.body));
});

const listUnassigned = asyncHandler(async (req, res) => {
  res.json(await service.listUnassigned(req.query.societyId));
});

const assignCustomer = asyncHandler(async (req, res) => {
  sendOrError(res, await service.assignCustomer(req.params.saleId, req.body.customerId));
});

module.exports = {
  listForSociety, create, getById, update, remove,
  listPayments, addPayment,
  listLedger, addLedgerEntry, deleteSalePayment, updateSalePayment,
  transferBetweenSales, updateTransfer,
  listUnassigned, assignCustomer,
};
