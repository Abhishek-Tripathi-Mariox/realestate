const { asyncHandler } = require('../../utils/asyncHandler');
const authService = require('./auth.service');

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

const verify = (req, res) => {
  res.json({ user: req.user });
};

module.exports = { login, verify };
