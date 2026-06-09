const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./receivablesPayables.service');

const summary = asyncHandler(async (req, res) => {
  res.json(await service.summary(req.query));
});

module.exports = { summary };
