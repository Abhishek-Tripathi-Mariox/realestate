const { v4: uuidv4 } = require('uuid');
const { AuditLog } = require('../models');

// Paths whose method+path tuple should not be logged (noise / reads dressed as
// POSTs / health checks / the audit-log read itself).
const AUDIT_SKIP_PATHS = [
  /^\/api\/auth\/verify/,
  /^\/api\/admin\/audit-logs/,
];

// Batched audit-log writer. Each non-GET request used to fire its own
// AuditLog.create() concurrently which saturated the Mongo connection pool
// under load. We now buffer entries in memory and flush them with a single
// insertMany() either on a timer or once the buffer fills.
const AUDIT_BUFFER = [];
const AUDIT_FLUSH_INTERVAL_MS = 2000;
const AUDIT_BUFFER_MAX = 200;
let auditFlushTimer = null;
let auditFlushing = false;

const flushAuditBuffer = async () => {
  if (auditFlushing || AUDIT_BUFFER.length === 0) return;
  auditFlushing = true;
  const batch = AUDIT_BUFFER.splice(0, AUDIT_BUFFER.length);
  try {
    await AuditLog.insertMany(batch, { ordered: false });
  } catch (err) {
    console.error('[audit] flush failed:', err.message);
  } finally {
    auditFlushing = false;
  }
};

const scheduleAuditFlush = () => {
  if (auditFlushTimer) return;
  auditFlushTimer = setTimeout(() => {
    auditFlushTimer = null;
    flushAuditBuffer();
  }, AUDIT_FLUSH_INTERVAL_MS);
  if (auditFlushTimer.unref) auditFlushTimer.unref();
};

const enqueueAuditEntry = (entry) => {
  AUDIT_BUFFER.push(entry);
  if (AUDIT_BUFFER.length >= AUDIT_BUFFER_MAX) {
    flushAuditBuffer();
  } else {
    scheduleAuditFlush();
  }
};

// Flush on shutdown so we don't lose the tail of the buffer. SIGINT /
// SIGTERM handlers must await the flush before letting Node exit, so we
// wrap process.exit to give the buffer a chance to drain.
const flushOnExit = async () => {
  try { await flushAuditBuffer(); } catch { /* swallow — best-effort */ }
};
const handleSignal = (signal) => async () => {
  await flushOnExit();
  process.exit(signal === 'SIGINT' ? 130 : 143);
};
process.once('SIGINT', handleSignal('SIGINT'));
process.once('SIGTERM', handleSignal('SIGTERM'));
process.once('beforeExit', flushOnExit);

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

      // Redact a wider field set than just token/password — keys carrying
      // secrets / PII shouldn't be persisted in the audit collection at all.
      const SENSITIVE_KEYS = new Set([
        'token', 'password', 'currentPassword', 'newPassword', 'confirmPassword',
        'apiKey', 'secret', 'jwt', 'authorization', 'cookie', 'sessionId',
        'otp', 'pin', 'cvv', 'cardNumber', 'panNumber', 'aadhaar', 'aadhar',
      ]);
      const redact = (val) => {
        if (val === null || val === undefined) return val;
        if (Array.isArray(val)) return val.map(redact);
        if (typeof val !== 'object') return val;
        const out = {};
        for (const k of Object.keys(val)) {
          out[k] = SENSITIVE_KEYS.has(k) ? '***' : redact(val[k]);
        }
        return out;
      };

      let after = null;
      if (action !== 'DELETE' && capturedBody && typeof capturedBody === 'object') {
        try {
          after = redact(JSON.parse(JSON.stringify(capturedBody)));
        } catch {
          after = null;
        }
      }
      // Capture request-side payload as `before` for UPDATE/DELETE so we
      // can see what the client sent (the *previous* DB state would
      // require a pre-handler hook; this is a pragmatic compromise).
      let before = null;
      if ((action === 'UPDATE' || action === 'DELETE') && req.body && typeof req.body === 'object') {
        try {
          before = redact(JSON.parse(JSON.stringify(req.body)));
        } catch {
          before = null;
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
        before,
        after,
        timestamp: new Date(),
      };

      enqueueAuditEntry(entry);
    } catch (err) {
      console.error('[audit] middleware error:', err.message);
    }
  });

  next();
};

module.exports = { autoAudit };
