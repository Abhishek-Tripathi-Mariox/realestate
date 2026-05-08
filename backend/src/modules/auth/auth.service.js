const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../../models');

const login = async ({ email, password }) => {
  if (!email || !password) {
    return { error: 'Email and password are required', status: 400 };
  }
  const user = await User.findOne({ email }).lean();
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return { error: 'Invalid credentials', status: 401 };
  }
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '24h' },
  );
  return {
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
};

const changePassword = async ({ userId, currentPassword, newPassword }) => {
  if (!currentPassword || !newPassword) {
    return { error: 'Current and new password are required', status: 400 };
  }
  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    return { error: 'New password must be at least 6 characters', status: 400 };
  }
  if (currentPassword === newPassword) {
    return { error: 'New password must be different from current password', status: 400 };
  }
  const user = await User.findOne({ id: userId });
  if (!user) {
    return { error: 'User not found', status: 404 };
  }
  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) {
    return { error: 'Current password is incorrect', status: 401 };
  }
  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();
  return { success: true, message: 'Password changed successfully' };
};

module.exports = { login, changePassword };
