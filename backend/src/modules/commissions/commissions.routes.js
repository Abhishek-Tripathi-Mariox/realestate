const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./commissions.controller');

const commissionBillsRouter = express.Router();
commissionBillsRouter.get('/', verifyToken, ctrl.listBills);
commissionBillsRouter.post('/', verifyToken, ctrl.createBill);
commissionBillsRouter.delete('/:id', verifyToken, ctrl.deleteBill);
commissionBillsRouter.get('/:billId/payments', verifyToken, ctrl.listBillPayments);
commissionBillsRouter.post('/:billId/payments', verifyToken, ctrl.addBillPayment);

const commissionPaymentsRouter = express.Router();
commissionPaymentsRouter.delete('/:id', verifyToken, ctrl.deleteBillPayment);

module.exports = { commissionBillsRouter, commissionPaymentsRouter };
