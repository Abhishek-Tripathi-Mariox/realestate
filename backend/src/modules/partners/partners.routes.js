const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./partners.controller');

// Society-scoped: GET / POST under /api/societies/:societyId/partners
const societyScopedRouter = express.Router({ mergeParams: true });
societyScopedRouter.get('/', verifyToken, ctrl.listForSociety);
societyScopedRouter.post('/', verifyToken, ctrl.create);

// Flat partner ops: /api/partners/:id and /api/partners/:partnerId/ledger
const flatRouter = express.Router();
flatRouter.put('/:id', verifyToken, ctrl.update);
flatRouter.delete('/:id', verifyToken, ctrl.remove);
flatRouter.get('/:partnerId/ledger', verifyToken, ctrl.listLedger);
flatRouter.post('/:partnerId/ledger', verifyToken, ctrl.addLedgerEntry);

// Ledger-entries shared CRUD (partner ledger only): /api/ledger-entries/:id
const ledgerEntriesRouter = express.Router();
ledgerEntriesRouter.put('/:id', verifyToken, ctrl.updateLedgerEntry);
ledgerEntriesRouter.delete('/:id', verifyToken, ctrl.deleteLedgerEntry);

module.exports = { societyScopedRouter, flatRouter, ledgerEntriesRouter };
