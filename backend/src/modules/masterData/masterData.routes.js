const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./masterData.controller');

const vendorTypesRouter = express.Router();
vendorTypesRouter.get('/', verifyToken, ctrl.listVendorTypes);
vendorTypesRouter.post('/', verifyToken, ctrl.createVendorType);

const expenseCategoriesRouter = express.Router();
expenseCategoriesRouter.get('/', verifyToken, ctrl.listExpenseCategories);
expenseCategoriesRouter.post('/', verifyToken, ctrl.createExpenseCategory);

module.exports = { vendorTypesRouter, expenseCategoriesRouter };
