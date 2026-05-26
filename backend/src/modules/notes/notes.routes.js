const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./notes.controller');

const router = express.Router();
router.get('/', verifyToken, ctrl.list);
router.get('/:id', verifyToken, ctrl.getOne);
router.post('/', verifyToken, ctrl.create);
router.put('/:id', verifyToken, ctrl.update);
router.delete('/:id', verifyToken, ctrl.remove);

module.exports = router;
