const express = require('express');
const cors = require('cors');

const { deleteOtpGuard } = require('./middleware/deleteOtp');
const { moneySanitizer } = require('./middleware/sanitize');
const { autoAudit } = require('./middleware/audit');

// Module routers
const authRoutes = require('./modules/auth/auth.routes');
const societiesRoutes = require('./modules/societies/societies.routes');
const phasesRoutes = require('./modules/phases/phases.routes');
const partnersRoutes = require('./modules/partners/partners.routes');
const inventoryRoutes = require('./modules/inventory/inventory.routes');
const purchasesRoutes = require('./modules/purchases/purchases.routes');
const salesRoutes = require('./modules/sales/sales.routes');
const customersRoutes = require('./modules/customers/customers.routes');
const customerPaymentsRoutes = require('./modules/customerPayments/customerPayments.routes');
const accountsRoutes = require('./modules/accounts/accounts.routes');
const daybookRoutes = require('./modules/daybook/daybook.routes');
const expensesRoutes = require('./modules/expenses/expenses.routes');
const vendorsRoutes = require('./modules/vendors/vendors.routes');
const masterDataRoutes = require('./modules/masterData/masterData.routes');
const commissionsRoutes = require('./modules/commissions/commissions.routes');
const marginsRoutes = require('./modules/margins/margins.routes');
const resalesRoutes = require('./modules/resales/resales.routes');
const loansRoutes = require('./modules/loans/loans.routes');
const dastiRoutes = require('./modules/dasti/dasti.routes');
const firmLedgerRoutes = require('./modules/firmLedger/firmLedger.routes');
const bankRoutes = require('./modules/bank/bank.routes');
const notesRoutes = require('./modules/notes/notes.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const trashRoutes = require('./modules/trash/trash.routes');

const app = express();

app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Delete-Otp'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(deleteOtpGuard);
app.use(moneySanitizer);
app.use(autoAudit);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ Routes ============
app.use('/api/auth', authRoutes);

// Societies + nested society-scoped routes
app.use('/api/societies', societiesRoutes);
app.use('/api/societies/:societyId/phases', phasesRoutes.societyScopedRouter);
app.use('/api/societies/:societyId/partners', partnersRoutes.societyScopedRouter);
app.use('/api/societies/:societyId/inventory', inventoryRoutes.societyScopedRouter);
app.use('/api/societies/:societyId/purchases', purchasesRoutes.societyScopedRouter);
app.use('/api/societies/:societyId/sales', salesRoutes.societyScopedRouter);

// Flat resource routes
app.use('/api/phases', phasesRoutes.flatRouter);
app.use('/api/partners', partnersRoutes.flatRouter);
app.use('/api/ledger-entries', partnersRoutes.ledgerEntriesRouter);
app.use('/api/inventory', inventoryRoutes.flatRouter);
app.use('/api/global-inventory', inventoryRoutes.globalRouter);
app.use('/api/purchases', purchasesRoutes.flatRouter);
app.use('/api/purchase-payments', purchasesRoutes.purchasePaymentsRouter);
app.use('/api/sales', salesRoutes.flatRouter);
app.use('/api/sale-payments', salesRoutes.salePaymentsRouter);
app.use('/api/sale-transfers', salesRoutes.saleTransfersRouter);
app.use('/api/customers', customersRoutes);
app.use('/api/customer-payments', customerPaymentsRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/daybook', daybookRoutes);

// Expenses (split across three URL prefixes)
app.use('/api/expense-bills', expensesRoutes.expenseBillsRouter);
app.use('/api/expenses', expensesRoutes.expensesRouter);
app.use('/api/expense-payments', expensesRoutes.expensePaymentsRouter);

app.use('/api/vendors', vendorsRoutes);
app.use('/api/vendor-types', masterDataRoutes.vendorTypesRouter);
app.use('/api/expense-categories', masterDataRoutes.expenseCategoriesRouter);

app.use('/api/commission-bills', commissionsRoutes.commissionBillsRouter);
app.use('/api/commission-payments', commissionsRoutes.commissionPaymentsRouter);
app.use('/api/margin-bills', marginsRoutes.marginBillsRouter);
app.use('/api/margin-payments', marginsRoutes.marginPaymentsRouter);

app.use('/api/resales', resalesRoutes);

app.use('/api/parties', loansRoutes.partiesRouter);
app.use('/api/loans', loansRoutes.loansRouter);

// Dasti Ledger — standalone temporary-cash tracker between firm & partners.
// /api/firms is shared with the Firm Ledger.
app.use('/api/firms', dastiRoutes.firmsRouter);
app.use('/api/dasti/persons', dastiRoutes.personsRouter);
app.use('/api/dasti/transactions', dastiRoutes.transactionsRouter);

// Firm Ledger — per-firm money IN/OUT (firm is the subject; counterparty is
// optional free-text). Standalone, does not touch the daybook.
app.use('/api/firm-ledger/transactions', firmLedgerRoutes.transactionsRouter);

// Bank — cash withdrawals from a single account + internal transfers between
// two accounts. Each operation posts mirrored daybook transactions so account
// balances reflect the movement.
app.use('/api/bank', bankRoutes);

// Notes — simple title+body sticky notes shown in the sidebar.
app.use('/api/notes', notesRoutes);

app.use('/api/admin', adminRoutes.adminRouter);
app.use('/api/cleanup-orphans', adminRoutes.cleanupOrphansRouter);
app.use('/api/trash', trashRoutes);

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

module.exports = app;
