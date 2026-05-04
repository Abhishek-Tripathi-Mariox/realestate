const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./daybook.service');

const list = asyncHandler(async (req, res) => {
  res.json(await service.list(req.query));
});

const summary = asyncHandler(async (req, res) => {
  res.json(await service.summary(req.query));
});

const createManualEntry = asyncHandler(async (req, res) => {
  res.json(await service.createManualEntry(req.body, req.user.userId));
});

module.exports = { list, summary, createManualEntry };
