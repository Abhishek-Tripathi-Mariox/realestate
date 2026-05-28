const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./moneyReceived.controller');

const router = express.Router();
router.get('/', verifyToken, ctrl.list);

module.exports = router;
