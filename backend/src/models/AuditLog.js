const { mongoose, buildSchema } = require('./baseSchema');

const schema = buildSchema({
  id: { type: String, required: true, unique: true },
  entityType: String,
  entityId: String,
  action: String,
  method: String,
  path: String,
  userId: String,
  userName: String,
  before: mongoose.Schema.Types.Mixed,
  after: mongoose.Schema.Types.Mixed,
  reason: String,
  timestamp: Date,
});

module.exports = mongoose.model('AuditLog', schema, 'audit_logs');
