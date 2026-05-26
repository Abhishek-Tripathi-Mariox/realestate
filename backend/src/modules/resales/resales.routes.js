const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const ctrl = require('./resales.controller');

const router = express.Router();
router.get('/', verifyToken, ctrl.list);
router.post('/', verifyToken, ctrl.create);
router.delete('/:dealId', verifyToken, ctrl.remove);
router.post('/:dealId/close', verifyToken, ctrl.closeDeal);
router.get('/:dealId/buyer-payments', verifyToken, ctrl.listBuyerPayments);
router.post('/:dealId/buyer-payments', verifyToken, ctrl.addBuyerPayment);
router.put('/:dealId/buyer-payments/:paymentId', verifyToken, ctrl.updateBuyerPayment);
router.delete('/:dealId/buyer-payments/:paymentId', verifyToken, ctrl.deleteBuyerPayment);
router.get('/:dealId/seller-payouts', verifyToken, ctrl.listSellerPayouts);
router.post('/:dealId/seller-payouts', verifyToken, ctrl.addSellerPayout);
router.put('/:dealId/seller-payouts/:payoutId', verifyToken, ctrl.updateSellerPayout);
router.delete('/:dealId/seller-payouts/:payoutId', verifyToken, ctrl.deleteSellerPayout);

module.exports = router;
