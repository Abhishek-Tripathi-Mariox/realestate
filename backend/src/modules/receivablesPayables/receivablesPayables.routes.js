const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./receivablesPayables.controller');

const router = express.Router();
router.get('/', verifyToken, ctrl.summary);

module.exports = router;
