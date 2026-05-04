const { v4: uuidv4 } = require('uuid');
const { AuditLog } = require('../models');

// Paths whose method+path tuple should not be logged (noise / reads dressed as
// POSTs / health checks / the audit-log read itself).
const AUDIT_SKIP_PATHS = [
  /^\/api\/auth\/verify/,
  /^\/api\/admin\/audit-logs/,
];

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OID_RX = /^[0-9a-f]{24}$/i;

const inferEntityType = (urlPath) => {
  const cleanPath = urlPath.split('?')[0];
  const segs = cleanPath.split('/').filter(Boolean);
  if (segs[0] === 'api') segs.shift();
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    if (UUID_RX.test(s) || OID_RX.test(s)) continue;
    return s;
  }
  return cleanPath;
};

const autoAudit = (req, res, next) => {
  const method = req.method;
  if (method === 'GET' || method === 'OPTIONS' || method === 'HEAD') return next();
  if (AUDIT_SKIP_PATHS.some(rx => rx.test(req.path))) return next();

  const originalJson = res.json.bind(res);
  let capturedBody = null;
  res.json = function (body) {
    capturedBody = body;
    return originalJson(body);
  };

  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    try {
      const action =
        method === 'POST' ? (req.path.includes('/auth/login') ? 'LOGIN' : 'CREATE') :
        method === 'PUT' || method === 'PATCH' ? 'UPDATE' :
        method === 'DELETE' ? 'DELETE' : 'OTHER';

      const entityType = inferEntityType(req.path);
      const entityId =
        (capturedBody && typeof capturedBody === 'object' && capturedBody.id) ||
        req.params?.id ||
        req.params?.partnerId ||
        req.params?.loanId ||
        req.params?.repaymentId ||
        req.params?.societyId ||
        null;

      const userId = req.user?.userId || req.user?.id || null;
      const userName = req.user?.name || req.user?.email || (action === 'LOGIN' ? (req.body?.email || null) : null);

      let after = null;
      if (action !== 'DELETE' && capturedBody && typeof capturedBody === 'object') {
        try {
          after = JSON.parse(JSON.stringify(capturedBody));
          if (after.token) after.token = '***';
          if (after.password) after.password = '***';
        } catch {
          after = null;
        }
      }

      const entry = {
        id: uuidv4(),
        entityType,
        entityId: entityId ? String(entityId) : null,
        action,
        method,
        path: req.path,
        userId,
        userName,
        before: null,
        after,
        timestamp: new Date(),
      };

      AuditLog.create(entry).catch((err) => {
        console.error('[audit] failed to insert log:', err.message);
      });
    } catch (err) {
      console.error('[audit] middleware error:', err.message);
    }
  });

  next();
};

module.exports = { autoAudit };
