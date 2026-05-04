const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./vendors.controller');

const router = express.Router();
router.get('/', verifyToken, ctrl.list);
router.post('/', verifyToken, ctrl.create);
router.put('/:id', verifyToken, ctrl.update);
router.delete('/:id', verifyToken, ctrl.remove);
router.get('/:id/ledger', verifyToken, ctrl.ledger);

module.exports = router;
