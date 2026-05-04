const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./daybook.controller');

const router = express.Router();
router.get('/', verifyToken, ctrl.list);
router.get('/summary', verifyToken, ctrl.summary);
router.post('/', verifyToken, ctrl.createManualEntry);

module.exports = router;
