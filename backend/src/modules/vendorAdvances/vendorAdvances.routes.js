const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./vendorAdvances.controller');

// /api/vendor-advances/... (advance-scoped) and vendor-scoped create route
// mounted separately so paths read naturally: /vendors/:id/advances (list +
// create) and /vendor-advances/:advanceId/... (advance-level operations).
const vendorAdvancesRouter = express.Router();
vendorAdvancesRouter.get('/', verifyToken, ctrl.listAdvances);
vendorAdvancesRouter.put('/:advanceId', verifyToken, ctrl.updateAdvance);
vendorAdvancesRouter.delete('/:advanceId', verifyToken, ctrl.deleteAdvance);
vendorAdvancesRouter.get('/:advanceId/work', verifyToken, ctrl.listWork);
vendorAdvancesRouter.post('/:advanceId/work', verifyToken, ctrl.addWork);
vendorAdvancesRouter.put('/:advanceId/work/:workId', verifyToken, ctrl.updateWork);
vendorAdvancesRouter.delete('/:advanceId/work/:workId', verifyToken, ctrl.deleteWork);

// Vendor-scoped: POST /vendors/:vendorId/advances → createAdvance
const vendorScopedRouter = express.Router({ mergeParams: true });
vendorScopedRouter.post('/', verifyToken, ctrl.createAdvance);

module.exports = { vendorAdvancesRouter, vendorScopedRouter };
