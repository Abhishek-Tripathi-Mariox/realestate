const { v4: uuidv4 } = require('uuid');
const { AuditLog } = require('../models');

// Manual audit-log helper. Most logs go through the auto-audit middleware;
// use this only when a route needs to record a custom before/after pair.
const logAudit = async (entityType, entityId, action, before, after, userId, metadata = {}) => {
  const auditEntry = {
    id: uuidv4(),
    entityType,
    entityId,
    action,
    before: before ? JSON.parse(JSON.stringify(before)) : null,
    after: after ? JSON.parse(JSON.stringify(after)) : null,
    userId,
    ...metadata,
    timestamp: new Date(),
  };
  await AuditLog.create(auditEntry);
  return auditEntry;
};

module.exports = { logAudit };
