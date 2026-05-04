const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./inventory.controller');

// Society-scoped: /api/societies/:societyId/inventory
const societyScopedRouter = express.Router({ mergeParams: true });
societyScopedRouter.get('/', verifyToken, ctrl.listForSociety);
societyScopedRouter.post('/', verifyToken, ctrl.create);

// Flat: /api/inventory/:id and /api/inventory/global
const flatRouter = express.Router();
flatRouter.get('/global', verifyToken, ctrl.listGlobalAdmin);
flatRouter.put('/:id', verifyToken, ctrl.update);
flatRouter.delete('/:id', verifyToken, ctrl.remove);

// Standalone: /api/global-inventory
const globalRouter = express.Router();
globalRouter.get('/', verifyToken, ctrl.listGlobal);

module.exports = { societyScopedRouter, flatRouter, globalRouter };
