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

schema.index({ timestamp: -1 });
schema.index({ entityType: 1, entityId: 1 });
schema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', schema, 'audit_logs');
