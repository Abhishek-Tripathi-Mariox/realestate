const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./dasti.controller');

// /api/firms — firm CRUD (used by both Dasti Ledger and Firm Ledger)
const firmsRouter = express.Router();
firmsRouter.get('/', verifyToken, ctrl.listFirms);
firmsRouter.get('/:id', verifyToken, ctrl.getFirm);
firmsRouter.post('/', verifyToken, ctrl.createFirm);
firmsRouter.put('/:id', verifyToken, ctrl.updateFirm);
firmsRouter.delete('/:id', verifyToken, ctrl.removeFirm);

// /api/dasti/persons — partner/friend/investor accounts
const personsRouter = express.Router();
personsRouter.get('/', verifyToken, ctrl.listPersons);
personsRouter.get('/:id', verifyToken, ctrl.getPerson);
personsRouter.post('/', verifyToken, ctrl.createPerson);
personsRouter.put('/:id', verifyToken, ctrl.updatePerson);
personsRouter.delete('/:id', verifyToken, ctrl.removePerson);

// /api/dasti/transactions — IN/OUT entries between firm and person
const transactionsRouter = express.Router();
transactionsRouter.get('/', verifyToken, ctrl.listTransactions);
transactionsRouter.get('/summary', verifyToken, ctrl.summary);
transactionsRouter.post('/', verifyToken, ctrl.createTransaction);
transactionsRouter.put('/:id', verifyToken, ctrl.updateTransaction);
transactionsRouter.delete('/:id', verifyToken, ctrl.removeTransaction);

module.exports = { firmsRouter, personsRouter, transactionsRouter };
