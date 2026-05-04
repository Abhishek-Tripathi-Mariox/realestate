const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./accounts.controller');

const router = express.Router();
router.get('/', verifyToken, ctrl.list);
router.post('/', verifyToken, ctrl.create);
router.put('/:id', verifyToken, ctrl.update);
router.put('/:id/opening-balance', verifyToken, ctrl.updateOpeningBalance);
router.delete('/:id', verifyToken, ctrl.remove);

module.exports = router;
