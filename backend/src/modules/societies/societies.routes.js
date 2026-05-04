const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./societies.controller');

const router = express.Router();

router.get('/', verifyToken, ctrl.list);
router.post('/', verifyToken, ctrl.create);
router.put('/:id', verifyToken, ctrl.update);
router.delete('/:id', verifyToken, ctrl.remove);
router.get('/:id/summary', verifyToken, ctrl.summary);

module.exports = router;
