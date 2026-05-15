const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./margins.controller');

const marginBillsRouter = express.Router();
marginBillsRouter.get('/', verifyToken, ctrl.listBills);
marginBillsRouter.post('/', verifyToken, ctrl.createBill);
marginBillsRouter.put('/:id', verifyToken, ctrl.updateBill);
marginBillsRouter.delete('/:id', verifyToken, ctrl.deleteBill);
marginBillsRouter.get('/:billId/payments', verifyToken, ctrl.listBillPayments);
marginBillsRouter.post('/:billId/payments', verifyToken, ctrl.addBillPayment);

const marginPaymentsRouter = express.Router();
marginPaymentsRouter.put('/:id', verifyToken, ctrl.updateBillPayment);
marginPaymentsRouter.delete('/:id', verifyToken, ctrl.deleteBillPayment);

module.exports = { marginBillsRouter, marginPaymentsRouter };
