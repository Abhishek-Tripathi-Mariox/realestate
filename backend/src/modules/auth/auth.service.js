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

module.exports = { login };
