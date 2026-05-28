const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./moneyReceived.service');

const list = asyncHandler(async (req, res) => {
  res.json(await service.list(req.query));
});

module.exports = { list };
