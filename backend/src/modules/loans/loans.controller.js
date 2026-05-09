const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./loans.service');

const sendOrError = (res, result) => {
  if (result && result.error) return res.status(result.status || 500).json({ error: result.error });
  res.json(result);
};

const listParties = asyncHandler(async (req, res) => {
  res.json(await service.listParties());
});

const createParty = asyncHandler(async (req, res) => {
  sendOrError(res, await service.createParty(req.body));
});

const removeParty = asyncHandler(async (req, res) => {
  sendOrError(res, await service.removeParty(req.params.id) || { message: 'Party deleted' });
});

const partyLedger = asyncHandler(async (req, res) => {
  res.json(await service.partyLedger(req.params.id));
});

const listLoans = asyncHandler(async (req, res) => {
  res.json(await service.listLoans(req.query));
});

const createLoan = asyncHandler(async (req, res) => {
  sendOrError(res, await service.createLoan(req.body, req.user.userId));
});

const removeLoan = asyncHandler(async (req, res) => {
  sendOrError(res, await service.removeLoan(req.params.id, req.user.userId));
});

const listRepayments = asyncHandler(async (req, res) => {
  res.json(await service.listRepayments(req.params.loanId));
});

const createRepayment = asyncHandler(async (req, res) => {
  sendOrError(res, await service.createRepayment(req.params.loanId, req.body, req.user.userId));
});

const deleteRepayment = asyncHandler(async (req, res) => {
  sendOrError(res, await service.deleteRepayment(req.params.loanId, req.params.repaymentId, req.user.userId));
});

module.exports = {
  listParties, createParty, removeParty, partyLedger,
  listLoans, createLoan, removeLoan,
  listRepayments, createRepayment, deleteRepayment,
};
