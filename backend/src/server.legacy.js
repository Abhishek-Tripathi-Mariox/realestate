const path = require('path');
const fs = require('fs');

// Read backend .env file manually to avoid supervisor PORT override
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) {
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});

// Set env vars from backend .env (override any existing)
Object.keys(envVars).forEach(key => {
  process.env[key] = envVars[key];
});

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { connectDB, getDB, mongoose } = require('./config/database');

const app = express();
// Backend uses BACKEND_PORT from env or defaults to 8001
const PORT = envVars.PORT || envVars.BACKEND_PORT || 8001;

// Middleware
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Delete-Otp']
}));
app.use(express.json({ limit: '10mb' }));

// ============ DELETE MASTER OTP GUARD ============
// All DELETE routes require the configured master OTP via the X-Delete-Otp header.
// This is in addition to per-route auth checks. If DELETE_MASTER_OTP is not set,
// the guard fails closed so deletes are never accidentally exposed.
app.use((req, res, next) => {
  if (req.method !== 'DELETE') return next();
  const expected = process.env.DELETE_MASTER_OTP;
  if (!expected) {
    return res.status(503).json({
      error: 'Delete OTP not configured on server',
      code: 'DELETE_OTP_NOT_CONFIGURED',
    });
  }
  const provided = req.headers['x-delete-otp'] || req.headers['X-Delete-Otp'];
  if (!provided || String(provided).trim() !== String(expected).trim()) {
    return res.status(403).json({
      error: 'Invalid or missing master delete OTP',
      code: 'DELETE_OTP_REQUIRED',
    });
  }
  next();
});

// ============ HELPER FUNCTIONS ============

// Round a value to 2 decimal places (paise precision) using integer paise math
// to avoid float drift. Returns 0 for non-finite inputs.
const roundPaise = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
};

// Names of monetary fields that should be auto-rounded to paise in request
// bodies. Anything semantically "an amount of money" goes here.
const MONEY_FIELDS = new Set([
  'amount', 'paidAmount', 'pendingAmount', 'totalAmount', 'totalPrice',
  'pricePerSqft', 'salePrice', 'purchasePrice', 'discount', 'tax', 'taxAmount',
  'commissionAmount', 'commissionRate', 'commission',
  'billAmount', 'billTotal', 'totalPaid', 'balance',
  'capital', 'capitalContributed', 'profitShare',
  'openingAmount', 'openingBalance', 'closingBalance',
  'currentBalance', 'creditLimit', 'overdraftLimit',
  'principal', 'interest', 'interestRate', 'interestAmount',
  'loanAmount', 'repaymentAmount', 'outstandingAmount',
  'buyerPayment', 'sellerPayout', 'companyCommission',
  'expenseAmount', 'rent', 'deposit', 'advance',
  'price',
]);

// Recursively round monetary fields in any plain-object/array body. Mutates
// in place (and returns the same value) for cheap reuse on req.body.
const sanitizeMoneyFields = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    obj.forEach(sanitizeMoneyFields);
    return obj;
  }
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === 'object') {
      sanitizeMoneyFields(val);
    } else if (MONEY_FIELDS.has(key) && val !== null && val !== undefined && val !== '') {
      obj[key] = roundPaise(val);
    }
  }
  return obj;
};

// Body sanitizer middleware — runs on every JSON write request and rounds any
// monetary field to 2 decimals (paise). Read paths and DELETE skip naturally
// because they don't carry monetary bodies.
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'DELETE') return next();
  if (req.body && typeof req.body === 'object') sanitizeMoneyFields(req.body);
  next();
});

const notDeleted = (additionalQuery = {}) => {
  return { ...additionalQuery, $or: [{ isDeleted: { $ne: true } }, { isDeleted: { $exists: false } }] };
};

const getAccountBalance = async (db, accountId) => {
  const account = await db.collection('accounts').findOne({ id: accountId });
  if (!account) return { balance: 0, account: null };
  
  const transactions = await db.collection('transactions').find({ 
    accountId,
    isVoided: { $ne: true },
    isReversed: { $ne: true },
    isReversal: { $ne: true }
  }).toArray();
  
  let balance = 0;
  for (const txn of transactions) {
    const amt = Number(txn.amount) || 0;
    if (txn.direction === 'IN') balance += amt;
    else balance -= amt;
  }

  return { balance, account };
};

const createTransaction = async (db, data, userId) => {
  const scope = data.societyId ? 'SOCIETY' : 'COMPANY';
  const transaction = {
    id: uuidv4(),
    txnDate: data.txnDate || new Date().toISOString().split('T')[0],
    societyId: data.societyId || null,
    scope,
    accountId: data.accountId,
    direction: data.direction,
    amount: Number(data.amount) || 0,
    paymentMode: data.paymentMode || 'Cash',
    partyType: data.partyType,
    partyName: data.partyName,
    sourceType: data.sourceType,
    sourceId: data.sourceId,
    referenceNo: data.referenceNo || '',
    remark: data.remark || '',
    createdBy: userId,
    createdAt: new Date()
  };
  await db.collection('transactions').insertOne(transaction);
  return transaction;
};

const logAudit = async (db, entityType, entityId, action, before, after, userId, metadata = {}) => {
  const auditEntry = {
    id: uuidv4(),
    entityType,
    entityId,
    action,
    before: before ? JSON.parse(JSON.stringify(before)) : null,
    after: after ? JSON.parse(JSON.stringify(after)) : null,
    userId,
    ...metadata,
    timestamp: new Date()
  };
  await db.collection('audit_logs').insertOne(auditEntry);
  return auditEntry;
};

const createReversalTransaction = async (db, originalTxn, userId, reason = 'Payment deleted') => {
  if (!originalTxn) return null;
  
  const existingReversal = await db.collection('transactions').findOne({
    originalTxnId: originalTxn.id,
    isReversal: true
  });
  if (existingReversal) return existingReversal;
  
  const reversalTxn = {
    id: uuidv4(),
    txnDate: new Date().toISOString().split('T')[0],
    societyId: originalTxn.societyId,
    scope: originalTxn.scope || 'SOCIETY',
    accountId: originalTxn.accountId,
    direction: originalTxn.direction === 'IN' ? 'OUT' : 'IN',
    amount: Number(originalTxn.amount) || 0,
    paymentMode: originalTxn.paymentMode,
    partyType: originalTxn.partyType,
    partyName: originalTxn.partyName,
    sourceType: `${originalTxn.sourceType}_REVERSAL`,
    sourceId: originalTxn.id,
    referenceNo: originalTxn.referenceNo,
    remark: `REVERSAL: ${reason}`,
    createdBy: userId,
    createdAt: new Date(),
    isReversal: true,
    originalTxnId: originalTxn.id
  };
  
  await db.collection('transactions').insertOne(reversalTxn);
  await db.collection('transactions').updateOne(
    { id: originalTxn.id },
    { $set: { isReversed: true, reversedAt: new Date(), reversalTxnId: reversalTxn.id } }
  );
  
  return reversalTxn;
};

// Auth middleware
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    req.user = jwt.verify(authHeader.substring(7), process.env.JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
};

// ============ AUTO-AUDIT MIDDLEWARE ============
// Logs every successful write (POST/PUT/PATCH/DELETE) to the audit_logs
// collection automatically, so individual route handlers don't have to call
// logAudit() manually. We wrap res.json to capture the outgoing payload, and
// run after `finish` so the response is never delayed by the audit insert.

// Paths whose method+path tuple should not be logged (noise / reads dressed
// as POSTs / health checks / the audit-log read itself).
const AUDIT_SKIP_PATHS = [
  /^\/api\/auth\/verify/,
  /^\/api\/admin\/audit-logs/,
];

// Pull a useful entityType label out of the URL. Strategy: walk the path
// segments after `/api/`, drop any uuid/objectid-shaped segments, return the
// last meaningful segment. Falls back to the full path.
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OID_RX = /^[0-9a-f]{24}$/i;
const inferEntityType = (urlPath) => {
  const cleanPath = urlPath.split('?')[0];
  const segs = cleanPath.split('/').filter(Boolean);
  // Drop the leading "api"
  if (segs[0] === 'api') segs.shift();
  // Walk from the right, return the first non-id segment
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    if (UUID_RX.test(s) || OID_RX.test(s)) continue;
    return s;
  }
  return cleanPath;
};

app.use((req, res, next) => {
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
    // Only log successful responses
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

      // For DELETE: previous state is gone but we still record the entity ref.
      // For CREATE/UPDATE: store the response payload as `after` (with paise
      // already rounded by the sanitizer). Strip noisy/circular keys.
      let after = null;
      if (action !== 'DELETE' && capturedBody && typeof capturedBody === 'object') {
        try {
          after = JSON.parse(JSON.stringify(capturedBody));
          // Never persist secrets
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

      // Fire and forget — never block the request lifecycle
      const db = getDB();
      db.collection('audit_logs').insertOne(entry).catch((err) => {
        console.error('[audit] failed to insert log:', err.message);
      });
    } catch (err) {
      console.error('[audit] middleware error:', err.message);
    }
  });

  next();
});

// ============ DATABASE INITIALIZATION ============

const initializeDatabase = async () => {
  const db = getDB();
  
  // Create admin user
  const usersCollection = db.collection('users');
  const adminExists = await usersCollection.findOne({ email: 'admin@realestate.com' });
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('Admin@123', 10);
    await usersCollection.insertOne({
      id: uuidv4(),
      email: 'admin@realestate.com',
      password: hashedPassword,
      name: 'Super Admin',
      role: 'super_admin',
      createdAt: new Date()
    });
    console.log('Default Super Admin created');
  }
  
  // Create indexes
  await usersCollection.createIndex({ email: 1 }, { unique: true });
  const collections = ['societies', 'society_phases', 'expense_categories', 'partners', 'partner_ledger_entries',
    'inventory', 'purchases', 'purchase_payment_entries', 'sales', 'sale_payment_entries', 'vendors',
    'expense_bills', 'expense_payments', 'commission_bills', 'commission_payments', 'resale_deals',
    'resale_buyer_payments', 'resale_seller_payouts', 'inventory_ownership_history', 'vendor_types',
    'customers', 'customer_payments', 'payment_allocations', 'accounts', 'account_opening_balances',
    'transactions', 'parties', 'loans', 'loan_repayments'];
  
  for (const col of collections) {
    try { await db.collection(col).createIndex({ id: 1 }, { unique: true }); } catch(e) {}
  }
  
  // Default categories
  const categoriesCount = await db.collection('expense_categories').countDocuments();
  if (categoriesCount === 0) {
    const defaultCategories = ['Civil', 'Tiles', 'Electrical', 'Plumbing', 'Paint', 'Labour', 'Legal', 'Marketing', 'Office', 'Other'];
    for (const name of defaultCategories) {
      await db.collection('expense_categories').insertOne({ id: uuidv4(), name, isActive: true, isDeleted: false, createdAt: new Date() });
    }
  }
  
  // Default vendor types
  const vendorTypesCount = await db.collection('vendor_types').countDocuments();
  if (vendorTypesCount === 0) {
    const defaultTypes = ['Electrician', 'Broker', 'Labour', 'Legal', 'Marketing', 'Plumber', 'Civil', 'Tiles', 'Paint', 'Carpenter', 'Other'];
    for (const name of defaultTypes) {
      await db.collection('vendor_types').insertOne({ id: uuidv4(), name, isActive: true, isDeleted: false, createdAt: new Date() });
    }
  }
  
  // Default accounts
  const accountsCount = await db.collection('accounts').countDocuments();
  if (accountsCount === 0) {
    const defaultAccounts = [
      { name: 'Cash-in-Hand', type: 'CASH', isDefault: true },
      { name: 'HDFC Bank', type: 'BANK', isDefault: false },
      { name: 'ICICI Bank', type: 'BANK', isDefault: false }
    ];
    for (const acc of defaultAccounts) {
      const account = { id: uuidv4(), ...acc, overdraftEnabled: false, isActive: true, createdAt: new Date() };
      await db.collection('accounts').insertOne(account);
      await db.collection('account_opening_balances').insertOne({
        id: uuidv4(), accountId: account.id, openingAmount: 0, openingDate: new Date().toISOString().split('T')[0], createdAt: new Date()
      });
    }
  }
  
  console.log('Database initialized');
};

// ============ ROUTES ============

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ AUTH ROUTES ============

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const db = getDB();
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = await db.collection('users').findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/verify', verifyToken, (req, res) => {
  res.json({ user: req.user });
});

// ============ SOCIETIES ROUTES ============

app.get('/api/societies', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const societies = await db.collection('societies').find({}).toArray();
    res.json(societies.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/societies', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Only Super Admin can create societies' });
    
    const db = getDB();
    const society = {
      id: uuidv4(),
      name: req.body.name,
      location: req.body.location,
      totalArea: req.body.totalArea,
      startDate: req.body.startDate,
      status: req.body.status || 'Active',
      notes: req.body.notes || '',
      createdAt: new Date()
    };
    await db.collection('societies').insertOne(society);
    const { _id, ...cleaned } = society;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/societies/:id', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Only Super Admin can update societies' });
    
    const db = getDB();
    await db.collection('societies').updateOne({ id: req.params.id }, { $set: { ...req.body, updatedAt: new Date() } });
    const updated = await db.collection('societies').findOne({ id: req.params.id });
    const { _id, ...cleaned } = updated;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/societies/:id', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Only Super Admin can delete societies' });
    
    const db = getDB();
    const societyId = req.params.id;
    
    // Cascade delete
    await db.collection('transactions').deleteMany({ societyId });
    const sales = await db.collection('sales').find({ societyId }).toArray();
    for (const sale of sales) {
      await db.collection('sale_payment_entries').deleteMany({ saleId: sale.id });
    }
    await db.collection('sales').deleteMany({ societyId });
    await db.collection('purchases').deleteMany({ societyId });
    await db.collection('expense_bills').deleteMany({ societyId });
    await db.collection('vendors').deleteMany({ societyId });
    await db.collection('inventory').deleteMany({ societyId });
    await db.collection('partners').deleteMany({ societyId });
    await db.collection('society_phases').deleteMany({ societyId });
    await db.collection('societies').deleteOne({ id: societyId });
    
    res.json({ message: 'Society and all related data deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Society Summary
app.get('/api/societies/:id/summary', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const societyId = req.params.id;
    
    const inventory = await db.collection('inventory').find(notDeleted({ societyId })).toArray();
    const sales = await db.collection('sales').find(notDeleted({ societyId })).toArray();
    const purchases = await db.collection('purchases').find(notDeleted({ societyId })).toArray();
    const expenseBills = await db.collection('expense_bills').find(notDeleted({ societyId })).toArray();
    
    const totalInventory = inventory.length;
    const soldInventory = inventory.filter(i => i.status === 'Sold').length;
    const availableInventory = inventory.filter(i => i.status === 'Available').length;
    
    const totalSaleAmount = sales.reduce((sum, s) => sum + (s.finalAmount || 0), 0);
    const totalReceived = sales.reduce((sum, s) => sum + (s.amountPaid || 0), 0);
    const totalPending = totalSaleAmount - totalReceived;
    
    const totalPurchaseAmount = purchases.reduce((sum, p) => sum + (p.totalCost || 0), 0);
    const totalPurchasePaid = purchases.reduce((sum, p) => sum + (p.amountPaid || 0), 0);
    
    const totalExpenses = expenseBills.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalExpensesPaid = expenseBills.reduce((sum, e) => sum + (e.paidAmount || 0), 0);
    
    res.json({
      totalInventory,
      soldInventory,
      availableInventory,
      totalSaleAmount,
      totalReceived,
      totalPending,
      totalPurchaseAmount,
      totalPurchasePaid,
      totalExpenses,
      totalExpensesPaid
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ PHASES ROUTES ============

app.get('/api/societies/:societyId/phases', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const phases = await db.collection('society_phases').find({ societyId: req.params.societyId }).toArray();
    res.json(phases.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/societies/:societyId/phases', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const phase = {
      id: uuidv4(),
      societyId: req.params.societyId,
      name: req.body.name,
      description: req.body.description || '',
      createdAt: new Date()
    };
    await db.collection('society_phases').insertOne(phase);
    const { _id, ...cleaned } = phase;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/phases/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    await db.collection('society_phases').updateOne({ id: req.params.id }, { $set: { ...req.body, updatedAt: new Date() } });
    const updated = await db.collection('society_phases').findOne({ id: req.params.id });
    const { _id, ...cleaned } = updated;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/phases/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    await db.collection('society_phases').deleteOne({ id: req.params.id });
    res.json({ message: 'Phase deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ PARTNERS ROUTES ============

app.get('/api/societies/:societyId/partners', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const partners = await db.collection('partners').find(notDeleted({ societyId: req.params.societyId })).toArray();
    
    const partnersWithTotals = await Promise.all(partners.map(async (partner) => {
      const ledgerEntries = await db.collection('partner_ledger_entries').find(notDeleted({ partnerId: partner.id })).toArray();
      const totalInvestment = ledgerEntries.filter(e => e.type === 'INVESTMENT').reduce((sum, e) => sum + e.amount, 0);
      const totalWithdrawal = ledgerEntries.filter(e => e.type === 'WITHDRAWAL').reduce((sum, e) => sum + e.amount, 0);
      const totalProfitPaid = ledgerEntries.filter(e => e.type === 'PROFIT_PAYOUT').reduce((sum, e) => sum + e.amount, 0);
      const runningBalance = totalInvestment - totalWithdrawal - totalProfitPaid;
      
      return { ...partner, totalInvestment, totalWithdrawal, totalProfitPaid, runningBalance };
    }));
    
    const summary = {
      totalPartnerInvestment: partnersWithTotals.reduce((sum, p) => sum + p.totalInvestment, 0),
      totalWithdrawals: partnersWithTotals.reduce((sum, p) => sum + p.totalWithdrawal, 0),
      totalProfitPaid: partnersWithTotals.reduce((sum, p) => sum + p.totalProfitPaid, 0),
      totalRunningBalance: partnersWithTotals.reduce((sum, p) => sum + p.runningBalance, 0),
      totalPercentage: partnersWithTotals.reduce((sum, p) => sum + p.percentage, 0),
      partnerCount: partnersWithTotals.length
    };
    
    res.json({ partners: partnersWithTotals.map(({ _id, ...rest }) => rest), summary });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/societies/:societyId/partners', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const societyId = req.params.societyId;
    
    const existingPartners = await db.collection('partners').find(notDeleted({ societyId })).toArray();
    const totalPercentage = existingPartners.reduce((sum, p) => sum + p.percentage, 0) + req.body.percentage;
    
    if (totalPercentage > 100) {
      return res.status(400).json({ error: 'Total partner percentage cannot exceed 100%' });
    }
    
    const partner = {
      id: uuidv4(),
      societyId,
      name: req.body.name,
      percentage: req.body.percentage,
      expectedInvestment: req.body.expectedInvestment || 0,
      notes: req.body.notes || '',
      createdAt: new Date()
    };
    
    await db.collection('partners').insertOne(partner);
    const { _id, ...cleaned } = partner;
    res.json({ ...cleaned, totalInvestment: 0, totalWithdrawal: 0, totalProfitPaid: 0, runningBalance: 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/partners/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    await db.collection('partners').updateOne({ id: req.params.id }, { $set: { ...req.body, updatedAt: new Date() } });
    const updated = await db.collection('partners').findOne({ id: req.params.id });
    const { _id, ...cleaned } = updated;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/partners/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    await db.collection('partners').updateOne({ id: req.params.id }, { $set: { isDeleted: true, deletedAt: new Date() } });
    res.json({ message: 'Partner deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Partner Ledger
app.get('/api/partners/:partnerId/ledger', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const entries = await db.collection('partner_ledger_entries').find(notDeleted({ partnerId: req.params.partnerId })).sort({ entryDate: -1 }).toArray();
    res.json(entries.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/partners/:partnerId/ledger', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const partner = await db.collection('partners').findOne({ id: req.params.partnerId });
    if (!partner) return res.status(404).json({ error: 'Partner not found' });
    
    let accountId = req.body.accountId;
    if (!accountId) {
      const defaultAccount = await db.collection('accounts').findOne({ isDefault: true });
      accountId = defaultAccount?.id;
    }
    
    const entry = {
      id: uuidv4(),
      partnerId: req.params.partnerId,
      societyId: partner.societyId,
      accountId,
      type: req.body.type,
      amount: Number(req.body.amount) || 0,
      entryDate: req.body.entryDate,
      paymentMode: req.body.paymentMode,
      remark: req.body.remark || '',
      createdBy: req.user.userId,
      createdAt: new Date()
    };
    
    await db.collection('partner_ledger_entries').insertOne(entry);
    
    const direction = req.body.type === 'INVESTMENT' ? 'IN' : 'OUT';
    await createTransaction(db, {
      txnDate: req.body.entryDate,
      societyId: partner.societyId,
      accountId,
      direction,
      amount: Number(req.body.amount) || 0,
      paymentMode: req.body.paymentMode,
      partyType: 'Partner',
      partyName: partner.name,
      sourceType: 'PARTNER_CAPITAL',
      sourceId: entry.id,
      remark: req.body.remark || `${req.body.type} - ${partner.name}`
    }, req.user.userId);
    
    const { _id, ...cleaned } = entry;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/ledger-entries/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const entry = await db.collection('partner_ledger_entries').findOne({ id: req.params.id });
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    
    const originalTxn = await db.collection('transactions').findOne({ sourceType: 'PARTNER_CAPITAL', sourceId: req.params.id });
    if (originalTxn) {
      await createReversalTransaction(db, originalTxn, req.user.userId, 'Ledger entry deleted');
    }
    
    await db.collection('partner_ledger_entries').updateOne({ id: req.params.id }, { $set: { isDeleted: true, deletedAt: new Date() } });
    res.json({ message: 'Ledger entry deleted with reversal' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ INVENTORY ROUTES ============

app.get('/api/societies/:societyId/inventory', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const inventory = await db.collection('inventory').find(notDeleted({ societyId: req.params.societyId })).toArray();
    res.json(inventory.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/societies/:societyId/inventory', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const item = {
      id: uuidv4(),
      societyId: req.params.societyId,
      inventoryNumber: req.body.inventoryNumber,
      type: req.body.type,
      phase: req.body.phase || '',
      area: req.body.area,
      pricePerSqft: req.body.pricePerSqft,
      totalPrice: req.body.area * req.body.pricePerSqft,
      status: 'Available',
      notes: req.body.notes || '',
      createdAt: new Date()
    };
    await db.collection('inventory').insertOne(item);
    const { _id, ...cleaned } = item;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/inventory/global - Global inventory across all societies (admin only)
app.get('/api/inventory/global', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const db = getDB();
    const {
      societyId,
      status,
      type,
      q,
      page = 1,
      limit = 50,
      sort = 'createdAt',
      order = 'desc',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(500, parseInt(limit) || 50));
    const skip = (pageNum - 1) * limitNum;
    const sortDirection = order === 'asc' ? 1 : -1;

    // Load societies once for name/location enrichment + name search
    const societies = await db.collection('societies').find({}).toArray();
    const societyMap = {};
    societies.forEach(s => { societyMap[s.id] = s; });

    // Build base filter
    const filter = { isDeleted: { $ne: true } };
    if (societyId && societyId !== 'all') filter.societyId = societyId;
    if (status && status !== 'all') filter.status = status;
    if (type && type !== 'all') filter.type = type;

    if (q && q.trim()) {
      const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      // Match societies by name first, then include their ids in $or
      const matchingSocietyIds = societies
        .filter(s => rx.test(s.name || ''))
        .map(s => s.id);

      filter.$or = [
        { inventoryNumber: rx },
        { type: rx },
        { currentOwner: rx },
        { facing: rx },
        { floor: rx },
        { notes: rx },
      ];
      if (matchingSocietyIds.length > 0) {
        filter.$or.push({ societyId: { $in: matchingSocietyIds } });
      }
    }

    const total = await db.collection('inventory').countDocuments(filter);

    const items = await db.collection('inventory')
      .find(filter)
      .sort({ [sort]: sortDirection })
      .skip(skip)
      .limit(limitNum)
      .toArray();

    const inventory = items.map(({ _id, ...rest }) => ({
      ...rest,
      societyName: societyMap[rest.societyId]?.name || 'Unknown',
      societyLocation: societyMap[rest.societyId]?.location || '',
    }));

    // Summary across the (filter-but-unpaginated) result set
    const summaryAgg = await db.collection('inventory').aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          available: { $sum: { $cond: [{ $eq: ['$status', 'Available'] }, 1, 0] } },
          sold: { $sum: { $cond: [{ $eq: ['$status', 'Sold'] }, 1, 0] } },
          booked: { $sum: { $cond: [{ $eq: ['$status', 'Booked'] }, 1, 0] } },
          blocked: { $sum: { $cond: [{ $eq: ['$status', 'Blocked'] }, 1, 0] } },
        },
      },
    ]).toArray();
    const summary = summaryAgg[0]
      ? { total: summaryAgg[0].total, available: summaryAgg[0].available, sold: summaryAgg[0].sold, booked: summaryAgg[0].booked, blocked: summaryAgg[0].blocked }
      : { total: 0, available: 0, sold: 0, booked: 0, blocked: 0 };

    // Distinct types/statuses for filter dropdowns (across all non-deleted inventory)
    const types = (await db.collection('inventory').distinct('type', { isDeleted: { $ne: true } }))
      .filter(Boolean)
      .sort();
    const distinctStatuses = (await db.collection('inventory').distinct('status', { isDeleted: { $ne: true } }))
      .filter(Boolean);
    const statuses = distinctStatuses.length > 0 ? distinctStatuses : ['Available', 'Sold', 'Booked', 'Blocked'];

    res.json({
      inventory,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
      summary,
      filters: { types, statuses },
    });
  } catch (error) {
    console.error('Global inventory error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/inventory/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const updates = { ...req.body, updatedAt: new Date() };
    if (req.body.area && req.body.pricePerSqft) {
      updates.totalPrice = req.body.area * req.body.pricePerSqft;
    }
    await db.collection('inventory').updateOne({ id: req.params.id }, { $set: updates });
    const updated = await db.collection('inventory').findOne({ id: req.params.id });
    const { _id, ...cleaned } = updated;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/inventory/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    await db.collection('inventory').updateOne({ id: req.params.id }, { $set: { isDeleted: true, deletedAt: new Date() } });
    res.json({ message: 'Inventory deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Global Inventory
app.get('/api/global-inventory', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const inventory = await db.collection('inventory').find(notDeleted()).toArray();
    const societies = await db.collection('societies').find({}).toArray();
    const societyMap = {};
    societies.forEach(s => societyMap[s.id] = s.name);
    
    const enriched = inventory.map(item => ({
      ...item,
      societyName: societyMap[item.societyId] || 'Unknown'
    }));
    
    res.json(enriched.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ PURCHASES ROUTES ============

app.get('/api/societies/:societyId/purchases', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const purchases = await db.collection('purchases').find(notDeleted({ societyId: req.params.societyId })).toArray();
    res.json(purchases.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/societies/:societyId/purchases', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const purchase = {
      id: uuidv4(),
      societyId: req.params.societyId,
      inventoryId: req.body.inventoryId,
      vendorName: req.body.vendorName,
      purchaseDate: req.body.purchaseDate,
      totalCost: req.body.totalCost,
      amountPaid: 0,
      status: 'Pending',
      notes: req.body.notes || '',
      createdAt: new Date()
    };
    await db.collection('purchases').insertOne(purchase);
    const { _id, ...cleaned } = purchase;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ SALES ROUTES ============

app.get('/api/societies/:societyId/sales', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const sales = await db.collection('sales').find(notDeleted({ societyId: req.params.societyId })).toArray();
    
    const enrichedSales = await Promise.all(sales.map(async (sale) => {
      const inventory = await db.collection('inventory').findOne({ id: sale.inventoryId });
      const customer = sale.customerId ? await db.collection('customers').findOne({ id: sale.customerId }) : null;
      return {
        ...sale,
        inventoryNumber: inventory?.inventoryNumber || 'N/A',
        inventoryType: inventory?.type || 'N/A',
        phase: inventory?.phase || 'N/A',
        customerName: customer?.name || sale.buyerName || 'N/A'
      };
    }));
    
    const summary = {
      totalSales: enrichedSales.length,
      totalAmount: enrichedSales.reduce((sum, s) => sum + (s.finalAmount || 0), 0),
      totalReceived: enrichedSales.reduce((sum, s) => sum + (s.amountPaid || 0), 0),
      totalPending: enrichedSales.reduce((sum, s) => sum + ((s.finalAmount || 0) - (s.amountPaid || 0)), 0)
    };
    
    res.json({ sales: enrichedSales.map(({ _id, ...rest }) => rest), summary });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/societies/:societyId/sales', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const societyId = req.params.societyId;
    
    const sale = {
      id: uuidv4(),
      societyId,
      inventoryId: req.body.inventoryId,
      customerId: req.body.customerId || null,
      buyerName: req.body.buyerName,
      buyerContact: req.body.buyerContact,
      saleDate: req.body.saleDate,
      agreedPrice: req.body.agreedPrice,
      discount: req.body.discount || 0,
      finalAmount: req.body.agreedPrice - (req.body.discount || 0),
      amountPaid: 0,
      status: 'Booked',
      paymentStatus: 'Pending',
      notes: req.body.notes || '',
      createdBy: req.user.userId,
      createdAt: new Date()
    };
    
    await db.collection('sales').insertOne(sale);
    await db.collection('inventory').updateOne({ id: req.body.inventoryId }, { $set: { status: 'Sold', soldDate: req.body.saleDate } });
    
    const { _id, ...cleaned } = sale;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/sales/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const updates = { ...req.body, updatedAt: new Date() };
    if (req.body.agreedPrice !== undefined || req.body.discount !== undefined) {
      const sale = await db.collection('sales').findOne({ id: req.params.id });
      const agreedPrice = req.body.agreedPrice ?? sale.agreedPrice;
      const discount = req.body.discount ?? sale.discount;
      updates.finalAmount = agreedPrice - discount;
    }
    await db.collection('sales').updateOne({ id: req.params.id }, { $set: updates });
    const updated = await db.collection('sales').findOne({ id: req.params.id });
    const { _id, ...cleaned } = updated;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/sales/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const sale = await db.collection('sales').findOne({ id: req.params.id });
    if (sale) {
      await db.collection('inventory').updateOne({ id: sale.inventoryId }, { $set: { status: 'Available', soldDate: null } });
    }
    await db.collection('sales').updateOne({ id: req.params.id }, { $set: { isDeleted: true, deletedAt: new Date() } });
    res.json({ message: 'Sale deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sale Payments
app.get('/api/sales/:saleId/payments', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const payments = await db.collection('sale_payment_entries').find(notDeleted({ saleId: req.params.saleId })).sort({ paymentDate: -1 }).toArray();
    res.json(payments.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sales/:saleId/payments', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const sale = await db.collection('sales').findOne({ id: req.params.saleId });
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    
    let accountId = req.body.accountId;
    if (!accountId) {
      const defaultAccount = await db.collection('accounts').findOne({ isDefault: true });
      accountId = defaultAccount?.id;
    }
    
    const payment = {
      id: uuidv4(),
      saleId: req.params.saleId,
      societyId: sale.societyId,
      accountId,
      amount: Number(req.body.amount) || 0,
      paymentDate: req.body.paymentDate,
      paymentMode: req.body.paymentMode || 'Cash',
      referenceNo: req.body.referenceNo || '',
      remark: req.body.remark || '',
      createdBy: req.user.userId,
      createdAt: new Date()
    };
    
    await db.collection('sale_payment_entries').insertOne(payment);
    
    const newAmountPaid = (sale.amountPaid || 0) + req.body.amount;
    const paymentStatus = newAmountPaid >= sale.finalAmount ? 'Paid' : 'Partial';
    await db.collection('sales').updateOne({ id: req.params.saleId }, { $set: { amountPaid: newAmountPaid, paymentStatus } });
    
    await createTransaction(db, {
      txnDate: req.body.paymentDate,
      societyId: sale.societyId,
      accountId,
      direction: 'IN',
      amount: Number(req.body.amount) || 0,
      paymentMode: req.body.paymentMode || 'Cash',
      partyType: 'Customer',
      partyName: sale.buyerName,
      sourceType: 'SALE_PAYMENT',
      sourceId: payment.id,
      remark: req.body.remark || `Sale payment - ${sale.buyerName}`
    }, req.user.userId);
    
    const { _id, ...cleaned } = payment;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sale Ledger (entryType: SALE_PAYMENT | WITHDRAWAL | PROFIT_PAYOUT)
app.get('/api/sales/:saleId/ledger', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const entries = await db.collection('sale_payment_entries')
      .find(notDeleted({ saleId: req.params.saleId }))
      .sort({ paymentDate: -1 })
      .toArray();
    res.json({ entries: entries.map(({ _id, ...rest }) => rest) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sales/:saleId/ledger', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const sale = await db.collection('sales').findOne({ id: req.params.saleId });
    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    let accountId = req.body.accountId;
    if (!accountId) {
      const defaultAccount = await db.collection('accounts').findOne({ isDefault: true });
      accountId = defaultAccount?.id;
    }

    const entryType = req.body.entryType || 'SALE_PAYMENT';
    const amount = parseFloat(req.body.amount) || 0;

    const entry = {
      id: uuidv4(),
      saleId: req.params.saleId,
      societyId: sale.societyId,
      accountId,
      entryType,
      amount,
      paymentDate: req.body.paymentDate,
      paymentMode: req.body.paymentMode || 'Cash',
      referenceNo: req.body.referenceNo || '',
      remark: req.body.remark || '',
      createdBy: req.user.userId,
      createdAt: new Date()
    };

    await db.collection('sale_payment_entries').insertOne(entry);

    if (entryType === 'SALE_PAYMENT') {
      const newAmountPaid = (sale.amountPaid || 0) + amount;
      const paymentStatus = newAmountPaid >= sale.finalAmount ? 'Paid' : 'Partial';
      await db.collection('sales').updateOne({ id: req.params.saleId }, { $set: { amountPaid: newAmountPaid, paymentStatus } });
    }

    const direction = entryType === 'SALE_PAYMENT' ? 'IN' : 'OUT';
    await createTransaction(db, {
      txnDate: req.body.paymentDate,
      societyId: sale.societyId,
      accountId,
      direction,
      amount,
      paymentMode: req.body.paymentMode || 'Cash',
      partyType: 'Customer',
      partyName: sale.buyerName,
      sourceType: 'SALE_PAYMENT',
      sourceId: entry.id,
      remark: req.body.remark || `${entryType} - ${sale.buyerName}`
    }, req.user.userId);

    const { _id, ...cleaned } = entry;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/sale-payments/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const entry = await db.collection('sale_payment_entries').findOne({ id: req.params.id });
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    const originalTxn = await db.collection('transactions').findOne({ sourceType: 'SALE_PAYMENT', sourceId: req.params.id });
    if (originalTxn) {
      await createReversalTransaction(db, originalTxn, req.user.userId, 'Sale ledger entry deleted');
    }

    if ((entry.entryType || 'SALE_PAYMENT') === 'SALE_PAYMENT') {
      const sale = await db.collection('sales').findOne({ id: entry.saleId });
      if (sale) {
        const newAmountPaid = Math.max(0, (sale.amountPaid || 0) - (entry.amount || 0));
        const paymentStatus = newAmountPaid <= 0 ? 'Pending' : (newAmountPaid >= sale.finalAmount ? 'Paid' : 'Partial');
        await db.collection('sales').updateOne({ id: entry.saleId }, { $set: { amountPaid: newAmountPaid, paymentStatus } });
      }
    }

    await db.collection('sale_payment_entries').updateOne({ id: req.params.id }, { $set: { isDeleted: true, deletedAt: new Date() } });
    res.json({ message: 'Sale ledger entry deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ CUSTOMERS ROUTES ============

app.get('/api/customers', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const filter = notDeleted();
    if (req.query.societyId) filter.societyId = req.query.societyId;
    const customers = await db.collection('customers').find(filter).toArray();
    res.json(customers.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/customers', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const customer = {
      id: uuidv4(),
      societyId: req.body.societyId,
      name: req.body.name,
      phone: req.body.phone || '',
      email: req.body.email || '',
      address: req.body.address || '',
      notes: req.body.notes || '',
      createdBy: req.user.userId,
      createdAt: new Date()
    };
    await db.collection('customers').insertOne(customer);
    const { _id, ...cleaned } = customer;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/customers/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    await db.collection('customers').updateOne({ id: req.params.id }, { $set: { ...req.body, updatedAt: new Date() } });
    const updated = await db.collection('customers').findOne({ id: req.params.id });
    const { _id, ...cleaned } = updated;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/customers/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    await db.collection('customers').updateOne({ id: req.params.id }, { $set: { ...req.body, updatedAt: new Date() } });
    const updated = await db.collection('customers').findOne({ id: req.params.id });
    const { _id, ...cleaned } = updated;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/customers/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    await db.collection('customers').updateOne({ id: req.params.id }, { $set: { isDeleted: true, deletedAt: new Date() } });
    res.json({ message: 'Customer deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/customers/:id/sales', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const sales = await db.collection('sales').find(notDeleted({ customerId: req.params.id })).toArray();
    const enriched = await Promise.all(sales.map(async (s) => {
      const inventory = s.inventoryId ? await db.collection('inventory').findOne({ id: s.inventoryId }) : null;
      const allocations = await db.collection('payment_allocations').find({ saleId: s.id }).toArray();
      const allocatedAmount = allocations.reduce((sum, a) => sum + (a.amount || 0), 0);
      return {
        ...s,
        inventoryNumber: inventory?.inventoryNumber || 'N/A',
        allocatedAmount,
        pendingBalance: (s.finalAmount || 0) - allocatedAmount
      };
    }));
    res.json(enriched.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/customers/:id/ledger', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const customerId = req.params.id;

    const sales = await db.collection('sales').find(notDeleted({ customerId })).toArray();
    const payments = await db.collection('customer_payments').find(notDeleted({ customerId })).toArray();
    const paymentIds = payments.map(p => p.id);
    const allocations = paymentIds.length
      ? await db.collection('payment_allocations').find({ paymentId: { $in: paymentIds } }).toArray()
      : [];

    const inventoryIds = [...new Set(sales.map(s => s.inventoryId).filter(Boolean))];
    const inventories = inventoryIds.length
      ? await db.collection('inventory').find({ id: { $in: inventoryIds } }).toArray()
      : [];
    const inventoryById = Object.fromEntries(inventories.map(i => [i.id, i]));
    const saleById = Object.fromEntries(sales.map(s => [s.id, s]));

    const saleEntries = sales.map(s => {
      const allocatedForSale = allocations.filter(a => a.saleId === s.id).reduce((sum, a) => sum + (a.amount || 0), 0);
      const inv = s.inventoryId ? inventoryById[s.inventoryId] : null;
      return {
        id: `sale-${s.id}`,
        date: s.saleDate || s.createdAt,
        type: 'SALE',
        description: `Sale - ${inv?.inventoryNumber || 'Unit'}`,
        debit: s.finalAmount || 0,
        credit: 0,
        pendingBalance: (s.finalAmount || 0) - allocatedForSale
      };
    });

    const paymentEntries = payments.map(p => {
      const paymentAllocs = allocations.filter(a => a.paymentId === p.id);
      const allocationDetails = paymentAllocs.map(a => {
        const sale = saleById[a.saleId];
        const inv = sale?.inventoryId ? inventoryById[sale.inventoryId] : null;
        return { inventoryNumber: inv?.inventoryNumber || 'N/A', amount: a.amount || 0 };
      });
      const unalloc = p.unallocatedAmount != null ? p.unallocatedAmount : ((p.amount || 0) - paymentAllocs.reduce((s, a) => s + (a.amount || 0), 0));
      let status = 'PENDING';
      if (unalloc <= 0) status = 'FULLY_ALLOCATED';
      else if (unalloc < (p.amount || 0)) status = 'PARTIAL';
      return {
        id: `pay-${p.id}`,
        date: p.paymentDate || p.createdAt,
        type: 'PAYMENT',
        description: `Payment via ${p.paymentMode || 'Cash'}${p.referenceNo ? ` (${p.referenceNo})` : ''}`,
        debit: 0,
        credit: p.amount || 0,
        allocationDetails,
        status
      };
    });

    const ledger = [...saleEntries, ...paymentEntries]
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    let running = 0;
    for (const e of ledger) {
      running += (e.debit || 0) - (e.credit || 0);
      e.runningBalance = running;
    }

    const totalSales = sales.reduce((s, x) => s + (x.finalAmount || 0), 0);
    const totalPayments = payments.reduce((s, x) => s + (x.amount || 0), 0);
    const totalAllocated = allocations.reduce((s, x) => s + (x.amount || 0), 0);
    const unallocatedPayments = payments.reduce((s, x) => s + (x.unallocatedAmount != null ? x.unallocatedAmount : 0), 0);

    res.json({
      summary: {
        totalSales,
        totalPayments,
        totalAllocated,
        outstandingBalance: totalSales - totalAllocated,
        unallocatedPayments
      },
      ledger
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Customer Payments
app.get('/api/customer-payments', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const filter = notDeleted();
    if (req.query.societyId) filter.societyId = req.query.societyId;
    if (req.query.customerId) filter.customerId = req.query.customerId;
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const total = await db.collection('customer_payments').countDocuments(filter);
    const payments = await db.collection('customer_payments').find(filter).sort({ paymentDate: -1 }).skip(skip).limit(limit).toArray();
    
    const enriched = await Promise.all(payments.map(async (p) => {
      const customer = await db.collection('customers').findOne({ id: p.customerId });
      const account = await db.collection('accounts').findOne({ id: p.accountId });
      return { ...p, customerName: customer?.name || 'N/A', accountName: account?.name || 'N/A' };
    }));
    
    res.json({
      data: enriched.map(({ _id, ...rest }) => rest),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/customer-payments', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const customer = await db.collection('customers').findOne({ id: req.body.customerId });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    
    let accountId = req.body.accountId;
    if (!accountId) {
      const defaultAccount = await db.collection('accounts').findOne({ isDefault: true });
      accountId = defaultAccount?.id;
    }
    
    const payment = {
      id: uuidv4(),
      customerId: req.body.customerId,
      societyId: req.body.societyId || customer.societyId,
      accountId,
      amount: Number(req.body.amount) || 0,
      paymentDate: req.body.paymentDate,
      paymentMode: req.body.paymentMode || 'Cash',
      referenceNo: req.body.referenceNo || '',
      remark: req.body.remark || '',
      unallocatedAmount: req.body.amount,
      createdBy: req.user.userId,
      createdAt: new Date()
    };
    
    await db.collection('customer_payments').insertOne(payment);
    
    await createTransaction(db, {
      txnDate: req.body.paymentDate,
      societyId: payment.societyId,
      accountId,
      direction: 'IN',
      amount: Number(req.body.amount) || 0,
      paymentMode: req.body.paymentMode || 'Cash',
      partyType: 'Customer',
      partyName: customer.name,
      sourceType: 'CUSTOMER_PAYMENT',
      sourceId: payment.id,
      remark: req.body.remark || `Customer payment - ${customer.name}`
    }, req.user.userId);
    
    const { _id, ...cleaned } = payment;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/customer-payments/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const payment = await db.collection('customer_payments').findOne({ id: req.params.id });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    
    const originalTxn = await db.collection('transactions').findOne({ sourceType: 'CUSTOMER_PAYMENT', sourceId: req.params.id });
    if (originalTxn) {
      await createReversalTransaction(db, originalTxn, req.user.userId, 'Customer payment deleted');
    }
    
    await db.collection('customer_payments').updateOne({ id: req.params.id }, { $set: { isDeleted: true, deletedAt: new Date() } });
    await db.collection('payment_allocations').deleteMany({ paymentId: req.params.id });
    
    res.json({ message: 'Payment deleted with reversal' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ACCOUNTS ROUTES ============

app.get('/api/accounts', verifyToken, async (req, res) => {
  try {
    const db = getDB();

    // Build a Mongo filter that respects the requested scope so society-
    // specific accounts never leak into other societies' dropdowns.
    //
    //   ?societyId=xxx        -> GLOBAL + accounts belonging to xxx only
    //   ?scope=COMPANY        -> GLOBAL only (no society-scoped accounts)
    //   ?scope=SOCIETY        -> society-scoped accounts (combined with societyId if given)
    //   ?scope=ALL or nothing -> every account (admin / legacy view)
    const { societyId, scope } = req.query;
    const filter = { isActive: { $ne: false } };

    const isGlobalAccount = {
      $or: [
        { scope: 'GLOBAL' },
        { societyId: null },
        { societyId: { $exists: false } },
      ],
    };

    if (scope === 'COMPANY') {
      Object.assign(filter, isGlobalAccount);
    } else if (scope === 'SOCIETY') {
      filter.scope = 'SOCIETY';
      if (societyId && societyId !== 'all') filter.societyId = societyId;
    } else if (societyId && societyId !== 'all') {
      // Default behaviour for the dashboard: GLOBAL + this society's accounts
      filter.$or = [
        { scope: 'GLOBAL' },
        { societyId: null },
        { societyId: { $exists: false } },
        { societyId },
      ];
    }
    // else: scope === 'ALL' or nothing => no extra filter (admin view)

    const accounts = await db.collection('accounts').find(filter).toArray();

    const accountsWithBalance = await Promise.all(accounts.map(async (account) => {
      const { balance } = await getAccountBalance(db, account.id);
      const opening = await db.collection('account_opening_balances').findOne({ accountId: account.id });
      return {
        ...account,
        currentBalance: balance,
        openingAmount: opening?.openingAmount || 0,
        openingDate: opening?.openingDate || null,
      };
    }));

    res.json(accountsWithBalance.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/accounts', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const account = {
      id: uuidv4(),
      name: req.body.name,
      type: req.body.type || 'BANK',
      isDefault: false,
      overdraftEnabled: req.body.overdraftEnabled || false,
      scope: req.body.scope || 'GLOBAL',
      societyId: req.body.societyId || null,
      isActive: true,
      createdAt: new Date()
    };
    
    await db.collection('accounts').insertOne(account);
    
    await db.collection('account_opening_balances').insertOne({
      id: uuidv4(),
      accountId: account.id,
      openingAmount: req.body.openingAmount || 0,
      openingDate: new Date().toISOString().split('T')[0],
      createdAt: new Date()
    });
    
    const { _id, ...cleaned } = account;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/accounts/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    await db.collection('accounts').updateOne({ id: req.params.id }, { $set: { ...req.body, updatedAt: new Date() } });
    const updated = await db.collection('accounts').findOne({ id: req.params.id });
    const { _id, ...cleaned } = updated;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/accounts/:id/opening-balance', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    await db.collection('account_opening_balances').updateOne(
      { accountId: req.params.id },
      { $set: { openingAmount: req.body.openingAmount, openingDate: req.body.openingDate, updatedAt: new Date() } },
      { upsert: true }
    );
    res.json({ message: 'Opening balance updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/accounts/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    await db.collection('accounts').updateOne({ id: req.params.id }, { $set: { isActive: false, deletedAt: new Date() } });
    res.json({ message: 'Account deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ DAYBOOK ROUTES ============

app.get('/api/daybook', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const filter = {};
    
    if (req.query.scope === 'COMPANY') {
      filter.societyId = null;
    } else if (req.query.societyId && req.query.societyId !== 'all') {
      filter.societyId = req.query.societyId;
    }
    
    if (req.query.accountId && req.query.accountId !== 'all') filter.accountId = req.query.accountId;
    if (req.query.direction && req.query.direction !== 'all') filter.direction = req.query.direction;
    if (req.query.sourceType && req.query.sourceType !== 'all') filter.sourceType = req.query.sourceType;
    
    if (req.query.startDate) filter.txnDate = { $gte: req.query.startDate };
    if (req.query.endDate) {
      filter.txnDate = filter.txnDate || {};
      filter.txnDate.$lte = req.query.endDate;
    }
    
    if (req.query.txnStatus === 'active') {
      filter.isVoided = { $ne: true };
    } else if (req.query.txnStatus === 'voided') {
      filter.isVoided = true;
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    
    const totalCount = await db.collection('transactions').countDocuments(filter);
    const transactions = await db.collection('transactions').find(filter).sort({ txnDate: -1, createdAt: -1 }).skip(skip).limit(limit).toArray();
    
    const accounts = await db.collection('accounts').find({}).toArray();
    const accountMap = {};
    accounts.forEach(a => accountMap[a.id] = a.name);
    
    const societies = await db.collection('societies').find({}).toArray();
    const societyMap = {};
    societies.forEach(s => societyMap[s.id] = s.name);
    
    const enriched = transactions.map(txn => ({
      ...txn,
      accountName: accountMap[txn.accountId] || 'Unknown',
      societyName: txn.societyId ? (societyMap[txn.societyId] || 'Unknown') : 'Company Level'
    }));
    
    res.json({
      transactions: enriched.map(({ _id, ...rest }) => rest),
      pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/daybook/summary', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const filter = { isVoided: { $ne: true }, isReversed: { $ne: true }, isReversal: { $ne: true } };
    
    if (req.query.scope === 'COMPANY') {
      filter.societyId = null;
    } else if (req.query.societyId && req.query.societyId !== 'all') {
      filter.societyId = req.query.societyId;
    }
    
    if (req.query.accountId && req.query.accountId !== 'all') filter.accountId = req.query.accountId;
    if (req.query.startDate) filter.txnDate = { $gte: req.query.startDate };
    if (req.query.endDate) {
      filter.txnDate = filter.txnDate || {};
      filter.txnDate.$lte = req.query.endDate;
    }
    
    const transactions = await db.collection('transactions').find(filter).toArray();
    
    let totalIn = 0, totalOut = 0;
    transactions.forEach(txn => {
      const amt = Number(txn.amount) || 0;
      if (txn.direction === 'IN') totalIn += amt;
      else totalOut += amt;
    });
    
    res.json({
      openingBalance: 0,
      totalIn,
      totalOut,
      closingBalance: totalIn - totalOut
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ EXPENSE ROUTES ============

app.get('/api/expense-bills', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const filter = notDeleted();
    if (req.query.societyId) filter.societyId = req.query.societyId;
    if (req.query.scope === 'COMPANY') filter.societyId = null;
    
    const bills = await db.collection('expense_bills').find(filter).sort({ billDate: -1 }).toArray();
    res.json(bills.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/expense-bills', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    
    let accountId = req.body.accountId;
    if (!accountId) {
      const defaultAccount = await db.collection('accounts').findOne({ isDefault: true });
      accountId = defaultAccount?.id;
    }
    
    const bill = {
      id: uuidv4(),
      societyId: req.body.scope === 'COMPANY' ? null : req.body.societyId,
      scope: req.body.scope || 'SOCIETY',
      vendorId: req.body.vendorId || null,
      vendorName: req.body.vendorName,
      category: req.body.category,
      amount: Number(req.body.amount) || 0,
      billDate: req.body.billDate || req.body.expenseDate,
      description: req.body.description || req.body.remark || '',
      paidAmount: req.body.amount,
      status: 'Paid',
      createdBy: req.user.userId,
      createdAt: new Date()
    };
    
    await db.collection('expense_bills').insertOne(bill);
    
    await createTransaction(db, {
      txnDate: bill.billDate,
      societyId: bill.societyId,
      accountId,
      direction: 'OUT',
      amount: bill.amount,
      paymentMode: req.body.paymentMode || 'Cash',
      partyType: 'Vendor',
      partyName: bill.vendorName,
      sourceType: 'EXPENSE_PAYMENT',
      sourceId: bill.id,
      remark: `${bill.category} - ${bill.vendorName}`
    }, req.user.userId);
    
    const { _id, ...cleaned } = bill;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/expense-bills/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const bill = await db.collection('expense_bills').findOne({ id: req.params.id });
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    
    const originalTxn = await db.collection('transactions').findOne({ sourceType: 'EXPENSE_PAYMENT', sourceId: req.params.id });
    if (originalTxn) {
      await createReversalTransaction(db, originalTxn, req.user.userId, 'Expense bill deleted');
    }
    
    await db.collection('expense_bills').updateOne({ id: req.params.id }, { $set: { isDeleted: true, deletedAt: new Date() } });
    res.json({ message: 'Expense bill deleted with reversal' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Quick Expense
// GET /api/expenses — listing for the dedicated /expenses page.
// Reads from the unified `transactions` collection (sourceType EXPENSE_PAYMENT
// or QUICK_EXPENSE, direction OUT). Returns paginated rows + summary totals
// so the page never has to compute them itself.
app.get('/api/expenses', verifyToken, async (req, res) => {
  try {
    const db = getDB();

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(500, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const filter = {
      direction: 'OUT',
      sourceType: { $in: ['EXPENSE_PAYMENT', 'QUICK_EXPENSE'] },
      isVoided: { $ne: true },
      isReversal: { $ne: true },
      isReversed: { $ne: true },
    };

    const scope = (req.query.scope || '').toUpperCase();
    if (scope === 'COMPANY') {
      filter.$or = [{ societyId: null }, { societyId: { $exists: false } }];
    } else if (scope === 'SOCIETY') {
      if (req.query.societyId && req.query.societyId !== 'all') {
        filter.societyId = req.query.societyId;
      } else {
        filter.societyId = { $ne: null };
      }
    } else if (req.query.societyId && req.query.societyId !== 'all') {
      filter.societyId = req.query.societyId;
    }

    if (req.query.accountId && req.query.accountId !== 'all') {
      filter.accountId = req.query.accountId;
    }
    if (req.query.paymentMode && req.query.paymentMode !== 'all') {
      filter.paymentMode = req.query.paymentMode;
    }

    if (req.query.startDate || req.query.endDate) {
      filter.txnDate = {};
      if (req.query.startDate) filter.txnDate.$gte = req.query.startDate;
      if (req.query.endDate) filter.txnDate.$lte = req.query.endDate;
    }

    const total = await db.collection('transactions').countDocuments(filter);

    const txns = await db.collection('transactions')
      .find(filter)
      .sort({ txnDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const transactions = txns.map(({ _id, ...rest }) => rest);

    // Summary totals computed across the *filtered* set (not just the page)
    const summaryAgg = await db.collection('transactions').aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalExpense: { $sum: '$amount' },
          cashExpense: {
            $sum: { $cond: [{ $eq: ['$paymentMode', 'Cash'] }, '$amount', 0] },
          },
          bankExpense: {
            $sum: { $cond: [{ $ne: ['$paymentMode', 'Cash'] }, '$amount', 0] },
          },
          transactionCount: { $sum: 1 },
        },
      },
    ]).toArray();

    const summary = summaryAgg[0]
      ? {
          totalExpense: roundPaise(summaryAgg[0].totalExpense),
          cashExpense: roundPaise(summaryAgg[0].cashExpense),
          bankExpense: roundPaise(summaryAgg[0].bankExpense),
          transactionCount: summaryAgg[0].transactionCount,
        }
      : { totalExpense: 0, cashExpense: 0, bankExpense: 0, transactionCount: 0 };

    res.json({
      transactions,
      summary,
      total,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('GET /api/expenses error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/expenses/:id — soft-delete the underlying expense bill,
// reverse the daybook transaction and any payment trail so the daybook
// stays balanced.
app.delete('/api/expenses/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const id = req.params.id;

    // The id passed in can be either a transaction id or an expense_bills id.
    let txn = await db.collection('transactions').findOne({ id });
    let bill = null;
    if (txn) {
      bill = await db.collection('expense_bills').findOne({ id: txn.sourceId });
    } else {
      bill = await db.collection('expense_bills').findOne({ id });
      if (bill) {
        txn = await db.collection('transactions').findOne({ sourceId: bill.id, sourceType: { $in: ['EXPENSE_PAYMENT', 'QUICK_EXPENSE'] } });
      }
    }

    if (!txn && !bill) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    if (txn) {
      await createReversalTransaction(db, txn, req.user.userId, 'Expense deleted');
    }
    if (bill) {
      await db.collection('expense_bills').updateOne(
        { id: bill.id },
        { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user.userId } }
      );
    }

    res.json({ message: 'Expense deleted', id });
  } catch (error) {
    console.error('DELETE /api/expenses/:id error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/expenses/quick', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    
    let accountId = req.body.accountId;
    if (!accountId) {
      const defaultAccount = await db.collection('accounts').findOne({ isDefault: true });
      accountId = defaultAccount?.id;
    }
    
    const expense = {
      id: uuidv4(),
      societyId: req.body.scope === 'COMPANY' ? null : req.body.societyId,
      scope: req.body.scope || 'SOCIETY',
      vendorName: req.body.vendorName || 'Cash Expense',
      category: req.body.category,
      amount: Number(req.body.amount) || 0,
      billDate: req.body.expenseDate,
      description: req.body.remark || '',
      paidAmount: req.body.amount,
      status: 'Paid',
      createdBy: req.user.userId,
      createdAt: new Date()
    };
    
    await db.collection('expense_bills').insertOne(expense);
    
    await createTransaction(db, {
      txnDate: expense.billDate,
      societyId: expense.societyId,
      accountId,
      direction: 'OUT',
      amount: expense.amount,
      paymentMode: req.body.paymentMode || 'Cash',
      partyType: 'Vendor',
      partyName: expense.vendorName,
      sourceType: 'EXPENSE_PAYMENT',
      sourceId: expense.id,
      referenceNo: expense.category || '',
      remark: `${expense.category} - ${expense.vendorName}`,
    }, req.user.userId);
    
    const { _id, ...cleaned } = expense;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ VENDORS ROUTES ============

app.get('/api/vendors', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const filter = notDeleted();
    if (req.query.societyId) filter.societyId = req.query.societyId;
    const vendors = await db.collection('vendors').find(filter).toArray();
    res.json(vendors.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/vendors', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const vendor = {
      id: uuidv4(),
      societyId: req.body.societyId,
      name: req.body.name,
      type: req.body.type,
      phone: req.body.phone || '',
      address: req.body.address || '',
      notes: req.body.notes || '',
      createdAt: new Date()
    };
    await db.collection('vendors').insertOne(vendor);
    const { _id, ...cleaned } = vendor;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/vendors/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    await db.collection('vendors').updateOne({ id: req.params.id }, { $set: { isDeleted: true, deletedAt: new Date() } });
    res.json({ message: 'Vendor deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ MASTER DATA ROUTES ============

app.get('/api/vendor-types', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const types = await db.collection('vendor_types').find(notDeleted({ isActive: true })).toArray();
    res.json(types.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/vendor-types', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const vendorType = {
      id: uuidv4(),
      name: req.body.name.trim(),
      isActive: true,
      isDeleted: false,
      createdAt: new Date()
    };
    await db.collection('vendor_types').insertOne(vendorType);
    const { _id, ...cleaned } = vendorType;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/expense-categories', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const categories = await db.collection('expense_categories').find(notDeleted({ isActive: { $ne: false } })).sort({ name: 1 }).toArray();
    res.json(categories.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/expense-categories', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const category = {
      id: uuidv4(),
      name: req.body.name.trim(),
      scope: req.body.scope || 'COMPANY',
      societyId: req.body.scope === 'SOCIETY' ? req.body.societyId : null,
      isActive: true,
      isDeleted: false,
      createdAt: new Date()
    };
    await db.collection('expense_categories').insertOne(category);
    const { _id, ...cleaned } = category;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ COMMISSION BILLS ROUTES ============

app.get('/api/commission-bills', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const filter = notDeleted();
    if (req.query.societyId) filter.societyId = req.query.societyId;
    const bills = await db.collection('commission_bills').find(filter).sort({ billDate: -1 }).toArray();
    res.json(bills.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/commission-bills', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const bill = {
      id: uuidv4(),
      societyId: req.body.societyId,
      brokerName: req.body.brokerName,
      saleId: req.body.saleId,
      amount: Number(req.body.amount) || 0,
      billDate: req.body.billDate,
      description: req.body.description || '',
      paidAmount: 0,
      status: 'Pending',
      createdAt: new Date()
    };
    await db.collection('commission_bills').insertOne(bill);
    const { _id, ...cleaned } = bill;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ RESALES ROUTES ============

app.get('/api/resales', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const filter = notDeleted();
    if (req.query.societyId) filter.societyId = req.query.societyId;
    const deals = await db.collection('resale_deals').find(filter).toArray();
    res.json(deals.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/resales', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const deal = {
      id: uuidv4(),
      societyId: req.body.societyId,
      inventoryId: req.body.inventoryId,
      sellerName: req.body.sellerName,
      buyerName: req.body.buyerName,
      resalePrice: req.body.resalePrice,
      companyCommission: req.body.companyCommission || 0,
      status: 'Active',
      createdAt: new Date()
    };
    await db.collection('resale_deals').insertOne(deal);
    const { _id, ...cleaned } = deal;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ LOANS/BORROW ROUTES ============

app.get('/api/parties', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const parties = await db.collection('parties').find(notDeleted()).toArray();
    
    const enriched = await Promise.all(parties.map(async (party) => {
      const borrowLoans = await db.collection('loans').find({ partyId: party.id, direction: 'BORROWED', isDeleted: { $ne: true } }).toArray();
      const givenLoans = await db.collection('loans').find({ partyId: party.id, direction: 'GIVEN', isDeleted: { $ne: true } }).toArray();
      
      const totalBorrowed = borrowLoans.reduce((sum, l) => sum + l.principalAmount, 0);
      const totalBorrowRepaid = borrowLoans.reduce((sum, l) => sum + (l.totalRepaid || 0), 0);
      const totalGiven = givenLoans.reduce((sum, l) => sum + l.principalAmount, 0);
      const totalGivenReceived = givenLoans.reduce((sum, l) => sum + (l.totalRepaid || 0), 0);
      
      return {
        ...party,
        totalBorrowed,
        totalBorrowRepaid,
        totalGiven,
        totalGivenReceived,
        openBorrowLoans: borrowLoans.filter(l => l.status === 'OPEN').length,
        openGivenLoans: givenLoans.filter(l => l.status === 'OPEN').length,
        totalLoans: borrowLoans.length + givenLoans.length
      };
    }));
    
    res.json(enriched.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ LOAN/PARTY VALIDATION HELPERS ============
const LOAN_PAYMENT_MODES = ['Cash', 'Bank Transfer', 'Cheque', 'RTGS', 'UPI'];
const PHONE_RX = /^[0-9+\-\s()]{7,20}$/;

const isFiniteNumber = (v) => Number.isFinite(v) && !Number.isNaN(v);

// Returns null if valid, otherwise an error message string.
const validateDateNotFuture = (dateStr, label = 'Date') => {
  if (!dateStr) return `${label} is required`;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return `${label} is invalid`;
  // Allow same-day (compare by date string) — strip time on the upper bound.
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (d.getTime() > today.getTime()) return `${label} cannot be in the future`;
  return null;
};

app.post('/api/parties', verifyToken, async (req, res) => {
  try {
    const db = getDB();

    const name = (req.body.name || '').trim();
    const phone = (req.body.phone || '').trim();
    const address = (req.body.address || '').trim();
    const notes = (req.body.notes || '').trim();

    if (name.length < 2) return res.status(400).json({ error: 'Name must be at least 2 characters' });
    if (name.length > 100) return res.status(400).json({ error: 'Name must be 100 characters or less' });
    if (phone && !PHONE_RX.test(phone)) return res.status(400).json({ error: 'Phone format is invalid (digits, spaces, +, -, () allowed; 7–20 chars)' });
    if (address.length > 250) return res.status(400).json({ error: 'Address must be 250 characters or less' });
    if (notes.length > 500) return res.status(400).json({ error: 'Notes must be 500 characters or less' });

    const existing = await db.collection('parties').findOne(notDeleted({ name }));
    if (existing) return res.status(409).json({ error: 'A party with this name already exists' });

    const party = {
      id: uuidv4(),
      name,
      phone,
      address,
      notes,
      createdAt: new Date()
    };
    await db.collection('parties').insertOne(party);
    const { _id, ...cleaned } = party;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/parties/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    await db.collection('parties').updateOne({ id: req.params.id }, { $set: { isDeleted: true, deletedAt: new Date() } });
    res.json({ message: 'Party deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/parties/:id/ledger', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const partyId = req.params.id;
    
    const loans = await db.collection('loans').find({ partyId, isDeleted: { $ne: true } }).toArray();
    const repayments = await db.collection('loan_repayments').find({ partyId, isDeleted: { $ne: true } }).toArray();
    
    let entries = [];
    
    loans.forEach(loan => {
      entries.push({
        id: loan.id,
        date: loan.loanDate,
        type: 'LOAN',
        direction: loan.direction,
        description: loan.direction === 'BORROWED' ? 'Borrowed' : 'Given',
        credit: loan.direction === 'BORROWED' ? loan.principalAmount : 0,
        debit: loan.direction === 'GIVEN' ? loan.principalAmount : 0
      });
    });
    
    repayments.forEach(r => {
      const loan = loans.find(l => l.id === r.loanId);
      entries.push({
        id: r.id,
        date: r.repaymentDate,
        type: 'REPAYMENT',
        direction: loan?.direction || 'UNKNOWN',
        description: loan?.direction === 'BORROWED' ? 'Repaid' : 'Received',
        credit: loan?.direction === 'GIVEN' ? r.amount : 0,
        debit: loan?.direction === 'BORROWED' ? r.amount : 0
      });
    });
    
    entries.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    let balance = 0;
    entries = entries.map(e => {
      balance += e.credit - e.debit;
      return { ...e, balance };
    });
    
    const borrowLoans = loans.filter(l => l.direction === 'BORROWED');
    const givenLoans = loans.filter(l => l.direction === 'GIVEN');
    
    const summary = {
      totalBorrowed: borrowLoans.reduce((s, l) => s + l.principalAmount, 0),
      totalBorrowRepaid: borrowLoans.reduce((s, l) => s + (l.totalRepaid || 0), 0),
      borrowBalance: borrowLoans.reduce((s, l) => s + l.principalAmount - (l.totalRepaid || 0), 0),
      totalGiven: givenLoans.reduce((s, l) => s + l.principalAmount, 0),
      totalGivenReceived: givenLoans.reduce((s, l) => s + (l.totalRepaid || 0), 0),
      givenBalance: givenLoans.reduce((s, l) => s + l.principalAmount - (l.totalRepaid || 0), 0),
      netBalance: balance
    };
    
    res.json({ entries, summary });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/loans', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const filter = notDeleted();
    if (req.query.direction) filter.direction = req.query.direction;
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
    if (req.query.partyId && req.query.partyId !== 'all') filter.partyId = req.query.partyId;
    
    const loans = await db.collection('loans').find(filter).toArray();
    
    const enriched = await Promise.all(loans.map(async (loan) => {
      const party = await db.collection('parties').findOne({ id: loan.partyId });
      const account = await db.collection('accounts').findOne({ id: loan.accountId });
      return {
        ...loan,
        partyName: party?.name || 'Unknown',
        accountName: account?.name || 'Unknown'
      };
    }));
    
    res.json(enriched.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/loans', verifyToken, async (req, res) => {
  try {
    const db = getDB();

    const direction = req.body.direction;
    if (!['BORROWED', 'GIVEN'].includes(direction)) {
      return res.status(400).json({ error: 'Direction must be BORROWED or GIVEN' });
    }

    if (!req.body.partyId) return res.status(400).json({ error: 'Party is required' });
    const party = await db.collection('parties').findOne(notDeleted({ id: req.body.partyId }));
    if (!party) return res.status(404).json({ error: 'Party not found' });

    const principalAmount = parseFloat(req.body.principalAmount);
    if (!isFiniteNumber(principalAmount) || principalAmount <= 0) {
      return res.status(400).json({ error: 'Principal amount must be a positive number' });
    }
    if (principalAmount > 1e12) {
      return res.status(400).json({ error: 'Principal amount is unrealistically large' });
    }

    const dateErr = validateDateNotFuture(req.body.loanDate, 'Loan date');
    if (dateErr) return res.status(400).json({ error: dateErr });

    if (!req.body.accountId) return res.status(400).json({ error: 'Account is required' });
    const account = await db.collection('accounts').findOne(notDeleted({ id: req.body.accountId }));
    if (!account) return res.status(404).json({ error: 'Account not found' });
    // Loans live at the company level only — refuse society-scoped accounts.
    if (account.scope && account.scope !== 'COMPANY') {
      return res.status(400).json({ error: 'Account must be a company-level account for loans' });
    }

    const paymentMode = req.body.paymentMode || 'Bank Transfer';
    if (!LOAN_PAYMENT_MODES.includes(paymentMode)) {
      return res.status(400).json({ error: `Payment mode must be one of: ${LOAN_PAYMENT_MODES.join(', ')}` });
    }

    const purpose = (req.body.purpose || '').trim();
    if (purpose.length > 500) {
      return res.status(400).json({ error: 'Purpose must be 500 characters or less' });
    }

    const loan = {
      id: uuidv4(),
      partyId: req.body.partyId,
      direction,
      principalAmount,
      loanDate: req.body.loanDate,
      accountId: req.body.accountId,
      purpose,
      paymentMode,
      totalRepaid: 0,
      balancePrincipal: principalAmount,
      status: 'OPEN',
      createdBy: req.user.userId,
      createdAt: new Date()
    };
    
    await db.collection('loans').insertOne(loan);

    const txnDirection = direction === 'BORROWED' ? 'IN' : 'OUT';
    const sourceType = direction === 'BORROWED' ? 'LOAN_BORROWED' : 'LOAN_GIVEN';

    await createTransaction(db, {
      txnDate: loan.loanDate,
      societyId: null,
      accountId: loan.accountId,
      direction: txnDirection,
      amount: loan.principalAmount,
      paymentMode: loan.paymentMode,
      partyType: 'Party',
      partyName: party.name,
      sourceType,
      sourceId: loan.id,
      remark: purpose || `Loan ${direction.toLowerCase()} - ${party.name}`
    }, req.user.userId);
    
    const { _id, ...cleaned } = loan;
    res.json({ ...cleaned, partyName: party.name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/loans/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const loan = await db.collection('loans').findOne({ id: req.params.id });
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    
    const sourceType = loan.direction === 'BORROWED' ? 'LOAN_BORROWED' : 'LOAN_GIVEN';
    const originalTxn = await db.collection('transactions').findOne({ sourceType, sourceId: req.params.id });
    if (originalTxn) {
      await createReversalTransaction(db, originalTxn, req.user.userId, 'Loan deleted');
    }
    
    const repayments = await db.collection('loan_repayments').find({ loanId: req.params.id }).toArray();
    for (const r of repayments) {
      const repaySourceType = loan.direction === 'BORROWED' ? 'LOAN_BORROWED_REPAYMENT' : 'LOAN_GIVEN_REPAYMENT';
      const repayTxn = await db.collection('transactions').findOne({ sourceType: repaySourceType, sourceId: r.id });
      if (repayTxn) {
        await createReversalTransaction(db, repayTxn, req.user.userId, 'Loan deleted');
      }
    }
    
    await db.collection('loan_repayments').updateMany({ loanId: req.params.id }, { $set: { isDeleted: true } });
    await db.collection('loans').updateOne({ id: req.params.id }, { $set: { isDeleted: true, deletedAt: new Date() } });
    
    res.json({ message: 'Loan deleted with reversals' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/loans/:loanId/repayments', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const repayments = await db.collection('loan_repayments').find(notDeleted({ loanId: req.params.loanId })).sort({ repaymentDate: -1 }).toArray();
    
    const enriched = await Promise.all(repayments.map(async (r) => {
      const account = await db.collection('accounts').findOne({ id: r.accountId });
      return { ...r, accountName: account?.name || 'Unknown' };
    }));
    
    res.json(enriched.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/loans/:loanId/repayments', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const loan = await db.collection('loans').findOne(notDeleted({ id: req.params.loanId }));
    if (!loan) return res.status(404).json({ error: 'Loan not found' });

    if (loan.status === 'CLOSED') {
      return res.status(400).json({ error: 'Loan is already closed; no further repayments allowed' });
    }

    const amount = parseFloat(req.body.amount);
    if (!isFiniteNumber(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Repayment amount must be a positive number' });
    }
    const balance = Number(loan.balancePrincipal) || 0;
    // Use a tiny epsilon to allow floating-point equal-to-balance.
    if (amount > balance + 0.005) {
      return res.status(400).json({
        error: `Repayment amount (${amount}) exceeds outstanding balance (${balance.toFixed(2)})`
      });
    }

    const dateErr = validateDateNotFuture(req.body.repaymentDate, 'Repayment date');
    if (dateErr) return res.status(400).json({ error: dateErr });
    if (new Date(req.body.repaymentDate) < new Date(loan.loanDate)) {
      return res.status(400).json({ error: 'Repayment date cannot be before the loan date' });
    }

    if (!req.body.accountId) return res.status(400).json({ error: 'Account is required' });
    const account = await db.collection('accounts').findOne(notDeleted({ id: req.body.accountId }));
    if (!account) return res.status(404).json({ error: 'Account not found' });
    if (account.scope && account.scope !== 'COMPANY') {
      return res.status(400).json({ error: 'Account must be a company-level account for loan repayments' });
    }

    const paymentMode = req.body.paymentMode || 'Cash';
    if (!LOAN_PAYMENT_MODES.includes(paymentMode)) {
      return res.status(400).json({ error: `Payment mode must be one of: ${LOAN_PAYMENT_MODES.join(', ')}` });
    }

    const remark = (req.body.remark || '').trim();
    if (remark.length > 500) {
      return res.status(400).json({ error: 'Remark must be 500 characters or less' });
    }

    const party = await db.collection('parties').findOne({ id: loan.partyId });

    const repayment = {
      id: uuidv4(),
      loanId: req.params.loanId,
      partyId: loan.partyId,
      amount,
      repaymentDate: req.body.repaymentDate,
      accountId: req.body.accountId,
      paymentMode,
      remark,
      createdBy: req.user.userId,
      createdAt: new Date()
    };

    await db.collection('loan_repayments').insertOne(repayment);

    const newTotalRepaid = (loan.totalRepaid || 0) + amount;
    const newBalance = loan.principalAmount - newTotalRepaid;
    const newStatus = newBalance <= 0.005 ? 'CLOSED' : 'OPEN';

    await db.collection('loans').updateOne(
      { id: req.params.loanId },
      { $set: { totalRepaid: newTotalRepaid, balancePrincipal: Math.max(0, newBalance), status: newStatus } }
    );

    const txnDirection = loan.direction === 'BORROWED' ? 'OUT' : 'IN';
    const sourceType = loan.direction === 'BORROWED' ? 'LOAN_BORROWED_REPAYMENT' : 'LOAN_GIVEN_REPAYMENT';

    await createTransaction(db, {
      txnDate: repayment.repaymentDate,
      societyId: null,
      accountId: repayment.accountId,
      direction: txnDirection,
      amount,
      paymentMode,
      partyType: 'Party',
      partyName: party?.name || 'Unknown',
      sourceType,
      sourceId: repayment.id,
      remark: remark || `Loan repayment - ${party?.name || ''}`.trim()
    }, req.user.userId);

    const { _id, ...cleaned } = repayment;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/loans/:loanId/repayments/:repaymentId', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const repayment = await db.collection('loan_repayments').findOne({ id: req.params.repaymentId });
    if (!repayment) return res.status(404).json({ error: 'Repayment not found' });
    
    const loan = await db.collection('loans').findOne({ id: req.params.loanId });
    
    const sourceType = loan?.direction === 'BORROWED' ? 'LOAN_BORROWED_REPAYMENT' : 'LOAN_GIVEN_REPAYMENT';
    const originalTxn = await db.collection('transactions').findOne({ sourceType, sourceId: req.params.repaymentId });
    if (originalTxn) {
      await createReversalTransaction(db, originalTxn, req.user.userId, 'Repayment deleted');
    }
    
    if (loan) {
      const newTotalRepaid = Math.max(0, (loan.totalRepaid || 0) - repayment.amount);
      const newBalance = loan.principalAmount - newTotalRepaid;
      await db.collection('loans').updateOne(
        { id: req.params.loanId },
        { $set: { totalRepaid: newTotalRepaid, balancePrincipal: newBalance, status: 'OPEN' } }
      );
    }
    
    await db.collection('loan_repayments').updateOne({ id: req.params.repaymentId }, { $set: { isDeleted: true, deletedAt: new Date() } });
    
    res.json({ message: 'Repayment deleted with reversal' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ADMIN/RECYCLE BIN ROUTES ============

app.get('/api/admin/recycle-bin', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Super Admin only' });
    
    const db = getDB();
    const collections = ['sales', 'inventory', 'expense_bills', 'partners', 'customers', 'loans'];
    const records = [];
    
    for (const col of collections) {
      const deleted = await db.collection(col).find({ isDeleted: true }).toArray();
      deleted.forEach(d => records.push({ ...d, _collection: col }));
    }
    
    res.json({ records: records.map(({ _id, ...rest }) => rest), total: records.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/restore/:collection/:id', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Super Admin only' });
    
    const db = getDB();
    await db.collection(req.params.collection).updateOne(
      { id: req.params.id },
      { $set: { isDeleted: false }, $unset: { deletedAt: '', deletedBy: '' } }
    );
    
    res.json({ message: 'Record restored' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/audit-logs', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Super Admin only' });

    const db = getDB();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.entityType && req.query.entityType !== 'all') {
      filter.entityType = req.query.entityType;
    }
    if (req.query.action && req.query.action !== 'all') {
      filter.action = req.query.action;
    }
    if (req.query.userId && req.query.userId !== 'all') {
      filter.userId = req.query.userId;
    }
    if (req.query.startDate || req.query.endDate) {
      filter.timestamp = {};
      if (req.query.startDate) filter.timestamp.$gte = new Date(req.query.startDate);
      if (req.query.endDate) {
        const end = new Date(req.query.endDate);
        end.setHours(23, 59, 59, 999);
        filter.timestamp.$lte = end;
      }
    }
    if (req.query.q && String(req.query.q).trim()) {
      const rx = new RegExp(String(req.query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { entityType: rx },
        { entityId: rx },
        { reason: rx },
        { userName: rx },
      ];
    }

    const total = await db.collection('audit_logs').countDocuments(filter);
    const logs = await db.collection('audit_logs')
      .find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    // Enrich with user names where available
    const userIds = [...new Set(logs.map(l => l.userId).filter(Boolean))];
    let userMap = {};
    if (userIds.length > 0) {
      const users = await db.collection('users').find({ id: { $in: userIds } }).toArray();
      users.forEach(u => { userMap[u.id] = { name: u.name, email: u.email, role: u.role }; });
    }

    const enriched = logs.map(({ _id, ...rest }) => ({
      ...rest,
      userName: rest.userName || userMap[rest.userId]?.name || 'System',
      userEmail: userMap[rest.userId]?.email || null,
    }));

    // Distinct values for filter dropdowns
    const entityTypes = (await db.collection('audit_logs').distinct('entityType')).filter(Boolean).sort();
    const actions = (await db.collection('audit_logs').distinct('action')).filter(Boolean).sort();

    res.json({
      logs: enriched,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      filters: { entityTypes, actions },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ CUSTOMER PAYMENT ALLOCATIONS ============

app.get('/api/customer-payments/:id/allocations', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const allocations = await db.collection('payment_allocations').find({ paymentId: req.params.id }).toArray();
    res.json(allocations.map(({ _id, ...rest }) => ({ ...rest, allocatedAmount: rest.amount })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/customer-payments/:id/allocations', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const payment = await db.collection('customer_payments').findOne({ id: req.params.id });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const incoming = Array.isArray(req.body.allocations) ? req.body.allocations : [];
    const totalAllocated = incoming.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
    if (totalAllocated > (payment.amount || 0) + 0.01) {
      return res.status(400).json({ error: `Allocation total (${totalAllocated}) exceeds payment amount (${payment.amount})` });
    }

    await db.collection('payment_allocations').deleteMany({ paymentId: req.params.id });

    const docs = incoming
      .filter(a => parseFloat(a.amount) > 0 && a.saleId)
      .map(a => ({
        id: uuidv4(),
        paymentId: req.params.id,
        saleId: a.saleId,
        amount: parseFloat(a.amount),
        createdBy: req.user.userId,
        createdAt: new Date()
      }));
    if (docs.length) await db.collection('payment_allocations').insertMany(docs);

    const unallocatedAmount = (payment.amount || 0) - totalAllocated;
    await db.collection('customer_payments').updateOne(
      { id: req.params.id },
      { $set: { unallocatedAmount, updatedAt: new Date() } }
    );

    res.json({ message: 'Allocations saved', count: docs.length, unallocatedAmount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ VENDOR PUT + LEDGER ============

app.put('/api/vendors/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const update = { ...req.body, updatedAt: new Date() };
    delete update.id;
    delete update._id;
    await db.collection('vendors').updateOne({ id: req.params.id }, { $set: update });
    const updated = await db.collection('vendors').findOne({ id: req.params.id });
    if (!updated) return res.status(404).json({ error: 'Vendor not found' });
    const { _id, ...cleaned } = updated;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/vendors/:id/ledger', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const vendor = await db.collection('vendors').findOne({ id: req.params.id });
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    const txns = await db.collection('transactions').find({
      partyType: 'Vendor',
      partyName: vendor.name,
      direction: 'OUT',
      isReversal: { $ne: true }
    }).sort({ txnDate: -1 }).toArray();

    const entries = txns.map(t => ({
      id: t.id,
      date: t.txnDate || t.createdAt,
      source: t.sourceType === 'COMMISSION_PAYMENT' ? 'COMMISSION' : 'EXPENSE',
      reference: t.referenceNo || t.sourceId || '',
      amount: t.amount || 0,
      paymentMode: t.paymentMode || 'Cash',
      remark: t.remark || ''
    }));

    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ DAYBOOK POST (manual transaction) ============

app.post('/api/daybook', verifyToken, async (req, res) => {
  try {
    const db = getDB();

    let accountId = req.body.accountId;
    if (!accountId) {
      const defaultAccount = await db.collection('accounts').findOne({ isDefault: true });
      accountId = defaultAccount?.id;
    }

    const txn = await createTransaction(db, {
      txnDate: req.body.txnDate,
      societyId: req.body.societyId || null,
      scope: req.body.scope || (req.body.societyId ? 'SOCIETY' : 'COMPANY'),
      accountId,
      direction: req.body.direction || 'OUT',
      amount: parseFloat(req.body.amount) || 0,
      paymentMode: req.body.paymentMode || 'Cash',
      partyType: req.body.partyType || 'Other',
      partyName: req.body.partyName || '',
      sourceType: req.body.sourceType || 'QUICK_EXPENSE',
      sourceId: req.body.sourceId || null,
      referenceNo: req.body.referenceNo || '',
      remark: req.body.remark || ''
    }, req.user.userId);

    res.json(txn || { message: 'Transaction created' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ LEDGER ENTRIES PUT (partner ledger edit) ============

app.put('/api/ledger-entries/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const entry = await db.collection('partner_ledger_entries').findOne({ id: req.params.id });
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    const partner = await db.collection('partners').findOne({ id: entry.partnerId });

    const originalTxn = await db.collection('transactions').findOne({ sourceType: 'PARTNER_CAPITAL', sourceId: req.params.id });
    if (originalTxn) {
      await createReversalTransaction(db, originalTxn, req.user.userId, 'Ledger entry edited');
    }

    const update = {
      type: req.body.type ?? entry.type,
      amount: parseFloat(req.body.amount) || entry.amount,
      entryDate: req.body.entryDate || entry.entryDate,
      paymentMode: req.body.paymentMode || entry.paymentMode,
      accountId: req.body.accountId || entry.accountId,
      remark: req.body.remark ?? entry.remark,
      updatedAt: new Date()
    };
    await db.collection('partner_ledger_entries').updateOne({ id: req.params.id }, { $set: update });

    const direction = update.type === 'INVESTMENT' ? 'IN' : 'OUT';
    await createTransaction(db, {
      txnDate: update.entryDate,
      societyId: entry.societyId,
      accountId: update.accountId,
      direction,
      amount: update.amount,
      paymentMode: update.paymentMode,
      partyType: 'Partner',
      partyName: partner?.name || '',
      sourceType: 'PARTNER_CAPITAL',
      sourceId: entry.id,
      remark: update.remark || `${update.type} - ${partner?.name || ''}`
    }, req.user.userId);

    const updated = await db.collection('partner_ledger_entries').findOne({ id: req.params.id });
    const { _id, ...cleaned } = updated;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ SALES UNASSIGNED + ASSIGN-CUSTOMER ============

app.get('/api/sales/unassigned', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const filter = notDeleted({ $or: [{ customerId: null }, { customerId: '' }, { customerId: { $exists: false } }] });
    if (req.query.societyId) filter.societyId = req.query.societyId;
    const sales = await db.collection('sales').find(filter).toArray();
    const enriched = await Promise.all(sales.map(async (s) => {
      const inventory = s.inventoryId ? await db.collection('inventory').findOne({ id: s.inventoryId }) : null;
      return { ...s, inventoryNumber: inventory?.inventoryNumber || 'N/A' };
    }));
    res.json(enriched.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/sales/:saleId/assign-customer', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    if (!req.body.customerId) return res.status(400).json({ error: 'customerId required' });
    const customer = await db.collection('customers').findOne({ id: req.body.customerId });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    await db.collection('sales').updateOne(
      { id: req.params.saleId },
      { $set: { customerId: req.body.customerId, buyerName: customer.name, updatedAt: new Date() } }
    );
    const updated = await db.collection('sales').findOne({ id: req.params.saleId });
    if (!updated) return res.status(404).json({ error: 'Sale not found' });
    const { _id, ...cleaned } = updated;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ PURCHASES DELETE + PAYMENTS ============

app.delete('/api/purchases/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const purchase = await db.collection('purchases').findOne({ id: req.params.id });
    if (!purchase) return res.status(404).json({ error: 'Purchase not found' });

    const txns = await db.collection('transactions').find({
      sourceType: { $in: ['PURCHASE', 'PURCHASE_PAYMENT'] },
      sourceId: req.params.id,
      isReversal: { $ne: true }
    }).toArray();
    for (const t of txns) {
      await createReversalTransaction(db, t, req.user.userId, 'Purchase deleted');
    }

    await db.collection('purchases').updateOne({ id: req.params.id }, { $set: { isDeleted: true, deletedAt: new Date() } });
    res.json({ message: 'Purchase deleted with reversal' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/purchases/:purchaseId/payments', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const entries = await db.collection('purchase_payment_entries')
      .find(notDeleted({ purchaseId: req.params.purchaseId }))
      .sort({ paymentDate: -1 })
      .toArray();
    res.json(entries.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/purchases/:purchaseId/payments', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const purchase = await db.collection('purchases').findOne({ id: req.params.purchaseId });
    if (!purchase) return res.status(404).json({ error: 'Purchase not found' });

    let accountId = req.body.accountId;
    if (!accountId) {
      const defaultAccount = await db.collection('accounts').findOne({ isDefault: true });
      accountId = defaultAccount?.id;
    }

    const amount = parseFloat(req.body.amount) || 0;
    const entry = {
      id: uuidv4(),
      purchaseId: req.params.purchaseId,
      societyId: purchase.societyId,
      accountId,
      amount,
      paymentDate: req.body.paymentDate || req.body.entryDate,
      paymentMode: req.body.paymentMode || 'Cash',
      referenceNo: req.body.referenceNo || '',
      remark: req.body.remark || '',
      createdBy: req.user.userId,
      createdAt: new Date()
    };

    await db.collection('purchase_payment_entries').insertOne(entry);

    const newPaid = (purchase.amountPaid || 0) + amount;
    const status = newPaid >= (purchase.dealAmount || purchase.totalAmount || 0) ? 'Paid' : 'Partial';
    await db.collection('purchases').updateOne({ id: req.params.purchaseId }, { $set: { amountPaid: newPaid, paymentStatus: status } });

    await createTransaction(db, {
      txnDate: entry.paymentDate,
      societyId: purchase.societyId,
      accountId,
      direction: 'OUT',
      amount,
      paymentMode: entry.paymentMode,
      partyType: 'Vendor',
      partyName: purchase.partyName || purchase.sellerName || 'Seller',
      sourceType: 'PURCHASE_PAYMENT',
      sourceId: entry.id,
      remark: entry.remark || `Purchase payment - ${purchase.partyName || ''}`
    }, req.user.userId);

    const { _id, ...cleaned } = entry;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/purchase-payments/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const entry = await db.collection('purchase_payment_entries').findOne({ id: req.params.id });
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    const originalTxn = await db.collection('transactions').findOne({ sourceType: 'PURCHASE_PAYMENT', sourceId: req.params.id });
    if (originalTxn) {
      await createReversalTransaction(db, originalTxn, req.user.userId, 'Purchase payment deleted');
    }

    const purchase = await db.collection('purchases').findOne({ id: entry.purchaseId });
    if (purchase) {
      const newPaid = Math.max(0, (purchase.amountPaid || 0) - (entry.amount || 0));
      const status = newPaid <= 0 ? 'Pending' : (newPaid >= (purchase.dealAmount || purchase.totalAmount || 0) ? 'Paid' : 'Partial');
      await db.collection('purchases').updateOne({ id: entry.purchaseId }, { $set: { amountPaid: newPaid, paymentStatus: status } });
    }

    await db.collection('purchase_payment_entries').updateOne({ id: req.params.id }, { $set: { isDeleted: true, deletedAt: new Date() } });
    res.json({ message: 'Purchase payment deleted with reversal' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ COMMISSION BILLS DELETE + PAYMENTS ============

app.delete('/api/commission-bills/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const bill = await db.collection('commission_bills').findOne({ id: req.params.id });
    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    const txns = await db.collection('transactions').find({
      sourceType: 'COMMISSION_PAYMENT',
      sourceId: { $regex: `^${req.params.id}` },
      isReversal: { $ne: true }
    }).toArray();
    for (const t of txns) {
      await createReversalTransaction(db, t, req.user.userId, 'Commission bill deleted');
    }
    const directTxn = await db.collection('transactions').findOne({ sourceType: 'COMMISSION_PAYMENT', sourceId: req.params.id, isReversal: { $ne: true } });
    if (directTxn) await createReversalTransaction(db, directTxn, req.user.userId, 'Commission bill deleted');

    await db.collection('commission_bills').updateOne({ id: req.params.id }, { $set: { isDeleted: true, deletedAt: new Date() } });
    await db.collection('commission_payments').updateMany({ billId: req.params.id }, { $set: { isDeleted: true, deletedAt: new Date() } });
    res.json({ message: 'Commission bill deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/commission-bills/:billId/payments', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const payments = await db.collection('commission_payments')
      .find(notDeleted({ billId: req.params.billId }))
      .sort({ paymentDate: -1 })
      .toArray();
    res.json(payments.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/commission-bills/:billId/payments', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const bill = await db.collection('commission_bills').findOne({ id: req.params.billId });
    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    let accountId = req.body.accountId;
    if (!accountId) {
      const defaultAccount = await db.collection('accounts').findOne({ isDefault: true });
      accountId = defaultAccount?.id;
    }

    const amount = parseFloat(req.body.amount) || 0;
    const payment = {
      id: uuidv4(),
      billId: req.params.billId,
      societyId: bill.societyId,
      accountId,
      amount,
      paymentDate: req.body.paymentDate,
      paymentMode: req.body.paymentMode || 'Cash',
      referenceNo: req.body.referenceNo || '',
      remark: req.body.remark || '',
      createdBy: req.user.userId,
      createdAt: new Date()
    };

    await db.collection('commission_payments').insertOne(payment);

    const newPaid = (bill.paidAmount || 0) + amount;
    const status = newPaid >= (bill.amount || 0) ? 'Paid' : 'Partial';
    await db.collection('commission_bills').updateOne({ id: req.params.billId }, { $set: { paidAmount: newPaid, status } });

    await createTransaction(db, {
      txnDate: payment.paymentDate,
      societyId: bill.societyId,
      accountId,
      direction: 'OUT',
      amount,
      paymentMode: payment.paymentMode,
      partyType: 'Vendor',
      partyName: bill.brokerName,
      sourceType: 'COMMISSION_PAYMENT',
      sourceId: payment.id,
      remark: payment.remark || `Commission - ${bill.brokerName}`
    }, req.user.userId);

    const { _id, ...cleaned } = payment;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/commission-payments/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const payment = await db.collection('commission_payments').findOne({ id: req.params.id });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const originalTxn = await db.collection('transactions').findOne({ sourceType: 'COMMISSION_PAYMENT', sourceId: req.params.id });
    if (originalTxn) {
      await createReversalTransaction(db, originalTxn, req.user.userId, 'Commission payment deleted');
    }

    const bill = await db.collection('commission_bills').findOne({ id: payment.billId });
    if (bill) {
      const newPaid = Math.max(0, (bill.paidAmount || 0) - (payment.amount || 0));
      const status = newPaid <= 0 ? 'Pending' : (newPaid >= (bill.amount || 0) ? 'Paid' : 'Partial');
      await db.collection('commission_bills').updateOne({ id: payment.billId }, { $set: { paidAmount: newPaid, status } });
    }

    await db.collection('commission_payments').updateOne({ id: req.params.id }, { $set: { isDeleted: true, deletedAt: new Date() } });
    res.json({ message: 'Commission payment deleted with reversal' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ EXPENSE BILLS PAYMENTS ============

app.get('/api/expense-bills/:billId/payments', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const payments = await db.collection('expense_payments')
      .find(notDeleted({ billId: req.params.billId }))
      .sort({ paymentDate: -1 })
      .toArray();
    res.json(payments.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/expense-bills/:billId/payments', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const bill = await db.collection('expense_bills').findOne({ id: req.params.billId });
    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    let accountId = req.body.accountId;
    if (!accountId) {
      const defaultAccount = await db.collection('accounts').findOne({ isDefault: true });
      accountId = defaultAccount?.id;
    }

    const amount = parseFloat(req.body.amount) || 0;
    const payment = {
      id: uuidv4(),
      billId: req.params.billId,
      societyId: bill.societyId,
      accountId,
      amount,
      paymentDate: req.body.paymentDate,
      paymentMode: req.body.paymentMode || 'Cash',
      referenceNo: req.body.referenceNo || '',
      remark: req.body.remark || '',
      createdBy: req.user.userId,
      createdAt: new Date()
    };

    await db.collection('expense_payments').insertOne(payment);

    const newPaid = (bill.paidAmount || 0) + amount;
    const status = newPaid >= (bill.amount || 0) ? 'Paid' : 'Partial';
    await db.collection('expense_bills').updateOne({ id: req.params.billId }, { $set: { paidAmount: newPaid, status } });

    await createTransaction(db, {
      txnDate: payment.paymentDate,
      societyId: bill.societyId,
      accountId,
      direction: 'OUT',
      amount,
      paymentMode: payment.paymentMode,
      partyType: 'Vendor',
      partyName: bill.vendorName,
      sourceType: 'EXPENSE_PAYMENT',
      sourceId: payment.id,
      remark: payment.remark || `${bill.category} - ${bill.vendorName}`
    }, req.user.userId);

    const { _id, ...cleaned } = payment;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/expense-payments/:id', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const payment = await db.collection('expense_payments').findOne({ id: req.params.id });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const originalTxn = await db.collection('transactions').findOne({ sourceType: 'EXPENSE_PAYMENT', sourceId: req.params.id });
    if (originalTxn) {
      await createReversalTransaction(db, originalTxn, req.user.userId, 'Expense payment deleted');
    }

    const bill = await db.collection('expense_bills').findOne({ id: payment.billId });
    if (bill) {
      const newPaid = Math.max(0, (bill.paidAmount || 0) - (payment.amount || 0));
      const status = newPaid <= 0 ? 'Pending' : (newPaid >= (bill.amount || 0) ? 'Paid' : 'Partial');
      await db.collection('expense_bills').updateOne({ id: payment.billId }, { $set: { paidAmount: newPaid, status } });
    }

    await db.collection('expense_payments').updateOne({ id: req.params.id }, { $set: { isDeleted: true, deletedAt: new Date() } });
    res.json({ message: 'Expense payment deleted with reversal' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ RESALES (full set) ============

app.delete('/api/resales/:dealId', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const deal = await db.collection('resale_deals').findOne({ id: req.params.dealId });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const buyerPayments = await db.collection('resale_buyer_payments').find({ dealId: req.params.dealId }).toArray();
    const sellerPayouts = await db.collection('resale_seller_payouts').find({ dealId: req.params.dealId }).toArray();
    for (const p of buyerPayments) {
      const t = await db.collection('transactions').findOne({ sourceType: 'RESALE_BUYER_PAYMENT', sourceId: p.id, isReversal: { $ne: true } });
      if (t) await createReversalTransaction(db, t, req.user.userId, 'Resale deal deleted');
    }
    for (const p of sellerPayouts) {
      const t = await db.collection('transactions').findOne({ sourceType: 'RESALE_SELLER_PAYOUT', sourceId: p.id, isReversal: { $ne: true } });
      if (t) await createReversalTransaction(db, t, req.user.userId, 'Resale deal deleted');
    }

    await db.collection('resale_buyer_payments').updateMany({ dealId: req.params.dealId }, { $set: { isDeleted: true, deletedAt: new Date() } });
    await db.collection('resale_seller_payouts').updateMany({ dealId: req.params.dealId }, { $set: { isDeleted: true, deletedAt: new Date() } });
    await db.collection('resale_deals').updateOne({ id: req.params.dealId }, { $set: { isDeleted: true, deletedAt: new Date() } });
    res.json({ message: 'Resale deal deleted with reversal' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/resales/:dealId/close', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const deal = await db.collection('resale_deals').findOne({ id: req.params.dealId });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    if (deal.status === 'TRANSFERRED' || deal.status === 'Closed') {
      return res.status(400).json({ error: 'Deal already closed' });
    }

    await db.collection('resale_deals').updateOne(
      { id: req.params.dealId },
      { $set: { status: 'TRANSFERRED', closedAt: new Date(), closedBy: req.user.userId } }
    );

    if (deal.inventoryId) {
      await db.collection('inventory_ownership_history').insertOne({
        id: uuidv4(),
        inventoryId: deal.inventoryId,
        previousOwner: deal.sellerName,
        newOwner: deal.buyerName,
        dealId: deal.id,
        transferDate: new Date(),
        transferredBy: req.user.userId
      });
      await db.collection('inventory').updateOne(
        { id: deal.inventoryId },
        { $set: { currentOwner: deal.buyerName, status: 'Resold', updatedAt: new Date() } }
      );
    }

    res.json({ message: 'Deal closed and ownership transferred' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/resales/:dealId/buyer-payments', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const payments = await db.collection('resale_buyer_payments')
      .find(notDeleted({ dealId: req.params.dealId }))
      .sort({ paymentDate: -1 })
      .toArray();
    res.json(payments.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/resales/:dealId/buyer-payments', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const deal = await db.collection('resale_deals').findOne({ id: req.params.dealId });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    let accountId = req.body.accountId;
    if (!accountId) {
      const defaultAccount = await db.collection('accounts').findOne({ isDefault: true });
      accountId = defaultAccount?.id;
    }

    const amount = parseFloat(req.body.amount) || 0;
    const payment = {
      id: uuidv4(),
      dealId: req.params.dealId,
      societyId: deal.societyId,
      accountId,
      amount,
      paymentDate: req.body.paymentDate,
      paymentMode: req.body.paymentMode || 'Cash',
      referenceNo: req.body.referenceNo || '',
      remark: req.body.remark || '',
      createdBy: req.user.userId,
      createdAt: new Date()
    };

    await db.collection('resale_buyer_payments').insertOne(payment);

    await createTransaction(db, {
      txnDate: payment.paymentDate,
      societyId: deal.societyId,
      accountId,
      direction: 'IN',
      amount,
      paymentMode: payment.paymentMode,
      partyType: 'Customer',
      partyName: deal.buyerName,
      sourceType: 'RESALE_BUYER_PAYMENT',
      sourceId: payment.id,
      remark: payment.remark || `Resale buyer payment - ${deal.buyerName}`
    }, req.user.userId);

    const { _id, ...cleaned } = payment;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/resales/:dealId/buyer-payments/:paymentId', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const payment = await db.collection('resale_buyer_payments').findOne({ id: req.params.paymentId });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const originalTxn = await db.collection('transactions').findOne({ sourceType: 'RESALE_BUYER_PAYMENT', sourceId: req.params.paymentId });
    if (originalTxn) {
      await createReversalTransaction(db, originalTxn, req.user.userId, 'Resale buyer payment deleted');
    }

    await db.collection('resale_buyer_payments').updateOne({ id: req.params.paymentId }, { $set: { isDeleted: true, deletedAt: new Date() } });
    res.json({ message: 'Buyer payment deleted with reversal' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/resales/:dealId/seller-payouts', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const payouts = await db.collection('resale_seller_payouts')
      .find(notDeleted({ dealId: req.params.dealId }))
      .sort({ paymentDate: -1 })
      .toArray();
    res.json(payouts.map(({ _id, ...rest }) => rest));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/resales/:dealId/seller-payouts', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const deal = await db.collection('resale_deals').findOne({ id: req.params.dealId });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    let accountId = req.body.accountId;
    if (!accountId) {
      const defaultAccount = await db.collection('accounts').findOne({ isDefault: true });
      accountId = defaultAccount?.id;
    }

    const amount = parseFloat(req.body.amount) || 0;
    const payout = {
      id: uuidv4(),
      dealId: req.params.dealId,
      societyId: deal.societyId,
      accountId,
      amount,
      paymentDate: req.body.paymentDate,
      paymentMode: req.body.paymentMode || 'Cash',
      referenceNo: req.body.referenceNo || '',
      remark: req.body.remark || '',
      createdBy: req.user.userId,
      createdAt: new Date()
    };

    await db.collection('resale_seller_payouts').insertOne(payout);

    await createTransaction(db, {
      txnDate: payout.paymentDate,
      societyId: deal.societyId,
      accountId,
      direction: 'OUT',
      amount,
      paymentMode: payout.paymentMode,
      partyType: 'Vendor',
      partyName: deal.sellerName,
      sourceType: 'RESALE_SELLER_PAYOUT',
      sourceId: payout.id,
      remark: payout.remark || `Resale seller payout - ${deal.sellerName}`
    }, req.user.userId);

    const { _id, ...cleaned } = payout;
    res.json(cleaned);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/resales/:dealId/seller-payouts/:payoutId', verifyToken, async (req, res) => {
  try {
    const db = getDB();
    const payout = await db.collection('resale_seller_payouts').findOne({ id: req.params.payoutId });
    if (!payout) return res.status(404).json({ error: 'Payout not found' });

    const originalTxn = await db.collection('transactions').findOne({ sourceType: 'RESALE_SELLER_PAYOUT', sourceId: req.params.payoutId });
    if (originalTxn) {
      await createReversalTransaction(db, originalTxn, req.user.userId, 'Resale seller payout deleted');
    }

    await db.collection('resale_seller_payouts').updateOne({ id: req.params.payoutId }, { $set: { isDeleted: true, deletedAt: new Date() } });
    res.json({ message: 'Seller payout deleted with reversal' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ADMIN PERMANENT DELETE + CLEANUP ORPHANS ============

app.delete('/api/admin/permanent-delete/:collection/:id', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Super Admin only' });
    const db = getDB();
    const allowed = ['sales', 'inventory', 'expense_bills', 'partners', 'customers', 'loans',
      'purchases', 'vendors', 'commission_bills', 'resale_deals', 'customer_payments',
      'sale_payment_entries', 'purchase_payment_entries', 'expense_payments', 'commission_payments',
      'partner_ledger_entries', 'resale_buyer_payments', 'resale_seller_payouts'];
    if (!allowed.includes(req.params.collection)) {
      return res.status(400).json({ error: 'Collection not allowed' });
    }
    const result = await db.collection(req.params.collection).deleteOne({ id: req.params.id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Record not found' });
    res.json({ message: 'Record permanently deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/cleanup-orphans', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Super Admin only' });
    const db = getDB();

    const societyIds = (await db.collection('societies').find({}, { projection: { id: 1 } }).toArray()).map(s => s.id);
    let removed = 0;

    const collections = ['inventory', 'purchases', 'sales', 'partners', 'customers', 'expense_bills',
      'commission_bills', 'resale_deals', 'customer_payments', 'society_phases'];

    for (const col of collections) {
      const result = await db.collection(col).updateMany(
        { societyId: { $nin: [...societyIds, null] }, isDeleted: { $ne: true } },
        { $set: { isDeleted: true, deletedAt: new Date(), deletedReason: 'Orphan cleanup' } }
      );
      removed += result.modifiedCount || 0;
    }

    res.json({ message: `Cleanup complete. Marked ${removed} orphan record(s) as deleted.`, removed });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ 404 HANDLER ============

app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ============ START SERVER ============

const startServer = async () => {
  try {
    await connectDB();
    await initializeDatabase();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Backend server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
