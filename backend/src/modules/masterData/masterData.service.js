const { v4: uuidv4 } = require('uuid');
const { notDeleted } = require('../../utils/notDeleted');
const { VendorType, ExpenseCategory } = require('../../models');

const stripId = ({ _id, ...rest }) => rest;

const listVendorTypes = async () => {
  const types = await VendorType.find(notDeleted({ isActive: true })).lean();
  return types.map(stripId);
};

const createVendorType = async (body) => {
  const vendorType = {
    id: uuidv4(),
    name: body.name.trim(),
    isActive: true,
    isDeleted: false,
    createdAt: new Date(),
  };
  await VendorType.create(vendorType);
  return vendorType;
};

const listExpenseCategories = async () => {
  const categories = await ExpenseCategory
    .find(notDeleted({ isActive: { $ne: false } }))
    .sort({ name: 1 })
    .lean();
  return categories.map(stripId);
};

const createExpenseCategory = async (body) => {
  const category = {
    id: uuidv4(),
    name: body.name.trim(),
    scope: body.scope || 'COMPANY',
    societyId: body.scope === 'SOCIETY' ? body.societyId : null,
    isActive: true,
    isDeleted: false,
    createdAt: new Date(),
  };
  await ExpenseCategory.create(category);
  return category;
};

module.exports = { listVendorTypes, createVendorType, listExpenseCategories, createExpenseCategory };
