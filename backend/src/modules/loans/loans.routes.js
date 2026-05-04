const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./loans.controller');

const partiesRouter = express.Router();
partiesRouter.get('/', verifyToken, ctrl.listParties);
partiesRouter.post('/', verifyToken, ctrl.createParty);
partiesRouter.delete('/:id', verifyToken, ctrl.removeParty);
partiesRouter.get('/:id/ledger', verifyToken, ctrl.partyLedger);

const loansRouter = express.Router();
loansRouter.get('/', verifyToken, ctrl.listLoans);
loansRouter.post('/', verifyToken, ctrl.createLoan);
loansRouter.delete('/:id', verifyToken, ctrl.removeLoan);
loansRouter.get('/:loanId/repayments', verifyToken, ctrl.listRepayments);
loansRouter.post('/:loanId/repayments', verifyToken, ctrl.createRepayment);
loansRouter.delete('/:loanId/repayments/:repaymentId', verifyToken, ctrl.deleteRepayment);

module.exports = { partiesRouter, loansRouter };
