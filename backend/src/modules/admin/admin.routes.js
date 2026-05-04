const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./admin.controller');

// /api/admin/...
const adminRouter = express.Router();
adminRouter.get('/recycle-bin', verifyToken, ctrl.recycleBin);
adminRouter.post('/restore/:collection/:id', verifyToken, ctrl.restore);
adminRouter.get('/audit-logs', verifyToken, ctrl.auditLogs);
adminRouter.delete('/permanent-delete/:collection/:id', verifyToken, ctrl.permanentDelete);

// /api/cleanup-orphans (top-level POST)
const cleanupOrphansRouter = express.Router();
cleanupOrphansRouter.post('/', verifyToken, ctrl.cleanupOrphans);

module.exports = { adminRouter, cleanupOrphansRouter };
