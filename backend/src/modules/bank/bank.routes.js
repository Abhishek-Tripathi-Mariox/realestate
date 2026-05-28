const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./bank.controller');

// /api/bank/operations — withdrawals + internal transfers in one list.
// POST /withdrawals + /transfers are split because they carry different
// payloads; PUT/DELETE work on the op id regardless of kind.
const router = express.Router();
router.get('/operations', verifyToken, ctrl.listOperations);
router.get('/operations/summary', verifyToken, ctrl.summary);
router.post('/withdrawals', verifyToken, ctrl.createWithdrawal);
router.post('/transfers', verifyToken, ctrl.createTransfer);
router.put('/operations/:id', verifyToken, ctrl.updateOperation);
router.delete('/operations/:id', verifyToken, ctrl.removeOperation);

module.exports = router;
