const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./purchases.controller');

// Society-scoped: /api/societies/:societyId/purchases
const societyScopedRouter = express.Router({ mergeParams: true });
societyScopedRouter.get('/', verifyToken, ctrl.listForSociety);
societyScopedRouter.post('/', verifyToken, ctrl.create);

// Flat: /api/purchases/:id and /api/purchases/:purchaseId/payments
const flatRouter = express.Router();
flatRouter.delete('/:id', verifyToken, ctrl.remove);
flatRouter.get('/:purchaseId/payments', verifyToken, ctrl.listPayments);
flatRouter.post('/:purchaseId/payments', verifyToken, ctrl.addPayment);

// Standalone payment-entry deletion: /api/purchase-payments/:id
const purchasePaymentsRouter = express.Router();
purchasePaymentsRouter.delete('/:id', verifyToken, ctrl.deletePayment);

module.exports = { societyScopedRouter, flatRouter, purchasePaymentsRouter };
