const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./expenses.controller');

// /api/expense-bills (+ /:billId/payments)
const expenseBillsRouter = express.Router();
expenseBillsRouter.get('/', verifyToken, ctrl.listBills);
expenseBillsRouter.post('/', verifyToken, ctrl.createBill);
expenseBillsRouter.put('/:id', verifyToken, ctrl.updateBill);
expenseBillsRouter.delete('/:id', verifyToken, ctrl.deleteBill);
expenseBillsRouter.get('/:billId/payments', verifyToken, ctrl.listBillPayments);
expenseBillsRouter.post('/:billId/payments', verifyToken, ctrl.addBillPayment);

// /api/expenses (and /api/expenses/quick)
const expensesRouter = express.Router();
expensesRouter.get('/', verifyToken, ctrl.listExpenses);
expensesRouter.post('/quick', verifyToken, ctrl.quickExpense);
expensesRouter.put('/:id', verifyToken, ctrl.updateExpense);
expensesRouter.delete('/:id', verifyToken, ctrl.deleteExpense);

// /api/expense-payments/:id
const expensePaymentsRouter = express.Router();
expensePaymentsRouter.put('/:id', verifyToken, ctrl.updateBillPayment);
expensePaymentsRouter.delete('/:id', verifyToken, ctrl.deleteBillPayment);

module.exports = { expenseBillsRouter, expensesRouter, expensePaymentsRouter };
