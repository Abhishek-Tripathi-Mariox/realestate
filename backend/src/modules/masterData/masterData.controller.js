const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./masterData.service');

const listVendorTypes = asyncHandler(async (req, res) => {
  res.json(await service.listVendorTypes());
});

const createVendorType = asyncHandler(async (req, res) => {
  res.json(await service.createVendorType(req.body));
});

const listExpenseCategories = asyncHandler(async (req, res) => {
  res.json(await service.listExpenseCategories());
});

const createExpenseCategory = asyncHandler(async (req, res) => {
  res.json(await service.createExpenseCategory(req.body));
});

module.exports = { listVendorTypes, createVendorType, listExpenseCategories, createExpenseCategory };
