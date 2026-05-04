const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./phases.controller');

// Mounted partly under /api/societies/:societyId/phases (list+create) and
// partly under /api/phases/:id (update+delete). app.js wires both mount points.
const societyScopedRouter = express.Router({ mergeParams: true });
societyScopedRouter.get('/', verifyToken, ctrl.listForSociety);
societyScopedRouter.post('/', verifyToken, ctrl.create);

const flatRouter = express.Router();
flatRouter.put('/:id', verifyToken, ctrl.update);
flatRouter.delete('/:id', verifyToken, ctrl.remove);

module.exports = { societyScopedRouter, flatRouter };
