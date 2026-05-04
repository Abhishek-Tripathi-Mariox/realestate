const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: String,
  name: String,
  role: String,
  createdAt: Date,
});

module.exports = mongoose.model('User', schema, 'users');
