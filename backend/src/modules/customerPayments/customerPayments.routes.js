const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./customerPayments.controller');

const router = express.Router();
router.get('/', verifyToken, ctrl.list);
router.post('/', verifyToken, ctrl.create);
router.delete('/:id', verifyToken, ctrl.remove);
router.get('/:id/allocations', verifyToken, ctrl.listAllocations);
router.post('/:id/allocations', verifyToken, ctrl.setAllocations);

module.exports = router;
