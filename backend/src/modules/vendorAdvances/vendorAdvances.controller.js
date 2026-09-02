const { asyncHandler } = require('../../utils/asyncHandler');
const service = require('./vendorAdvances.service');

const send = (res) => (result) => {
  if (result?.error) return res.status(result.status || 500).json({ error: result.error });
  res.json(result);
};

const listAdvances = asyncHandler(async (req, res) => {
  res.json(await service.listAdvances(req.query));
});

const createAdvance = asyncHandler(async (req, res) => {
  const result = await service.createAdvance(req.params.vendorId, req.body, req.user?.userId);
  send(res)(result);
});

const updateAdvance = asyncHandler(async (req, res) => {
  const result = await service.updateAdvance(req.params.advanceId, req.body, req.user?.userId);
  send(res)(result);
});

const deleteAdvance = asyncHandler(async (req, res) => {
  const result = await service.deleteAdvance(req.params.advanceId, req.user?.userId);
  send(res)(result);
});

const listWork = asyncHandler(async (req, res) => {
  res.json(await service.listWork(req.params.advanceId));
});

const addWork = asyncHandler(async (req, res) => {
  const result = await service.addWork(req.params.advanceId, req.body, req.user?.userId);
  send(res)(result);
});

const updateWork = asyncHandler(async (req, res) => {
  const result = await service.updateWork(req.params.advanceId, req.params.workId, req.body, req.user?.userId);
  send(res)(result);
});

const deleteWork = asyncHandler(async (req, res) => {
  const result = await service.deleteWork(req.params.advanceId, req.params.workId, req.user?.userId);
  send(res)(result);
});

module.exports = {
  listAdvances, createAdvance, updateAdvance, deleteAdvance,
  listWork, addWork, updateWork, deleteWork,
};
