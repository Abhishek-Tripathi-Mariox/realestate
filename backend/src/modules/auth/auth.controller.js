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

const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword({
    userId: req.user.userId,
    currentPassword: req.body.currentPassword,
    newPassword: req.body.newPassword,
  });
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

module.exports = { login, verify, changePassword };
