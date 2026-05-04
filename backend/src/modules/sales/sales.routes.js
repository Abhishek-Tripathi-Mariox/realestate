const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./sales.controller');

// Society-scoped: /api/societies/:societyId/sales
const societyScopedRouter = express.Router({ mergeParams: true });
societyScopedRouter.get('/', verifyToken, ctrl.listForSociety);
societyScopedRouter.post('/', verifyToken, ctrl.create);

// Flat: /api/sales/...
// Order matters: /sales/unassigned must come before /sales/:id
const flatRouter = express.Router();
flatRouter.get('/unassigned', verifyToken, ctrl.listUnassigned);
flatRouter.put('/:saleId/assign-customer', verifyToken, ctrl.assignCustomer);
flatRouter.get('/:saleId/payments', verifyToken, ctrl.listPayments);
flatRouter.post('/:saleId/payments', verifyToken, ctrl.addPayment);
flatRouter.get('/:saleId/ledger', verifyToken, ctrl.listLedger);
flatRouter.post('/:saleId/ledger', verifyToken, ctrl.addLedgerEntry);
flatRouter.put('/:id', verifyToken, ctrl.update);
flatRouter.delete('/:id', verifyToken, ctrl.remove);

// Standalone: /api/sale-payments/:id (delete a sale ledger entry)
const salePaymentsRouter = express.Router();
salePaymentsRouter.delete('/:id', verifyToken, ctrl.deleteSalePayment);

module.exports = { societyScopedRouter, flatRouter, salePaymentsRouter };
