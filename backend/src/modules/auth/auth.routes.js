const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./auth.controller');

const router = express.Router();

router.post('/login', ctrl.login);
router.get('/verify', verifyToken, ctrl.verify);
router.post('/change-password', verifyToken, ctrl.changePassword);

module.exports = router;
