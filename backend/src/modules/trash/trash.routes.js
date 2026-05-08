const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./trash.controller');

// /api/trash/...
const router = express.Router();

// GET    /api/trash                         → list every soft-deleted record (optional ?type=slug)
// POST   /api/trash/:type/:id/restore       → restore a single record
// DELETE /api/trash/:type/:id               → permanently delete a single record
// DELETE /api/trash                         → empty the trash (optional ?type=slug to scope)
router.get('/', verifyToken, ctrl.list);
router.post('/:type/:id/restore', verifyToken, ctrl.restore);
router.delete('/:type/:id', verifyToken, ctrl.purge);
router.delete('/', verifyToken, ctrl.empty);

module.exports = router;
