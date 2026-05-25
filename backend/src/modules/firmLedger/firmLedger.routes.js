const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./firmLedger.controller');

// /api/firm-ledger/transactions — IN/OUT entries for each firm's standalone
// money ledger. Firms themselves are managed via /api/firms (shared with the
// Dasti Ledger module).
const transactionsRouter = express.Router();
transactionsRouter.get('/', verifyToken, ctrl.listTransactions);
transactionsRouter.get('/summary', verifyToken, ctrl.summary);
transactionsRouter.post('/', verifyToken, ctrl.createTransaction);
transactionsRouter.put('/:id', verifyToken, ctrl.updateTransaction);
transactionsRouter.delete('/:id', verifyToken, ctrl.removeTransaction);

module.exports = { transactionsRouter };
