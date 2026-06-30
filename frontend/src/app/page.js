'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { Toaster } from '@/components/ui/toaster'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Building2, Users, Package, ShoppingCart, TrendingUp, TrendingDown, LogOut, Plus, Edit, Trash2, Home, Eye, EyeOff, Receipt, UserCheck, CreditCard, Percent, RefreshCw, ArrowRightLeft, CheckCircle, XCircle, BookOpen, Wallet, ArrowDownCircle, ArrowUpCircle, Filter, X, Download, FileText, FileSpreadsheet, Lock, Settings, AlertTriangle, Pencil, IndianRupee, UserCircle, MinusCircle, Globe, Zap } from 'lucide-react'
import { AppShell } from '@/components/dashboard/AppShell'
import { StatCard } from '@/components/dashboard/StatCard'
import { getDeleteOtp, refreshDeleteOtp } from '@/lib/deleteOtp'

// Login screen logo — tries /images/logo.png, falls back to gradient Building.
// Drop your logo at frontend/public/images/logo.png to override.
const LoginLogo = () => {
  const [failed, setFailed] = useState(false)
  if (!failed) {
    return (
      <img
        src="/images/logo.png"
        alt="Logo"
        onError={() => setFailed(true)}
        className="w-16 h-16 rounded-2xl object-cover shadow-elevated"
      />
    )
  }
  return (
    <div className="relative">
      <div className="absolute inset-0 gradient-bg blur-2xl opacity-40 rounded-3xl" />
      <div className="relative gradient-bg w-16 h-16 rounded-2xl flex items-center justify-center shadow-elevated">
        <Building2 className="w-8 h-8 text-white" strokeWidth={2.25} />
      </div>
    </div>
  )
}
import { useRouter } from 'next/navigation'
import Papa from 'papaparse'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import { Ta } from 'zod/v4/locales'

const VENDOR_TYPES = ['Electrician', 'Broker', 'Labour', 'Legal', 'Marketing', 'Plumber', 'Civil', 'Other']
const EXPENSE_CATEGORIES = ['Civil', 'Tiles', 'Electrical', 'Plumbing', 'Paint', 'Labour', 'Legal', 'Marketing', 'Office', 'Other']
const PAYMENT_MODES = ['Cash', 'Bank Transfer', 'Cheque', 'RTGS', 'UPI']

// Rows-per-page options used by every paginated table in the app.
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200]

// Returns the paged slice of a filtered list + meta so each tab can render
// pagination controls (Previous / Next, "Showing X to Y of Z") consistently.
// Page is clamped so a stale page index from a previous filter doesn't blank
// out the table.
const slicePage = (list, pageSize, page) => {
  const total = list.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(Math.max(1, page || 1), totalPages)
  const start = (currentPage - 1) * pageSize
  return {
    paged: list.slice(start, start + pageSize),
    total,
    totalPages,
    currentPage,
    start,
    end: Math.min(start + pageSize, total),
  }
}
const SOURCE_TYPE_LABELS = {
  'SALE_PAYMENT': 'Sale Payment',
  'PURCHASE_PAYMENT': 'Purchase Payment',
  'EXPENSE_PAYMENT': 'Expense Payment',
  'BROKER_COMMISSION': 'Broker Commission',
  'COMMISSION_PAYMENT': 'Commission Payment',
  'MARGIN_PAYMENT': 'Margin Payment',
  'PARTNER_CAPITAL': 'Partner Capital',
  'CUSTOMER_PAYMENT': 'Customer Payment',
  'CUSTOMER_PAYMENT_REVERSAL': 'Customer Payment (Reversal)',
  'RESALE_BUYER_PAYMENT': 'Resale - Buyer',
  'RESALE_SELLER_PAYOUT': 'Resale - Seller',
  'RESALE_COMPANY_COMMISSION': 'Resale - Company Fee',
  'OPENING_BALANCE': 'Opening Balance',
  'BORROW_RECEIVED': 'Loan Borrowed (old)',
  'BORROW_REPAYMENT': 'Loan Repaid (old)',
  'LOAN_BORROWED': 'Loan Borrowed',
  'LOAN_BORROWED_REPAYMENT': 'Loan Repaid',
  'LOAN_GIVEN': 'Loan Given',
  'LOAN_GIVEN_REPAYMENT': 'Loan Received Back',
  'OTHER': 'Other'
}

// Safe Indian-locale rupee formatter — always 2 decimals, paise-accurate.
// Callers already prefix "₹", so this returns digits only (e.g. "1,23,456.78").
const fmt = (value) => {
  const n = Math.round((Number(value) || 0) * 100) / 100
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Shared pagination footer used under every paginated table. Keeps the
// "Showing X to Y of Z" line + Prev/Next controls visually consistent
// across tabs without each tab reimplementing the math.
const TablePager = ({ total, totalPages, currentPage, start, end, onChange, label = 'rows' }) => {
  if (total <= 0) return null
  return (
    <div className="flex items-center justify-between mt-3 pt-3 border-t">
      <div className="text-sm text-muted-foreground">
        Showing {start + 1} to {end} of {total} {label}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground px-2">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  )
}

// Inline rows-per-page selector — paired with TablePager via the same filter
// state object on each tab.
const PageSizeSelect = ({ value, onChange }) => (
  <div className="flex items-center gap-2">
    <span className="text-sm text-muted-foreground">Rows per page:</span>
    <Select value={String(value)} onValueChange={(v) => onChange(parseInt(v))}>
      <SelectTrigger className="w-[80px] h-8">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PAGE_SIZE_OPTIONS.map(n => (
          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)

// `vendorLedgerScope` flips the Vendor Ledger tab between its two modes:
//   - 'default'   → regular Vendor Ledger; vendor types exclude 'Broker' AND
//                   'Commission' so commission vendors live on their own page.
//   - 'commission'→ Commission Ledger; same UI but scoped to vendor type
//                   'Commission' only, and new vendors default to that type.
// `companyScope` runs the vendor ledger at company level (no society):
//   - skips the society gate and society loading
//   - vendor + bill loaders query the company-scope APIs instead
//   - vendor + bill mutations write `societyId: null` / `scope: 'COMPANY'`
// All other tab paths still expect `selectedSociety`, so this flag is only
// safe with `singleTabMode` pinned to a vendor-tied tab (e.g. expenses).
export const App = ({ initialTab = 'partners', singleTabMode = false, vendorLedgerScope = 'default', companyScope = false } = {}) => {
  const router = useRouter()
  const { toast } = useToast()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)
  
  // Admin panel state
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  
  // Login state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  
  // App state
  const [activeTab, setActiveTab] = useState(initialTab)
  const [societies, setSocieties] = useState([])
  const [selectedSociety, setSelectedSociety] = useState(null)
  const [showSocietyGate, setShowSocietyGate] = useState(false)
  const [pendingSocietyTab, setPendingSocietyTab] = useState('')
  const [hasShownProtectedTabGate, setHasShownProtectedTabGate] = useState(false)
  const [partners, setPartners] = useState([])
  const [partnerSummary, setPartnerSummary] = useState(null)
  const [inventory, setInventory] = useState([])
  const [purchases, setPurchases] = useState([])
  const [sales, setSales] = useState([])
  const [salesSummary, setSalesSummary] = useState(null)
  const [vendors, setVendors] = useState([])
  const [expenseBills, setExpenseBills] = useState([])
  const [commissionBills, setCommissionBills] = useState([])
  const [marginBills, setMarginBills] = useState([])
  const [resaleDeals, setResaleDeals] = useState([])
  const [summary, setSummary] = useState(null)
  const [accounts, setAccounts] = useState([])
  
  // Master data (dynamic dropdowns)
  const [vendorTypes, setVendorTypes] = useState([])
  const [expenseCategories, setExpenseCategories] = useState([])
  
  // View/Edit sale state
  const [viewSaleId, setViewSaleId] = useState(null)
  const [viewSaleData, setViewSaleData] = useState(null)
  const [editingSale, setEditingSale] = useState(null)
  const [editingInventory, setEditingInventory] = useState(null)
  const [editingPurchase, setEditingPurchase] = useState(null)
  const [editingExpenseBill, setEditingExpenseBill] = useState(null)
  // Vendor-ledger payment edit dialog state. Lives at app level so it can
  // overlay the VendorLedgerDrawer without coupling to BillPaymentDrawer's
  // shared paymentBillType state.
  const [editingVendorPayment, setEditingVendorPayment] = useState(null)
  // Vendor-level "Add Payment / Withdrawal" — single dialog whose type
  // selector switches between FIFO-payment and LIFO-withdrawal flows.
  const [addingVendorPayment, setAddingVendorPayment] = useState(null)
  // Global Ledger — cross-vendor view of all activity (work + payments +
  // withdrawals) for the current scope. Read-only, filterable, exportable.
  const [isGlobalLedgerOpen, setIsGlobalLedgerOpen] = useState(false)
  const [globalLedgerEntries, setGlobalLedgerEntries] = useState([])
  const [globalLedgerLoading, setGlobalLedgerLoading] = useState(false)
  const [editingCommissionBill, setEditingCommissionBill] = useState(null)
  const [editingMarginBill, setEditingMarginBill] = useState(null)
  
  // Partner edit state
  const [editingPartner, setEditingPartner] = useState(null)
  const [editingLedgerEntry, setEditingLedgerEntry] = useState(null)
  
  // Admin Tools state
  const [showMasters, setShowMasters] = useState(false)
  const [showRecycleBin, setShowRecycleBin] = useState(false)
  const [recycleBinData, setRecycleBinData] = useState({ records: [], summary: {}, total: 0 })
  const [showAuditLogs, setShowAuditLogs] = useState(false)
  const [auditLogsData, setAuditLogsData] = useState({ logs: [], pagination: {} })
  const [recycleBinFilter, setRecycleBinFilter] = useState('')
  const [showUnassignedSales, setShowUnassignedSales] = useState(false)
  const [unassignedSales, setUnassignedSales] = useState([])

  const handleTabChange = (nextTab) => {
    // In company-scope mode there is no society to pick — let the click
    // through directly so the user lands on the tab content immediately.
    if (!companyScope && (nextTab === 'expenses' || nextTab === 'margins')) {
      setPendingSocietyTab(nextTab)
      setShowSocietyGate(true)
      return
    }
    setActiveTab(nextTab)
  }
  
  // Quick Add Expense state
  const [showQuickExpense, setShowQuickExpense] = useState(false)
  const [quickExpenseData, setQuickExpenseData] = useState({
    scope: 'SOCIETY',
    societyId: '',
    accountId: '',
    amount: '',
    category: '',
    vendorName: '',
    paymentMode: 'Cash',
    expenseDate: new Date().toISOString().split('T')[0],
    remark: ''
  })
  // Inline Add Category state (for Quick Expense modal)
  const [showQuickAddCategory, setShowQuickAddCategory] = useState(false)
  const [quickNewCategoryName, setQuickNewCategoryName] = useState('')
  const [addingQuickCategory, setAddingQuickCategory] = useState(false)
  
  // Daybook state
  const [daybookTransactions, setDaybookTransactions] = useState([])
  const [daybookSummary, setDaybookSummary] = useState(null)
  const [daybookFilters, setDaybookFilters] = useState({
    societyId: 'all',
    accountId: 'all',
    direction: 'all',
    sourceType: 'all',
    startDate: '',
    endDate: ''
  })
  
  // Dialog/Drawer states
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState('create')
  const [currentItem, setCurrentItem] = useState(null)
  
  // Ledger drawer states
  const [isLedgerDrawerOpen, setIsLedgerDrawerOpen] = useState(false)
  const [ledgerType, setLedgerType] = useState(null)
  const [ledgerItem, setLedgerItem] = useState(null)
  const [ledgerEntries, setLedgerEntries] = useState([])

  // Payment drawer states for expense/commission bills
  const [isPaymentDrawerOpen, setIsPaymentDrawerOpen] = useState(false)
  const [paymentBillType, setPaymentBillType] = useState(null) // 'expense' or 'commission'
  const [paymentBill, setPaymentBill] = useState(null)
  const [billPayments, setBillPayments] = useState([])

  // Vendor ledger drawer
  const [isVendorLedgerOpen, setIsVendorLedgerOpen] = useState(false)
  const [vendorLedgerItem, setVendorLedgerItem] = useState(null)
  const [vendorLedgerEntries, setVendorLedgerEntries] = useState([])

  // Resale payment drawer states
  const [isResalePaymentDrawerOpen, setIsResalePaymentDrawerOpen] = useState(false)
  const [resaleDeal, setResaleDeal] = useState(null)
  const [resaleBuyerPayments, setResaleBuyerPayments] = useState([])
  const [resaleSellerPayouts, setResaleSellerPayouts] = useState([])

  // Customer & Payment Allocation states
  const [customers, setCustomers] = useState([])
  const [customerPayments, setCustomerPayments] = useState([])
  const [customerPaymentsPagination, setCustomerPaymentsPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0
  })
  const [customerPaymentsLoading, setCustomerPaymentsLoading] = useState(false)

  // Change password dialog state
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [changePasswordForm, setChangePasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [changePasswordSubmitting, setChangePasswordSubmitting] = useState(false)
  const [showCurrentPwd, setShowCurrentPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)

  const [showCustomerForm, setShowCustomerForm] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  // null = creating a new payment, an object = editing that payment in place.
  // The same dialog hosts both modes via CustomerPaymentForm's `payment` prop.
  const [editingPayment, setEditingPayment] = useState(null)
  const [showAllocationModal, setShowAllocationModal] = useState(false)
  const [currentPaymentForAllocation, setCurrentPaymentForAllocation] = useState(null)
  const [customerSalesForAllocation, setCustomerSalesForAllocation] = useState([])
  const [showCustomerLedger, setShowCustomerLedger] = useState(false)
  const [customerLedgerData, setCustomerLedgerData] = useState(null)

  // Expense & Commission Filters
  const [expenseFilters, setExpenseFilters] = useState({
    status: 'all',
    vendorId: 'all',
    categoryId: 'all',
    startDate: '',
    endDate: '',
    search: '',
    pageSize: 25,
    page: 1,
  })
  // Vendor Ledger (Daily Khata style) filters + per-vendor action target
  const [vendorLedgerFilters, setVendorLedgerFilters] = useState({
    search: '',
    category: 'all',
    status: 'all',
    pageSize: 25,
    page: 1,
  })
  const [addWorkVendor, setAddWorkVendor] = useState(null)
  const [commissionFilters, setCommissionFilters] = useState({
    status: 'all',
    brokerId: 'all',
    startDate: '',
    endDate: '',
    search: '',
    pageSize: 25,
    page: 1,
  })
  const [marginFilters, setMarginFilters] = useState({
    status: 'all',
    startDate: '',
    endDate: '',
    search: '',
    pageSize: 25,
    page: 1,
  })
  const [customerFilters, setCustomerFilters] = useState({
    search: '',
    startDate: '',
    endDate: '',
    pageSize: 25,
    page: 1,
  })
  const [salesFilters, setSalesFilters] = useState({ search: '', startDate: '', endDate: '', pageSize: 50, page: 1 })
  const [purchasesFilters, setPurchasesFilters] = useState({ search: '', startDate: '', endDate: '', pageSize: 25, page: 1 })
  const [resalesFilters, setResalesFilters] = useState({ search: '', startDate: '', endDate: '', pageSize: 25, page: 1 })
  const [inventoryFilters, setInventoryFilters] = useState({ search: '', status: 'all', pageSize: 25, page: 1 })
  const [partnersFilters, setPartnersFilters] = useState({ search: '', pageSize: 25, page: 1 })
  const [auditLogsFilters, setAuditLogsFilters] = useState({ search: '', pageSize: 50, page: 1 })

  useEffect(() => {
    try {
      const storedToken = localStorage.getItem('token')
      const storedUser = localStorage.getItem('user')

      if (storedToken && storedUser) {
        setToken(storedToken)
        setUser(JSON.parse(storedUser))
        setIsAuthenticated(true)
      }
    } catch (err) {
      // Corrupt localStorage shouldn't strand the user on the loading screen.
      console.error('Auth restore failed:', err)
      try { localStorage.removeItem('user') } catch {}
      try { localStorage.removeItem('token') } catch {}
    } finally {
      setLoading(false)
    }
  }, [])

  // Tracks which dashboard tabs have already pulled their data for the
  // currently-selected society. Cleared when the society changes so a fresh
  // load happens, but switching back to an already-loaded tab is a no-op.
  const loadedTabsRef = useRef(new Set())

  useEffect(() => {
    if (isAuthenticated) {
      loadSocieties()
      loadMasterData() // Load vendor types and expense categories
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (isAuthenticated) {
      loadAccounts()
      // Daybook lives on its own /daybook page — don't pre-fetch it on the
      // dashboard. The page loader pulls fresh data when the user navigates.
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (selectedSociety || companyScope) {
      // Society changed — invalidate per-tab caches and load only the data
      // the user needs right now (top summary cards + the active tab). Other
      // tabs lazy-load on first switch via the activeTab effect below.
      // In companyScope mode the loaders ignore selectedSociety and hit the
      // company-scope APIs instead; we still want to (re)fetch on mount.
      loadedTabsRef.current = new Set()
      if (!companyScope) loadSocietySummary()
      ensureTabLoaded(activeTab)
      loadAccounts() // Reload accounts when society changes (for scope filtering)
    }
  }, [selectedSociety, companyScope])

  useEffect(() => {
    if (activeTab !== 'expenses' && activeTab !== 'margins') {
      setHasShownProtectedTabGate(false)
      return
    }
    // Company-scope tabs don't need a society pick, so skip the gate.
    if (companyScope) return
    if (!hasShownProtectedTabGate) {
      setPendingSocietyTab(activeTab)
      setShowSocietyGate(true)
      setHasShownProtectedTabGate(true)
    }
  }, [activeTab, hasShownProtectedTabGate, companyScope])

  useEffect(() => {
    if (selectedSociety || companyScope) ensureTabLoaded(activeTab)
  }, [activeTab])

  const loadMasterData = async () => {
    try {
      const [vendorTypesRes, expenseCategoriesRes] = await Promise.all([
        apiCall('/vendor-types'),
        apiCall('/expense-categories')
      ])
      setVendorTypes(vendorTypesRes || [])
      setExpenseCategories(expenseCategoriesRes || [])
    } catch (error) {
      console.error('Failed to load master data:', error)
    }
  }

  const apiCall = async (endpoint, method = 'GET', body = null) => {
    // Always get fresh token from localStorage to avoid stale state issues
    const authToken = token || localStorage.getItem('token')

    const buildOptions = (otp) => {
      const headers = {
        'Content-Type': 'application/json',
        ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        ...(otp ? { 'X-Delete-Otp': otp } : {}),
      }
      const opts = { method, headers }
      if (body) opts.body = JSON.stringify(body)
      return opts
    }

    let otp = null
    if (method === 'DELETE') {
      otp = getDeleteOtp()
      if (!otp) throw new Error('Delete cancelled — OTP required')
    }

    let response = await fetch(`/api${endpoint}`, buildOptions(otp))

    // If the server rejects our OTP, prompt once more and retry.
    if (response.status === 403 && method === 'DELETE') {
      const errClone = response.clone()
      const errBody = await errClone.json().catch(() => ({}))
      if (errBody?.code === 'DELETE_OTP_REQUIRED') {
        const fresh = refreshDeleteOtp()
        if (!fresh) throw new Error('Delete cancelled — OTP required')
        response = await fetch(`/api${endpoint}`, buildOptions(fresh))
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error || 'API call failed')
    }
    return response.json()
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error)
      }
      
      const data = await response.json()
      setToken(data.token)
      setUser(data.user)
      setIsAuthenticated(true)
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      
      toast({
        title: 'Login Successful',
        description: `Welcome back, ${data.user.name}!`
      })
    } catch (error) {
      toast({
        title: 'Login Failed',
        description: error.message,
        variant: 'destructive'
      })
    }
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    setUser(null)
    setToken(null)
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    toast({
      title: 'Logged Out',
      description: 'You have been logged out successfully'
    })
  }

  const openChangePassword = () => {
    setChangePasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    setShowCurrentPwd(false)
    setShowNewPwd(false)
    setShowConfirmPwd(false)
    setShowChangePassword(true)
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    const { currentPassword, newPassword, confirmPassword } = changePasswordForm
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({ title: 'Error', description: 'All fields are required', variant: 'destructive' })
      return
    }
    if (newPassword.length < 6) {
      toast({ title: 'Error', description: 'New password must be at least 6 characters', variant: 'destructive' })
      return
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Error', description: 'New passwords do not match', variant: 'destructive' })
      return
    }
    if (currentPassword === newPassword) {
      toast({ title: 'Error', description: 'New password must be different from current password', variant: 'destructive' })
      return
    }
    try {
      setChangePasswordSubmitting(true)
      await apiCall('/auth/change-password', 'POST', { currentPassword, newPassword })
      toast({ title: 'Success', description: 'Password changed successfully' })
      setShowChangePassword(false)
      setChangePasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setChangePasswordSubmitting(false)
    }
  }

  const loadSocieties = async () => {
    try {
      const data = await apiCall('/societies')
      setSocieties(data)
      if (data.length > 0 && !selectedSociety) {
        // Honor a society id passed from /societies "Open Dashboard"
        let preferred = null
        try {
          preferred = sessionStorage.getItem('selectedSociety')
          if (preferred) sessionStorage.removeItem('selectedSociety')
        } catch {}
        const match = preferred && data.find(s => s.id === preferred)
        setSelectedSociety(match ? match.id : data[0].id)
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      })
    }
  }

  const loadAccounts = async () => {
    try {
      // Pass societyId to filter accounts (show global + society-specific)
      const societyParam = selectedSociety ? `?societyId=${selectedSociety}` : ''
      const data = await apiCall(`/accounts${societyParam}`)
      setAccounts(data)
    } catch (error) {
      console.error('Error loading accounts:', error)
    }
  }

  const loadDaybook = async (filters = daybookFilters) => {
    try {
      const params = new URLSearchParams()
      if (filters.societyId && filters.societyId !== 'all') params.append('societyId', filters.societyId)
      if (filters.accountId && filters.accountId !== 'all') params.append('accountId', filters.accountId)
      if (filters.direction && filters.direction !== 'all') params.append('direction', filters.direction)
      if (filters.sourceType && filters.sourceType !== 'all') params.append('sourceType', filters.sourceType)
      if (filters.startDate) params.append('startDate', filters.startDate)
      if (filters.endDate) params.append('endDate', filters.endDate)
      
      const [txnData, summaryData] = await Promise.all([
        apiCall(`/daybook?${params.toString()}`),
        apiCall(`/daybook/summary?${params.toString()}`)
      ])
      
      setDaybookTransactions(txnData.transactions || [])
      setDaybookSummary(summaryData)
    } catch (error) {
      console.error('Error loading daybook:', error)
    }
  }

  // Top summary cards (Total Purchases / Sales / Expenses / Payables /
  // Net Profit) — needed regardless of which tab is open. Loaded on every
  // society change.
  const loadSocietySummary = async () => {
    try {
      const summaryData = await apiCall(`/societies/${selectedSociety}/summary`)
      setSummary(summaryData)
    } catch (error) {
      console.error('Failed to load summary:', error)
    }
  }

  // Per-tab loaders. Each pulls only what its own tab + the dialogs it
  // launches need. Cross-tab dependencies (e.g. SaleForm needs inventory)
  // are folded into the relevant tab loader so opening the tab is enough.
  const loadPartnersTab = async () => {
    const data = await apiCall(`/societies/${selectedSociety}/partners`)
    if (data.partners) {
      setPartners(data.partners)
      setPartnerSummary(data.summary)
    } else {
      setPartners(data)
      setPartnerSummary(null)
    }
  }

  const loadInventoryTab = async () => {
    const data = await apiCall(`/societies/${selectedSociety}/inventory`)
    setInventory(data)
  }

  const loadPurchasesTab = async () => {
    const data = await apiCall(`/societies/${selectedSociety}/purchases`)
    setPurchases(data)
  }

  const loadCustomersTab = async () => {
    const data = await apiCall(`/customers?societyId=${selectedSociety}`)
    setCustomers(data || [])
    await loadCustomerPayments(1, customerPaymentsPagination.limit)
  }

  const loadSalesTab = async () => {
    // Sales tab list renders denormalized fields, but Add/Edit Sale dialogs
    // need inventory + customers — fetch those alongside so the form is
    // ready when the user clicks Add. Resale deals are pulled too so the
    // per-row resale-chain (original → ... → latest owner) renders on first
    // visit; without this the chain only appeared after the user opened the
    // Resales tab once to populate resaleDeals.
    const [salesData, inventoryData, customersData, dealsData] = await Promise.all([
      apiCall(`/societies/${selectedSociety}/sales`),
      apiCall(`/societies/${selectedSociety}/inventory`),
      apiCall(`/customers?societyId=${selectedSociety}`),
      apiCall(`/resales?societyId=${selectedSociety}`).catch(() => []),
    ])
    if (salesData?.sales) {
      setSales(salesData.sales)
      setSalesSummary(salesData.summary)
    } else {
      setSales(salesData)
      setSalesSummary(null)
    }
    setInventory(inventoryData)
    setCustomers(customersData || [])
    setResaleDeals(dealsData || [])
  }

  const loadResalesTab = async () => {
    // Resales: list deals; ResaleForm picks from Sold inventory and
    // existing sales for the seller side.
    const [dealsData, inventoryData, salesData] = await Promise.all([
      apiCall(`/resales?societyId=${selectedSociety}`),
      apiCall(`/societies/${selectedSociety}/inventory`),
      apiCall(`/societies/${selectedSociety}/sales`),
    ])
    setResaleDeals(dealsData)
    setInventory(inventoryData)
    if (salesData?.sales) {
      setSales(salesData.sales)
      setSalesSummary(salesData.summary)
    } else if (salesData) {
      setSales(salesData)
      setSalesSummary(null)
    }
  }

  const loadVendorsTab = async () => {
    const url = companyScope
      ? '/vendors?scope=company'
      : `/vendors?societyId=${selectedSociety}`
    const data = await apiCall(url)
    setVendors(data)
  }

  const loadExpensesTab = async () => {
    // Expense form needs vendor list; bundle. In company-scope mode both
    // calls target the company-level endpoint shapes so vendors + bills
    // align (a society vendor can't own a company bill and vice versa).
    const vendorsUrl = companyScope
      ? '/vendors?scope=company'
      : `/vendors?societyId=${selectedSociety}`
    const billsUrl = companyScope
      ? '/expense-bills?scope=COMPANY'
      : `/expense-bills?societyId=${selectedSociety}`
    const [billsData, vendorsData] = await Promise.all([
      apiCall(billsUrl),
      apiCall(vendorsUrl),
    ])
    setExpenseBills(billsData)
    setVendors(vendorsData)
  }

  const loadCommissionsTab = async () => {
    // Commission form picks a sale + inventory.
    const [billsData, inventoryData, salesData] = await Promise.all([
      apiCall(`/commission-bills?societyId=${selectedSociety}`),
      apiCall(`/societies/${selectedSociety}/inventory`),
      apiCall(`/societies/${selectedSociety}/sales`),
    ])
    setCommissionBills(billsData)
    setInventory(inventoryData)
    if (salesData?.sales) {
      setSales(salesData.sales)
      setSalesSummary(salesData.summary)
    } else if (salesData) {
      setSales(salesData)
      setSalesSummary(null)
    }
  }

  const loadMarginsTab = async () => {
    // Margin bills attach to a ResaleDeal. We also pull inventory so the
    // dropdown can show flat numbers next to each resale.
    const [billsData, dealsData, inventoryData] = await Promise.all([
      apiCall(`/margin-bills?societyId=${selectedSociety}`),
      apiCall(`/resales?societyId=${selectedSociety}`),
      apiCall(`/societies/${selectedSociety}/inventory`),
    ])
    setMarginBills(billsData)
    setResaleDeals(dealsData)
    setInventory(inventoryData)
  }

  const tabLoaders = {
    partners: loadPartnersTab,
    inventory: loadInventoryTab,
    purchases: loadPurchasesTab,
    customers: loadCustomersTab,
    sales: loadSalesTab,
    resales: loadResalesTab,
    vendors: loadVendorsTab,
    expenses: loadExpensesTab,
    commissions: loadCommissionsTab,
    margins: loadMarginsTab,
  }

  // Lazy-load a tab's data on first visit. Reuses the cached fetch across
  // tab toggles. On error, drops the cache marker so the next visit retries.
  const ensureTabLoaded = async (tab) => {
    if (!selectedSociety) return
    const loader = tabLoaders[tab]
    if (!loader) return
    if (loadedTabsRef.current.has(tab)) return
    loadedTabsRef.current.add(tab)
    try {
      await loader()
    } catch (error) {
      loadedTabsRef.current.delete(tab)
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  // Called by CRUD handlers after a mutation. Refreshes the top summary
  // cards plus only the tabs the user has actually visited — untouched
  // tabs stay cold and load fresh on first switch.
  const loadSocietyData = async () => {
    // In companyScope mode there's no society to summarise, but we still
    // want every previously-loaded tab refreshed after a mutation (vendor
    // create, bill edit, etc.) — otherwise the table stays stale.
    if (!selectedSociety && !companyScope) return
    const visitedTabs = Array.from(loadedTabsRef.current)
    loadedTabsRef.current = new Set()
    await Promise.all([
      companyScope ? Promise.resolve() : loadSocietySummary(),
      ...visitedTabs.map(tab => ensureTabLoaded(tab)),
    ])
  }
  
  // Dedicated function to load customer payments with pagination
  const loadCustomerPayments = async (page = 1, limit = 25) => {
    if (!selectedSociety) return
    
    setCustomerPaymentsLoading(true)
    try {
      const response = await apiCall(`/customer-payments?societyId=${selectedSociety}&page=${page}&limit=${limit}`)
      
      // Handle paginated response
      if (response.data && response.pagination) {
        setCustomerPayments(response.data)
        setCustomerPaymentsPagination(response.pagination)
      } else {
        // Backward compatibility if API doesn't return paginated format
        setCustomerPayments(Array.isArray(response) ? response : [])
        setCustomerPaymentsPagination({ page: 1, limit: 10, total: response.length || 0, totalPages: 1 })
      }
    } catch (error) {
      console.error('Error loading customer payments:', error)
      setCustomerPayments([])
    } finally {
      setCustomerPaymentsLoading(false)
    }
  }
  
  // Handle customer payments pagination change
  const handleCustomerPaymentsPageChange = (newPage) => {
    if (newPage >= 1 && newPage <= customerPaymentsPagination.totalPages) {
      loadCustomerPayments(newPage, customerPaymentsPagination.limit)
    }
  }
  
  // Handle customer payments limit change
  const handleCustomerPaymentsLimitChange = (newLimit) => {
    loadCustomerPayments(1, newLimit) // Reset to page 1 when limit changes
  }

  const openLedger = async (type, item) => {
    setLedgerType(type)
    setLedgerItem(item)
    setIsLedgerDrawerOpen(true)
    setLedgerEntries([])  // Clear entries while loading
    
    try {
      let entries = []
      if (type === 'partner') {
        entries = await apiCall(`/partners/${item.id}/ledger`)
      } else if (type === 'purchase') {
        entries = await apiCall(`/purchases/${item.id}/payments`)
      } else if (type === 'sale') {
        // Use new ledger endpoint for sales
        const response = await apiCall(`/sales/${item.id}/ledger`)
        console.log('Sale Ledger API Response:', response)  // Debug
        entries = response?.entries || []  // Extract entries array from response
      }
      // Ensure entries is always an array
      const finalEntries = Array.isArray(entries) ? entries : []
      console.log('Setting ledger entries:', finalEntries.length)  // Debug
      setLedgerEntries(finalEntries)
    } catch (error) {
      console.error('Ledger API Error:', error)
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      })
      setLedgerEntries([])  // Reset to empty array on error
    }
  }

  const handleAddLedgerEntry = async (formData) => {
    try {
      if (ledgerType === 'partner') {
        await apiCall(`/partners/${ledgerItem.id}/ledger`, 'POST', formData)
      } else if (ledgerType === 'purchase') {
        await apiCall(`/purchases/${ledgerItem.id}/payments`, 'POST', formData)
      } else if (ledgerType === 'sale') {
        // Use new ledger endpoint for sales
        await apiCall(`/sales/${ledgerItem.id}/ledger`, 'POST', formData)
      }

      await openLedger(ledgerType, ledgerItem)
      await loadSocietyData()

      toast({ title: 'Success', description: 'Entry added successfully' })
      return true
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
      return false
    }
  }

  const handleTransferBetweenSales = async (payload) => {
    if (!ledgerItem?.id) return false
    try {
      await apiCall(`/sales/${ledgerItem.id}/transfer`, 'POST', payload)
      await openLedger('sale', ledgerItem)
      await loadSocietyData()
      toast({ title: 'Success', description: 'Amount transferred between sales' })
      return true
    } catch (error) {
      toast({ title: 'Transfer failed', description: error.message, variant: 'destructive' })
      return false
    }
  }

  const handleUpdateTransfer = async (transferGroupId, payload) => {
    if (!transferGroupId) return false
    try {
      await apiCall(`/sale-transfers/${transferGroupId}`, 'PUT', payload)
      if (ledgerItem) await openLedger('sale', ledgerItem)
      await loadSocietyData()
      toast({ title: 'Success', description: 'Transfer updated' })
      return true
    } catch (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' })
      return false
    }
  }

  const handleUpdateLedgerEntry = async (formData) => {
    try {
      // Each ledger type has its own PUT endpoint — the per-resource service
      // is what knows how to reverse the original transaction and rewrite
      // the parent's denormalized totals correctly.
      let endpoint = null
      if (ledgerType === 'partner') {
        endpoint = `/ledger-entries/${editingLedgerEntry.id}`
      } else if (ledgerType === 'purchase') {
        endpoint = `/purchase-payments/${editingLedgerEntry.id}`
      } else if (ledgerType === 'sale') {
        endpoint = `/sale-payments/${editingLedgerEntry.id}`
      } else {
        throw new Error(`Edit not supported for ledger type: ${ledgerType}`)
      }
      await apiCall(endpoint, 'PUT', formData)
      await openLedger(ledgerType, ledgerItem)
      await loadSocietyData()
      setEditingLedgerEntry(null)
      toast({ title: 'Success', description: 'Ledger entry updated successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleDeleteLedgerEntry = async (entryId) => {
    try {
      if (ledgerType === 'partner') {
        await apiCall(`/ledger-entries/${entryId}`, 'DELETE')
      } else if (ledgerType === 'purchase') {
        await apiCall(`/purchase-payments/${entryId}`, 'DELETE')
      } else if (ledgerType === 'sale') {
        await apiCall(`/sale-payments/${entryId}`, 'DELETE')
      }
      
      await openLedger(ledgerType, ledgerItem)
      await loadSocietyData()
      
      toast({ title: 'Success', description: 'Entry deleted successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  // Bill Payment functions
  const openBillPayments = async (type, bill) => {
    setPaymentBillType(type)
    setPaymentBill(bill)
    setIsPaymentDrawerOpen(true)
    
    try {
      let payments = []
      if (type === 'expense') {
        payments = await apiCall(`/expense-bills/${bill.id}/payments`)
      } else if (type === 'commission') {
        payments = await apiCall(`/commission-bills/${bill.id}/payments`)
      } else if (type === 'margin') {
        payments = await apiCall(`/margin-bills/${bill.id}/payments`)
      }
      setBillPayments(payments)
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      })
    }
  }

  const handleAddBillPayment = async (formData) => {
    try {
      if (paymentBillType === 'expense') {
        await apiCall(`/expense-bills/${paymentBill.id}/payments`, 'POST', formData)
      } else if (paymentBillType === 'commission') {
        await apiCall(`/commission-bills/${paymentBill.id}/payments`, 'POST', formData)
      } else if (paymentBillType === 'margin') {
        await apiCall(`/margin-bills/${paymentBill.id}/payments`, 'POST', formData)
      }
      
      await openBillPayments(paymentBillType, paymentBill)
      await loadSocietyData()
      
      toast({ title: 'Success', description: 'Payment added successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleDeleteBillPayment = async (paymentId) => {
    try {
      if (paymentBillType === 'expense') {
        await apiCall(`/expense-payments/${paymentId}`, 'DELETE')
      } else if (paymentBillType === 'commission') {
        await apiCall(`/commission-payments/${paymentId}`, 'DELETE')
      } else if (paymentBillType === 'margin') {
        await apiCall(`/margin-payments/${paymentId}`, 'DELETE')
      }

      await openBillPayments(paymentBillType, paymentBill)
      await loadSocietyData()

      toast({ title: 'Success', description: 'Payment deleted successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleUpdateBillPayment = async (paymentId, formData) => {
    try {
      if (paymentBillType === 'expense') {
        await apiCall(`/expense-payments/${paymentId}`, 'PUT', formData)
      } else if (paymentBillType === 'commission') {
        await apiCall(`/commission-payments/${paymentId}`, 'PUT', formData)
      } else if (paymentBillType === 'margin') {
        await apiCall(`/margin-payments/${paymentId}`, 'PUT', formData)
      }

      await openBillPayments(paymentBillType, paymentBill)
      await loadSocietyData()

      toast({ title: 'Success', description: 'Payment updated successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
      throw error
    }
  }

  // Vendor Ledger functions
  // Builds a unified Daily-Khata-style timeline by merging the vendor's
  // expense bills (Work entries) with payments returned by the legacy
  // /ledger endpoint. Balance is computed chronologically (older → newer)
  // then displayed reverse-chronological so the latest activity sits on top.
  const openVendorLedger = async (vendor) => {
    setVendorLedgerItem(vendor)
    setIsVendorLedgerOpen(true)

    try {
      // Always fetch fresh. Use bill-level payments endpoint (only "alive"
      // payments) instead of /vendors/:id/ledger, which leaves stale txns
      // behind when a payment is edited and double-counts the totals.
      // companyScope swaps the URL to the no-society variant so the drawer
      // shows the vendor's company-level bills instead of a society's.
      const billsUrl = companyScope
        ? '/expense-bills?scope=COMPANY'
        : `/expense-bills?societyId=${selectedSociety}`
      const allBills = await apiCall(billsUrl)
      const billsForVendor = (allBills || []).filter(b => b.vendorId === vendor.id)

      const paymentBundles = await Promise.all(
        billsForVendor.map(b =>
          (b.totalPaid > 0)
            ? apiCall(`/expense-bills/${b.id}/payments`).then(ps => ({ billId: b.id, payments: ps || [] }))
            : Promise.resolve({ billId: b.id, payments: [] })
        )
      )

      const workEntries = billsForVendor.map(b => {
        const isLabour = /labour/i.test(b.categoryName || '')
        return {
          id: `work-${b.id}`,
          sourceId: b.id,
          raw: b,                      // full bill for edit dialog
          date: b.billDate || b.createdAt,
          createdAt: b.createdAt || b.billDate,
          type: 'WORK',
          subType: isLabour ? 'LABOUR' : 'WORK',
          description: b.description || b.categoryName || (isLabour ? 'Labour' : 'Work'),
          categoryName: b.categoryName || '',
          workValue: b.billAmount || 0,
          paymentAmount: 0,
          reference: '',
        }
      })
      const paymentEntries = paymentBundles.flatMap(({ billId, payments }) =>
        payments.map(p => {
          const isWithdrawal = p.type === 'WITHDRAWAL'
          return {
            id: p.id,
            sourceId: p.id,            // ExpensePayment.id — correct for DELETE
            raw: { ...p, billId },     // full payment for edit dialog
            billId,
            date: p.paymentDate || p.createdAt,
            createdAt: p.createdAt || p.paymentDate,
            type: isWithdrawal ? 'WITHDRAWAL' : 'PAYMENT',
            subType: isWithdrawal ? 'WITHDRAWAL' : 'PAYMENT',
            description: p.remark || (isWithdrawal ? 'Withdrawal' : 'Payment made'),
            categoryName: '',
            workValue: 0,
            // Withdrawals show as negative payment for the running balance
            // (vendor receives less net, so we owe more).
            paymentAmount: isWithdrawal ? -(p.amount || 0) : (p.amount || 0),
            paymentMode: p.paymentMode || 'Cash',
            reference: p.referenceNo || '',
          }
        })
      )

      // Chronological order: primary sort by user-facing date, secondary by
      // createdAt timestamp so same-day rows respect actual creation order.
      // Display is reverse-chronological (newest first) after balance calc.
      const merged = [...workEntries, ...paymentEntries].sort((a, b) => {
        const da = new Date(a.date).getTime() || 0
        const db = new Date(b.date).getTime() || 0
        if (da !== db) return da - db
        const ca = new Date(a.createdAt).getTime() || 0
        const cb = new Date(b.createdAt).getTime() || 0
        return ca - cb
      })
      let running = 0
      const withBalance = merged.map(e => {
        running += (e.workValue || 0) - (e.paymentAmount || 0)
        return { ...e, amount: e.paymentAmount, balance: running }
      })
      setVendorLedgerEntries(withBalance.reverse())
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      })
    }
  }

  // Global Ledger — fetch all bills + payments for the current vendor-ledger
  // scope (regular vendors OR Commission vendors, depending on the page) and
  // build a single chronological timeline. Read-only view.
  const openGlobalLedger = async () => {
    setIsGlobalLedgerOpen(true)
    setGlobalLedgerLoading(true)
    try {
      // Match the same scope rule used by vendorLedgerRows so the global
      // view stays consistent with the per-vendor list on this page.
      const scopedVendors = vendors.filter(v => {
        if (v.type === 'Broker') return false
        if (vendorLedgerScope === 'commission') return v.type === 'Commission'
        return v.type !== 'Commission'
      })
      const vendorIds = new Set(scopedVendors.map(v => v.id))
      const vendorById = new Map(scopedVendors.map(v => [v.id, v]))

      // companyScope hits the company-level bills endpoint; without this swap
      // we'd request `?societyId=null` which the backend treats as "no bills"
      // and the drawer renders the empty state.
      const billsUrl = companyScope
        ? '/expense-bills?scope=COMPANY'
        : `/expense-bills?societyId=${selectedSociety}`
      const allBills = await apiCall(billsUrl)
      const scopedBills = (allBills || []).filter(b => vendorIds.has(b.vendorId))

      const paymentBundles = await Promise.all(
        scopedBills.map(b =>
          apiCall(`/expense-bills/${b.id}/payments`)
            .then(ps => ({ billId: b.id, payments: ps || [] }))
            .catch(() => ({ billId: b.id, payments: [] }))
        )
      )

      const workEntries = scopedBills.map(b => {
        const isLabour = /labour/i.test(b.categoryName || '')
        const vendor = vendorById.get(b.vendorId)
        return {
          id: `work-${b.id}`,
          sourceId: b.id,
          raw: b,
          vendorId: b.vendorId,
          vendorName: vendor?.name || b.vendorName || '—',
          date: b.billDate || b.createdAt,
          createdAt: b.createdAt || b.billDate,
          type: 'WORK',
          subType: isLabour ? 'LABOUR' : 'WORK',
          description: b.description || b.categoryName || (isLabour ? 'Labour' : 'Work'),
          categoryName: b.categoryName || '',
          workValue: b.billAmount || 0,
          paymentAmount: 0,
          reference: '',
        }
      })
      const paymentEntries = paymentBundles.flatMap(({ billId, payments }) => {
        const bill = scopedBills.find(b => b.id === billId)
        const vendor = vendorById.get(bill?.vendorId)
        const vendorName = vendor?.name || bill?.vendorName || '—'
        return payments.map(p => {
          const isWithdrawal = p.type === 'WITHDRAWAL'
          return {
            id: p.id,
            sourceId: p.id,
            raw: { ...p, billId },
            billId,
            vendorId: bill?.vendorId,
            vendorName,
            date: p.paymentDate || p.createdAt,
            createdAt: p.createdAt || p.paymentDate,
            type: isWithdrawal ? 'WITHDRAWAL' : 'PAYMENT',
            subType: isWithdrawal ? 'WITHDRAWAL' : 'PAYMENT',
            description: p.remark || (isWithdrawal ? 'Withdrawal' : 'Payment made'),
            categoryName: bill?.categoryName || '',
            workValue: 0,
            paymentAmount: isWithdrawal ? -(p.amount || 0) : (p.amount || 0),
            paymentMode: p.paymentMode || 'Cash',
            reference: p.referenceNo || '',
          }
        })
      })

      // Newest-first by createdAt — the user wants the most recently logged
      // entry at the top regardless of its backdated transaction date, so a
      // late-recorded bill from last week still surfaces above older ones.
      // Falls back to the transaction date when createdAt is missing.
      const merged = [...workEntries, ...paymentEntries].sort((a, b) => {
        const ca = new Date(a.createdAt || a.date).getTime() || 0
        const cb = new Date(b.createdAt || b.date).getTime() || 0
        return cb - ca
      })
      setGlobalLedgerEntries(merged)
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setGlobalLedgerLoading(false)
    }
  }

  // Global Ledger CSV — exports the entire (unfiltered) timeline. Filtering
  // applies in the drawer's UI; export captures everything for archival.
  const exportGlobalLedgerToCSV = () => {
    if (!globalLedgerEntries.length) return
    const headers = ['Date', 'Vendor', 'Type', 'Description', 'Work Value', 'Payment', 'Mode', 'Reference']
    const rows = globalLedgerEntries.map(e => [
      e.date || '',
      e.vendorName || '',
      e.type === 'WITHDRAWAL' ? 'Withdrawal' : e.subType === 'LABOUR' ? 'Labour' : e.type === 'WORK' ? 'Work' : 'Payment',
      (e.description || '').replace(/"/g, '""'),
      e.workValue || 0,
      e.paymentAmount || 0,
      e.paymentMode || '',
      e.reference || '',
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${vendorLedgerScope === 'commission' ? 'commission' : 'vendor'}_ledger_global_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Vendor Ledger Drawer actions — wired from the drawer back into the
  // page-level dialog state so the existing Add Work / Add Payment flows
  // are reused (no duplicate forms).
  const handleVendorDetailAddWork = (vendor, opts = {}) => {
    setAddWorkVendor(vendor)
    setCurrentItem(null)
    if (opts.preselectLabour) {
      // The Add-Labour shortcut: keep vendor pre-filled but also hint that
      // a Labour-category bill is being added. ExpenseBillForm picks up
      // initialData.category to find the matching id.
      // (Falls back to first category if "Labour" doesn't exist.)
      setAddWorkVendor({ ...vendor, _preselectLabour: true })
    } else if (opts.preselectQuickPay) {
      // Quick Pay shortcut: same Add-Work dialog, but with "Payment Made Now"
      // pre-checked and paid amount auto-synced to the bill amount (full pay
      // in one shot — work + payment recorded together).
      setAddWorkVendor({ ...vendor, _preselectQuickPay: true })
    }
    setDialogMode('createExpenseBill')
    setIsDialogOpen(true)
  }
  const handleVendorDetailAddPayment = async (vendor) => {
    const allBills = expenseBills.filter(b => b.vendorId === vendor.id)
    const unpaid = allBills
      .filter(b => b.status !== 'PAID')
      .sort((a, b) => new Date(a.billDate) - new Date(b.billDate))   // FIFO for payment
    const paid = allBills
      .filter(b => (b.totalPaid || 0) > 0)
      .sort((a, b) => new Date(b.billDate) - new Date(a.billDate))   // LIFO for withdrawal
    const totalPending = unpaid.reduce((s, b) => s + (b.balance || 0), 0)
    const totalPaidAll = paid.reduce((s, b) => s + (b.totalPaid || 0), 0)
    if (totalPending <= 0 && totalPaidAll <= 0) {
      toast({
        title: 'No bills to act on',
        description: `Add a work entry for ${vendor.name} first.`,
        variant: 'destructive'
      })
      return
    }
    // Single dialog drives both Payment (FIFO across unpaid) and Withdrawal
    // (LIFO across paid). User picks the entry type inside the dialog.
    setAddingVendorPayment({ vendor, unpaidBills: unpaid, paidBills: paid, totalPending, totalPaid: totalPaidAll })
  }

  // Allocate the entered amount across bills, type-aware:
  //   PAYMENT     → FIFO over unpaidBills (oldest first), capped by balance
  //   WITHDRAWAL  → LIFO over paidBills (newest first), capped by totalPaid
  // Each chunk hits POST /expense-bills/:id/payments with the right `type`
  // so the backend handles the IN/OUT direction and paidAmount delta.
  const handleSubmitVendorAddPayment = async (formData) => {
    const ctx = addingVendorPayment
    if (!ctx) return
    const amount = parseFloat(formData.amount)
    if (!(amount > 0)) return
    const isWithdrawal = formData.type === 'WITHDRAWAL'
    const sourceBills = isWithdrawal ? ctx.paidBills : ctx.unpaidBills
    try {
      let remaining = amount
      const allocations = []
      for (const bill of sourceBills) {
        if (remaining <= 0) break
        const cap = isWithdrawal
          ? Math.max(0, bill.totalPaid || 0)
          : Math.max(0, bill.balance || 0)
        if (cap <= 0) continue
        const portion = Math.min(remaining, cap)
        await apiCall(`/expense-bills/${bill.id}/payments`, 'POST', {
          amount: portion,
          type: isWithdrawal ? 'WITHDRAWAL' : 'PAYMENT',
          paymentDate: formData.paymentDate,
          paymentMode: formData.paymentMode,
          accountId: formData.accountId,
          referenceNo: formData.referenceNo,
          remark: formData.remark,
        })
        allocations.push({ billId: bill.id, amount: portion })
        remaining -= portion
      }
      setAddingVendorPayment(null)
      if (vendorLedgerItem) await openVendorLedger(vendorLedgerItem)
      await loadSocietyData()
      const label = isWithdrawal ? 'Withdrawal' : 'Payment'
      toast({
        title: `${label} recorded`,
        description: `₹${fmt(amount - remaining)} across ${allocations.length} bill${allocations.length > 1 ? 's' : ''}${remaining > 0 ? ` (₹${fmt(remaining)} not allocated)` : ''}`,
      })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  // Deletes a single entry from the vendor ledger timeline. Routes to the
  // correct backend endpoint based on entry type, then re-fetches the
  // ledger so the running balance and stats update in place.
  const handleVendorLedgerDelete = async (entry) => {
    if (!entry || !entry.sourceId || !vendorLedgerItem) return
    try {
      if (entry.type === 'WORK') {
        await apiCall(`/expense-bills/${entry.sourceId}`, 'DELETE')
      } else if (entry.type === 'PAYMENT' || entry.type === 'WITHDRAWAL') {
        // Both Payment and Withdrawal live in the ExpensePayment collection;
        // the backend reads the row's `type` and reverses the right way.
        await apiCall(`/expense-payments/${entry.sourceId}`, 'DELETE')
      } else {
        return
      }
      const label = entry.type === 'WORK'
        ? 'Work entry'
        : entry.type === 'WITHDRAWAL' ? 'Withdrawal' : 'Payment'
      toast({ title: 'Deleted', description: `${label} deleted` })
      await openVendorLedger(vendorLedgerItem)
      await loadSocietyData()
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleCreateSociety = async (formData) => {
    try {
      await apiCall('/societies', 'POST', formData)
      await loadSocieties()
      setIsDialogOpen(false)
      toast({ title: 'Success', description: 'Society created successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleDeleteSociety = async (societyId) => {
    try {
      await apiCall(`/societies/${societyId}`, 'DELETE')
      await loadSocieties()
      setSelectedSociety(null)
      toast({ title: 'Success', description: 'Society and all related data deleted' })
      return { success: true }
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
      return { success: false, error: error.message }
    }
  }

  const handleCleanupOrphans = async () => {
    try {
      const result = await apiCall('/cleanup-orphans', 'POST')
      toast({ title: 'Cleanup Complete', description: result.message })
      await loadSocieties()
      return result
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleCreatePartner = async (formData) => {
    try {
      await apiCall(`/societies/${selectedSociety}/partners`, 'POST', formData)
      await loadSocietyData()
      setIsDialogOpen(false)
      toast({ title: 'Success', description: 'Partner added successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleUpdatePartner = async (formData) => {
    try {
      await apiCall(`/partners/${editingPartner.id}`, 'PUT', formData)
      await loadSocietyData()
      setEditingPartner(null)
      toast({ title: 'Success', description: 'Partner updated successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleDeletePartner = async (partnerId) => {
    try {
      await apiCall(`/partners/${partnerId}`, 'DELETE')
      await loadSocietyData()
      toast({ title: 'Success', description: 'Partner deleted successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  // ============ CUSTOMER & PAYMENT ALLOCATION HANDLERS ============
  
  const handleCreateCustomer = async (formData) => {
    try {
      await apiCall('/customers', 'POST', { ...formData, societyId: selectedSociety })
      await loadSocietyData()
      setShowCustomerForm(false)
      setEditingCustomer(null)
      toast({ title: 'Success', description: 'Customer added successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }
  
  const handleUpdateCustomer = async (formData) => {
    try {
      await apiCall(`/customers/${editingCustomer.id}`, 'PUT', formData)
      await loadSocietyData()
      setShowCustomerForm(false)
      setEditingCustomer(null)
      toast({ title: 'Success', description: 'Customer updated successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }
  
  const handleDeleteCustomer = async (customerId) => {
    if (!confirm('Are you sure you want to delete this customer?')) return
    try {
      await apiCall(`/customers/${customerId}`, 'DELETE')
      await loadSocietyData()
      toast({ title: 'Success', description: 'Customer deleted successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }
  
  const handleCreatePayment = async (formData) => {
    try {
      // Strip the FE-only flag before posting — the backend doesn't know
      // (or care) about whether the user wants the allocation modal next.
      const { skipAllocation, ...payload } = formData
      const result = await apiCall('/customer-payments', 'POST', payload)

      // AUTO-REFRESH: Update all related data immediately after payment creation
      // 1. Refresh customer payments list (go to first page to see new payment at top)
      await loadCustomerPayments(1, customerPaymentsPagination.limit)

      // 2. Refresh customers list (updates Total Paid, Balance for each customer)
      const customersData = await apiCall(`/customers?societyId=${selectedSociety}`)
      setCustomers(customersData || [])

      // 3. Refresh sales data (updates payment received status on sales)
      const salesData = await apiCall(`/societies/${selectedSociety}/sales`)
      if (salesData.sales) {
        setSales(salesData.sales)
        setSalesSummary(salesData.summary)
      } else {
        setSales(salesData)
      }

      // 4. Refresh summary (updates Total Payments Received in dashboard)
      const summaryData = await apiCall(`/societies/${selectedSociety}/summary`)
      setSummary(summaryData)

      setShowPaymentForm(false)

      if (skipAllocation) {
        // Direct Add path: skip the allocation modal entirely. The payment
        // lives in the Customer Payments table as unallocated; the user can
        // edit / delete / allocate it later from the same row's actions.
        toast({ title: 'Success', description: 'Payment recorded as direct add.' })
        return
      }

      // Immediately open allocation modal
      const customerSales = await apiCall(`/customers/${formData.customerId}/sales`)
      setCustomerSalesForAllocation(customerSales)
      setCurrentPaymentForAllocation({ ...result, allocatedAmount: 0 })
      setShowAllocationModal(true)

      toast({ title: 'Success', description: 'Payment recorded. Now allocate to flats.' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }
  
  const handleUpdatePayment = async (formData) => {
    if (!editingPayment) return
    try {
      await apiCall(`/customer-payments/${editingPayment.id}`, 'PUT', formData)

      // Mirror handleCreatePayment's refresh fan-out so balances stay in sync
      // across the dashboard, customer list, sales, and summary cards.
      await loadCustomerPayments(customerPaymentsPagination.page, customerPaymentsPagination.limit)
      const customersData = await apiCall(`/customers?societyId=${selectedSociety}`)
      setCustomers(customersData || [])
      const salesData = await apiCall(`/societies/${selectedSociety}/sales`)
      if (salesData.sales) {
        setSales(salesData.sales)
        setSalesSummary(salesData.summary)
      } else {
        setSales(salesData)
      }
      const summaryData = await apiCall(`/societies/${selectedSociety}/summary`)
      setSummary(summaryData)

      setShowPaymentForm(false)
      setEditingPayment(null)
      toast({ title: 'Success', description: 'Payment updated' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const openEditPayment = (payment) => {
    setEditingPayment(payment)
    setShowPaymentForm(true)
  }

  const handleDeletePayment = async (paymentId) => {
    if (!confirm('Are you sure you want to delete this payment? This will create a reversal entry and remove all allocations.')) return
    
    // Optimistic UI update
    const previousPayments = [...customerPayments]
    setCustomerPayments(prev => prev.filter(p => p.id !== paymentId))
    
    try {
      await apiCall(`/customer-payments/${paymentId}`, 'DELETE')
      
      // AUTO-REFRESH: Update all related data immediately after payment deletion
      // 1. Refresh customer payments with current pagination
      const currentPage = customerPayments.length === 1 && customerPaymentsPagination.page > 1 
        ? customerPaymentsPagination.page - 1 
        : customerPaymentsPagination.page
      await loadCustomerPayments(currentPage, customerPaymentsPagination.limit)
      
      // 2. Refresh customers list (updates Total Paid, Balance for each customer)
      const customersData = await apiCall(`/customers?societyId=${selectedSociety}`)
      setCustomers(customersData || [])
      
      // 3. Refresh sales data (updates payment received status on sales)
      const salesData = await apiCall(`/societies/${selectedSociety}/sales`)
      if (salesData.sales) {
        setSales(salesData.sales)
        setSalesSummary(salesData.summary)
      } else {
        setSales(salesData)
      }
      
      // 4. Refresh summary (updates Total Payments Received in dashboard)
      const summaryData = await apiCall(`/societies/${selectedSociety}/summary`)
      setSummary(summaryData)
      
      toast({ title: 'Success', description: 'Payment deleted successfully' })
    } catch (error) {
      // Rollback on error
      setCustomerPayments(previousPayments)
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }
  
  const openAllocationModal = async (payment) => {
    try {
      const customerSales = await apiCall(`/customers/${payment.customerId}/sales`)
      const existingAllocations = await apiCall(`/customer-payments/${payment.id}/allocations`)

      // Merge existing allocations into sales data. Resale rows (`_isResale`)
      // match on `resaleDealId`, sale rows on `saleId` — the allocation record
      // carries one or the other depending on which target it was saved for.
      const salesWithAllocations = customerSales.map(row => {
        const existing = row._isResale
          ? existingAllocations.find(a => a.resaleDealId === row.id)
          : existingAllocations.find(a => a.saleId === row.id)
        return {
          ...row,
          currentAllocation: existing?.allocatedAmount || 0,
        }
      })

      setCustomerSalesForAllocation(salesWithAllocations)
      setCurrentPaymentForAllocation(payment)
      setShowAllocationModal(true)
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }
  
  const handleSaveAllocations = async (allocations) => {
    try {
      await apiCall(`/customer-payments/${currentPaymentForAllocation.id}/allocations`, 'POST', {
        allocations: allocations.filter(a => a.amount > 0)
      })
      
      // AUTO-REFRESH: Update all related data immediately after allocation save
      // 1. Refresh customer payments with current pagination
      await loadCustomerPayments(customerPaymentsPagination.page, customerPaymentsPagination.limit)
      
      // 2. Refresh customers list (updates allocated amounts)
      const customersData = await apiCall(`/customers?societyId=${selectedSociety}`)
      setCustomers(customersData || [])
      
      // 3. Refresh sales data (updates allocation status on sales)
      const salesData = await apiCall(`/societies/${selectedSociety}/sales`)
      if (salesData.sales) {
        setSales(salesData.sales)
        setSalesSummary(salesData.summary)
      } else {
        setSales(salesData)
      }
      
      setShowAllocationModal(false)
      setCurrentPaymentForAllocation(null)
      toast({ title: 'Success', description: 'Allocations saved successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }
  
  // Handle creating a sale from within the allocation modal
  const handleCreateSaleInModal = async (formData) => {
    try {
      await apiCall(`/societies/${selectedSociety}/sales`, 'POST', formData)
      await loadSocietyData()
      toast({ title: 'Success', description: 'Sale created successfully. You can now allocate to this sale.' })
      
      // Refresh the sales list for allocation modal
      if (currentPaymentForAllocation) {
        const customerSales = await apiCall(`/customers/${currentPaymentForAllocation.customerId}/sales`)
        const existingAllocations = await apiCall(`/customer-payments/${currentPaymentForAllocation.id}/allocations`)
        const salesWithAllocations = customerSales.map(row => {
          const existing = row._isResale
            ? existingAllocations.find(a => a.resaleDealId === row.id)
            : existingAllocations.find(a => a.saleId === row.id)
          return {
            ...row,
            currentAllocation: existing?.allocatedAmount || 0,
          }
        })
        setCustomerSalesForAllocation(salesWithAllocations)
      }
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }
  
  const openCustomerLedger = async (customer) => {
    try {
      const ledgerData = await apiCall(`/customers/${customer.id}/ledger`)
      setCustomerLedgerData({ ...ledgerData, customer })
      setShowCustomerLedger(true)
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleCreateInventory = async (formData) => {
    try {
      await apiCall(`/societies/${selectedSociety}/inventory`, 'POST', formData)
      await loadSocietyData()
      setIsDialogOpen(false)
      toast({ title: 'Success', description: 'Inventory created successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleCreatePurchase = async (formData) => {
    try {
      await apiCall(`/societies/${selectedSociety}/purchases`, 'POST', formData)
      await loadSocietyData()
      setIsDialogOpen(false)
      toast({ title: 'Success', description: 'Purchase created successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleDeletePurchase = async (purchaseId) => {
    try {
      await apiCall(`/purchases/${purchaseId}`, 'DELETE')
      await loadSocietyData()
      toast({ title: 'Success', description: 'Purchase deleted successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleUpdatePurchase = async (formData) => {
    if (!editingPurchase?.id) return
    try {
      await apiCall(`/purchases/${editingPurchase.id}`, 'PUT', formData)
      await loadSocietyData()
      setEditingPurchase(null)
      toast({ title: 'Success', description: 'Purchase updated successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleCreateSale = async (formData) => {
    try {
      // Multi-flat form sends `items[]`. Sequentially POST one Sale per item
      // so inventory `Sold` flips and any per-sale daybook entries happen in
      // the same order as the list. Single-flat callers still work — they
      // either omit `items` or send legacy top-level fields.
      const { items, ...shared } = formData
      if (Array.isArray(items) && items.length > 0) {
        const errors = []
        for (const it of items) {
          try {
            await apiCall(`/societies/${selectedSociety}/sales`, 'POST', { ...shared, ...it })
          } catch (perItemErr) {
            const inv = inventory.find(i => i.id === it.inventoryId)
            const label = inv ? `${inv.type} ${inv.inventoryNumber}` : 'flat'
            errors.push(`${label}: ${perItemErr.message || 'failed'}`)
          }
        }
        await refreshAfterSaleChange()
        setIsDialogOpen(false)
        if (errors.length) {
          toast({
            title: errors.length === items.length ? 'All sales failed' : 'Some sales failed',
            description: errors.join('\n'),
            variant: 'destructive',
          })
        } else {
          toast({
            title: 'Success',
            description: items.length > 1 ? `${items.length} sales created` : 'Sale created successfully',
          })
        }
        return
      }

      await apiCall(`/societies/${selectedSociety}/sales`, 'POST', formData)
      await refreshAfterSaleChange()
      setIsDialogOpen(false)
      toast({ title: 'Success', description: 'Sale created successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  // Force-refresh the sales list after create/edit/delete. loadSocietyData
  // is gated by the visited-tabs cache — if the user reached the sale form
  // via a flow that didn't mark 'sales' as visited (e.g. dashboard quick
  // action) the list stays stale. Calling the loader directly sidesteps
  // that and also reloads inventory so Sold flags update in real time.
  const refreshAfterSaleChange = async () => {
    if (!selectedSociety) return
    try {
      await Promise.all([
        loadSalesTab(),
        loadSocietySummary(),
      ])
      loadedTabsRef.current.add('sales')
    } catch (err) {
      console.error('refreshAfterSaleChange failed', err)
    }
  }

  // Inventory Edit/Delete handlers
  const handleEditInventory = async (formData) => {
    try {
      await apiCall(`/inventory/${editingInventory.id}`, 'PUT', formData)
      await loadSocietyData()
      setEditingInventory(null)
      setIsDialogOpen(false)
      toast({ title: 'Success', description: 'Inventory updated successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleDeleteInventory = async (inventoryId) => {
    try {
      await apiCall(`/inventory/${inventoryId}`, 'DELETE')
      await loadSocietyData()
      toast({ title: 'Success', description: 'Inventory deleted successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  // Sale View/Edit/Delete handlers
  const handleViewSale = async (saleId) => {
    try {
      const saleData = await apiCall(`/sales/${saleId}`)
      setViewSaleData(saleData)
      setViewSaleId(saleId)
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleEditSale = async (formData) => {
    try {
      await apiCall(`/sales/${editingSale.id}`, 'PUT', formData)
      await refreshAfterSaleChange()
      setEditingSale(null)
      setIsDialogOpen(false)
      toast({ title: 'Success', description: 'Sale updated successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleDeleteSale = async (saleId) => {
    try {
      await apiCall(`/sales/${saleId}`, 'DELETE')
      await refreshAfterSaleChange()
      toast({ title: 'Success', description: 'Sale and related entries deleted successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  // CSV Export for Sales
  const exportSalesToCSV = () => {
    if (!sales || sales.length === 0) {
      toast({ title: 'No Data', description: 'No sales to export', variant: 'destructive' })
      return
    }
    
    const headers = ['Inventory No', 'Customer', 'Phone', 'Deal Price', 'Discount', 'Final Amount', 'Paid', 'Balance', 'Status', 'Sale Date']
    const rows = sales.map(sale => [
      sale.inventoryNumber || '',
      sale.customerName,
      sale.customerPhone,
      sale.dealPrice,
      sale.discount,
      sale.finalAmount,
      sale.totalPaid,
      sale.balance,
      sale.status,
      sale.saleDate ? new Date(sale.saleDate).toLocaleDateString() : ''
    ])
    
    const csvContent = [headers.join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sales_${selectedSociety}_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Recycle Bin handlers
  const loadRecycleBin = async () => {
    try {
      const data = await apiCall('/admin/recycle-bin' + (recycleBinFilter ? `?type=${recycleBinFilter}` : ''))
      setRecycleBinData(data)
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const restoreRecord = async (collectionName, recordId) => {
    try {
      await apiCall(`/admin/restore/${collectionName}/${recordId}`, 'POST')
      toast({ title: 'Success', description: 'Record restored successfully' })
      loadRecycleBin()
      if (selectedSociety) loadSocietyData()
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const permanentDeleteRecord = async (collectionName, recordId) => {
    try {
      await apiCall(`/admin/permanent-delete/${collectionName}/${recordId}`, 'DELETE')
      toast({ title: 'Success', description: 'Record permanently deleted' })
      loadRecycleBin()
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  // Audit Log handlers — fetches up to `pageSize` rows from the server so the
  // selected page size matches what the user sees. Search + paging beyond the
  // fetched window is then handled client-side.
  const loadAuditLogs = async (size) => {
    try {
      const limit = size || auditLogsFilters.pageSize || 50
      const data = await apiCall(`/admin/audit-logs?limit=${limit}`)
      setAuditLogsData(data)
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  // Vendor Management
  const handleCreateVendor = async (formData) => {
    try {
      // companyScope vendors are unscoped (societyId=null) so they show up
      // in every society's vendor ledger by virtue of being "shared".
      const societyId = companyScope ? null : selectedSociety
      await apiCall('/vendors', 'POST', { ...formData, societyId })
      if (companyScope) {
        await loadVendorsTab()
        await loadExpensesTab()
      } else {
        await loadSocietyData()
      }
      setIsDialogOpen(false)
      toast({ title: 'Success', description: 'Vendor created successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleUpdateVendor = async (vendorId, formData) => {
    try {
      await apiCall(`/vendors/${vendorId}`, 'PUT', formData)
      await loadSocietyData()
      setIsDialogOpen(false)
      toast({ title: 'Success', description: 'Vendor updated successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleDeleteVendor = async (vendorId) => {
    try {
      await apiCall(`/vendors/${vendorId}`, 'DELETE')
      await loadSocietyData()
      toast({ title: 'Success', description: 'Vendor deleted successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  // Expense Bill Management
  const handleCreateExpenseBill = async (formData) => {
    try {
      // `initialPayment` lives on the form payload only — the bill endpoint
      // doesn't accept it, so strip it before POSTing and replay it as a
      // separate POST to /payments once we have the new bill id.
      const { initialPayment, ...billBody } = formData
      // companyScope routes bills to the no-society path. Backend reads
      // `scope=COMPANY` to null-out the societyId on the persisted bill.
      const scopedBody = companyScope
        ? { ...billBody, societyId: null, scope: 'COMPANY' }
        : { ...billBody, societyId: selectedSociety }
      const bill = await apiCall('/expense-bills', 'POST', scopedBody)

      if (initialPayment && bill?.id && initialPayment.amount > 0) {
        try {
          await apiCall(`/expense-bills/${bill.id}/payments`, 'POST', initialPayment)
        } catch (payErr) {
          // Bill saved but payment failed — surface it so the user can retry
          // the payment manually instead of losing the work entry.
          toast({
            title: 'Work saved, payment failed',
            description: payErr.message || 'Add the payment from the bill drawer.',
            variant: 'destructive',
          })
          await loadSocietyData()
          if (vendorLedgerItem) await openVendorLedger(vendorLedgerItem)
          setIsDialogOpen(false)
          return
        }
      }

      await loadSocietyData()
      if (vendorLedgerItem) await openVendorLedger(vendorLedgerItem)
      setIsDialogOpen(false)
      toast({
        title: 'Success',
        description: initialPayment ? 'Work entry saved with payment' : 'Expense bill created successfully',
      })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleUpdateExpenseBill = async (formData) => {
    if (!editingExpenseBill?.id) return
    try {
      await apiCall(`/expense-bills/${editingExpenseBill.id}`, 'PUT', formData)
      await loadSocietyData()
      setEditingExpenseBill(null)
      // If the vendor ledger drawer is open, refresh its timeline so the
      // edited work entry's new value/category/date is reflected.
      if (vendorLedgerItem) await openVendorLedger(vendorLedgerItem)
      toast({ title: 'Success', description: 'Expense bill updated successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  // Vendor-ledger edit dispatch — routes the click to the right edit
  // surface (existing ExpenseBillForm dialog for Work, new dialog for
  // Payment). Drawer stays open behind the overlay.
  const handleVendorLedgerEdit = (entry) => {
    if (!entry || !entry.raw) return
    if (entry.type === 'WORK') {
      setEditingExpenseBill(entry.raw)
    } else if (entry.type === 'PAYMENT' || entry.type === 'WITHDRAWAL') {
      // Same edit dialog for both — the payment row's `type` field on the
      // backend lets the update handler keep the right IN/OUT semantics.
      setEditingVendorPayment(entry.raw)
    }
  }

  const handleSubmitVendorPaymentEdit = async (formData) => {
    if (!editingVendorPayment?.id) return
    try {
      await apiCall(`/expense-payments/${editingVendorPayment.id}`, 'PUT', formData)
      setEditingVendorPayment(null)
      if (vendorLedgerItem) await openVendorLedger(vendorLedgerItem)
      await loadSocietyData()
      toast({ title: 'Success', description: 'Payment updated' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleDeleteExpenseBill = async (billId) => {
    try {
      await apiCall(`/expense-bills/${billId}`, 'DELETE')
      await loadSocietyData()
      toast({ title: 'Success', description: 'Expense bill deleted successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  // Commission Bill Management
  const handleCreateCommissionBill = async (formData) => {
    try {
      await apiCall('/commission-bills', 'POST', { ...formData, societyId: selectedSociety })
      await loadSocietyData()
      setIsDialogOpen(false)
      toast({ title: 'Success', description: 'Commission bill created successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleDeleteCommissionBill = async (billId) => {
    try {
      await apiCall(`/commission-bills/${billId}`, 'DELETE')
      await loadSocietyData()
      toast({ title: 'Success', description: 'Commission bill deleted successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleUpdateCommissionBill = async (formData) => {
    if (!editingCommissionBill?.id) return
    try {
      await apiCall(`/commission-bills/${editingCommissionBill.id}`, 'PUT', formData)
      await loadSocietyData()
      setEditingCommissionBill(null)
      toast({ title: 'Success', description: 'Commission bill updated successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  // Margin Bill Management — mirrors Commission Bill flow but the bill is
  // attached to a ResaleDeal instead of a broker vendor + sale.
  const handleCreateMarginBill = async (formData) => {
    try {
      // Mirror the expense flow — strip the inline payment, create the bill,
      // then replay the payment as a POST to /payments. Saves a second click
      // when the user is recording an advance/full payment with the entry.
      const { initialPayment, ...billBody } = formData
      const bill = await apiCall('/margin-bills', 'POST', { ...billBody, societyId: selectedSociety })

      if (initialPayment && bill?.id && initialPayment.amount > 0) {
        try {
          await apiCall(`/margin-bills/${bill.id}/payments`, 'POST', initialPayment)
        } catch (payErr) {
          toast({
            title: 'Margin saved, payment failed',
            description: payErr.message || 'Add the payment from the bill drawer.',
            variant: 'destructive',
          })
          await loadSocietyData()
          setIsDialogOpen(false)
          return
        }
      }

      await loadSocietyData()
      setIsDialogOpen(false)
      toast({
        title: 'Success',
        description: initialPayment ? 'Margin saved with payment' : 'Margin bill created successfully',
      })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleDeleteMarginBill = async (billId) => {
    try {
      await apiCall(`/margin-bills/${billId}`, 'DELETE')
      await loadSocietyData()
      toast({ title: 'Success', description: 'Margin bill deleted successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleUpdateMarginBill = async (formData) => {
    if (!editingMarginBill?.id) return
    try {
      await apiCall(`/margin-bills/${editingMarginBill.id}`, 'PUT', formData)
      await loadSocietyData()
      setEditingMarginBill(null)
      toast({ title: 'Success', description: 'Margin bill updated successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  // Resale Deal Management
  const handleCreateResaleDeal = async (formData) => {
    try {
      await apiCall('/resales', 'POST', { ...formData, societyId: selectedSociety })
      await loadSocietyData()
      setIsDialogOpen(false)
      toast({ title: 'Success', description: 'Resale deal created successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleDeleteResaleDeal = async (dealId) => {
    try {
      await apiCall(`/resales/${dealId}`, 'DELETE')
      await loadSocietyData()
      toast({ title: 'Success', description: 'Resale deal deleted successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleCloseResaleDeal = async (dealId) => {
    try {
      await apiCall(`/resales/${dealId}/close`, 'POST')
      await loadSocietyData()
      toast({ title: 'Success', description: 'Deal closed and ownership transferred!' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  // Resale payment drawer functions
  const openResalePayments = async (deal) => {
    setResaleDeal(deal)
    setIsResalePaymentDrawerOpen(true)
    
    try {
      const [buyerPayments, sellerPayouts] = await Promise.all([
        apiCall(`/resales/${deal.id}/buyer-payments`),
        apiCall(`/resales/${deal.id}/seller-payouts`)
      ])
      setResaleBuyerPayments(buyerPayments)
      setResaleSellerPayouts(sellerPayouts)
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      })
    }
  }

  const handleAddBuyerPayment = async (formData) => {
    try {
      await apiCall(`/resales/${resaleDeal.id}/buyer-payments`, 'POST', formData)
      await openResalePayments(resaleDeal)
      await loadSocietyData()
      toast({ title: 'Success', description: 'Buyer payment added successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleDeleteBuyerPayment = async (paymentId) => {
    try {
      await apiCall(`/resales/${resaleDeal.id}/buyer-payments/${paymentId}`, 'DELETE')
      await openResalePayments(resaleDeal)
      await loadSocietyData()
      toast({ title: 'Success', description: 'Buyer payment deleted successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleEditBuyerPayment = async (paymentId, formData) => {
    try {
      await apiCall(`/resales/${resaleDeal.id}/buyer-payments/${paymentId}`, 'PUT', formData)
      await openResalePayments(resaleDeal)
      await loadSocietyData()
      toast({ title: 'Success', description: 'Buyer payment updated successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleAddSellerPayout = async (formData) => {
    try {
      await apiCall(`/resales/${resaleDeal.id}/seller-payouts`, 'POST', formData)
      await openResalePayments(resaleDeal)
      await loadSocietyData()
      toast({ title: 'Success', description: 'Seller payout added successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleDeleteSellerPayout = async (payoutId) => {
    try {
      await apiCall(`/resales/${resaleDeal.id}/seller-payouts/${payoutId}`, 'DELETE')
      await openResalePayments(resaleDeal)
      await loadSocietyData()
      toast({ title: 'Success', description: 'Seller payout deleted successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleEditSellerPayout = async (payoutId, formData) => {
    try {
      await apiCall(`/resales/${resaleDeal.id}/seller-payouts/${payoutId}`, 'PUT', formData)
      await openResalePayments(resaleDeal)
      await loadSocietyData()
      toast({ title: 'Success', description: 'Seller payout updated successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center">
          <Building2 className="w-16 h-16 mx-auto mb-4 text-blue-600 animate-pulse" />
          <p className="text-lg text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="relative flex items-center justify-center min-h-screen auth-bg overflow-hidden p-4">
        <Toaster />
        <div className="absolute inset-0 auth-grid pointer-events-none" />
        <div className="auth-watermark" aria-hidden="true" />

        <div className="relative w-full max-w-md fade-up">
          {/* Brand mark */}
          <div className="flex flex-col items-center mb-8">
            <LoginLogo />
            <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-900">
              Welcome back
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Sign in to manage your real estate societies
            </p>
          </div>

          {/* Card */}
          <div className="glass-panel rounded-2xl p-7 shadow-elevated">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-medium text-slate-700 uppercase tracking-wider">
                  Email address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 bg-white/80 border-slate-200 focus-visible:ring-2 focus-visible:ring-primary/40"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-medium text-slate-700 uppercase tracking-wider">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 bg-white/80 border-slate-200 focus-visible:ring-2 focus-visible:ring-primary/40"
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full h-11 gradient-bg text-white font-semibold shadow-lg hover:shadow-xl hover:opacity-95 transition-all"
              >
                Sign In
              </Button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            Real Estate Society Management & Accounting System
          </p>
        </div>
      </div>
    )
  }

  // Filter expense bills based on filters
  const filteredExpenseBills = expenseBills.filter(bill => {
    if (expenseFilters.status !== 'all' && bill.status !== expenseFilters.status) return false
    if (expenseFilters.vendorId !== 'all' && bill.vendorId !== expenseFilters.vendorId) return false
    if (expenseFilters.categoryId !== 'all' && bill.categoryId !== expenseFilters.categoryId) return false
    if (expenseFilters.startDate && new Date(bill.billDate) < new Date(expenseFilters.startDate)) return false
    if (expenseFilters.endDate && new Date(bill.billDate) > new Date(expenseFilters.endDate)) return false
    const q = (expenseFilters.search || '').trim().toLowerCase()
    if (q) {
      const hay = `${bill.vendorName || ''} ${bill.categoryName || bill.category || ''} ${bill.description || ''} ${bill.referenceNo || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  const expenseBillsPage = slicePage(filteredExpenseBills, expenseFilters.pageSize, expenseFilters.page)

  // Filter commission bills based on filters
  const filteredCommissionBills = commissionBills.filter(bill => {
    if (commissionFilters.status !== 'all' && bill.status !== commissionFilters.status) return false
    if (commissionFilters.brokerId !== 'all' && bill.brokerVendorId !== commissionFilters.brokerId) return false
    if (commissionFilters.startDate && new Date(bill.commissionDate) < new Date(commissionFilters.startDate)) return false
    if (commissionFilters.endDate && new Date(bill.commissionDate) > new Date(commissionFilters.endDate)) return false
    const q = (commissionFilters.search || '').trim().toLowerCase()
    if (q) {
      const hay = `${bill.brokerName || ''} ${bill.customerName || ''} ${bill.inventoryName || ''} ${bill.description || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  const commissionBillsPage = slicePage(filteredCommissionBills, commissionFilters.pageSize, commissionFilters.page)

  // Filter margin bills based on filters
  const filteredMarginBills = marginBills.filter(bill => {
    if (marginFilters.status !== 'all' && bill.status !== marginFilters.status) return false
    if (marginFilters.startDate && new Date(bill.billDate) < new Date(marginFilters.startDate)) return false
    if (marginFilters.endDate && new Date(bill.billDate) > new Date(marginFilters.endDate)) return false
    const q = (marginFilters.search || '').trim().toLowerCase()
    if (q) {
      const hay = `${bill.description || ''} ${bill.remark || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  const marginBillsPage = slicePage(filteredMarginBills, marginFilters.pageSize, marginFilters.page)

  // Calculate expense totals based on filtered data
  const expenseTotals = {
    totalBill: filteredExpenseBills.reduce((sum, b) => sum + b.billAmount, 0),
    totalPaid: filteredExpenseBills.reduce((sum, b) => sum + (b.totalPaid || 0), 0),
    totalBalance: filteredExpenseBills.reduce((sum, b) => sum + (b.balance || 0), 0)
  }

  // Customers list: search by name/phone/notes, date range applies to the
  // customer's createdAt OR any of their payments — so the list shows people
  // who were either added or active in that window. The summary cards above
  // the table use the same date range against customerPayments to show
  // "amount received in this date range".
  const customerSearchLc = (customerFilters.search || '').trim().toLowerCase()
  const customerStartTs = customerFilters.startDate ? new Date(customerFilters.startDate).getTime() : null
  const customerEndTs = customerFilters.endDate ? new Date(customerFilters.endDate).getTime() + 86400000 - 1 : null

  const inCustomerDateRange = (ts) => {
    if (!ts) return false
    if (customerStartTs !== null && ts < customerStartTs) return false
    if (customerEndTs !== null && ts > customerEndTs) return false
    return true
  }
  const dateFilterActive = customerStartTs !== null || customerEndTs !== null

  // Map of customerId → had-payment-in-range, used to decide if a customer
  // row passes the date filter without re-scanning payments per row.
  const customerHasPaymentInRange = (() => {
    if (!dateFilterActive) return null
    const set = new Set()
    for (const p of customerPayments) {
      const ts = p.paymentDate ? new Date(p.paymentDate).getTime() : null
      if (ts !== null && inCustomerDateRange(ts) && p.customerId) {
        set.add(p.customerId)
      }
    }
    return set
  })()

  const filteredCustomers = customers.filter(c => {
    if (customerSearchLc) {
      const hay = `${c.name || ''} ${c.phone || ''} ${c.notes || ''}`.toLowerCase()
      if (!hay.includes(customerSearchLc)) return false
    }
    if (dateFilterActive) {
      const createdTs = c.createdAt ? new Date(c.createdAt).getTime() : null
      const createdInRange = createdTs !== null && inCustomerDateRange(createdTs)
      const hadPayment = customerHasPaymentInRange?.has(c.id)
      if (!createdInRange && !hadPayment) return false
    }
    return true
  })

  // Payments matching the active date range (used by the summary cards so
  // the "Total Payments" card answers "how much came in between X and Y").
  const customerPaymentsInRange = dateFilterActive
    ? customerPayments.filter(p => {
        const ts = p.paymentDate ? new Date(p.paymentDate).getTime() : null
        return ts !== null && inCustomerDateRange(ts)
      })
    : customerPayments

  const customerTotalPages = Math.max(1, Math.ceil(filteredCustomers.length / customerFilters.pageSize))
  const customerCurrentPage = Math.min(customerFilters.page, customerTotalPages)
  const customerPageStart = (customerCurrentPage - 1) * customerFilters.pageSize
  const customersPaged = filteredCustomers.slice(customerPageStart, customerPageStart + customerFilters.pageSize)

  // Generic helper: filter a list of records by a free-text search across the
  // given field names, plus an inclusive date range against a chosen field.
  // Used by Sales / Purchases / Resales / etc. so each tab doesn't have to
  // reimplement the same predicate.
  const applyListFilter = (list, filters, { searchFields = [], dateField = null }) => {
    const q = (filters.search || '').trim().toLowerCase()
    const startTs = filters.startDate ? new Date(filters.startDate).getTime() : null
    const endTs = filters.endDate ? new Date(filters.endDate).getTime() + 86400000 - 1 : null
    return (list || []).filter(row => {
      if (q) {
        const hay = searchFields.map(f => row?.[f] ?? '').join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (dateField && (startTs !== null || endTs !== null)) {
        const ts = row?.[dateField] ? new Date(row[dateField]).getTime() : null
        if (ts === null) return false
        if (startTs !== null && ts < startTs) return false
        if (endTs !== null && ts > endTs) return false
      }
      return true
    })
  }

  const filteredSales = applyListFilter(sales, salesFilters, {
    searchFields: ['customerName', 'buyerName', 'inventoryNumber', 'inventoryType', 'phase', 'notes'],
    dateField: 'saleDate',
  })
  const salesPage = slicePage(filteredSales, salesFilters.pageSize, salesFilters.page)
  const salesFilteredTotals = {
    finalAmount: filteredSales.reduce((s, r) => s + (r.finalAmount || 0), 0),
    totalPaid: filteredSales.reduce((s, r) => s + (r.totalPaid || 0), 0),
    balance: filteredSales.reduce((s, r) => s + (r.balance || 0), 0),
  }

  const filteredPurchases = applyListFilter(purchases || [], purchasesFilters, {
    searchFields: ['partyName', 'vendorName', 'notes'],
    dateField: 'purchaseDate',
  })
  const purchasesPage = slicePage(filteredPurchases, purchasesFilters.pageSize, purchasesFilters.page)
  const purchasesFilteredTotals = {
    dealAmount: filteredPurchases.reduce((s, r) => s + (r.dealAmount || r.totalCost || 0), 0),
    totalPaid: filteredPurchases.reduce((s, r) => s + (r.totalPaid || 0), 0),
    balance: filteredPurchases.reduce((s, r) => s + (r.balance || 0), 0),
  }

  const filteredResales = applyListFilter(resaleDeals || [], resalesFilters, {
    searchFields: ['sellerName', 'buyerName', 'inventoryName', 'inventoryNumber', 'notes'],
    dateField: 'dealDate',
  })
  const resalesPage = slicePage(filteredResales, resalesFilters.pageSize, resalesFilters.page)

  const filteredInventory = (inventory || []).filter(item => {
    const q = (inventoryFilters.search || '').trim().toLowerCase()
    if (q) {
      const hay = `${item.type || ''} ${item.inventoryNumber || ''} ${item.phase || ''} ${item.status || ''} ${item.currentOwner || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (inventoryFilters.status !== 'all' && item.status !== inventoryFilters.status) return false
    return true
  })
  const inventoryPage = slicePage(filteredInventory, inventoryFilters.pageSize, inventoryFilters.page)

  const filteredPartners = (partners || []).filter(p => {
    const q = (partnersFilters.search || '').trim().toLowerCase()
    if (!q) return true
    return `${p.name || ''} ${p.phone || ''} ${p.email || ''} ${p.notes || ''}`.toLowerCase().includes(q)
  })
  const partnersPage = slicePage(filteredPartners, partnersFilters.pageSize, partnersFilters.page)

  const auditLogsAll = auditLogsData?.logs || []
  const filteredAuditLogs = auditLogsAll.filter(log => {
    const q = (auditLogsFilters.search || '').trim().toLowerCase()
    if (!q) return true
    const hay = `${log.action || ''} ${log.entityType || ''} ${log.entityId || ''} ${log.userName || ''} ${log.reason || ''}`.toLowerCase()
    return hay.includes(q)
  })
  const auditLogsPage = slicePage(filteredAuditLogs, auditLogsFilters.pageSize, auditLogsFilters.page)

  // Per-vendor ledger summary (Daily Khata view). Joins vendors with their
  // expense bills + payments so each row is a vendor card, not a bill.
  // Brokers belong to the Commissions module — exclude them from the
  // Daily-Khata vendor view so Work/Payment math doesn't include broker
  // payouts (which live in commission-bills, not expense-bills).
  const vendorLedgerRows = vendors.filter(v => {
    if (v.type === 'Broker') return false  // brokers live on the Commissions tab
    if (vendorLedgerScope === 'commission') return v.type === 'Commission'
    return v.type !== 'Commission'         // default Vendor Ledger hides Commission type
  }).map(v => {
    const bills = expenseBills.filter(b => b.vendorId === v.id)
    const workValue = bills.reduce((s, b) => s + (b.billAmount || 0), 0)
    const amountPaid = bills.reduce((s, b) => s + (b.totalPaid || 0), 0)
    const labourValue = bills
      .filter(b => /labour/i.test(b.categoryName || ''))
      .reduce((s, b) => s + (b.billAmount || 0), 0)
    const pending = Math.max(0, workValue - amountPaid)
    const advance = Math.max(0, amountPaid - workValue)
    // Latest bill date is the best signal we have for "last activity" without
    // an extra round-trip for the payment dates.
    const lastActivity = bills.length
      ? bills.map(b => b.billDate).filter(Boolean).sort().pop()
      : null
    return {
      ...v,
      workValue,
      amountPaid,
      labourValue,
      pending,
      advance,
      lastActivity,
      // Vendor's own type/trade — independent of which work-category was
      // booked last. Avoids the row badge flipping every time a bill is added.
      displayCategory: v.type || 'Other',
      ledgerStatus: pending > 0 ? 'pending' : (advance > 0 ? 'advance' : 'cleared')
    }
  })

  const filteredVendorLedger = vendorLedgerRows.filter(r => {
    if (vendorLedgerFilters.search) {
      const q = vendorLedgerFilters.search.toLowerCase()
      if (!(r.name || '').toLowerCase().includes(q) &&
          !(r.phone || '').toLowerCase().includes(q)) return false
    }
    if (vendorLedgerFilters.category !== 'all' && r.displayCategory !== vendorLedgerFilters.category) return false
    if (vendorLedgerFilters.status !== 'all' && r.ledgerStatus !== vendorLedgerFilters.status) return false
    return true
  })

  const vendorLedgerTotals = {
    totalVendors: filteredVendorLedger.length,
    totalWorkValue: filteredVendorLedger.reduce((s, r) => s + r.workValue, 0),
    totalPaid: filteredVendorLedger.reduce((s, r) => s + r.amountPaid, 0),
    totalPending: filteredVendorLedger.reduce((s, r) => s + r.pending, 0),
    labourCost: filteredVendorLedger.reduce((s, r) => s + (r.labourValue || 0), 0),
  }
  const vendorLedgerPage = slicePage(filteredVendorLedger, vendorLedgerFilters.pageSize, vendorLedgerFilters.page)
  vendorLedgerTotals.materialCost = vendorLedgerTotals.totalWorkValue - vendorLedgerTotals.labourCost

  const vendorLedgerCategories = Array.from(
    new Set(vendorLedgerRows.map(r => r.displayCategory).filter(Boolean))
  ).sort()

  const openAddWorkForVendor = (vendor) => {
    setAddWorkVendor(vendor)
    setCurrentItem(null)
    setDialogMode('createExpenseBill')
    setIsDialogOpen(true)
  }

  const openPaymentForVendor = async (vendor) => {
    // Same flow as the detail-drawer "+ Add Payment": vendor-level dialog
    // that lets the user pick Payment (FIFO) or Withdrawal (LIFO) inside.
    await handleVendorDetailAddPayment(vendor)
  }

  // Calculate commission totals based on filtered data
  const commissionTotals = {
    totalCommission: filteredCommissionBills.reduce((sum, b) => sum + b.commissionAmount, 0),
    totalPaid: filteredCommissionBills.reduce((sum, b) => sum + (b.totalPaid || 0), 0),
    totalBalance: filteredCommissionBills.reduce((sum, b) => sum + (b.balance || 0), 0)
  }

  const marginTotals = {
    totalMargin: filteredMarginBills.reduce((sum, b) => sum + (b.amount || 0), 0),
    totalPaid: filteredMarginBills.reduce((sum, b) => sum + (b.totalPaid || 0), 0),
    totalBalance: filteredMarginBills.reduce((sum, b) => sum + (b.balance || 0), 0)
  }

  // Export to CSV function
  const exportToCSV = (data, filename, columns) => {
    const rows = data.map(item => {
      const row = {}
      columns.forEach(col => {
        row[col.header] = col.accessor(item)
      })
      return row
    })
    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  // Export to PDF function
  const exportToPDF = (data, filename, columns, totals, title) => {
    const doc = new jsPDF()
    const societyName = selectedSociety?.name || 'All Societies'
    
    // Title
    doc.setFontSize(16)
    doc.text(title, 14, 15)
    doc.setFontSize(10)
    doc.text(`Society: ${societyName}`, 14, 22)
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 28)
    
    // Table data
    const tableData = data.map(item => columns.map(col => col.accessor(item)))
    
    // Add totals row
    if (totals) {
      const totalsRow = columns.map(col => {
        if (col.totalKey) return `₹${fmt(totals[col.totalKey])}`
        if (col.totalLabel) return col.totalLabel
        return ''
      })
      tableData.push(totalsRow)
    }
    
    doc.autoTable({
      head: [columns.map(col => col.header)],
      body: tableData,
      startY: 35,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [66, 139, 202] },
      footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' }
    })
    
    doc.save(`${filename}_${new Date().toISOString().split('T')[0]}.pdf`)
  }

  // Export Expense Bills
  const exportExpensesToCSV = () => {
    const columns = [
      { header: 'Date', accessor: b => new Date(b.billDate).toLocaleDateString() },
      { header: 'Vendor', accessor: b => b.vendorName },
      { header: 'Category', accessor: b => b.categoryName || '-' },
      { header: 'Bill Amount', accessor: b => b.billAmount },
      { header: 'Paid', accessor: b => b.totalPaid || 0 },
      { header: 'Balance', accessor: b => b.balance || 0 },
      { header: 'Status', accessor: b => b.status }
    ]
    exportToCSV(filteredExpenseBills, 'expense_bills', columns)
  }

  const exportExpensesToPDF = () => {
    const columns = [
      { header: 'Date', accessor: b => new Date(b.billDate).toLocaleDateString() },
      { header: 'Vendor', accessor: b => b.vendorName },
      { header: 'Category', accessor: b => b.categoryName || '-' },
      { header: 'Bill Amount', accessor: b => `₹${fmt(b.billAmount)}` },
      { header: 'Paid', accessor: b => `₹${fmt(b.totalPaid)}`, totalKey: 'totalPaid' },
      { header: 'Balance', accessor: b => `₹${fmt(b.balance)}`, totalKey: 'totalBalance' },
      { header: 'Status', accessor: b => b.status, totalLabel: 'TOTALS' }
    ]
    // Add total bill column info
    columns[3].totalKey = 'totalBill'
    exportToPDF(filteredExpenseBills, 'expense_bills', columns, expenseTotals, 'Expense Bills Report')
  }

  // Export Commission Bills
  const exportCommissionsToCSV = () => {
    const columns = [
      { header: 'Date', accessor: b => new Date(b.commissionDate).toLocaleDateString() },
      { header: 'Broker', accessor: b => b.brokerName },
      { header: 'Customer', accessor: b => b.customerName },
      { header: 'Inventory', accessor: b => b.inventoryName },
      { header: 'Commission', accessor: b => b.commissionAmount },
      { header: 'Paid', accessor: b => b.totalPaid || 0 },
      { header: 'Balance', accessor: b => b.balance || 0 },
      { header: 'Status', accessor: b => b.status }
    ]
    exportToCSV(filteredCommissionBills, 'commission_bills', columns)
  }

  const exportCommissionsToPDF = () => {
    const columns = [
      { header: 'Date', accessor: b => new Date(b.commissionDate).toLocaleDateString() },
      { header: 'Broker', accessor: b => b.brokerName },
      { header: 'Customer', accessor: b => b.customerName },
      { header: 'Commission', accessor: b => `₹${fmt(b.commissionAmount)}`, totalKey: 'totalCommission' },
      { header: 'Paid', accessor: b => `₹${fmt(b.totalPaid)}`, totalKey: 'totalPaid' },
      { header: 'Balance', accessor: b => `₹${fmt(b.balance)}`, totalKey: 'totalBalance' },
      { header: 'Status', accessor: b => b.status, totalLabel: 'TOTALS' }
    ]
    exportToPDF(filteredCommissionBills, 'commission_bills', columns, commissionTotals, 'Commission Bills Report')
  }

  // Export Vendor Ledger
  const exportVendorLedgerToCSV = () => {
    if (!vendorLedgerItem || vendorLedgerEntries.length === 0) return
    const columns = [
      { header: 'Date', accessor: e => new Date(e.date).toLocaleDateString() },
      { header: 'Source', accessor: e => e.source },
      { header: 'Reference', accessor: e => e.reference },
      { header: 'Amount', accessor: e => e.amount },
      { header: 'Mode', accessor: e => e.paymentMode },
      { header: 'Remark', accessor: e => e.remark || '' }
    ]
    exportToCSV(vendorLedgerEntries, `vendor_ledger_${vendorLedgerItem.name}`, columns)
  }

  const exportVendorLedgerToPDF = () => {
    if (!vendorLedgerItem || vendorLedgerEntries.length === 0) return
    const total = vendorLedgerEntries.reduce((sum, e) => sum + e.amount, 0)
    const columns = [
      { header: 'Date', accessor: e => new Date(e.date).toLocaleDateString() },
      { header: 'Source', accessor: e => e.source },
      { header: 'Reference', accessor: e => e.reference },
      { header: 'Amount', accessor: e => `₹${fmt(e.amount)}`, totalKey: 'total' },
      { header: 'Mode', accessor: e => e.paymentMode, totalLabel: 'TOTAL' }
    ]
    exportToPDF(vendorLedgerEntries, `vendor_ledger_${vendorLedgerItem.name}`, columns, { total }, `Vendor Ledger - ${vendorLedgerItem.name}`)
  }

  // Clear expense filters
  const clearExpenseFilters = () => {
    setExpenseFilters(f => ({
      status: 'all',
      vendorId: 'all',
      categoryId: 'all',
      startDate: '',
      endDate: '',
      search: '',
      pageSize: f.pageSize,
      page: 1,
    }))
  }

  // Clear commission filters
  const clearCommissionFilters = () => {
    setCommissionFilters(f => ({
      status: 'all',
      brokerId: 'all',
      startDate: '',
      endDate: '',
      search: '',
      pageSize: f.pageSize,
      page: 1,
    }))
  }

  const clearMarginFilters = () => {
    setMarginFilters(f => ({
      status: 'all',
      startDate: '',
      endDate: '',
      search: '',
      pageSize: f.pageSize,
      page: 1,
    }))
  }

  // Quick Add Expense Handler
  const handleQuickExpense = async () => {
    try {
      if (!quickExpenseData.amount || parseFloat(quickExpenseData.amount) <= 0) {
        toast({ variant: 'destructive', title: 'Error', description: 'Please enter a valid amount' })
        return
      }
      if (!quickExpenseData.accountId) {
        toast({ variant: 'destructive', title: 'Error', description: 'Please select an account' })
        return
      }
      if (!quickExpenseData.category) {
        toast({ variant: 'destructive', title: 'Error', description: 'Please select or enter a category' })
        return
      }
      if (quickExpenseData.scope === 'SOCIETY' && !quickExpenseData.societyId) {
        toast({ variant: 'destructive', title: 'Error', description: 'Please select a society' })
        return
      }

      // Create Daybook transaction directly
      const txnData = {
        txnDate: quickExpenseData.expenseDate,
        societyId: quickExpenseData.scope === 'SOCIETY' ? quickExpenseData.societyId : null,
        scope: quickExpenseData.scope,
        accountId: quickExpenseData.accountId,
        direction: 'OUT',
        amount: parseFloat(quickExpenseData.amount),
        paymentMode: quickExpenseData.paymentMode,
        partyType: 'Vendor',
        partyName: quickExpenseData.vendorName || quickExpenseData.category,
        sourceType: 'QUICK_EXPENSE',
        referenceNo: quickExpenseData.category,
        remark: quickExpenseData.remark || `${quickExpenseData.category}${quickExpenseData.vendorName ? ' - ' + quickExpenseData.vendorName : ''}`
      }

      await apiCall('/daybook', 'POST', txnData)

      toast({ title: 'Success', description: 'Expense added successfully!' })
      setShowQuickExpense(false)
      
      // Refresh data
      loadDaybook()
      if (selectedSociety) {
        // Reload society data to update summary cards
        loadSocietyData()
      }
    } catch (error) {
      console.error('Failed to add expense:', error)
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to add expense' })
    }
  }

  // Handle adding a new category inline (from Quick Expense modal)
  const handleQuickAddCategory = async () => {
    if (!quickNewCategoryName.trim()) return
    
    setAddingQuickCategory(true)
    try {
      const newCategory = await apiCall('/expense-categories', 'POST', {
        name: quickNewCategoryName.trim(),
        scope: quickExpenseData.scope,
        societyId: quickExpenseData.scope === 'SOCIETY' ? quickExpenseData.societyId : null
      })
      
      // Refresh categories list
      await loadMasterData()
      
      // Auto-select the new category
      setQuickExpenseData({ ...quickExpenseData, category: newCategory.name })
      
      // Reset inline form
      setShowQuickAddCategory(false)
      setQuickNewCategoryName('')
      
      toast({ title: 'Success', description: `Category "${newCategory.name}" created!` })
    } catch (error) {
      console.error('Failed to add category:', error)
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to add category' })
    } finally {
      setAddingQuickCategory(false)
    }
  }

  return (
    <AppShell user={user} onLogout={handleLogout} onChangePassword={openChangePassword} searchPlaceholder="Search properties, customers, partners...">
      <Toaster />

      {/* Change Password Dialog */}
      <Dialog open={showChangePassword} onOpenChange={setShowChangePassword}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-4 h-4" /> Change Password
            </DialogTitle>
            <DialogDescription>
              Enter your current password and choose a new one.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cp-current">Current Password</Label>
              <div className="relative">
                <Input
                  id="cp-current"
                  type={showCurrentPwd ? 'text' : 'password'}
                  value={changePasswordForm.currentPassword}
                  onChange={(e) => setChangePasswordForm({ ...changePasswordForm, currentPassword: e.target.value })}
                  placeholder="Enter current password"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPwd(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                  aria-label={showCurrentPwd ? 'Hide password' : 'Show password'}
                >
                  {showCurrentPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cp-new">New Password</Label>
              <div className="relative">
                <Input
                  id="cp-new"
                  type={showNewPwd ? 'text' : 'password'}
                  value={changePasswordForm.newPassword}
                  onChange={(e) => setChangePasswordForm({ ...changePasswordForm, newPassword: e.target.value })}
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPwd(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                  aria-label={showNewPwd ? 'Hide password' : 'Show password'}
                >
                  {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cp-confirm">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="cp-confirm"
                  type={showConfirmPwd ? 'text' : 'password'}
                  value={changePasswordForm.confirmPassword}
                  onChange={(e) => setChangePasswordForm({ ...changePasswordForm, confirmPassword: e.target.value })}
                  placeholder="Re-enter new password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPwd(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                  aria-label={showConfirmPwd ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowChangePassword(false)}
                disabled={changePasswordSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={changePasswordSubmitting} className="gradient-bg text-white">
                {changePasswordSubmitting ? 'Changing...' : 'Change Password'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Overview of your real estate societies</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Society Selector & Actions — hidden in companyScope mode, the
            whole page operates at company level and a society pick would
            be misleading. */}
        {!companyScope && (
        <div className="mb-6 p-3 sm:p-4 rounded-2xl bg-white border border-slate-200/70 shadow-soft">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Label htmlFor="society-select" className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">Society</Label>
              <Select value={selectedSociety} onValueChange={setSelectedSociety}>
                <SelectTrigger className="w-full sm:w-64 h-9 border-slate-200 bg-slate-50/60 hover:bg-slate-100/60 transition-colors">
                  <SelectValue placeholder="Choose a society" />
                </SelectTrigger>
                <SelectContent>
                  {societies.map(society => (
                    <SelectItem key={society.id} value={society.id}>
                      {society.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!singleTabMode && (
              <div className="sm:ml-auto flex items-center gap-2 flex-wrap">
                {/* Quick Add Expense Button */}
                <Button
                  variant="ghost"
                  onClick={() => {
                    setQuickExpenseData({
                      scope: 'SOCIETY',
                      societyId: selectedSociety || '',
                      accountId: '',
                      amount: '',
                      category: '',
                      vendorName: '',
                      paymentMode: 'Cash',
                      expenseDate: new Date().toISOString().split('T')[0],
                      remark: ''
                    })
                    setShowQuickExpense(true)
                  }}
                  className="h-9 px-3 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add Expense
                </Button>

                {/* Refresh button - all roles */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    loadSocieties()
                    if (selectedSociety) loadSocietyData()
                  }}
                  className="h-9 px-3 text-xs font-medium border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
                </Button>

                {/* New Society - super admin only */}
                {user?.role === 'super_admin' && (
                  <Dialog open={dialogMode === 'createSociety' && isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setDialogMode('') }}>
                    <DialogTrigger asChild>
                      <Button
                        onClick={() => { setDialogMode('createSociety'); setCurrentItem(null); }}
                        className="h-9 px-3.5 text-xs font-semibold gradient-bg text-white shadow-md hover:shadow-lg hover:opacity-95 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        New Society
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Create New Society</DialogTitle>
                      </DialogHeader>
                      <SocietyForm onSubmit={handleCreateSociety} onCancel={() => setIsDialogOpen(false)} />
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            )}
          </div>
        </div>
        )}

        {(selectedSociety && summary) || companyScope ? (
          <>
            {/* Dashboard Summary Cards */}
            {!singleTabMode && !companyScope && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
                <StatCard
                  label="Total Purchases"
                  value={`₹${fmt(summary.totalPurchaseAmount)}`}
                  sub={`${summary.purchaseCount} transactions`}
                  color="indigo"
                  Icon={ShoppingCart}
                  percent={Math.min(100, (summary.purchaseCount || 0) * 6)}
                />
                <StatCard
                  label="Total Sales"
                  value={`₹${fmt(summary.totalSalesAmount)}`}
                  sub={`${summary.salesCount} transactions`}
                  color="emerald"
                  Icon={TrendingUp}
                  percent={Math.min(100, (summary.salesCount || 0) * 6)}
                />
                <StatCard
                  label="Total Expenses"
                  value={`₹${fmt((summary.totalExpenses || 0) + (summary.totalCommissions || 0))}`}
                  sub={`${(summary.expenseBillCount || 0) + (summary.commissionBillCount || 0)} bills`}
                  color="orange"
                  Icon={TrendingDown}
                  percent={(() => {
                    const combined = (summary.totalExpenses || 0) + (summary.totalCommissions || 0)
                    const total = combined + (summary.totalSalesAmount || 0)
                    return total > 0 ? Math.min(100, (combined / total) * 100) : 0
                  })()}
                />
                <StatCard
                  label="Total Payables"
                  value={`₹${fmt(summary.totalPayables)}`}
                  sub="Unpaid bills"
                  color="amber"
                  Icon={CreditCard}
                  percent={(() => {
                    const total = (summary.totalExpenses || 0) + (summary.totalCommissions || 0)
                    return total > 0 ? Math.min(100, ((summary.totalPayables || 0) / total) * 100) : 0
                  })()}
                />
                <StatCard
                  label="Net Profit / Loss"
                  value={`₹${fmt(summary.netProfitLoss)}`}
                  sub={summary.netProfitLoss >= 0 ? 'Profitable' : 'In loss'}
                  color={summary.netProfitLoss >= 0 ? 'emerald' : 'rose'}
                  Icon={IndianRupee}
                  percent={(() => {
                    const total = summary.totalSalesAmount || 0
                    if (total <= 0) return 0
                    return Math.min(100, Math.max(0, ((summary.netProfitLoss || 0) / total) * 100))
                  })()}
                />
              </div>
            )}

            {/* Tabs for different modules */}
            <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
              {!singleTabMode && (
                <TabsList className="flex w-full flex-nowrap overflow-x-auto whitespace-nowrap lg:grid lg:grid-cols-6 gap-2 h-14 p-2 bg-slate-100/80 border border-slate-200/70 rounded-xl">
                  <TabsTrigger value="partners" className="shrink-0 rounded-lg px-5 py-2 text-sm data-[state=active]:bg-white data-[state=active]:shadow-soft data-[state=active]:text-primary font-medium">Partners</TabsTrigger>
                  <TabsTrigger value="inventory" className="shrink-0 rounded-lg px-5 py-2 text-sm data-[state=active]:bg-white data-[state=active]:shadow-soft data-[state=active]:text-primary font-medium">Inventory</TabsTrigger>
                  <TabsTrigger value="purchases" className="shrink-0 rounded-lg px-5 py-2 text-sm data-[state=active]:bg-white data-[state=active]:shadow-soft data-[state=active]:text-primary font-medium">Purchases</TabsTrigger>
                  <TabsTrigger value="customers" className="shrink-0 rounded-lg px-5 py-2 text-sm data-[state=active]:bg-white data-[state=active]:shadow-soft data-[state=active]:text-primary font-medium">Customers</TabsTrigger>
                  <TabsTrigger value="sales" className="shrink-0 rounded-lg px-5 py-2 text-sm data-[state=active]:bg-white data-[state=active]:shadow-soft data-[state=active]:text-primary font-medium">Sales</TabsTrigger>
                  <TabsTrigger value="resales" className="shrink-0 rounded-lg px-5 py-2 text-sm data-[state=active]:bg-white data-[state=active]:shadow-soft data-[state=active]:text-primary font-medium">Resale</TabsTrigger>
                  {/* Vendors + Commissions tabs hidden (user request). The
                      content blocks below are gated on `false && ...` so they
                      stay in the source for easy revival. */}
                  {/* <TabsTrigger value="vendors" className="shrink-0 rounded-lg px-5 py-2 text-sm data-[state=active]:bg-white data-[state=active]:shadow-soft data-[state=active]:text-primary font-medium">Vendors</TabsTrigger> */}
                  {/* <TabsTrigger value="commissions" className="shrink-0 rounded-lg px-5 py-2 text-sm data-[state=active]:bg-white data-[state=active]:shadow-soft data-[state=active]:text-primary font-medium">Commissions</TabsTrigger> */}
                </TabsList>
              )}

              <Dialog
                open={showSocietyGate}
                onOpenChange={(open) => {
                  setShowSocietyGate(open)
                  if (!open) setPendingSocietyTab('')
                }}
              >
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Select Society First</DialogTitle>
                    <DialogDescription>
                      Vendor Ledger and Margin Ledger need a society selected before they can load data.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Society</Label>
                      <Select value={selectedSociety || ''} onValueChange={setSelectedSociety}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a society" />
                        </SelectTrigger>
                        <SelectContent>
                          {societies.map(society => (
                            <SelectItem key={society.id} value={society.id}>
                              {society.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowSocietyGate(false)
                          setPendingSocietyTab('')
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          if (!selectedSociety) return
                          const nextTab = pendingSocietyTab || activeTab
                          setShowSocietyGate(false)
                          setPendingSocietyTab('')
                          setHasShownProtectedTabGate(true)
                          setActiveTab(nextTab)
                        }}
                        disabled={!selectedSociety}
                      >
                        Continue
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Partners Tab */}
              <TabsContent value="partners" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Partners</CardTitle>
                      <Dialog open={dialogMode === 'createPartner' && isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setDialogMode('') }}>
                        <DialogTrigger asChild>
                          <Button onClick={() => { setDialogMode('createPartner'); setCurrentItem(null); }}>
                            <Plus className="w-4 h-4 mr-2" /> Add Partner
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Add New Partner</DialogTitle>
                          </DialogHeader>
                          <PartnerForm onSubmit={handleCreatePartner} onCancel={() => setIsDialogOpen(false)} />
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Partner Summary */}
                    {partnerSummary && partners.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6 p-4 bg-purple-50 rounded-lg">
                        <div>
                          <p className="text-sm text-gray-600">Total Investment</p>
                          <p className="text-lg font-bold text-green-600">₹{fmt(partnerSummary.totalPartnerInvestment)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Total Withdrawals</p>
                          <p className="text-lg font-bold text-orange-600">₹{fmt(partnerSummary.totalWithdrawals)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Profit Paid</p>
                          <p className="text-lg font-bold text-purple-600">₹{fmt(partnerSummary.totalProfitPaid)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Running Balance</p>
                          <p className="text-lg font-bold text-blue-600">₹{fmt(partnerSummary.totalRunningBalance)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Total % Allocated</p>
                          <p className="text-lg font-bold text-gray-700">{partnerSummary.totalPercentage}%</p>
                        </div>
                      </div>
                    )}
                    
                    {/* Filter Bar */}
                    <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
                      <div className="flex items-center gap-2 mb-3">
                        <Filter className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">Search</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto"
                          onClick={() => setPartnersFilters(f => ({ search: '', pageSize: f.pageSize, page: 1 }))}
                        >
                          <X className="w-4 h-4 mr-1" /> Clear
                        </Button>
                      </div>
                      <Input
                        placeholder="Search by name / phone / email / notes…"
                        className="h-9"
                        value={partnersFilters.search}
                        onChange={(e) => setPartnersFilters(f => ({ ...f, search: e.target.value, page: 1 }))}
                      />
                    </div>

                    {partners.length === 0 ? (
                      <p className="text-center text-gray-500 py-8">No partners added yet</p>
                    ) : filteredPartners.length === 0 ? (
                      <p className="text-center text-gray-500 py-8">No partners match your search</p>
                    ) : (
                      <>
                      <div className="flex items-center justify-end mb-2">
                        <PageSizeSelect
                          value={partnersFilters.pageSize}
                          onChange={(n) => setPartnersFilters(f => ({ ...f, pageSize: n, page: 1 }))}
                        />
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>%</TableHead>
                            <TableHead>Expected Investment</TableHead>
                            <TableHead>Notes</TableHead>
                            <TableHead>Total Investment</TableHead>
                            <TableHead>Withdrawals</TableHead>
                            <TableHead>Profit Paid</TableHead>
                            <TableHead>Running Balance</TableHead>
                            <TableHead>Profit Share</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {partnersPage.paged.map(partner => {
                            const profitShare = summary?.partnerDistribution?.find(p => p.partnerId === partner.id)?.profitShare || 0
                            const pledged = Number(partner.expectedInvestment || 0)
                            const actual = Number(partner.totalInvestment || 0)
                            const shortfall = pledged > 0 ? Math.max(0, pledged - actual) : 0
                            return (
                              <TableRow key={partner.id} className="align-top">
                                <TableCell className="font-medium">
                                  <div>{partner.name}</div>
                                  {partner.notes && (
                                    <div
                                      className="text-xs text-slate-500 italic mt-0.5 max-w-xs truncate"
                                      title={partner.notes}
                                    >
                                      {partner.notes}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>{partner.percentage}%</TableCell>
                                <TableCell className="text-slate-700">
                                  {pledged > 0 ? (
                                    <>
                                      <div>₹{fmt(pledged)}</div>
                                      {shortfall > 0 && (
                                        <div className="text-[11px] text-amber-600">
                                          ₹{fmt(shortfall)} pending
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-slate-600">
                                  {partner.notes && (
                                    <div
                                      className="text-xs text-slate-500 italic mt-0.5 max-w-xs truncate"
                                      title={partner.notes}
                                    >
                                      {partner.notes}
                                    </div>
                                  )}
                                </TableCell>  
                                <TableCell className="text-green-600">₹{fmt(partner.totalInvestment)}</TableCell>
                                <TableCell className="text-orange-600">₹{fmt(partner.totalWithdrawal)}</TableCell>
                                <TableCell className="text-purple-600">₹{fmt(partner.totalProfitPaid)}</TableCell>
                                <TableCell className={`font-bold ${(partner.runningBalance || 0) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                  ₹{fmt(partner.runningBalance)}
                                </TableCell>
                                <TableCell className={profitShare >= 0 ? 'text-green-600' : 'text-red-600'}>
                                  ₹{fmt(profitShare)}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setEditingPartner(partner)}>
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => openLedger('partner', partner)}>
                                      <Receipt className="w-4 h-4 mr-1" /> Ledger
                                    </Button>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="destructive" size="sm">
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Delete Partner?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            This will delete the partner and all their ledger entries and Daybook transactions. This action cannot be undone.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => handleDeletePartner(partner.id)}>Delete</AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                      <TablePager
                        total={partnersPage.total}
                        totalPages={partnersPage.totalPages}
                        currentPage={partnersPage.currentPage}
                        start={partnersPage.start}
                        end={partnersPage.end}
                        label="partners"
                        onChange={(p) => setPartnersFilters(f => ({ ...f, page: p }))}
                      />
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Inventory Tab */}
              <TabsContent value="inventory" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Inventory</CardTitle>
                      <Dialog open={(dialogMode === 'createInventory' || dialogMode === 'editInventory') && isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) { setDialogMode(''); setEditingInventory(null); } }}>
                        <DialogTrigger asChild>
                          <Button onClick={() => { setDialogMode('createInventory'); setCurrentItem(null); setEditingInventory(null); }}>
                            <Plus className="w-4 h-4 mr-2" /> Add Inventory
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>{editingInventory ? 'Edit Inventory' : 'Add New Inventory'}</DialogTitle>
                          </DialogHeader>
                          <InventoryForm 
                            onSubmit={editingInventory ? handleEditInventory : handleCreateInventory} 
                            onCancel={() => { setIsDialogOpen(false); setEditingInventory(null); }} 
                            initialData={editingInventory}
                          />
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Filter Bar */}
                    <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
                      <div className="flex items-center gap-2 mb-3">
                        <Filter className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">Search & Filters</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto"
                          onClick={() => setInventoryFilters(f => ({ search: '', status: 'all', pageSize: f.pageSize, page: 1 }))}
                        >
                          <X className="w-4 h-4 mr-1" /> Clear
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-gray-500">Search (type / number / phase / owner)</Label>
                          <Input
                            placeholder="Type to filter…"
                            className="h-9"
                            value={inventoryFilters.search}
                            onChange={(e) => setInventoryFilters(f => ({ ...f, search: e.target.value, page: 1 }))}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">Status</Label>
                          <Select value={inventoryFilters.status} onValueChange={(v) => setInventoryFilters(f => ({ ...f, status: v, page: 1 }))}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All</SelectItem>
                              <SelectItem value="Available">Available</SelectItem>
                              <SelectItem value="Sold">Sold</SelectItem>
                              <SelectItem value="Resold">Resold</SelectItem>
                              <SelectItem value="Blocked">Blocked</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {inventory.length === 0 ? (
                      <p className="text-center text-gray-500 py-8">No inventory added yet</p>
                    ) : filteredInventory.length === 0 ? (
                      <p className="text-center text-gray-500 py-8">No inventory matches your filters</p>
                    ) : (
                      <>
                      <div className="flex items-center justify-end mb-2">
                        <PageSizeSelect
                          value={inventoryFilters.pageSize}
                          onChange={(n) => setInventoryFilters(f => ({ ...f, pageSize: n, page: 1 }))}
                        />
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Number</TableHead>
                            <TableHead>Area</TableHead>
                            <TableHead>Phase</TableHead>
                            <TableHead>Floor</TableHead>
                            <TableHead>Facing</TableHead>
                            <TableHead>Notes</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {inventoryPage.paged.map(item => (
                            <TableRow key={item.id}>
                              <TableCell>
                                <Badge variant={item.type === 'Flat' ? 'default' : 'secondary'}>
                                  {item.type}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-medium">{item.inventoryNumber}</TableCell>
                              <TableCell>{item.area ? `${item.area} sq ft` : '—'}</TableCell>
                              <TableCell>{item.phase || '—'}</TableCell>
                              <TableCell>{item.floor || '—'}</TableCell>
                              <TableCell>{item.facing || '—'}</TableCell>
                              <TableCell>{item.notes||'-'}</TableCell>
                              <TableCell>
                                <Badge variant={item.status === 'Sold' ? 'destructive' : item.status === 'Blocked' ? 'outline' : 'default'}>
                                  {item.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Button variant="ghost" size="sm" onClick={() => { setEditingInventory(item); setDialogMode('editInventory'); setIsDialogOpen(true); }}>
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Inventory?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          {item.status === 'Sold' ? 
                                            'This inventory is linked to a sale. Please cancel or delete the sale first.' :
                                            'This will permanently delete this inventory item. This action cannot be undone.'
                                          }
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        {item.status !== 'Sold' && (
                                          <AlertDialogAction onClick={() => handleDeleteInventory(item.id)} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                                        )}
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <TablePager
                        total={inventoryPage.total}
                        totalPages={inventoryPage.totalPages}
                        currentPage={inventoryPage.currentPage}
                        start={inventoryPage.start}
                        end={inventoryPage.end}
                        label="items"
                        onChange={(p) => setInventoryFilters(f => ({ ...f, page: p }))}
                      />
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Purchases Tab */}
              <TabsContent value="purchases" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Purchases</CardTitle>
                      <Dialog open={dialogMode === 'createPurchase' && isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setDialogMode('') }}>
                        <DialogTrigger asChild>
                          <Button onClick={() => { setDialogMode('createPurchase'); setCurrentItem(null); }}>
                            <Plus className="w-4 h-4 mr-2" /> Add Purchase
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Add New Purchase</DialogTitle>
                          </DialogHeader>
                          <PurchaseForm onSubmit={handleCreatePurchase} onCancel={() => setIsDialogOpen(false)} />
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Filter Bar */}
                    <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
                      <div className="flex items-center gap-2 mb-3">
                        <Filter className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">Search & Filters</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto"
                          onClick={() => setPurchasesFilters(f => ({ search: '', startDate: '', endDate: '', pageSize: f.pageSize, page: 1 }))}
                        >
                          <X className="w-4 h-4 mr-1" /> Clear
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs text-gray-500">Search (party / notes)</Label>
                          <Input
                            placeholder="Type to filter…"
                            className="h-9"
                            value={purchasesFilters.search}
                            onChange={(e) => setPurchasesFilters(f => ({ ...f, search: e.target.value, page: 1 }))}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">From Date</Label>
                          <Input type="date" className="h-9"
                            value={purchasesFilters.startDate}
                            onChange={(e) => setPurchasesFilters(f => ({ ...f, startDate: e.target.value, page: 1 }))}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">To Date</Label>
                          <Input type="date" className="h-9"
                            value={purchasesFilters.endDate}
                            onChange={(e) => setPurchasesFilters(f => ({ ...f, endDate: e.target.value, page: 1 }))}
                          />
                        </div>
                      </div>
                      {(purchasesFilters.search || purchasesFilters.startDate || purchasesFilters.endDate) && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3 p-3 bg-white rounded border">
                          <div>
                            <p className="text-xs text-gray-500">Filtered Deal Amount</p>
                            <p className="text-base font-bold text-blue-700">₹{fmt(purchasesFilteredTotals.dealAmount)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Filtered Paid</p>
                            <p className="text-base font-bold text-green-600">₹{fmt(purchasesFilteredTotals.totalPaid)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Filtered Balance</p>
                            <p className="text-base font-bold text-orange-600">₹{fmt(purchasesFilteredTotals.balance)}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {purchases.length === 0 ? (
                      <p className="text-center text-gray-500 py-8">No purchases recorded yet</p>
                    ) : filteredPurchases.length === 0 ? (
                      <p className="text-center text-gray-500 py-8">No purchases match your search / filters</p>
                    ) : (
                      <>
                      <div className="flex items-center justify-end mb-2">
                        <PageSizeSelect
                          value={purchasesFilters.pageSize}
                          onChange={(n) => setPurchasesFilters(f => ({ ...f, pageSize: n, page: 1 }))}
                        />
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Party Name</TableHead>
                            <TableHead>Deal Amount</TableHead>
                            <TableHead>Total Paid</TableHead>
                            <TableHead>Balance</TableHead>
                            <TableHead>Notes</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {purchasesPage.paged.map(purchase => (
                            <TableRow key={purchase.id}>
                              <TableCell className="font-medium">{purchase.partyName}</TableCell>
                              <TableCell>₹{fmt(purchase.dealAmount)}</TableCell>
                              <TableCell className="text-green-600">₹{fmt(purchase.totalPaid)}</TableCell>
                              <TableCell className="text-orange-600">₹{fmt(purchase.balance)}</TableCell>
                              <TableCell>{purchase.notes || '-'}</TableCell>
                              <TableCell>{new Date(purchase.agreementDate).toLocaleDateString()}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Button variant="outline" size="sm" onClick={() => openLedger('purchase', purchase)}>
                                    <Receipt className="w-4 h-4 mr-1" /> Payments
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingPurchase(purchase)}
                                    title="Edit purchase"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="destructive" size="sm">
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Purchase?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          This will delete the purchase and all payment entries. This action cannot be undone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeletePurchase(purchase.id)}>Delete</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <TablePager
                        total={purchasesPage.total}
                        totalPages={purchasesPage.totalPages}
                        currentPage={purchasesPage.currentPage}
                        start={purchasesPage.start}
                        end={purchasesPage.end}
                        label="purchases"
                        onChange={(p) => setPurchasesFilters(f => ({ ...f, page: p }))}
                      />
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Customers Tab - Payment Allocation System */}
              <TabsContent value="customers" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Users className="w-5 h-5" />
                        Customer Master & Payment Allocation
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => setShowPaymentForm(true)}>
                          <IndianRupee className="w-4 h-4 mr-2" /> Record Payment
                        </Button>
                        <Button onClick={() => { setShowCustomerForm(true); setEditingCustomer(null); }}>
                          <Plus className="w-4 h-4 mr-2" /> Add Customer
                        </Button>
                      </div>
                    </div>
                    <CardDescription>
                      Enterprise-grade payment system: One payment → Multiple flat allocations. No ledger mismatch.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* Filter Bar — search by name/phone/notes plus date range
                        that drives both the summary cards (amount received in
                        the range) and which customers appear in the list. */}
                    <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
                      <div className="flex items-center gap-2 mb-3">
                        <Filter className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">Search & Filters</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto"
                          onClick={() => setCustomerFilters({ search: '', startDate: '', endDate: '', pageSize: customerFilters.pageSize, page: 1 })}
                        >
                          <X className="w-4 h-4 mr-1" /> Clear
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs text-gray-500">Search (name / phone / notes)</Label>
                          <Input
                            placeholder="Type to filter…"
                            className="h-9"
                            value={customerFilters.search}
                            onChange={(e) => setCustomerFilters(f => ({ ...f, search: e.target.value, page: 1 }))}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">From Date</Label>
                          <Input
                            type="date"
                            className="h-9"
                            value={customerFilters.startDate}
                            onChange={(e) => setCustomerFilters(f => ({ ...f, startDate: e.target.value, page: 1 }))}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">To Date</Label>
                          <Input
                            type="date"
                            className="h-9"
                            value={customerFilters.endDate}
                            onChange={(e) => setCustomerFilters(f => ({ ...f, endDate: e.target.value, page: 1 }))}
                          />
                        </div>
                      </div>
                      {dateFilterActive && (
                        <p className="text-xs text-blue-600 mt-2">
                          Date range active — &ldquo;Total Payments&rdquo; below shows amount received in this window.
                        </p>
                      )}
                    </div>

                    {/* Customer Summary Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                      <Card className="bg-blue-50">
                        <CardContent className="pt-4">
                          <div className="text-sm text-muted-foreground">Total Customers</div>
                          <div className="text-2xl font-bold text-blue-700">{filteredCustomers.length}</div>
                          {filteredCustomers.length !== customers.length && (
                            <div className="text-xs text-blue-500 mt-1">of {customers.length}</div>
                          )}
                        </CardContent>
                      </Card>
                      <Card className="bg-green-50">
                        <CardContent className="pt-4">
                          <div className="text-sm text-muted-foreground">{dateFilterActive ? 'Payments in Range' : 'Total Payments'}</div>
                          <div className="text-2xl font-bold text-green-700">
                            ₹{fmt(customerPaymentsInRange.reduce((sum, p) => sum + (p.amount || 0), 0))}
                          </div>
                          {dateFilterActive && (
                            <div className="text-xs text-green-600 mt-1">{customerPaymentsInRange.length} entries</div>
                          )}
                        </CardContent>
                      </Card>
                      <Card className="bg-purple-50">
                        <CardContent className="pt-4">
                          <div className="text-sm text-muted-foreground">Fully Allocated</div>
                          <div className="text-2xl font-bold text-purple-700">
                            {customerPaymentsInRange.filter(p => p.status === 'FULLY_ALLOCATED').length}
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="bg-orange-50">
                        <CardContent className="pt-4">
                          <div className="text-sm text-muted-foreground">Pending Allocation</div>
                          <div className="text-2xl font-bold text-orange-700">
                            {customerPaymentsInRange.filter(p => p.status !== 'FULLY_ALLOCATED').length}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Customer List */}
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold">Customer List</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Rows per page:</span>
                        <Select
                          value={String(customerFilters.pageSize)}
                          onValueChange={(v) => setCustomerFilters(f => ({ ...f, pageSize: parseInt(v), page: 1 }))}
                        >
                          <SelectTrigger className="w-[80px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="25">25</SelectItem>
                            <SelectItem value="50">50</SelectItem>
                            <SelectItem value="100">100</SelectItem>
                            <SelectItem value="200">200</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {customers.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No customers added yet. Add a customer to start recording payments.
                      </div>
                    ) : filteredCustomers.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No customers match your search / date range.
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Customer Name</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Notes</TableHead>
                            <TableHead className="text-right">Flats</TableHead>
                            <TableHead className="text-right">Total Sale</TableHead>
                            <TableHead className="text-right">Total Paid</TableHead>
                            <TableHead className="text-right">Outstanding</TableHead>
                            <TableHead className="text-right">Unallocated</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {customersPaged.map(customer => (
                            <TableRow key={customer.id}>
                              <TableCell className="font-medium">{customer.name}</TableCell>
                              <TableCell>{customer.phone || '-'}</TableCell>
                              <TableCell>{customer.notes||"-"}</TableCell>
                              <TableCell className="text-right">{customer.salesCount || 0}</TableCell>
                              <TableCell className="text-right">₹{fmt(customer.totalSaleAmount || 0)}</TableCell>
                              <TableCell className="text-right text-green-600">₹{fmt(customer.totalPaid || 0)}</TableCell>
                              <TableCell className="text-right text-red-600">₹{fmt(customer.balance || 0)}</TableCell>
                              <TableCell className="text-right">
                                {customer.unallocatedAmount > 0 ? (
                                  <Badge variant="outline" className="bg-orange-50 text-orange-700">
                                    ₹{fmt(customer.unallocatedAmount)}
                                  </Badge>
                                ) : '-'}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button variant="outline" size="sm" onClick={() => openCustomerLedger(customer)}>
                                    <FileText className="w-4 h-4" />
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => { setEditingCustomer(customer); setShowCustomerForm(true); }}>
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}

                    {/* Customer list pagination controls */}
                    {filteredCustomers.length > customerFilters.pageSize && (
                      <div className="flex items-center justify-between mt-3 pt-3 border-t">
                        <div className="text-sm text-muted-foreground">
                          Showing {customerPageStart + 1} to {Math.min(customerPageStart + customerFilters.pageSize, filteredCustomers.length)} of {filteredCustomers.length} customers
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCustomerFilters(f => ({ ...f, page: Math.max(1, customerCurrentPage - 1) }))}
                            disabled={customerCurrentPage <= 1}
                          >
                            Previous
                          </Button>
                          <span className="text-sm text-muted-foreground px-2">
                            Page {customerCurrentPage} of {customerTotalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCustomerFilters(f => ({ ...f, page: Math.min(customerTotalPages, customerCurrentPage + 1) }))}
                            disabled={customerCurrentPage >= customerTotalPages}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Recent Payments Section */}
                    <div className="flex items-center justify-between mt-8 mb-3">
                      <h3 className="font-semibold">Recent Customer Payments</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Rows per page:</span>
                        <Select 
                          value={String(customerPaymentsPagination.limit)} 
                          onValueChange={(v) => handleCustomerPaymentsLimitChange(parseInt(v))}
                        >
                          <SelectTrigger className="w-[70px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="25">25</SelectItem>
                            <SelectItem value="50">50</SelectItem>
                            <SelectItem value="100">100</SelectItem>
                            <SelectItem value="200">200</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {customerPaymentsLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-muted-foreground">Loading payments...</span>
                      </div>
                    ) : customerPayments.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground">
                        No payments recorded yet.
                      </div>
                    ) : (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Customer</TableHead>
                              <TableHead>Mode</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                              <TableHead className="text-right">Allocated</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {customerPayments.map(payment => (
                              <TableRow key={payment.id}>
                                <TableCell>{new Date(payment.paymentDate).toLocaleDateString('en-IN')}</TableCell>
                                <TableCell className="font-medium">{payment.customerName}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{payment.paymentMode}</Badge>
                                </TableCell>
                                <TableCell className="text-right font-semibold text-green-600">
                                  ₹{fmt(payment.amount)}
                                </TableCell>
                                <TableCell className="text-right">
                                  ₹{fmt(payment.allocatedAmount || 0)}
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-col gap-1">
                                    <Badge 
                                      variant={payment.status === 'FULLY_ALLOCATED' ? 'default' : 'outline'}
                                      className={payment.status === 'FULLY_ALLOCATED' ? 'bg-green-500' : payment.status === 'PARTIALLY_ALLOCATED' ? 'bg-yellow-500 text-black' : 'bg-orange-100 text-orange-800'}
                                    >
                                      {payment.status === 'FULLY_ALLOCATED' ? 'Allocated' : payment.status === 'PARTIALLY_ALLOCATED' ? 'Partial' : 'Pending'}
                                    </Badge>
                                    {payment.unallocatedAmount > 0 && (
                                      <span className="text-xs text-orange-600 font-medium">
                                        ₹{fmt(payment.unallocatedAmount)} unallocated
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    {payment.unallocatedAmount > 0 ? (
                                      <Button 
                                        variant="default" 
                                        size="sm"
                                        className="bg-orange-500 hover:bg-orange-600"
                                        onClick={() => openAllocationModal(payment)}
                                      >
                                        <ArrowRightLeft className="w-4 h-4 mr-1" /> Allocate Remaining
                                      </Button>
                                    ) : (
                                      <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={() => openAllocationModal(payment)}
                                      >
                                        <Eye className="w-4 h-4 mr-1" /> View Allocations
                                      </Button>
                                    )}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openEditPayment(payment)}
                                      title="Edit payment (mode / account / amount / date / remark)"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="text-red-500"
                                      onClick={() => handleDeletePayment(payment.id)}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        
                        {/* Pagination Controls */}
                        {customerPaymentsPagination.totalPages > 0 && (
                          <div className="flex items-center justify-between mt-4 pt-4 border-t">
                            <div className="text-sm text-muted-foreground">
                              Showing {((customerPaymentsPagination.page - 1) * customerPaymentsPagination.limit) + 1} to {Math.min(customerPaymentsPagination.page * customerPaymentsPagination.limit, customerPaymentsPagination.total)} of {customerPaymentsPagination.total} payments
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCustomerPaymentsPageChange(customerPaymentsPagination.page - 1)}
                                disabled={customerPaymentsPagination.page <= 1}
                              >
                                Previous
                              </Button>
                              <span className="text-sm text-muted-foreground px-2">
                                Page {customerPaymentsPagination.page} of {customerPaymentsPagination.totalPages}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCustomerPaymentsPageChange(customerPaymentsPagination.page + 1)}
                                disabled={customerPaymentsPagination.page >= customerPaymentsPagination.totalPages}
                              >
                                Next
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Sales Tab */}
              <TabsContent value="sales" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Sales</CardTitle>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={exportSalesToCSV}>
                          <Download className="w-4 h-4 mr-2" /> Export CSV
                        </Button>
                        <Dialog open={(dialogMode === 'createSale' || dialogMode === 'editSale') && isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) { setDialogMode(''); setEditingSale(null); } }}>
                          <DialogTrigger asChild>
                            <Button onClick={() => { setDialogMode('createSale'); setCurrentItem(null); setEditingSale(null); }}>
                              <Plus className="w-4 h-4 mr-2" /> Add Sale
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>{editingSale ? 'Edit Sale' : 'Add New Sale'}</DialogTitle>
                            </DialogHeader>
                            <SaleForm 
                              inventory={editingSale ? inventory : inventory.filter(i => i.status === 'Available')} 
                              customers={customers}
                              onSubmit={editingSale ? handleEditSale : handleCreateSale} 
                              onCancel={() => { setIsDialogOpen(false); setEditingSale(null); }} 
                              initialData={editingSale}
                              hasPayments={editingSale?.paymentCount > 0}
                              onCreateCustomer={async (customerData) => {
                                const newCustomer = await apiCall('/customers', 'POST', { ...customerData, societyId: selectedSociety })
                                await loadSocietyData()
                                return newCustomer
                              }}
                              onUpdateCustomer={async (customerId, customerData) => {
                                const updatedCustomer = await apiCall(`/customers/${customerId}`, 'PATCH', customerData)
                                await loadSocietyData()
                                return updatedCustomer
                              }}
                            />
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Sales Summary */}
                    {salesSummary && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-green-50 rounded-lg">
                        <div>
                          <p className="text-sm text-gray-600">Total Sales ({salesSummary.count})</p>
                          <p className="text-lg font-bold text-blue-700">₹{fmt(salesSummary.totalDealAmount)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Total Received</p>
                          <p className="text-lg font-bold text-green-600">₹{fmt(salesSummary.totalReceived)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Balance Pending</p>
                          <p className="text-lg font-bold text-orange-600">₹{fmt(salesSummary.totalPending)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Collection %</p>
                          <p className="text-lg font-bold text-purple-600">
                            {salesSummary.totalDealAmount > 0 ? Math.round((salesSummary.totalReceived / salesSummary.totalDealAmount) * 100) : 0}%
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Filter Bar */}
                    <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
                      <div className="flex items-center gap-2 mb-3">
                        <Filter className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">Search & Filters</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto"
                          onClick={() => setSalesFilters(f => ({ search: '', startDate: '', endDate: '', pageSize: f.pageSize, page: 1 }))}
                        >
                          <X className="w-4 h-4 mr-1" /> Clear
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs text-gray-500">Search (customer / inventory / notes)</Label>
                          <Input
                            placeholder="Type to filter…"
                            className="h-9"
                            value={salesFilters.search}
                            onChange={(e) => setSalesFilters(f => ({ ...f, search: e.target.value, page: 1 }))}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">From Date</Label>
                          <Input type="date" className="h-9"
                            value={salesFilters.startDate}
                            onChange={(e) => setSalesFilters(f => ({ ...f, startDate: e.target.value, page: 1 }))}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">To Date</Label>
                          <Input type="date" className="h-9"
                            value={salesFilters.endDate}
                            onChange={(e) => setSalesFilters(f => ({ ...f, endDate: e.target.value, page: 1 }))}
                          />
                        </div>
                      </div>
                      {(salesFilters.search || salesFilters.startDate || salesFilters.endDate) && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3 p-3 bg-white rounded border">
                          <div>
                            <p className="text-xs text-gray-500">Filtered Final Amount</p>
                            <p className="text-base font-bold text-blue-700">₹{fmt(salesFilteredTotals.finalAmount)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Filtered Received</p>
                            <p className="text-base font-bold text-green-600">₹{fmt(salesFilteredTotals.totalPaid)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Filtered Balance</p>
                            <p className="text-base font-bold text-orange-600">₹{fmt(salesFilteredTotals.balance)}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {sales.length === 0 ? (
                      <p className="text-center text-gray-500 py-8">No sales recorded yet</p>
                    ) : filteredSales.length === 0 ? (
                      <p className="text-center text-gray-500 py-8">No sales match your search / filters</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <div className="flex items-center justify-end mb-2">
                          <PageSizeSelect
                            value={salesFilters.pageSize}
                            onChange={(n) => setSalesFilters(f => ({ ...f, pageSize: n, page: 1 }))}
                          />
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Inventory</TableHead>
                              <TableHead>Customer</TableHead>
                              <TableHead>Phone</TableHead>
                              <TableHead>Notes</TableHead>
                              <TableHead>Final Amount</TableHead>
                              <TableHead>Total Paid</TableHead>
                              <TableHead>Balance</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {salesPage.paged.map(sale => {
                              // Walk the resale chain (sale → first ResaleDeal
                              // → ResaleDeal whose previousResaleDealId == prev
                              // → ...) so we can surface the full hierarchy
                              // in the table — every hop with its sale price
                              // and the margin captured at that step.
                              const resaleChain = []
                              if (sale.resaleDealId) {
                                let cur = resaleDeals.find(d => d.id === sale.resaleDealId)
                                while (cur) {
                                  resaleChain.push(cur)
                                  cur = resaleDeals.find(d => d.previousResaleDealId === cur.id)
                                }
                              }
                              // Build a unified ownership timeline so we can
                              // render the same shape (name + price + margin)
                              // for both the original sale and each resale hop.
                              // First step = original; subsequent = resales.
                              const ownerSteps = [
                                {
                                  name: sale.customerName,
                                  phone: sale.customerPhone || '',
                                  price: sale.finalAmount || 0,
                                  margin: null,
                                  isOriginal: true,
                                  isLatest: resaleChain.length === 0,
                                },
                                ...resaleChain.map((d, idx) => ({
                                  name: d.buyerName,
                                  phone: d.buyerPhone || '',
                                  price: Number(d.resalePrice) || 0,
                                  margin: Number(d.companyCommission) || 0,
                                  isOriginal: false,
                                  isLatest: idx === resaleChain.length - 1,
                                })),
                              ]
                              const latestStep = ownerSteps[ownerSteps.length - 1]
                              return (
                              <TableRow key={sale.id}>
                                <TableCell>
                                  <span className="font-medium">{sale.inventoryNumber || sale.inventoryName}</span>
                                  {sale.inventoryArea > 0 && <span className="text-xs text-gray-500 block">{sale.inventoryArea} sq ft</span>}
                                  {resaleChain.length > 0 && (
                                    <span className="text-[10px] text-purple-600 mt-1 inline-flex items-center gap-1">
                                      <ArrowRightLeft className="w-3 h-3" />
                                      {resaleChain.length} resale{resaleChain.length > 1 ? 's' : ''}
                                    </span>
                                  )}
                                </TableCell>
                                {/* Customer cell rendered as a vertical owner
                                    chain when resold. ALL owners stay fully
                                    readable (original sale info matters too);
                                    the latest hop just gets a purple highlight
                                    so the current owner stands out. */}
                                <TableCell>
                                  {resaleChain.length === 0 ? (
                                    <span className="font-medium">{sale.customerName}</span>
                                  ) : (
                                    <div className="space-y-1.5 min-w-[200px]">
                                      {ownerSteps.map((step, idx) => (
                                        <div key={idx}>
                                          {idx > 0 && (
                                            <div className="text-[10px] text-slate-400 leading-none ml-1">↓</div>
                                          )}
                                          <div className={`flex items-baseline justify-between gap-2 rounded px-1.5 py-0.5 ${
                                            step.isLatest ? 'bg-purple-50 border border-purple-200' : ''
                                          }`}>
                                            <div className="flex items-center gap-1 min-w-0">
                                              {step.isLatest && <ArrowRightLeft className="w-3 h-3 text-purple-600 shrink-0" />}
                                              <span className={`text-xs truncate font-medium ${
                                                step.isLatest ? 'text-purple-700' : 'text-slate-800'
                                              }`} title={step.name}>
                                                {step.name}
                                              </span>
                                              {step.isOriginal && (
                                                <span className="text-[9px] bg-blue-100 text-blue-700 px-1 rounded uppercase">orig</span>
                                              )}
                                              {step.isLatest && !step.isOriginal && (
                                                <span className="text-[9px] bg-purple-100 text-purple-700 px-1 rounded uppercase">now</span>
                                              )}
                                            </div>
                                            <span className={`text-[11px] tabular-nums shrink-0 font-medium ${
                                              step.isLatest ? 'text-purple-700' : 'text-slate-700'
                                            }`}>
                                              ₹{fmt(step.price)}
                                            </span>
                                          </div>
                                          {step.margin > 0 && (
                                            <div className="text-[10px] text-amber-600 leading-none ml-1 mt-0.5">
                                              margin ₹{fmt(step.margin)}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {resaleChain.length === 0 ? (
                                    sale.customerPhone
                                  ) : (
                                    /* Both numbers readable; latest gets purple
                                        tint to match the chain highlight. */
                                    <div className="text-xs space-y-0.5">
                                      <div className="text-slate-700">{sale.customerPhone || '-'}</div>
                                      <div className="text-purple-700 font-medium">{latestStep.phone || '—'}</div>
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="max-w-[220px] truncate text-slate-600" title={sale.notes || ''}>
                                  {sale.notes || '-'}
                                </TableCell>
                                <TableCell>₹{fmt(sale.finalAmount)}</TableCell>
                                <TableCell className="text-green-600">₹{fmt(sale.totalPaid)}</TableCell>
                                <TableCell className="text-orange-600">₹{fmt(sale.balance)}</TableCell>
                                <TableCell>
                                  {sale.status === 'TRANSFERRED' ? (
                                    <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                                      🔄 Transferred
                                    </Badge>
                                  ) : (
                                    <Badge variant={sale.status === 'Completed' ? 'default' : 'outline'}>
                                      {sale.status}
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <Button variant="ghost" size="sm" onClick={() => handleViewSale(sale.id)} title="View Details">
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                    {sale.status === 'TRANSFERRED' ? (
                                      <>
                                        <Button 
                                          variant="outline" 
                                          size="sm" 
                                          className="text-purple-600"
                                          onClick={() => {
                                            const resaleDeal = resaleDeals.find(r => r.id === sale.resaleDealId)
                                            if (resaleDeal) {
                                              setActiveTab('resales')
                                            }
                                          }}
                                          title="View Resale Deal"
                                        >
                                          <ArrowRightLeft className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => openLedger('sale', sale)} title="View Ledger (Read-only)">
                                          <Receipt className="w-4 h-4" />
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <Button variant="ghost" size="sm" onClick={() => { setEditingSale(sale); setDialogMode('editSale'); setIsDialogOpen(true); }} title="Edit Sale">
                                          <Pencil className="w-4 h-4" />
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => openLedger('sale', sale)} title="Sale Ledger">
                                          <Receipt className="w-4 h-4" />
                                        </Button>
                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" title="Delete Sale">
                                              <Trash2 className="w-4 h-4" />
                                            </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>Delete Sale?</AlertDialogTitle>
                                              <AlertDialogDescription>
                                                {sale.paymentCount > 0 ? (
                                                  <>
                                                    <span className="text-red-600 font-semibold">Warning:</span> This sale has {sale.paymentCount} payment(s) recorded.
                                                    <br /><br />
                                                    Deleting this sale will also delete:
                                                    <ul className="list-disc ml-4 mt-2">
                                                      <li>All related payment records</li>
                                                      <li>All related Daybook entries</li>
                                                    </ul>
                                                    <br />
                                                    The inventory will be restored to &quot;Available&quot; status.
                                                  </>
                                                ) : (
                                                  'This will permanently delete the sale and restore the inventory to Available status.'
                                                )}
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                                              <AlertDialogAction onClick={() => handleDeleteSale(sale.id)} className="bg-red-600 hover:bg-red-700">
                                                Delete Sale
                                              </AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                      </>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                        <TablePager
                          total={salesPage.total}
                          totalPages={salesPage.totalPages}
                          currentPage={salesPage.currentPage}
                          start={salesPage.start}
                          end={salesPage.end}
                          label="sales"
                          onChange={(p) => setSalesFilters(f => ({ ...f, page: p }))}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* View Sale Dialog */}
                <Dialog open={!!viewSaleId} onOpenChange={(open) => { if (!open) { setViewSaleId(null); setViewSaleData(null); } }}>
                  <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Sale Details</DialogTitle>
                    </DialogHeader>
                    {viewSaleData && (
                      <div className="space-y-6">
                        {/* Inventory Section */}
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <h4 className="font-semibold mb-2">Inventory Details</h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div><span className="text-gray-500">Type:</span> {viewSaleData.inventory?.type || '—'}</div>
                            <div><span className="text-gray-500">Number:</span> {viewSaleData.inventory?.inventoryNumber || '—'}</div>
                            <div><span className="text-gray-500">Area:</span> {viewSaleData.inventory?.area ? `${viewSaleData.inventory.area} sq ft` : '—'}</div>
                            <div><span className="text-gray-500">Phase:</span> {viewSaleData.inventory?.phase || '—'}</div>
                            <div><span className="text-gray-500">Floor:</span> {viewSaleData.inventory?.floor || '—'}</div>
                            <div><span className="text-gray-500">Facing:</span> {viewSaleData.inventory?.facing || '—'}</div>
                          </div>
                        </div>
                        
                        {/* Customer Section */}
                        <div className="bg-blue-50 p-4 rounded-lg">
                          <h4 className="font-semibold mb-2">Customer Details</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                            <div><span className="text-gray-500">Name:</span> {viewSaleData.customerName}</div>
                            <div><span className="text-gray-500">Phone:</span> {viewSaleData.customerPhone}</div>
                            <div className="col-span-2"><span className="text-gray-500">Address:</span> {viewSaleData.customerAddress || '-'}</div>
                          </div>
                        </div>
                        
                        {/* Financial Section */}
                        <div className="bg-green-50 p-4 rounded-lg">
                          <h4 className="font-semibold mb-2">Financial Details</h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                            <div><span className="text-gray-500">Deal Price:</span> ₹{fmt(viewSaleData.dealPrice)}</div>
                            <div><span className="text-gray-500">Discount:</span> ₹{fmt(viewSaleData.discount)}</div>
                            <div><span className="text-gray-500">Final Amount:</span> <span className="font-bold">₹{fmt(viewSaleData.finalAmount)}</span></div>
                            <div><span className="text-gray-500">Total Paid:</span> <span className="text-green-600">₹{fmt(viewSaleData.totalPaid)}</span></div>
                            <div><span className="text-gray-500">Balance:</span> <span className="text-orange-600">₹{fmt(viewSaleData.balance)}</span></div>
                            <div><span className="text-gray-500">Status:</span> <Badge variant={viewSaleData.status === 'Completed' ? 'default' : 'outline'}>{viewSaleData.status}</Badge></div>
                          </div>
                        </div>
                        
                        {/* Sale Info */}
                        <div className="text-sm">
                          <div><span className="text-gray-500">Sale Date:</span> {viewSaleData.saleDate ? new Date(viewSaleData.saleDate).toLocaleDateString() : '-'}</div>
                          {viewSaleData.notes && <div className="mt-2"><span className="text-gray-500">Notes:</span> {viewSaleData.notes}</div>}
                        </div>
                        
                        {/* Payment History */}
                        {viewSaleData.payments && viewSaleData.payments.length > 0 && (
                          <div>
                            <h4 className="font-semibold mb-2">Payment History ({viewSaleData.payments.length})</h4>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Date</TableHead>
                                  <TableHead>Amount</TableHead>
                                  <TableHead>Mode</TableHead>
                                  <TableHead>Account</TableHead>
                                  <TableHead>Remark</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {viewSaleData.payments.map(payment => (
                                  <TableRow key={payment.id}>
                                    <TableCell>{new Date(payment.paymentDate).toLocaleDateString()}</TableCell>
                                    <TableCell className="text-green-600">₹{fmt(payment.amount)}</TableCell>
                                    <TableCell>{payment.paymentMode}</TableCell>
                                    <TableCell>{payment.accountName}</TableCell>
                                    <TableCell>{payment.remark || '-'}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </TabsContent>

              {/* Resale Tab */}
              <TabsContent value="resales" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <ArrowRightLeft className="w-5 h-5" />
                        Resale Deals
                      </CardTitle>
                      <Dialog open={dialogMode === 'createResale' && isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setDialogMode('') }}>
                        <DialogTrigger asChild>
                          <Button onClick={() => { setDialogMode('createResale'); setCurrentItem(null); }}>
                            <Plus className="w-4 h-4 mr-2" /> Add Resale Deal
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Add Resale Deal</DialogTitle>
                            <DialogDescription>Transfer flat ownership from seller (investor) to new buyer</DialogDescription>
                          </DialogHeader>
                          <ResaleDealForm
                            inventory={inventory.filter(i => i.status === 'Sold' || i.status === 'Resold')}
                            sales={sales}
                            customers={customers}
                            resaleDeals={resaleDeals}
                            onSubmit={handleCreateResaleDeal}
                            onCancel={() => setIsDialogOpen(false)}
                            onCreateCustomer={async (customerData) => {
                              const newCustomer = await apiCall('/customers', 'POST', { ...customerData, societyId: selectedSociety })
                              await loadSocietyData()
                              return newCustomer
                            }}
                          />
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Resale Summary */}
                    {summary && (summary.resaleCount > 0) && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-blue-50 rounded-lg">
                        <div>
                          <p className="text-sm text-gray-600">Total Receivable (Buyer)</p>
                          <p className="text-lg font-bold text-blue-700">₹{fmt(summary.totalResaleReceivable)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Received from Buyers</p>
                          <p className="text-lg font-bold text-green-600">₹{fmt(summary.resaleReceived)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Total Payable (Seller)</p>
                          <p className="text-lg font-bold text-orange-600">₹{fmt(summary.totalResalePayable)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Expected Profit</p>
                          <p className="text-lg font-bold text-purple-600">₹{fmt(summary.expectedResaleProfit)}</p>
                        </div>
                      </div>
                    )}
                    
                    {/* Filter Bar */}
                    <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
                      <div className="flex items-center gap-2 mb-3">
                        <Filter className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">Search & Filters</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto"
                          onClick={() => setResalesFilters(f => ({ search: '', startDate: '', endDate: '', pageSize: f.pageSize, page: 1 }))}
                        >
                          <X className="w-4 h-4 mr-1" /> Clear
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs text-gray-500">Search (seller / buyer / inventory / notes)</Label>
                          <Input
                            placeholder="Type to filter…"
                            className="h-9"
                            value={resalesFilters.search}
                            onChange={(e) => setResalesFilters(f => ({ ...f, search: e.target.value, page: 1 }))}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">From Date</Label>
                          <Input type="date" className="h-9"
                            value={resalesFilters.startDate}
                            onChange={(e) => setResalesFilters(f => ({ ...f, startDate: e.target.value, page: 1 }))}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">To Date</Label>
                          <Input type="date" className="h-9"
                            value={resalesFilters.endDate}
                            onChange={(e) => setResalesFilters(f => ({ ...f, endDate: e.target.value, page: 1 }))}
                          />
                        </div>
                      </div>
                    </div>

                    {resaleDeals.length === 0 ? (
                      <div className="text-center py-8">
                        <ArrowRightLeft className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                        <p className="text-gray-500">No resale deals recorded yet</p>
                        <p className="text-sm text-gray-400">Create a resale deal when an existing owner sells to a new buyer</p>
                      </div>
                    ) : filteredResales.length === 0 ? (
                      <p className="text-center text-gray-500 py-8">No resale deals match your search / filters</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <div className="flex items-center justify-end mb-2">
                          <PageSizeSelect
                            value={resalesFilters.pageSize}
                            onChange={(n) => setResalesFilters(f => ({ ...f, pageSize: n, page: 1 }))}
                          />
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Inventory</TableHead>
                              <TableHead>Seller → Buyer</TableHead>
                              <TableHead>Notes</TableHead>
                              <TableHead>Buyer Amt</TableHead>
                              <TableHead>Buyer Paid</TableHead>
                              <TableHead>Seller Amt</TableHead>
                              <TableHead>Seller Paid</TableHead>
                              <TableHead>Commission / Margin</TableHead>
                              <TableHead>Net Profit</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {resalesPage.paged.map(deal => (
                              <TableRow key={deal.id}>
                                <TableCell>{new Date(deal.dealDate).toLocaleDateString()}</TableCell>
                                <TableCell className="font-medium">{deal.inventoryName}</TableCell>
                                <TableCell>
                                  <div className="text-sm">
                                    <span className="text-orange-600">{deal.sellerName}</span>
                                    <span className="mx-1">→</span>
                                    <span className="text-green-600">{deal.buyerName}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="max-w-[200px] truncate text-slate-600" title={deal.notes || ''}>
                                  {deal.notes || '-'}
                                </TableCell>
                                <TableCell>₹{fmt(deal.buyerPurchaseAmount || deal.resalePrice || 0)}</TableCell>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="text-green-600">₹{fmt(deal.buyerPaid)}</span>
                                    <Badge variant={deal.buyerStatus === 'PAID' ? 'default' : deal.buyerStatus === 'PARTIAL' ? 'secondary' : 'destructive'} className="text-xs mt-1 w-fit">
                                      {deal.buyerStatus}
                                    </Badge>
                                  </div>
                                </TableCell>
                                <TableCell>₹{fmt(deal.sellerPayoutAmount || Math.max(0, (deal.resalePrice || 0) - (deal.companyCommission || 0)))}</TableCell>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="text-orange-600">₹{fmt(deal.sellerPaid)}</span>
                                    <Badge variant={deal.sellerStatus === 'PAID' ? 'default' : deal.sellerStatus === 'PARTIAL' ? 'secondary' : 'destructive'} className="text-xs mt-1 w-fit">
                                      {deal.sellerStatus}
                                    </Badge>
                                  </div>
                                </TableCell>
                                {/* Company Commission / Margin — total on top,
                                    charges breakdown (transfer + brokerage +
                                    other) as a small grey hint below when any
                                    of them are set. */}
                                <TableCell>
                                  {(() => {
                                    const tc = Number(deal.transferCharges) || 0
                                    const br = Number(deal.brokerage) || 0
                                    const oc = Number(deal.otherCharges) || 0
                                    const cc = Number(deal.companyCommission) || 0
                                    const breakdownParts = []
                                    if (tc) breakdownParts.push(`T:₹${fmt(tc)}`)
                                    if (br) breakdownParts.push(`B:₹${fmt(br)}`)
                                    if (oc) breakdownParts.push(`O:₹${fmt(oc)}`)
                                    return (
                                      <div className="flex flex-col">
                                        <span className="text-amber-700 font-semibold">₹{fmt(cc)}</span>
                                        {breakdownParts.length > 0 && (
                                          <span className="text-[10px] text-slate-500" title="Transfer · Brokerage · Other">
                                            {breakdownParts.join(' · ')}
                                          </span>
                                        )}
                                      </div>
                                    )
                                  })()}
                                </TableCell>
                                <TableCell className={(deal.netProfit ?? ((deal.resalePrice || 0) - (deal.originalSalePrice || 0) - (deal.companyCommission || 0))) >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                                  ₹{fmt(deal.netProfit ?? ((deal.resalePrice || 0) - (deal.originalSalePrice || 0) - (deal.companyCommission || 0)))}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={deal.status === 'CLOSED' ? 'default' : deal.status === 'ACTIVE' ? 'secondary' : 'outline'}>
                                    {deal.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={() => openResalePayments(deal)}>
                                      <CreditCard className="w-4 h-4 mr-1" /> Payments
                                    </Button>
                                    {deal.status === 'ACTIVE' && deal.buyerStatus === 'PAID' && deal.sellerStatus === 'PAID' && (
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button variant="default" size="sm" className="bg-green-600 hover:bg-green-700">
                                            <CheckCircle className="w-4 h-4 mr-1" /> Close
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Close Resale Deal?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              This will transfer ownership from {deal.sellerName} to {deal.buyerName}. This action cannot be undone.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleCloseResaleDeal(deal.id)}>Close Deal</AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    )}
                                    {deal.status !== 'CLOSED' && (
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button variant="destructive" size="sm">
                                            <Trash2 className="w-4 h-4" />
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Delete Resale Deal?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              This will delete the deal and all associated payments. This action cannot be undone.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleDeleteResaleDeal(deal.id)}>Delete</AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <TablePager
                          total={resalesPage.total}
                          totalPages={resalesPage.totalPages}
                          currentPage={resalesPage.currentPage}
                          start={resalesPage.start}
                          end={resalesPage.end}
                          label="deals"
                          onChange={(p) => setResalesFilters(f => ({ ...f, page: p }))}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Vendors Tab hidden (user request). Wrapped in false && (...)
                  so the JSX stays in source and can be revived by removing the
                  guard. */}
              {false && (
              <TabsContent value="vendors" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <UserCheck className="w-5 h-5" />
                        Vendor Master
                      </CardTitle>
                      <Dialog open={dialogMode === 'createVendor' && isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setDialogMode('') }}>
                        <DialogTrigger asChild>
                          <Button onClick={() => { setDialogMode('createVendor'); setCurrentItem(null); }}>
                            <Plus className="w-4 h-4 mr-2" /> Add Vendor
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg">
                          <DialogHeader>
                            <DialogTitle>Add New Vendor</DialogTitle>
                          </DialogHeader>
                          <VendorForm onSubmit={handleCreateVendor} onCancel={() => setIsDialogOpen(false)} vendorTypes={vendorTypes} onAddNewType={loadMasterData} />
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {vendors.length === 0 ? (
                      <p className="text-center text-gray-500 py-8">No vendors added yet</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Notes</TableHead>
                            <TableHead>Total Paid</TableHead>
                            <TableHead>Total Due</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {vendors.map(vendor => (
                            <TableRow key={vendor.id}>
                              <TableCell className="font-medium">{vendor.name}</TableCell>
                              <TableCell>
                                <Badge variant={vendor.type === 'Broker' ? 'default' : 'secondary'}>
                                  {vendor.type}
                                </Badge>
                              </TableCell>
                              <TableCell>{vendor.phone || '-'}</TableCell>
                              <TableCell>{vendor.notes||'-'}</TableCell>
                              <TableCell className="text-green-600 font-medium">₹{fmt(vendor.totalPaid)}</TableCell>
                              <TableCell className="text-orange-600 font-medium">₹{fmt(vendor.totalDue)}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Button variant="outline" size="sm" onClick={() => openVendorLedger(vendor)}>
                                    <Eye className="w-4 h-4 mr-1" /> Ledger
                                  </Button>
                                  <Dialog open={dialogMode === `editVendor-${vendor.id}` && isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setDialogMode('') }}>
                                    <DialogTrigger asChild>
                                      <Button variant="outline" size="sm" onClick={() => { setDialogMode(`editVendor-${vendor.id}`); setCurrentItem(vendor); }}>
                                        <Edit className="w-4 h-4" />
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-lg">
                                      <DialogHeader>
                                        <DialogTitle>Edit Vendor</DialogTitle>
                                      </DialogHeader>
                                      <VendorForm vendor={vendor} onSubmit={(data) => handleUpdateVendor(vendor.id, data)} onCancel={() => setIsDialogOpen(false)} vendorTypes={vendorTypes} onAddNewType={loadMasterData} />
                                    </DialogContent>
                                  </Dialog>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="destructive" size="sm">
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Vendor?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          This vendor can only be deleted if they have no unpaid bills.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeleteVendor(vendor.id)}>Delete</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              )}

              {/* Vendor Ledger Tab (Builder Daily Khata view).
                  Same UI for the Commission Ledger — scope flips title +
                  vendor-type filtering. */}
              <TabsContent value="expenses" className="space-y-4">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${vendorLedgerScope === 'commission' ? 'bg-purple-100' : 'bg-orange-100'}`}>
                      <BookOpen className={`w-5 h-5 ${vendorLedgerScope === 'commission' ? 'text-purple-600' : 'text-orange-600'}`} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">
                        {vendorLedgerScope === 'commission' ? 'Commission Ledger' : 'Vendor Ledger'}
                      </h2>
                      <p className="text-sm text-slate-500">
                        {vendorLedgerScope === 'commission'
                          ? 'Commission Daily Khata — Bills & Payments'
                          : 'Builder Daily Khata — Work, Material & Payments'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={openGlobalLedger}>
                      <BookOpen className="w-4 h-4 mr-2" /> View All Activity
                    </Button>
                    <Dialog
                      open={dialogMode === 'createVendorLedgerVendor' && isDialogOpen}
                      onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setDialogMode('') }}
                    >
                    <DialogTrigger asChild>
                      <Button onClick={() => { setDialogMode('createVendorLedgerVendor'); setCurrentItem(null); }}>
                        <Plus className="w-4 h-4 mr-2" /> Add {vendorLedgerScope === 'commission' ? 'Commission Vendor' : 'Vendor'}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>
                          {vendorLedgerScope === 'commission' ? 'Add New Commission Vendor' : 'Add New Vendor'}
                        </DialogTitle>
                      </DialogHeader>
                      <VendorForm
                        onSubmit={(data) => handleCreateVendor(
                          vendorLedgerScope === 'commission'
                            ? { ...data, type: 'Commission' }
                            : data
                        )}
                        onCancel={() => setIsDialogOpen(false)}
                        vendorTypes={
                          vendorLedgerScope === 'commission'
                            ? (vendorTypes || []).filter(t => (t.name || t) === 'Commission')
                            : (vendorTypes || []).filter(t => (t.name || t) !== 'Broker' && (t.name || t) !== 'Commission')
                        }
                        defaultType={vendorLedgerScope === 'commission' ? 'Commission' : undefined}
                        lockType={vendorLedgerScope === 'commission'}
                        onAddNewType={loadMasterData}
                      />
                    </DialogContent>
                  </Dialog>
                  </div>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Total Vendors</p>
                      <p className="text-2xl font-bold text-slate-900 mt-1">{vendorLedgerTotals.totalVendors}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-blue-50/60">
                    <CardContent className="p-4 text-center">
                      <p className="text-xs uppercase tracking-wide text-blue-700">Total Work Value</p>
                      <p className="text-2xl font-bold text-blue-700 mt-1">₹{fmt(vendorLedgerTotals.totalWorkValue)}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-green-50/60">
                    <CardContent className="p-4 text-center">
                      <p className="text-xs uppercase tracking-wide text-green-700">Total Paid</p>
                      <p className="text-2xl font-bold text-green-700 mt-1">₹{fmt(vendorLedgerTotals.totalPaid)}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-red-50/60">
                    <CardContent className="p-4 text-center">
                      <p className="text-xs uppercase tracking-wide text-red-700">Pending Payment</p>
                      <p className="text-2xl font-bold text-red-700 mt-1">₹{fmt(vendorLedgerTotals.totalPending)}</p>
                    </CardContent>
                  </Card>
                  {/* Labour / Material breakdown only applies to the regular
                      Vendor Ledger — commission vendors don't have work
                      categories, so we hide these two cards in that scope. */}
                  {vendorLedgerScope !== 'commission' && (
                    <>
                      <Card className="bg-purple-50/60">
                        <CardContent className="p-4 text-center">
                          <p className="text-xs uppercase tracking-wide text-purple-700">Labour Cost</p>
                          <p className="text-2xl font-bold text-purple-700 mt-1">₹{fmt(vendorLedgerTotals.labourCost)}</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-amber-50/60">
                        <CardContent className="p-4 text-center">
                          <p className="text-xs uppercase tracking-wide text-amber-700">Material Cost</p>
                          <p className="text-2xl font-bold text-amber-700 mt-1">₹{fmt(vendorLedgerTotals.materialCost)}</p>
                        </CardContent>
                      </Card>
                    </>
                  )}
                </div>

                {/* Filters */}
                <Card>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Input
                        placeholder="Search vendor name, phone…"
                        value={vendorLedgerFilters.search}
                        onChange={(e) => setVendorLedgerFilters(f => ({ ...f, search: e.target.value }))}
                      />
                      <Select
                        value={vendorLedgerFilters.category}
                        onValueChange={(v) => setVendorLedgerFilters(f => ({ ...f, category: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="All Categories" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Categories</SelectItem>
                          {vendorLedgerCategories.map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={vendorLedgerFilters.status}
                        onValueChange={(v) => setVendorLedgerFilters(f => ({ ...f, status: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="All Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="advance">Advance</SelectItem>
                          <SelectItem value="cleared">Cleared</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                {/* Vendor table */}
                <Card>
                  <CardContent className="p-0">
                    {vendorLedgerRows.length === 0 ? (
                      <div className="text-center py-12">
                        <UserCheck className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                        <p className="text-gray-500">No vendors yet</p>
                        <p className="text-sm text-gray-400">Click “Add Vendor” to get started. (Brokers are tracked in Commissions.)</p>
                      </div>
                    ) : filteredVendorLedger.length === 0 ? (
                      <div className="text-center py-12">
                        <Filter className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                        <p className="text-gray-500">No vendors match your filters</p>
                      </div>
                    ) : (
                      <>
                      <div className="flex items-center justify-end mb-2">
                        <PageSizeSelect
                          value={vendorLedgerFilters.pageSize}
                          onChange={(n) => setVendorLedgerFilters(f => ({ ...f, pageSize: n, page: 1 }))}
                        />
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Vendor</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Work Value</TableHead>
                            <TableHead>Amount Paid</TableHead>
                            <TableHead>Pending Payment</TableHead>
                            <TableHead>Last Activity</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {vendorLedgerPage.paged.map(row => (
                            <TableRow key={row.id}>
                              <TableCell className="font-medium">{row.name}</TableCell>
                              <TableCell>
                                <Badge variant="secondary">{row.displayCategory}</Badge>
                              </TableCell>
                              <TableCell className="text-blue-700 font-medium">₹{fmt(row.workValue)}</TableCell>
                              <TableCell className="text-green-700 font-medium">₹{fmt(row.amountPaid)}</TableCell>
                              <TableCell>
                                {row.pending > 0 ? (
                                  <span className="text-red-700 font-medium">₹{fmt(row.pending)} pending</span>
                                ) : row.advance > 0 ? (
                                  <span className="text-orange-600 font-medium">₹{fmt(row.advance)} advance</span>
                                ) : (
                                  <span className="text-slate-500">Cleared</span>
                                )}
                              </TableCell>
                              <TableCell className="text-slate-500">
                                {row.lastActivity ? new Date(row.lastActivity).toLocaleDateString() : '-'}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Button variant="outline" size="sm" onClick={() => openVendorLedger(row)}>
                                    <BookOpen className="w-4 h-4 mr-1" /> Ledger
                                  </Button>
                                  <Button size="sm" onClick={() => openAddWorkForVendor(row)}>
                                    <Plus className="w-4 h-4 mr-1" /> Add Work
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => openPaymentForVendor(row)}
                                  >
                                    <Wallet className="w-4 h-4 mr-1" /> Payment
                                  </Button>
                                  <Dialog open={dialogMode === `editVendorLedger-${row.id}` && isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setDialogMode('') }}>
                                    <DialogTrigger asChild>
                                      <Button variant="ghost" size="sm" onClick={() => { setDialogMode(`editVendorLedger-${row.id}`); setCurrentItem(row); }} title="Edit vendor">
                                        <Pencil className="w-4 h-4" />
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-lg">
                                      <DialogHeader>
                                        <DialogTitle>Edit Vendor</DialogTitle>
                                      </DialogHeader>
                                      <VendorForm
                                        vendor={row}
                                        onSubmit={(data) => handleUpdateVendor(row.id, vendorLedgerScope === 'commission' ? { ...data, type: 'Commission' } : data)}
                                        onCancel={() => setIsDialogOpen(false)}
                                        vendorTypes={
                                          vendorLedgerScope === 'commission'
                                            ? (vendorTypes || []).filter(t => (t.name || t) === 'Commission')
                                            : vendorTypes
                                        }
                                        defaultType={vendorLedgerScope === 'commission' ? 'Commission' : undefined}
                                        lockType={vendorLedgerScope === 'commission'}
                                        onAddNewType={loadMasterData}
                                      />
                                    </DialogContent>
                                  </Dialog>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="sm" title="Delete vendor">
                                        <Trash2 className="w-4 h-4 text-red-500" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Vendor?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          This vendor can only be deleted if they have no unpaid bills.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeleteVendor(row.id)}>Delete</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <TablePager
                        total={vendorLedgerPage.total}
                        totalPages={vendorLedgerPage.totalPages}
                        currentPage={vendorLedgerPage.currentPage}
                        start={vendorLedgerPage.start}
                        end={vendorLedgerPage.end}
                        label="vendors"
                        onChange={(p) => setVendorLedgerFilters(f => ({ ...f, page: p }))}
                      />
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Commissions Tab — hidden (user request). Wrapped in
                  `false && (...)` so it stays in source and can be revived. */}
              {false && (
              <TabsContent value="commissions" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Percent className="w-5 h-5" />
                        Commission Bills (Broker)
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={exportCommissionsToCSV}>
                          <FileSpreadsheet className="w-4 h-4 mr-1" /> CSV
                        </Button>
                        <Button variant="outline" size="sm" onClick={exportCommissionsToPDF}>
                          <FileText className="w-4 h-4 mr-1" /> PDF
                        </Button>
                        <Dialog open={dialogMode === 'createCommissionBill' && isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setDialogMode('') }}>
                          <DialogTrigger asChild>
                            <Button onClick={() => { setDialogMode('createCommissionBill'); setCurrentItem(null); }}>
                              <Plus className="w-4 h-4 mr-2" /> Add Commission Bill
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Add Commission Bill</DialogTitle>
                            </DialogHeader>
                            <CommissionBillForm 
                              brokers={vendors.filter(v => v.type === 'Broker')} 
                              sales={sales} 
                              inventory={inventory}
                              onSubmit={handleCreateCommissionBill} 
                              onCancel={() => setIsDialogOpen(false)} 
                            />
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                    {/* Filter Bar */}
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                      <div className="flex items-center gap-2 mb-3">
                        <Filter className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">Filters</span>
                        <Button variant="ghost" size="sm" onClick={clearCommissionFilters} className="ml-auto">
                          <X className="w-4 h-4 mr-1" /> Clear
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div className="md:col-span-2">
                          <Label className="text-xs text-gray-500">Search</Label>
                          <Input
                            placeholder="Broker / customer / inventory / description"
                            className="h-9"
                            value={commissionFilters.search}
                            onChange={(e) => setCommissionFilters(f => ({ ...f, search: e.target.value, page: 1 }))}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">Status</Label>
                          <Select value={commissionFilters.status} onValueChange={(v) => setCommissionFilters(f => ({ ...f, status: v, page: 1 }))}>
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="All Status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Status</SelectItem>
                              <SelectItem value="UNPAID">Unpaid</SelectItem>
                              <SelectItem value="PARTIAL">Partial</SelectItem>
                              <SelectItem value="PAID">Paid</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">Broker</Label>
                          <Select value={commissionFilters.brokerId} onValueChange={(v) => setCommissionFilters(f => ({ ...f, brokerId: v, page: 1 }))}>
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="All Brokers" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Brokers</SelectItem>
                              {vendors.filter(v => v.type === 'Broker').map(b => (
                                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">From Date</Label>
                          <Input
                            type="date"
                            className="h-9"
                            value={commissionFilters.startDate}
                            onChange={(e) => setCommissionFilters(f => ({ ...f, startDate: e.target.value, page: 1 }))}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">To Date</Label>
                          <Input
                            type="date"
                            className="h-9"
                            value={commissionFilters.endDate}
                            onChange={(e) => setCommissionFilters(f => ({ ...f, endDate: e.target.value, page: 1 }))}
                          />
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {commissionBills.length === 0 ? (
                      <div className="text-center py-8">
                        <Percent className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                        <p className="text-gray-500">No commission bills recorded yet</p>
                        <p className="text-sm text-gray-400">Add a broker vendor and sales first</p>
                      </div>
                    ) : filteredCommissionBills.length === 0 ? (
                      <div className="text-center py-8">
                        <Filter className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                        <p className="text-gray-500">No bills match your filters</p>
                        <Button variant="link" onClick={clearCommissionFilters}>Clear Filters</Button>
                      </div>
                    ) : (
                      <>
                        {/* Totals Summary */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 p-3 bg-purple-50 rounded-lg">
                          <div className="text-center">
                            <p className="text-xs text-gray-500">Total Commission</p>
                            <p className="text-lg font-semibold">₹{fmt(commissionTotals.totalCommission)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500">Total Paid</p>
                            <p className="text-lg font-semibold text-green-600">₹{fmt(commissionTotals.totalPaid)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500">Total Balance</p>
                            <p className="text-lg font-semibold text-orange-600">₹{fmt(commissionTotals.totalBalance)}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-end mb-2">
                          <PageSizeSelect
                            value={commissionFilters.pageSize}
                            onChange={(n) => setCommissionFilters(f => ({ ...f, pageSize: n, page: 1 }))}
                          />
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Broker</TableHead>
                              <TableHead>Sale (Customer)</TableHead>
                              <TableHead>Inventory</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead>Commission</TableHead>
                              <TableHead>Paid</TableHead>
                              <TableHead>Balance</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {commissionBillsPage.paged.map(bill => (
                              <TableRow key={bill.id}>
                                <TableCell>{new Date(bill.commissionDate).toLocaleDateString()}</TableCell>
                                <TableCell className="font-medium">{bill.brokerName}</TableCell>
                                <TableCell>{bill.customerName}</TableCell>
                                <TableCell>{bill.inventoryName}</TableCell>
                                <TableCell>{bill.description || '-'}</TableCell>
                                <TableCell>₹{fmt(bill.commissionAmount)}</TableCell>
                                <TableCell className="text-green-600">₹{fmt(bill.totalPaid)}</TableCell>
                                <TableCell className="text-orange-600">₹{fmt(bill.balance)}</TableCell>
                                <TableCell>
                                  <Badge variant={bill.status === 'PAID' ? 'default' : bill.status === 'PARTIAL' ? 'secondary' : 'destructive'}>
                                    {bill.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={() => openBillPayments('commission', bill)}>
                                      <CreditCard className="w-4 h-4 mr-1" /> Payments
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setEditingCommissionBill(bill)}
                                      title="Edit bill"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="destructive" size="sm">
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Delete Commission Bill?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            This will delete the bill and all associated payments. This action cannot be undone.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => handleDeleteCommissionBill(bill.id)}>Delete</AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <TablePager
                          total={commissionBillsPage.total}
                          totalPages={commissionBillsPage.totalPages}
                          currentPage={commissionBillsPage.currentPage}
                          start={commissionBillsPage.start}
                          end={commissionBillsPage.end}
                          label="bills"
                          onChange={(p) => setCommissionFilters(f => ({ ...f, page: p }))}
                        />
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              )}

              {/* Margins Tab */}
              <TabsContent value="margins" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <IndianRupee className="w-5 h-5" />
                        Margin Ledger
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Dialog open={dialogMode === 'createMarginBill' && isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setDialogMode('') }}>
                          <DialogTrigger asChild>
                            <Button onClick={() => { setDialogMode('createMarginBill'); setCurrentItem(null); }}>
                              <Plus className="w-4 h-4 mr-2" /> Add Margin Bill
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Add Margin Bill</DialogTitle>
                            </DialogHeader>
                            <MarginBillForm
                              accounts={accounts}
                              onSubmit={handleCreateMarginBill}
                              onCancel={() => setIsDialogOpen(false)}
                            />
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                    {/* Filter Bar */}
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                      <div className="flex items-center gap-2 mb-3">
                        <Filter className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">Filters</span>
                        <Button variant="ghost" size="sm" onClick={clearMarginFilters} className="ml-auto">
                          <X className="w-4 h-4 mr-1" /> Clear
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <Label className="text-xs text-gray-500">Search</Label>
                          <Input
                            placeholder="Remark"
                            className="h-9"
                            value={marginFilters.search}
                            onChange={(e) => setMarginFilters(f => ({ ...f, search: e.target.value, page: 1 }))}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">Status</Label>
                          <Select value={marginFilters.status} onValueChange={(v) => setMarginFilters(f => ({ ...f, status: v, page: 1 }))}>
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="All Status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Status</SelectItem>
                              <SelectItem value="PENDING">Pending</SelectItem>
                              <SelectItem value="PARTIAL">Partial</SelectItem>
                              <SelectItem value="PAID">Paid</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">From Date</Label>
                          <Input
                            type="date"
                            className="h-9"
                            value={marginFilters.startDate}
                            onChange={(e) => setMarginFilters(f => ({ ...f, startDate: e.target.value, page: 1 }))}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">To Date</Label>
                          <Input
                            type="date"
                            className="h-9"
                            value={marginFilters.endDate}
                            onChange={(e) => setMarginFilters(f => ({ ...f, endDate: e.target.value, page: 1 }))}
                          />
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {marginBills.length === 0 ? (
                      <div className="text-center py-8">
                        <IndianRupee className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                        <p className="text-gray-500">No margin bills recorded yet</p>
                        <p className="text-sm text-gray-400">{resaleDeals.length === 0 ? 'Add a resale deal first' : 'Click Add Margin Bill to record one'}</p>
                      </div>
                    ) : filteredMarginBills.length === 0 ? (
                      <div className="text-center py-8">
                        <Filter className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                        <p className="text-gray-500">No bills match your filters</p>
                        <Button variant="link" onClick={clearMarginFilters}>Clear Filters</Button>
                      </div>
                    ) : (
                      <>
                        {/* Totals Summary */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 p-3 bg-emerald-50 rounded-lg">
                          <div className="text-center">
                            <p className="text-xs text-gray-500">Total Margin</p>
                            <p className="text-lg font-semibold">₹{fmt(marginTotals.totalMargin)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500">Total Paid</p>
                            <p className="text-lg font-semibold text-green-600">₹{fmt(marginTotals.totalPaid)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500">Total Balance</p>
                            <p className="text-lg font-semibold text-orange-600">₹{fmt(marginTotals.totalBalance)}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-end mb-2">
                          <PageSizeSelect
                            value={marginFilters.pageSize}
                            onChange={(n) => setMarginFilters(f => ({ ...f, pageSize: n, page: 1 }))}
                          />
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Remark</TableHead>
                              <TableHead>Margin</TableHead>
                              <TableHead>Paid</TableHead>
                              <TableHead>Balance</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {marginBillsPage.paged.map(bill => {
                              const parsedDate = bill.billDate ? new Date(bill.billDate) : null
                              const dateLabel = parsedDate && !isNaN(parsedDate.getTime())
                                ? parsedDate.toLocaleDateString()
                                : '—'
                              return (
                                <TableRow key={bill.id}>
                                  <TableCell>{dateLabel}</TableCell>
                                  <TableCell>{bill.description || bill.remark || '-'}</TableCell>
                                  <TableCell>₹{fmt(bill.amount)}</TableCell>
                                  <TableCell className="text-green-600">₹{fmt(bill.totalPaid)}</TableCell>
                                  <TableCell className="text-orange-600">₹{fmt(bill.balance)}</TableCell>
                                  <TableCell>
                                    <Badge variant={bill.status === 'PAID' ? 'default' : bill.status === 'PARTIAL' ? 'secondary' : 'destructive'}>
                                      {bill.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <Button variant="outline" size="sm" onClick={() => openBillPayments('margin', bill)}>
                                        <CreditCard className="w-4 h-4 mr-1" /> Payments
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setEditingMarginBill(bill)}
                                        title="Edit bill"
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </Button>
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button variant="destructive" size="sm">
                                            <Trash2 className="w-4 h-4" />
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Delete Margin Bill?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              This will delete the bill and all associated payments. This action cannot be undone.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleDeleteMarginBill(bill.id)}>Delete</AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                        <TablePager
                          total={marginBillsPage.total}
                          totalPages={marginBillsPage.totalPages}
                          currentPage={marginBillsPage.currentPage}
                          start={marginBillsPage.start}
                          end={marginBillsPage.end}
                          label="bills"
                          onChange={(p) => setMarginFilters(f => ({ ...f, page: p }))}
                        />
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </div>

      {/* Partner/Purchase/Sale Ledger Drawer */}
      <LedgerDrawer
        isOpen={isLedgerDrawerOpen}
        onClose={() => setIsLedgerDrawerOpen(false)}
        ledgerType={ledgerType}
        ledgerItem={ledgerItem}
        entries={ledgerEntries}
        accounts={accounts}
        sales={sales}
        onAddEntry={handleAddLedgerEntry}
        onTransfer={handleTransferBetweenSales}
        onUpdateTransfer={handleUpdateTransfer}
        onDeleteEntry={handleDeleteLedgerEntry}
        onEditEntry={(entry) => setEditingLedgerEntry(entry)}
      />

      {/* Edit Partner Dialog */}
      <Dialog open={!!editingPartner} onOpenChange={(open) => !open && setEditingPartner(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Partner</DialogTitle>
            <DialogDescription>Update partner details. Total percentage across all partners cannot exceed 100%.</DialogDescription>
          </DialogHeader>
          {editingPartner && (
            <EditPartnerForm 
              partner={editingPartner}
              existingPartners={partners.filter(p => p.id !== editingPartner.id)}
              onSubmit={handleUpdatePartner}
              onCancel={() => setEditingPartner(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Purchase Dialog */}
      <Dialog open={!!editingPurchase} onOpenChange={(open) => !open && setEditingPurchase(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Purchase</DialogTitle>
            <DialogDescription>
              Update purchase details. Deal amount can&apos;t be set below the already-paid total.
            </DialogDescription>
          </DialogHeader>
          {editingPurchase && (
            <PurchaseForm
              initialData={editingPurchase}
              onSubmit={handleUpdatePurchase}
              onCancel={() => setEditingPurchase(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Expense Bill Dialog */}
      <Dialog open={!!editingExpenseBill} onOpenChange={(open) => !open && setEditingExpenseBill(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Expense Bill</DialogTitle>
            <DialogDescription>
              Update bill details. Bill amount can&apos;t be reduced below already paid.
            </DialogDescription>
          </DialogHeader>
          {editingExpenseBill && (
            <ExpenseBillForm
              vendors={vendors}
              initialData={editingExpenseBill}
              onSubmit={handleUpdateExpenseBill}
              onCancel={() => setEditingExpenseBill(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Commission Bill Dialog */}
      <Dialog open={!!editingCommissionBill} onOpenChange={(open) => !open && setEditingCommissionBill(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Commission Bill</DialogTitle>
            <DialogDescription>
              Update commission details. Commission amount can&apos;t be reduced below already paid.
            </DialogDescription>
          </DialogHeader>
          {editingCommissionBill && (
            <CommissionBillForm
              brokers={vendors.filter(v => v.type === 'Broker')}
              sales={sales}
              inventory={inventory}
              initialData={editingCommissionBill}
              onSubmit={handleUpdateCommissionBill}
              onCancel={() => setEditingCommissionBill(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Margin Bill Dialog */}
      <Dialog open={!!editingMarginBill} onOpenChange={(open) => !open && setEditingMarginBill(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Margin Bill</DialogTitle>
            <DialogDescription>
              Update margin details. Margin amount can&apos;t be reduced below already paid.
            </DialogDescription>
          </DialogHeader>
          {editingMarginBill && (
            <MarginBillForm
              initialData={editingMarginBill}
              onSubmit={handleUpdateMarginBill}
              onCancel={() => setEditingMarginBill(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Ledger Entry Dialog */}
      <Dialog open={!!editingLedgerEntry} onOpenChange={(open) => !open && setEditingLedgerEntry(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Ledger Entry</DialogTitle>
            <DialogDescription>Update the ledger entry. A reversal will be created for the original transaction.</DialogDescription>
          </DialogHeader>
          {editingLedgerEntry && (
            <EditLedgerEntryForm
              entry={editingLedgerEntry}
              ledgerType={ledgerType}
              accounts={accounts}
              onSubmit={handleUpdateLedgerEntry}
              onCancel={() => setEditingLedgerEntry(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Bill Payment Drawer */}
      <BillPaymentDrawer
        isOpen={isPaymentDrawerOpen}
        onClose={() => setIsPaymentDrawerOpen(false)}
        billType={paymentBillType}
        bill={paymentBill}
        payments={billPayments}
        accounts={accounts}
        onAddPayment={handleAddBillPayment}
        onDeletePayment={handleDeleteBillPayment}
        onUpdatePayment={handleUpdateBillPayment}
      />

      {/* Add Work dialog — mounted at top level so it works from any tab
          (Dashboard, Vendor Ledger, etc.) when triggered programmatically
          via setDialogMode('createExpenseBill'). */}
      <Dialog
        open={dialogMode === 'createExpenseBill' && isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open)
          if (!open) { setDialogMode(''); setAddWorkVendor(null) }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {addWorkVendor
                ? (addWorkVendor._preselectQuickPay
                    ? `Quick Pay — ${addWorkVendor.name}`
                    : `Add Work — ${addWorkVendor.name}`)
                : 'Add Work Entry'}
            </DialogTitle>
          </DialogHeader>
          <ExpenseBillForm
            vendors={vendors}
            accounts={accounts}
            initialData={addWorkVendor
              ? { vendorId: addWorkVendor.id, quickPay: !!addWorkVendor._preselectQuickPay }
              : undefined}
            onSubmit={handleCreateExpenseBill}
            onCancel={() => { setIsDialogOpen(false); setAddWorkVendor(null) }}
          />
        </DialogContent>
      </Dialog>

      {/* Vendor Ledger Drawer */}
      <VendorLedgerDrawer
        isOpen={isVendorLedgerOpen}
        onClose={() => setIsVendorLedgerOpen(false)}
        vendor={vendorLedgerItem}
        entries={vendorLedgerEntries}
        onExportCSV={exportVendorLedgerToCSV}
        onExportPDF={exportVendorLedgerToPDF}
        onAddWork={(v) => handleVendorDetailAddWork(v)}
        onAddPayment={(v) => handleVendorDetailAddPayment(v)}
        onAddLabour={(v) => handleVendorDetailAddWork(v, { preselectLabour: true })}
        onQuickPay={(v) => handleVendorDetailAddWork(v, { preselectQuickPay: true })}
        onDeleteEntry={handleVendorLedgerDelete}
        onEditEntry={handleVendorLedgerEdit}
      />

      {/* Global Ledger — cross-vendor read-only view, opened from the
          "View All Activity" button on the vendor/commission ledger page. */}
      <GlobalLedgerDrawer
        isOpen={isGlobalLedgerOpen}
        onClose={() => setIsGlobalLedgerOpen(false)}
        scope={vendorLedgerScope}
        entries={globalLedgerEntries}
        loading={globalLedgerLoading}
        onExportCSV={exportGlobalLedgerToCSV}
      />

      {/* Vendor Ledger — Edit Payment dialog (overlays VendorLedgerDrawer) */}
      <VendorPaymentEditDialog
        payment={editingVendorPayment}
        accounts={accounts}
        onClose={() => setEditingVendorPayment(null)}
        onSubmit={handleSubmitVendorPaymentEdit}
      />

      {/* Vendor Ledger — Add Payment / Withdrawal (vendor-level).
          Both flows live in this one dialog now (type selector inside). */}
      <VendorAddPaymentDialog
        context={addingVendorPayment}
        accounts={accounts}
        onClose={() => setAddingVendorPayment(null)}
        onSubmit={handleSubmitVendorAddPayment}
      />

      {/* Resale Payment Drawer */}
      <ResalePaymentDrawer
        isOpen={isResalePaymentDrawerOpen}
        onClose={() => setIsResalePaymentDrawerOpen(false)}
        deal={resaleDeal}
        buyerPayments={resaleBuyerPayments}
        sellerPayouts={resaleSellerPayouts}
        accounts={accounts}
        onAddBuyerPayment={handleAddBuyerPayment}
        onDeleteBuyerPayment={handleDeleteBuyerPayment}
        onEditBuyerPayment={handleEditBuyerPayment}
        onAddSellerPayout={handleAddSellerPayout}
        onDeleteSellerPayout={handleDeleteSellerPayout}
        onEditSellerPayout={handleEditSellerPayout}
      />

      {/* Recycle Bin Dialog */}
      <Dialog open={showRecycleBin} onOpenChange={(open) => { setShowRecycleBin(open); if (open) loadRecycleBin(); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-gray-600" />
              Recycle Bin - Deleted Records
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Filter */}
            <div className="flex items-center gap-2">
              <Select value={recycleBinFilter || 'all'} onValueChange={(v) => { setRecycleBinFilter(v === 'all' ? '' : v); }}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="salePayments">Sale Payments</SelectItem>
                  <SelectItem value="inventory">Inventory</SelectItem>
                  <SelectItem value="purchases">Purchases</SelectItem>
                  <SelectItem value="purchasePayments">Purchase Payments</SelectItem>
                  <SelectItem value="partners">Partners</SelectItem>
                  <SelectItem value="partnerLedgerEntries">Partner Ledger Entries</SelectItem>
                  <SelectItem value="customers">Customers</SelectItem>
                  <SelectItem value="customerPayments">Customer Payments</SelectItem>
                  <SelectItem value="vendors">Vendors</SelectItem>
                  <SelectItem value="expenseBills">Expense Bills</SelectItem>
                  <SelectItem value="expensePayments">Expense Payments</SelectItem>
                  <SelectItem value="commissionBills">Commission Bills</SelectItem>
                  <SelectItem value="commissionPayments">Commission Payments</SelectItem>
                  <SelectItem value="resaleDeals">Resale Deals</SelectItem>
                  <SelectItem value="resaleBuyerPayments">Resale Buyer Payments</SelectItem>
                  <SelectItem value="resaleSellerPayouts">Resale Seller Payouts</SelectItem>
                  <SelectItem value="parties">Parties</SelectItem>
                  <SelectItem value="loans">Loans</SelectItem>
                  <SelectItem value="loanRepayments">Loan Repayments</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={loadRecycleBin}>
                <RefreshCw className="w-4 h-4 mr-1" /> Refresh
              </Button>
            </div>
            
            {/* Summary */}
            {Object.keys(recycleBinData.summary).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(recycleBinData.summary).map(([key, count]) => (
                  <Badge key={key} variant="secondary">{key}: {count}</Badge>
                ))}
              </div>
            )}
            
            {/* Records Table */}
            {recycleBinData.records.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Trash2 className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                <p>Recycle bin is empty</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Name/ID</TableHead>
                    <TableHead>Deleted At</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recycleBinData.records.slice(0, 50).map((record) => (
                    <TableRow key={`${record._collectionName}-${record.id}`}>
                      <TableCell>
                        <Badge variant="outline">{record._collectionLabel}</Badge>
                      </TableCell>
                      <TableCell>
                        {record.customerName || record.name || record.inventoryNumber || record.partyName || record.id.substring(0, 8)}
                      </TableCell>
                      <TableCell>{record.deletedAt ? new Date(record.deletedAt).toLocaleString() : '-'}</TableCell>
                      <TableCell className="max-w-xs truncate">{record.deleteReason || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="text-green-600"
                            onClick={() => restoreRecord(record._collectionName, record.id)}
                          >
                            <RefreshCw className="w-4 h-4 mr-1" /> Restore
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="destructive">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Permanently Delete?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently remove this record and cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction 
                                  className="bg-red-600"
                                  onClick={() => permanentDeleteRecord(record._collectionName, record.id)}
                                >
                                  Delete Forever
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Audit Logs Dialog */}
      <Dialog open={showAuditLogs} onOpenChange={(open) => { setShowAuditLogs(open); if (open) loadAuditLogs(); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-gray-600" />
              Audit Logs - Activity History
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Search + rows-per-page. Changing page size re-fetches from the
                server so the requested number of rows is actually loaded. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
              <div>
                <Label className="text-xs text-gray-500">Search (action / entity / user / reason)</Label>
                <Input
                  placeholder="Type to filter…"
                  className="h-9"
                  value={auditLogsFilters.search}
                  onChange={(e) => setAuditLogsFilters(f => ({ ...f, search: e.target.value, page: 1 }))}
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <PageSizeSelect
                  value={auditLogsFilters.pageSize}
                  onChange={(n) => {
                    setAuditLogsFilters(f => ({ ...f, pageSize: n, page: 1 }))
                    loadAuditLogs(n)
                  }}
                />
                <Button variant="outline" size="sm" onClick={() => loadAuditLogs()}>
                  <RefreshCw className="w-4 h-4 mr-1" /> Refresh
                </Button>
              </div>
            </div>

            {/* Logs Table */}
            {!auditLogsData.logs || auditLogsData.logs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <BookOpen className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                <p>No audit logs yet</p>
              </div>
            ) : filteredAuditLogs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No logs match your search</div>
            ) : (
              <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogsPage.paged.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={
                          log.action === 'CREATE' ? 'default' :
                          log.action === 'UPDATE' ? 'secondary' :
                          log.action === 'DELETE' ? 'destructive' :
                          log.action === 'RESTORE' ? 'outline' : 'default'
                        }>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{log.entityType}</span>
                        <span className="text-xs text-gray-500 block">{log.entityId?.substring(0, 8)}</span>
                      </TableCell>
                      <TableCell>{log.userName || 'System'}</TableCell>
                      <TableCell className="max-w-xs">
                        {log.reason && <span className="text-sm text-gray-600">{log.reason}</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePager
                total={auditLogsPage.total}
                totalPages={auditLogsPage.totalPages}
                currentPage={auditLogsPage.currentPage}
                start={auditLogsPage.start}
                end={auditLogsPage.end}
                label="logs"
                onChange={(p) => setAuditLogsFilters(f => ({ ...f, page: p }))}
              />
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Unassigned Sales Dialog - Admin Utility */}
      <Dialog open={showUnassignedSales} onOpenChange={setShowUnassignedSales}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-cyan-600" />
              Assign Customers to Legacy Sales
            </DialogTitle>
            <DialogDescription>
              These sales have no linked customer. Select a customer to assign to each sale.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {unassignedSales.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="w-12 h-12 mx-auto text-green-400 mb-2" />
                <p className="font-medium text-green-600">All sales have customers assigned!</p>
                <p className="text-sm">No legacy sales require customer assignment.</p>
              </div>
            ) : (
              <>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-sm text-yellow-800">
                    <strong>{unassignedSales.length}</strong> sales found without customer assignment. 
                    Assign a customer to enable payment allocation.
                  </p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Flat/Unit</TableHead>
                      <TableHead>Customer Name (Legacy)</TableHead>
                      <TableHead>Sale Amount</TableHead>
                      <TableHead>Sale Date</TableHead>
                      <TableHead>Assign Customer</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unassignedSales.map((sale) => (
                      <UnassignedSaleRow 
                        key={sale.id} 
                        sale={sale} 
                        customers={customers}
                        onAssign={async (saleId, customerId) => {
                          try {
                            await apiCall(`/sales/${saleId}/assign-customer`, 'PUT', { customerId })
                            toast({ title: 'Success', description: 'Customer assigned to sale' })
                            // Refresh unassigned sales list
                            const sales = await apiCall(`/sales/unassigned?societyId=${selectedSociety}`)
                            setUnassignedSales(sales)
                            // Reload society data to refresh customer summary
                            await loadSocietyData()
                          } catch (error) {
                            toast({ title: 'Error', description: error.message, variant: 'destructive' })
                          }
                        }}
                      />
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Customer Form Dialog */}
      <Dialog open={showCustomerForm} onOpenChange={(open) => { setShowCustomerForm(open); if (!open) setEditingCustomer(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</DialogTitle>
            <DialogDescription>
              {editingCustomer ? 'Update customer details.' : 'Add a new customer to the system. Customers can have multiple flats.'}
            </DialogDescription>
          </DialogHeader>
          <CustomerForm 
            customer={editingCustomer}
            onSubmit={editingCustomer ? handleUpdateCustomer : handleCreateCustomer}
            onCancel={() => { setShowCustomerForm(false); setEditingCustomer(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Customer Payment Form Dialog — same dialog handles both Add and Edit;
          editingPayment toggles the mode. Closing the dialog clears the edit
          target so the next "Record Payment" open starts blank. */}
      <Dialog open={showPaymentForm} onOpenChange={(open) => { setShowPaymentForm(open); if (!open) setEditingPayment(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPayment ? 'Edit Customer Payment' : 'Record Customer Payment'}</DialogTitle>
            <DialogDescription>
              {editingPayment
                ? 'Update payment mode, account, amount, date or remark. Daybook entry is reversed and reposted.'
                : "Record a single payment. After saving, you'll allocate this payment to flats."}
            </DialogDescription>
          </DialogHeader>
          <CustomerPaymentForm
            customers={customers}
            accounts={accounts}
            payment={editingPayment}
            onSubmit={editingPayment ? handleUpdatePayment : handleCreatePayment}
            onCancel={() => { setShowPaymentForm(false); setEditingPayment(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Payment Allocation Modal */}
      <Dialog open={showAllocationModal} onOpenChange={(open) => { setShowAllocationModal(open); if (!open) setCurrentPaymentForAllocation(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Allocate Payment to Flats</DialogTitle>
            <DialogDescription>
              Payment Amount: <span className="font-bold text-green-600">₹{fmt(currentPaymentForAllocation?.amount || 0)}</span>
              {' | '}Allocated: <span className="font-bold">₹{fmt(currentPaymentForAllocation?.allocatedAmount || 0)}</span>
              {' | '}Unallocated: <span className="font-bold text-orange-600">₹{fmt((currentPaymentForAllocation?.amount || 0) - (currentPaymentForAllocation?.allocatedAmount || 0))}</span>
            </DialogDescription>
          </DialogHeader>
          {currentPaymentForAllocation && (
            <PaymentAllocationForm 
              payment={currentPaymentForAllocation}
              sales={customerSalesForAllocation}
              onSave={handleSaveAllocations}
              onCancel={() => { setShowAllocationModal(false); setCurrentPaymentForAllocation(null); }}
              inventory={inventory.filter(i => i.status !== 'Sold')}
              customer={customers.find(c => c.id === currentPaymentForAllocation.customerId)}
              onCreateSale={handleCreateSaleInModal}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Customer Ledger Drawer */}
      <Drawer open={showCustomerLedger} onOpenChange={setShowCustomerLedger}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle>Customer Ledger - {customerLedgerData?.customer?.name || ''}</DrawerTitle>
            <DrawerDescription>
              Complete payment and allocation history
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4 overflow-y-auto max-h-[70vh]">
            {customerLedgerData && <CustomerLedgerView data={customerLedgerData} />}
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline">Close</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Master Data Management Dialog */}
      <MasterDataDialog 
        open={showMasters} 
        onOpenChange={setShowMasters}
        vendorTypes={vendorTypes}
        expenseCategories={expenseCategories}
        onRefresh={loadMasterData}
      />

      {/* Quick Add Expense Modal */}
      <Dialog open={showQuickExpense} onOpenChange={setShowQuickExpense}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MinusCircle className="w-5 h-5 text-red-600" />
              Add Expense
            </DialogTitle>
            <DialogDescription>
              Record a quick expense to the Daybook
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Expense Scope */}
            <div>
              <Label>Expense Scope *</Label>
              <Select 
                value={quickExpenseData.scope} 
                onValueChange={v => setQuickExpenseData({...quickExpenseData, scope: v, societyId: v === 'SOCIETY' ? selectedSociety : ''})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SOCIETY">Society Expense</SelectItem>
                  <SelectItem value="COMPANY">Company Expense</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {quickExpenseData.scope === 'SOCIETY' ? 'Expense will be recorded under the selected society' : 'Expense will be recorded at company level'}
              </p>
            </div>

            {/* Society Selection (if Society scope) */}
            {quickExpenseData.scope === 'SOCIETY' && (
              <div>
                <Label>Society *</Label>
                <Select 
                  value={quickExpenseData.societyId} 
                  onValueChange={v => setQuickExpenseData({...quickExpenseData, societyId: v})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select society" />
                  </SelectTrigger>
                  <SelectContent>
                    {societies.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Account Selection */}
            <div>
              <Label>Account *</Label>
              <Select 
                value={quickExpenseData.accountId} 
                onValueChange={v => setQuickExpenseData({...quickExpenseData, accountId: v})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts
                    .filter(a => {
                      // Filter accounts based on scope
                      if (quickExpenseData.scope === 'COMPANY') {
                        return a.scope === 'GLOBAL' || !a.societyId
                      }
                      // For society scope: show global + society-specific accounts
                      return a.scope === 'GLOBAL' || !a.societyId || a.societyId === quickExpenseData.societyId
                    })
                    .map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({a.type}) - ₹{fmt(a.currentBalance || 0)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Amount */}
              <div>
                <Label>Amount *</Label>
                <Input
                  type="number"
                  placeholder="Enter amount"
                  min="1"
                  step="1"
                  value={quickExpenseData.amount}
                  onChange={e => {
                    const val = e.target.value
                    setQuickExpenseData({...quickExpenseData, amount: val})
                  }}
                  className={quickExpenseData.amount && (isNaN(Number(quickExpenseData.amount)) || Number(quickExpenseData.amount) <= 0) ? 'border-red-500' : ''}
                />
                {quickExpenseData.amount && (isNaN(Number(quickExpenseData.amount)) || Number(quickExpenseData.amount) <= 0) && (
                  <p className="text-xs text-red-500 mt-1">Amount must be a positive number</p>
                )}
              </div>

              {/* Date */}
              <div>
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={quickExpenseData.expenseDate}
                  onChange={e => setQuickExpenseData({...quickExpenseData, expenseDate: e.target.value})}
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <Label>Category *</Label>
              <Select 
                value={quickExpenseData.category} 
                onValueChange={v => {
                  if (v === '__ADD_NEW__') {
                    setShowQuickAddCategory(true)
                  } else {
                    setQuickExpenseData({...quickExpenseData, category: v})
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories.map(cat => (
                    <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                  ))}
                  <SelectItem value="Other">Other</SelectItem>
                  <SelectItem value="__ADD_NEW__" className="text-blue-600 font-medium">
                    <span className="flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Add New Category
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              
              {/* Inline Add Category Form */}
              {showQuickAddCategory && (
                <div className="mt-2 p-3 border rounded-lg bg-blue-50 space-y-2">
                  <Label className="text-xs text-blue-700">New Category Name</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter category name"
                      value={quickNewCategoryName}
                      onChange={e => setQuickNewCategoryName(e.target.value)}
                      className="flex-1 h-8 text-sm"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter' && quickNewCategoryName.trim()) {
                          handleQuickAddCategory()
                        } else if (e.key === 'Escape') {
                          setShowQuickAddCategory(false)
                          setQuickNewCategoryName('')
                        }
                      }}
                    />
                    <Button 
                      size="sm" 
                      className="h-8 px-3 bg-blue-600 hover:bg-blue-700"
                      disabled={!quickNewCategoryName.trim() || addingQuickCategory}
                      onClick={handleQuickAddCategory}
                    >
                      {addingQuickCategory ? 'Saving...' : 'Save'}
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-8 px-3"
                      onClick={() => {
                        setShowQuickAddCategory(false)
                        setQuickNewCategoryName('')
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Vendor/Party */}
              <div>
                <Label>Vendor/Party</Label>
                <Input
                  placeholder="Optional"
                  value={quickExpenseData.vendorName}
                  onChange={e => setQuickExpenseData({...quickExpenseData, vendorName: e.target.value})}
                />
              </div>

              {/* Payment Mode */}
              <div>
                <Label>Payment Mode</Label>
                <Select 
                  value={quickExpenseData.paymentMode} 
                  onValueChange={v => setQuickExpenseData({...quickExpenseData, paymentMode: v})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    <SelectItem value="UPI">UPI</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                    <SelectItem value="Card">Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Remark */}
            <div>
              <Label>Remark</Label>
              <Input
                placeholder="Optional note"
                value={quickExpenseData.remark}
                onChange={e => setQuickExpenseData({...quickExpenseData, remark: e.target.value})}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuickExpense(false)}>
              Cancel
            </Button>
            <Button onClick={handleQuickExpense} className="bg-red-600 hover:bg-red-700">
              <MinusCircle className="w-4 h-4 mr-2" />
              Save Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

// Bill Payment Drawer Component
const BillPaymentDrawer = ({ isOpen, onClose, billType, bill, payments, accounts, onAddPayment, onDeletePayment, onUpdatePayment }) => {
  const [formData, setFormData] = useState({
    amount: '',
    paymentDate: '',
    paymentMode: 'Cash',
    accountId: '',
    remark: ''
  })
  // Per-row inline edit state — only one row is editable at a time. Holds
  // the in-progress field values; null means the row is in read-only mode.
  const [editingPaymentId, setEditingPaymentId] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const startEdit = (payment) => {
    setEditingPaymentId(payment.id)
    setEditForm({
      amount: (payment.amount ?? '').toString(),
      paymentDate: (payment.paymentDate || '').toString().split('T')[0],
      paymentMode: payment.paymentMode || 'Cash',
      accountId: payment.accountId || '',
      remark: payment.remark || '',
    })
  }
  const cancelEdit = () => {
    setEditingPaymentId(null)
    setEditForm(null)
  }
  const saveEdit = async () => {
    if (!onUpdatePayment || !editingPaymentId || !editForm) return
    const amount = parseFloat(editForm.amount)
    if (!(amount > 0)) return
    setSavingEdit(true)
    try {
      await onUpdatePayment(editingPaymentId, {
        amount,
        paymentDate: editForm.paymentDate,
        paymentMode: editForm.paymentMode,
        accountId: editForm.accountId,
        remark: editForm.remark,
      })
      cancelEdit()
    } catch (err) {
      // toast already shown by parent handler; keep the edit row open so
      // the user can adjust and retry.
    } finally {
      setSavingEdit(false)
    }
  }

  // Set default account on mount, matching the selected payment mode
  useEffect(() => {
    if (accounts?.length > 0 && !formData.accountId) {
      const wantType = formData.paymentMode === 'Cash' ? 'CASH' : 'BANK'
      const eligible = accounts.filter(a => a.type === wantType)
      const defaultAccount = eligible.find(a => a.isDefault) || eligible[0]
      if (defaultAccount) setFormData(prev => ({ ...prev, accountId: defaultAccount.id }))
    }
  }, [accounts, formData.paymentMode])

  const getTitle = () => {
    if (!bill) return ''
    if (billType === 'expense') return `Expense Payments - ${bill.vendorName}`
    if (billType === 'commission') return `Commission Payments - ${bill.brokerName}`
    if (billType === 'margin') {
      const flat = bill.inventoryType && bill.inventoryName
        ? `${bill.inventoryType} ${bill.inventoryName}`
        : (bill.inventoryName || 'Resale')
      return `Margin Payments - ${flat}`
    }
    return ''
  }

  const getBillAmount = () => {
    if (!bill) return 0
    if (billType === 'expense') return bill.billAmount || 0
    if (billType === 'commission') return bill.commissionAmount || 0
    if (billType === 'margin') return bill.amount || 0
    return 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onAddPayment({
      amount: parseFloat(formData.amount),
      paymentDate: formData.paymentDate,
      paymentMode: formData.paymentMode,
      accountId: formData.accountId,
      remark: formData.remark
    })
    setFormData({ ...formData, amount: '', paymentDate: '', remark: '' })
  }

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
  const balance = getBillAmount() - totalPaid

  return (
    <Drawer open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle>{getTitle()}</DrawerTitle>
          <DrawerDescription>
            Manage payments for this {billType === 'expense' ? 'expense' : billType === 'margin' ? 'margin' : 'commission'} bill
          </DrawerDescription>
        </DrawerHeader>
        
        <div className="px-4 overflow-y-auto max-h-[60vh]">
          {/* Summary */}
          <Card className="mb-4 bg-blue-50">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Bill Amount</p>
                  <p className="text-xl font-bold text-gray-900">₹{fmt(getBillAmount())}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Paid</p>
                  <p className="text-xl font-bold text-green-600">₹{fmt(totalPaid)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Balance</p>
                  <p className={`text-xl font-bold ${balance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                    ₹{fmt(balance)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Form */}
          {balance > 0 && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-lg">Add Payment</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Amount * (Max: ₹{fmt(balance)})</Label>
                      <Input
                        type="number"
                        value={formData.amount}
                        onChange={e => setFormData({...formData, amount: e.target.value})}
                        max={balance}
                        required
                      />
                    </div>
                    <div>
                      <Label>Payment Date *</Label>
                      <Input
                        type="date"
                        value={formData.paymentDate}
                        onChange={e => setFormData({...formData, paymentDate: e.target.value})}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Payment Mode *</Label>
                    <Select value={formData.paymentMode} onValueChange={v => setFormData({...formData, paymentMode: v, accountId: ''})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_MODES.map(mode => (
                          <SelectItem key={mode} value={mode}>{mode}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Account *</Label>
                    <Select value={formData.accountId} onValueChange={v => setFormData({...formData, accountId: v})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts?.filter(acc => formData.paymentMode === 'Cash' ? acc.type === 'CASH' : acc.type === 'BANK').map(acc => (
                          <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.type})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Remark</Label>
                    <Textarea
                      value={formData.remark}
                      onChange={e => setFormData({...formData, remark: e.target.value})}
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    <Plus className="w-4 h-4 mr-2" /> Add Payment
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Payments List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Payment History</CardTitle>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <p className="text-center text-gray-500 py-4">No payments recorded yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Remark</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map(payment => {
                      const isEditing = editingPaymentId === payment.id && editForm
                      if (isEditing) {
                        const eligibleAccounts = (accounts || []).filter(acc =>
                          editForm.paymentMode === 'Cash' ? acc.type === 'CASH' : acc.type === 'BANK'
                        )
                        return (
                          <TableRow key={payment.id} className="bg-amber-50/40">
                            <TableCell>
                              <Input
                                type="date"
                                value={editForm.paymentDate}
                                onChange={e => setEditForm({ ...editForm, paymentDate: e.target.value })}
                                className="h-8"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={editForm.amount}
                                onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
                                className="h-8 w-28"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <Select
                                  value={editForm.paymentMode}
                                  onValueChange={v => setEditForm({ ...editForm, paymentMode: v, accountId: '' })}
                                >
                                  <SelectTrigger className="h-8 w-32">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {PAYMENT_MODES.map(m => (
                                      <SelectItem key={m} value={m}>{m}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Select
                                  value={editForm.accountId}
                                  onValueChange={v => setEditForm({ ...editForm, accountId: v })}
                                >
                                  <SelectTrigger className="h-8 w-32">
                                    <SelectValue placeholder="Account" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {eligibleAccounts.map(acc => (
                                      <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Input
                                value={editForm.remark}
                                onChange={e => setEditForm({ ...editForm, remark: e.target.value })}
                                className="h-8"
                                placeholder="Optional note"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button size="sm" onClick={saveEdit} disabled={savingEdit}>
                                  {savingEdit ? 'Saving...' : 'Save'}
                                </Button>
                                <Button size="sm" variant="outline" onClick={cancelEdit} disabled={savingEdit}>
                                  Cancel
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      }
                      return (
                        <TableRow key={payment.id}>
                          <TableCell>{new Date(payment.paymentDate).toLocaleDateString()}</TableCell>
                          <TableCell className="text-green-600 font-medium">₹{fmt(payment.amount)}</TableCell>
                          <TableCell><Badge variant="outline">{payment.paymentMode}</Badge></TableCell>
                          <TableCell>{payment.remark || '-'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {onUpdatePayment && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => startEdit(payment)}
                                  title="Edit payment"
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              )}
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="destructive" size="sm">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Payment?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => onDeletePayment(payment.id)}>Delete</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <DrawerFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

// Vendor Ledger Drawer Component
// Standalone payment-edit dialog for the vendor ledger drawer. Mirrors
// the inline-edit fields in BillPaymentDrawer (amount/date/mode/account/
// reference/remark) but as a modal so it can overlay the drawer.
const VendorPaymentEditDialog = ({ payment, accounts, onClose, onSubmit }) => {
  const [form, setForm] = useState({
    amount: '',
    paymentDate: '',
    paymentMode: 'Cash',
    accountId: '',
    referenceNo: '',
    remark: '',
  })

  useEffect(() => {
    if (payment) {
      setForm({
        amount: (payment.amount ?? '').toString(),
        paymentDate: (payment.paymentDate || '').toString().split('T')[0],
        paymentMode: payment.paymentMode || 'Cash',
        accountId: payment.accountId || '',
        referenceNo: payment.referenceNo || '',
        remark: payment.remark || '',
      })
    }
  }, [payment])

  const handleSave = (e) => {
    e.preventDefault()
    const amount = parseFloat(form.amount)
    if (!(amount > 0)) return
    onSubmit({
      amount,
      paymentDate: form.paymentDate,
      paymentMode: form.paymentMode,
      accountId: form.accountId,
      referenceNo: form.referenceNo,
      remark: form.remark,
    })
  }

  const eligibleAccounts = (accounts || []).filter(a =>
    form.paymentMode === 'Cash' ? a.type === 'CASH' : a.type === 'BANK'
  )

  return (
    <Dialog open={!!payment} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Payment</DialogTitle>
          <DialogDescription>Update payment details. Bill balance recalculates automatically.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount (₹) *</Label>
              <Input type="number" step="0.01" required
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div>
              <Label>Date *</Label>
              <Input type="date" required
                value={form.paymentDate}
                onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Payment Mode *</Label>
              <Select value={form.paymentMode} onValueChange={v => setForm(f => ({ ...f, paymentMode: v, accountId: '' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Account</Label>
              <Select value={form.accountId} onValueChange={v => setForm(f => ({ ...f, accountId: v }))}>
                <SelectTrigger><SelectValue placeholder="Default" /></SelectTrigger>
                <SelectContent>
                  {eligibleAccounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Reference / Cheque No</Label>
            <Input value={form.referenceNo} onChange={e => setForm(f => ({ ...f, referenceNo: e.target.value }))} placeholder="Optional" />
          </div>
          <div>
            <Label>Remark</Label>
            <Textarea value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Save Payment</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Vendor-level "Add Payment" dialog. User picks entry type:
//   • Payment    → FIFO across unpaid bills (oldest first)
//   • Withdrawal → LIFO across paid bills (newest first, refund flow)
// Live allocation preview reflects whichever type is selected.
const VendorAddPaymentDialog = ({ context, accounts, onClose, onSubmit }) => {
  const [form, setForm] = useState({
    entryType: 'PAYMENT',          // 'PAYMENT' | 'WITHDRAWAL'
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMode: 'Cash',
    accountId: '',
    referenceNo: '',
    remark: '',
  })

  useEffect(() => {
    if (context) {
      setForm({
        entryType: 'PAYMENT',
        amount: '',
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMode: 'Cash',
        accountId: '',
        referenceNo: '',
        remark: '',
      })
    }
  }, [context])

  const eligibleAccounts = (accounts || []).filter(a =>
    form.paymentMode === 'Cash' ? a.type === 'CASH' : a.type === 'BANK'
  )

  // Auto-select first eligible account — without this, a blank submit ends
  // up writing accountId='' to the txn and shows "Unknown" in the daybook.
  useEffect(() => {
    if (!context) return
    if (form.accountId && eligibleAccounts.some(a => a.id === form.accountId)) return
    if (!eligibleAccounts.length) return
    const def = eligibleAccounts.find(a => a.isDefault) || eligibleAccounts[0]
    setForm(f => ({ ...f, accountId: def.id }))
  }, [context, form.paymentMode, accounts])

  if (!context) return null
  const { vendor, unpaidBills, paidBills, totalPending, totalPaid } = context

  const isWithdrawal = form.entryType === 'WITHDRAWAL'
  const sourceBills = isWithdrawal ? (paidBills || []) : (unpaidBills || [])
  const maxAmount = isWithdrawal ? (totalPaid || 0) : (totalPending || 0)

  // Live allocation preview — same algorithm as the submit handler.
  const amountNum = parseFloat(form.amount) || 0
  const preview = []
  let remaining = amountNum
  for (const bill of sourceBills) {
    if (remaining <= 0) break
    const cap = isWithdrawal
      ? Math.max(0, bill.totalPaid || 0)
      : Math.max(0, bill.balance || 0)
    if (cap <= 0) continue
    const portion = Math.min(remaining, cap)
    preview.push({ bill, portion })
    remaining -= portion
  }
  const exceedsCap = amountNum > maxAmount

  const handleSave = (e) => {
    e.preventDefault()
    if (!(amountNum > 0)) return
    if (!form.accountId) return
    onSubmit({
      type: form.entryType,
      amount: amountNum,
      paymentDate: form.paymentDate,
      paymentMode: form.paymentMode,
      accountId: form.accountId,
      referenceNo: form.referenceNo,
      remark: form.remark,
    })
  }

  return (
    <Dialog open={!!context} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isWithdrawal ? 'Withdraw' : 'Add Payment'} — {vendor?.name}
          </DialogTitle>
          <DialogDescription>
            {isWithdrawal
              ? `Already paid ₹${fmt(totalPaid)} across ${paidBills?.length || 0} bill${(paidBills?.length || 0) !== 1 ? 's' : ''}. Withdrawal will reverse newest-first.`
              : `Pending ₹${fmt(totalPending)} across ${unpaidBills?.length || 0} bill${(unpaidBills?.length || 0) !== 1 ? 's' : ''}. Payment will be split oldest-first.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-3">
          {/* Entry type — Payment vs Withdrawal */}
          <div>
            <Label>Entry Type *</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, entryType: 'PAYMENT', amount: '' }))}
                className={`px-3 py-2 rounded-md border text-sm font-medium transition ${
                  form.entryType === 'PAYMENT'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Payment <span className="text-xs opacity-70">(pay vendor)</span>
              </button>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, entryType: 'WITHDRAWAL', amount: '' }))}
                disabled={(totalPaid || 0) <= 0}
                className={`px-3 py-2 rounded-md border text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${
                  form.entryType === 'WITHDRAWAL'
                    ? 'border-orange-600 bg-orange-50 text-orange-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
                title={(totalPaid || 0) <= 0 ? 'Nothing paid to vendor yet — withdrawal not possible' : 'Take money back from vendor'}
              >
                Withdrawal <span className="text-xs opacity-70">(take back)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount (₹) *</Label>
              <Input type="number" step="0.01" required
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder={`Max ${fmt(maxAmount)}`}
              />
            </div>
            <div>
              <Label>Date *</Label>
              <Input type="date" required
                value={form.paymentDate}
                onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Payment Mode *</Label>
              <Select value={form.paymentMode} onValueChange={v => setForm(f => ({ ...f, paymentMode: v, accountId: '' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Account *</Label>
              <Select value={form.accountId} onValueChange={v => setForm(f => ({ ...f, accountId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {eligibleAccounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!form.accountId && eligibleAccounts.length === 0 && (
                <p className="text-xs text-red-600 mt-1">No {form.paymentMode === 'Cash' ? 'cash' : 'bank'} account available</p>
              )}
            </div>
          </div>
          <div>
            <Label>Reference / Cheque No</Label>
            <Input value={form.referenceNo} onChange={e => setForm(f => ({ ...f, referenceNo: e.target.value }))} placeholder="Optional" />
          </div>
          <div>
            <Label>Remark</Label>
            <Textarea rows={2} value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} />
          </div>

          {/* Allocation preview */}
          {amountNum > 0 && (
            <div className={`p-3 rounded-lg border text-sm ${
              exceedsCap
                ? 'bg-red-50 border-red-200'
                : isWithdrawal
                  ? 'bg-orange-50 border-orange-200'
                  : 'bg-blue-50 border-blue-200'
            }`}>
              <p className="font-medium mb-2">
                {exceedsCap
                  ? `Amount exceeds ${isWithdrawal ? 'paid' : 'pending'} by ₹${fmt(amountNum - maxAmount)}. Reduce to ₹${fmt(maxAmount)}.`
                  : isWithdrawal
                    ? 'Reversal preview (newest-first):'
                    : 'Allocation preview (oldest-first):'}
              </p>
              {!exceedsCap && (
                <ul className="space-y-1">
                  {preview.map(({ bill, portion }) => (
                    <li key={bill.id} className="flex justify-between text-xs">
                      <span className="text-slate-600">
                        {new Date(bill.billDate).toLocaleDateString()} · {bill.categoryName || 'Work'}
                        {bill.description ? ` — ${bill.description}` : ''}
                      </span>
                      <span className={`font-medium ${isWithdrawal ? 'text-orange-700' : 'text-blue-700'}`}>
                        {isWithdrawal ? '−' : ''}₹{fmt(portion)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              disabled={!(amountNum > 0) || exceedsCap || !form.accountId}
              className={isWithdrawal ? 'bg-orange-600 hover:bg-orange-700 text-white' : ''}
            >
              {isWithdrawal ? 'Confirm Withdrawal' : 'Save Payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Global Ledger Drawer — cross-vendor read-only timeline. Filters: date
// preset chips + custom range + vendor + type + search. Exports to CSV.
const GlobalLedgerDrawer = ({ isOpen, onClose, scope, entries, loading, onExportCSV }) => {
  const [filterType, setFilterType] = useState('all')
  const [filterVendor, setFilterVendor] = useState('all')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [search, setSearch] = useState('')
  // 'transaction' uses the bill/payment date the user entered; 'created'
  // uses createdAt — useful for catching entries logged late after the fact.
  const [dateBasis, setDateBasis] = useState('transaction')

  // Distinct vendor list derived from the entries themselves so the filter
  // dropdown stays in sync with what's actually visible.
  const vendorOptions = Array.from(
    new Map(entries.map(e => [e.vendorId, { id: e.vendorId, name: e.vendorName }])).values()
  ).filter(v => v.id).sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  // Totals across the whole timeline (unfiltered) — these reflect the
  // ledger as a whole; filtered counts appear on the table footer.
  const totalWork = entries.filter(e => e.type === 'WORK').reduce((s, e) => s + (e.workValue || 0), 0)
  const totalPaid = entries.filter(e => e.type === 'PAYMENT' || e.type === 'WITHDRAWAL')
    .reduce((s, e) => s + (e.paymentAmount || 0), 0)
  const totalPending = Math.max(0, totalWork - totalPaid)

  const filteredEntries = entries.filter(e => {
    if (filterType !== 'all') {
      if (filterType === 'LABOUR') {
        if (e.subType !== 'LABOUR') return false
      } else if (filterType === 'WORK') {
        if (e.type !== 'WORK' || e.subType === 'LABOUR') return false
      } else if (e.type !== filterType) {
        return false
      }
    }
    if (filterVendor !== 'all' && e.vendorId !== filterVendor) return false
    const basisDate = dateBasis === 'created' ? (e.createdAt || e.date) : e.date
    if (filterFrom) {
      const fromTs = new Date(filterFrom).setHours(0, 0, 0, 0)
      if (new Date(basisDate).getTime() < fromTs) return false
    }
    if (filterTo) {
      const toTs = new Date(filterTo).setHours(23, 59, 59, 999)
      if (new Date(basisDate).getTime() > toTs) return false
    }
    if (search) {
      const q = search.toLowerCase()
      const hay = `${e.description || ''} ${e.vendorName || ''} ${e.categoryName || ''} ${e.reference || ''} ${e.paymentMode || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const title = scope === 'commission' ? 'Commission Ledger — All Activity' : 'Vendor Ledger — All Activity'

  return (
    <Drawer open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DrawerContent className="max-h-[95vh]">
        <DrawerHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${scope === 'commission' ? 'bg-purple-100' : 'bg-orange-100'}`}>
                <BookOpen className={`w-4 h-4 ${scope === 'commission' ? 'text-purple-600' : 'text-orange-600'}`} />
              </div>
              <div className="text-left">
                <DrawerTitle className="text-lg">{title}</DrawerTitle>
                <DrawerDescription>
                  {entries.length} entries · {vendorOptions.length} vendors
                </DrawerDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onExportCSV} disabled={entries.length === 0}>
                <FileSpreadsheet className="w-4 h-4 mr-1" /> CSV
              </Button>
            </div>
          </div>
        </DrawerHeader>

        <div className="px-4 pb-6 overflow-y-auto space-y-4 max-w-7xl mx-auto w-full">
          {/* Totals strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-blue-50/60">
              <CardContent className="p-4 text-center">
                <p className="text-xs uppercase tracking-wide text-blue-700">Total Work</p>
                <p className="text-xl font-bold text-blue-700 mt-1">₹{fmt(totalWork)}</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50/60">
              <CardContent className="p-4 text-center">
                <p className="text-xs uppercase tracking-wide text-green-700">Net Paid</p>
                <p className="text-xl font-bold text-green-700 mt-1">₹{fmt(totalPaid)}</p>
              </CardContent>
            </Card>
            <Card className="bg-red-50/60">
              <CardContent className="p-4 text-center">
                <p className="text-xs uppercase tracking-wide text-red-700">Pending</p>
                <p className="text-xl font-bold text-red-700 mt-1">₹{fmt(totalPending)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs uppercase tracking-wide text-slate-500">Showing</p>
                <p className="text-xl font-bold text-slate-900 mt-1">{filteredEntries.length} / {entries.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="p-3 space-y-3">
              {/* Date basis toggle — decides whether date filters compare against
                  the user-entered transaction date or the actual entry creation
                  timestamp (catches entries logged after the fact). */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500 mr-1">Filter by:</span>
                <Button
                  type="button"
                  variant={dateBasis === 'transaction' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setDateBasis('transaction')}
                >
                  Transaction Date
                </Button>
                <Button
                  type="button"
                  variant={dateBasis === 'created' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setDateBasis('created')}
                >
                  Entry Created Date
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500 mr-1">Quick range:</span>
                {(() => {
                  const today = new Date()
                  const iso = (d) => d.toISOString().split('T')[0]
                  const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate() - today.getDay())
                  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
                  const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
                  const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0)
                  const startOfYear = new Date(today.getFullYear(), 0, 1)
                  const presets = [
                    { label: 'Today', from: iso(today), to: iso(today) },
                    { label: 'This Week', from: iso(startOfWeek), to: iso(today) },
                    { label: 'This Month', from: iso(startOfMonth), to: iso(today) },
                    { label: 'Last Month', from: iso(startOfLastMonth), to: iso(endOfLastMonth) },
                    { label: 'This Year', from: iso(startOfYear), to: iso(today) },
                  ]
                  const isActive = (p) => filterFrom === p.from && filterTo === p.to
                  return (
                    <>
                      {presets.map(p => (
                        <Button
                          key={p.label}
                          type="button"
                          variant={isActive(p) ? 'default' : 'outline'}
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => { setFilterFrom(p.from); setFilterTo(p.to) }}
                        >
                          {p.label}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        variant={!filterFrom && !filterTo ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => { setFilterFrom(''); setFilterTo('') }}
                      >
                        All Time
                      </Button>
                      {(filterFrom || filterTo || filterType !== 'all' || filterVendor !== 'all' || search || dateBasis !== 'transaction') && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-slate-500"
                          onClick={() => { setFilterFrom(''); setFilterTo(''); setFilterType('all'); setFilterVendor('all'); setSearch(''); setDateBasis('transaction') }}
                        >
                          <X className="w-3 h-3 mr-1" /> Clear all
                        </Button>
                      )}
                    </>
                  )
                })()}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All Activities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Activities</SelectItem>
                    <SelectItem value="WORK">Work</SelectItem>
                    <SelectItem value="LABOUR">Labour</SelectItem>
                    <SelectItem value="PAYMENT">Payment</SelectItem>
                    <SelectItem value="WITHDRAWAL">Withdrawal</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterVendor} onValueChange={setFilterVendor}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All Vendors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Vendors</SelectItem>
                    {vendorOptions.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="date" className="h-9" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
                <Input type="date" className="h-9" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
                <Input className="h-9" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : filteredEntries.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No activity to show</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Work Value</TableHead>
                      <TableHead className="text-right">Payment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries.map(entry => (
                      <TableRow key={entry.id} className={entry.type === 'WITHDRAWAL' ? 'bg-orange-50/40' : ''}>
                        <TableCell className="whitespace-nowrap">
                          <div>{new Date(entry.date).toLocaleDateString()}</div>
                          {dateBasis === 'created' && entry.createdAt && (
                            <div className="text-[10px] text-slate-500">
                              entered {new Date(entry.createdAt).toLocaleDateString()}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{entry.vendorName}</TableCell>
                        <TableCell>
                          {entry.type === 'WITHDRAWAL' ? (
                            <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">Withdrawal</Badge>
                          ) : entry.subType === 'LABOUR' ? (
                            <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">Labour</Badge>
                          ) : entry.type === 'WORK' ? (
                            <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Work</Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Payment</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{entry.description}</div>
                          {entry.categoryName && entry.type === 'WORK' && (
                            <div className="text-xs text-slate-500">{entry.categoryName}</div>
                          )}
                          {(entry.type === 'PAYMENT' || entry.type === 'WITHDRAWAL') && entry.paymentMode && (
                            <div className="text-xs text-slate-500">via {entry.paymentMode}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.workValue > 0 ? (
                            <span className="text-blue-700 font-medium">₹{fmt(entry.workValue)}</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.type === 'WITHDRAWAL' ? (
                            <span className="text-orange-700 font-medium">−₹{fmt(Math.abs(entry.paymentAmount || 0))}</span>
                          ) : entry.paymentAmount > 0 ? (
                            <span className="text-green-700 font-medium">₹{fmt(entry.paymentAmount)}</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

const VendorLedgerDrawer = ({ isOpen, onClose, vendor, entries, onExportCSV, onExportPDF, onAddWork, onAddPayment, onAddLabour, onQuickPay, onDeleteEntry, onEditEntry }) => {
  const [filterType, setFilterType] = useState('all')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [search, setSearch] = useState('')

  // Aggregates derived from the merged work + payment timeline.
  const workEntries = entries.filter(e => e.type === 'WORK')
  const paymentEntries = entries.filter(e => e.type === 'PAYMENT')
  const withdrawalEntries = entries.filter(e => e.type === 'WITHDRAWAL')
  const totalWork = workEntries.reduce((s, e) => s + (e.workValue || 0), 0)
  const totalWithdrawn = withdrawalEntries.reduce((s, e) => s + Math.abs(e.paymentAmount || 0), 0)
  // Net paid = payments - withdrawals (payment entries already use positive
  // amounts; withdrawal entries store paymentAmount as negative, so summing
  // both alongside works out, but we keep them split for the headline cards).
  const totalPaid = paymentEntries.reduce((s, e) => s + (e.paymentAmount || 0), 0) - totalWithdrawn
  const labourValue = workEntries
    .filter(e => /labour/i.test(e.categoryName || ''))
    .reduce((s, e) => s + (e.workValue || 0), 0)
  // Latest payment / activity — entries are reverse-chronological so we
  // can take the first match.
  const lastPaymentEntry = paymentEntries[0] // already newest-first
  const lastActivity = entries[0]
  const owesUs = totalPaid - totalWork // positive = vendor owes us (advance)
  const weOwe = totalWork - totalPaid  // positive = pending payment to vendor

  const filteredEntries = entries.filter(e => {
    if (filterType !== 'all') {
      if (filterType === 'LABOUR') {
        if (e.subType !== 'LABOUR') return false
      } else if (filterType === 'WORK') {
        // Plain Work excludes Labour to avoid double-listing.
        if (e.type !== 'WORK' || e.subType === 'LABOUR') return false
      } else if (e.type !== filterType) {
        return false
      }
    }
    if (filterFrom && new Date(e.date) < new Date(filterFrom)) return false
    if (filterTo && new Date(e.date) > new Date(filterTo)) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = `${e.description || ''} ${e.categoryName || ''} ${e.reference || ''} ${e.paymentMode || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  return (
    <Drawer open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DrawerContent className="max-h-[95vh]">
        <DrawerHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
              <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-orange-600" />
              </div>
              <div>
                <DrawerTitle className="text-lg">{vendor?.name}</DrawerTitle>
                <DrawerDescription>{vendor?.type || 'Vendor'}</DrawerDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onExportCSV} disabled={entries.length === 0}>
                <FileSpreadsheet className="w-4 h-4 mr-1" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={onExportPDF} disabled={entries.length === 0}>
                <FileText className="w-4 h-4 mr-1" /> PDF
              </Button>
            </div>
          </div>
        </DrawerHeader>

        <div className="px-4 overflow-y-auto max-h-[80vh] space-y-4">
          {/* Orange gradient vendor summary */}
          <div className="rounded-xl p-5 text-white bg-gradient-to-r from-orange-500 to-amber-500 shadow">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider opacity-80 flex items-center gap-2">
                  <UserCheck className="w-4 h-4" /> Vendor Summary
                </p>
                <p className="text-3xl font-bold mt-1">{vendor?.name}</p>
                <p className="text-sm opacity-90">{vendor?.type || 'Vendor'}</p>
              </div>
              <div className="text-right">
                {owesUs > 0 ? (
                  <>
                    <p className="text-xs uppercase tracking-wider opacity-80">Advance Paid</p>
                    <p className="text-3xl font-bold mt-1">₹{fmt(owesUs)}</p>
                    <p className="text-sm opacity-90">Vendor owes you</p>
                  </>
                ) : weOwe > 0 ? (
                  <>
                    <p className="text-xs uppercase tracking-wider opacity-80">Pending Payment</p>
                    <p className="text-3xl font-bold mt-1">₹{fmt(weOwe)}</p>
                    <p className="text-sm opacity-90">You owe vendor</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs uppercase tracking-wider opacity-80">Status</p>
                    <p className="text-3xl font-bold mt-1">Cleared</p>
                  </>
                )}
              </div>
            </div>

            {/* Stat strip */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5 bg-white/95 rounded-lg p-3 text-slate-900">
              <div>
                <p className="text-xs text-blue-700 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Total Work Value</p>
                <p className="text-lg font-bold text-blue-700">₹{fmt(totalWork)}</p>
                <p className="text-[10px] text-slate-500">Material + Labour</p>
              </div>
              <div>
                <p className="text-xs text-green-700 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Amount Paid</p>
                <p className="text-lg font-bold text-green-700">₹{fmt(totalPaid)}</p>
                <p className="text-[10px] text-slate-500">{paymentEntries.length} payments</p>
              </div>
              <div>
                <p className="text-xs text-purple-700 flex items-center gap-1"><Wallet className="w-3 h-3" /> Labour Value</p>
                <p className="text-lg font-bold text-purple-700">₹{fmt(labourValue)}</p>
                <p className="text-[10px] text-slate-500">From work entries</p>
              </div>
              <div>
                <p className="text-xs text-slate-700 flex items-center gap-1"><CreditCard className="w-3 h-3" /> Last Payment</p>
                <p className="text-lg font-bold text-slate-800">
                  {lastPaymentEntry ? new Date(lastPaymentEntry.date).toLocaleDateString() : '-'}
                </p>
                <p className="text-[10px] text-slate-500">
                  {lastPaymentEntry ? `₹${fmt(lastPaymentEntry.paymentAmount)}` : ''}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-700 flex items-center gap-1"><Filter className="w-3 h-3" /> Last Activity</p>
                <p className="text-lg font-bold text-slate-800">
                  {lastActivity ? new Date(lastActivity.date).toLocaleDateString() : '-'}
                </p>
                <p className="text-[10px] text-slate-500">{entries.length} total entries</p>
              </div>
            </div>
          </div>

          {/* Action buttons — Quick Pay creates a work entry and records full
              payment in one submit, so the user doesn't need a follow-up step
              when the bill is paid on the spot. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white h-14 text-base" onClick={() => onAddWork && onAddWork(vendor)}>
              <Plus className="w-5 h-5 mr-2" /> Add Work
            </Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white h-14 text-base" onClick={() => onAddPayment && onAddPayment(vendor)}>
              <Plus className="w-5 h-5 mr-2" /> Add Payment
            </Button>
            <Button className="bg-purple-600 hover:bg-purple-700 text-white h-14 text-base" onClick={() => onAddLabour && onAddLabour(vendor)}>
              <Plus className="w-5 h-5 mr-2" /> Add Labour
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white h-14 text-base" onClick={() => onQuickPay && onQuickPay(vendor)}>
              <Zap className="w-5 h-5 mr-2" /> Quick Pay
            </Button>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="p-3 space-y-3">
              {/* Quick date presets — each chip rewrites filterFrom/filterTo
                  to the requested window. "All" clears the range entirely. */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500 mr-1">Quick range:</span>
                {(() => {
                  const today = new Date()
                  const iso = (d) => d.toISOString().split('T')[0]
                  const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate() - today.getDay())
                  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
                  const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
                  const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0)
                  const startOfYear = new Date(today.getFullYear(), 0, 1)
                  const presets = [
                    { label: 'Today', from: iso(today), to: iso(today) },
                    { label: 'This Week', from: iso(startOfWeek), to: iso(today) },
                    { label: 'This Month', from: iso(startOfMonth), to: iso(today) },
                    { label: 'Last Month', from: iso(startOfLastMonth), to: iso(endOfLastMonth) },
                    { label: 'This Year', from: iso(startOfYear), to: iso(today) },
                  ]
                  const isActive = (p) => filterFrom === p.from && filterTo === p.to
                  return (
                    <>
                      {presets.map(p => (
                        <Button
                          key={p.label}
                          type="button"
                          variant={isActive(p) ? 'default' : 'outline'}
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => { setFilterFrom(p.from); setFilterTo(p.to) }}
                        >
                          {p.label}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        variant={!filterFrom && !filterTo ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => { setFilterFrom(''); setFilterTo('') }}
                      >
                        All Time
                      </Button>
                      {(filterFrom || filterTo || filterType !== 'all' || search) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-slate-500"
                          onClick={() => { setFilterFrom(''); setFilterTo(''); setFilterType('all'); setSearch('') }}
                        >
                          <X className="w-3 h-3 mr-1" /> Clear all
                        </Button>
                      )}
                    </>
                  )
                })()}
              </div>

              {/* Existing filter inputs */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All Activities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Activities</SelectItem>
                    <SelectItem value="WORK">Work</SelectItem>
                    <SelectItem value="LABOUR">Labour</SelectItem>
                    <SelectItem value="PAYMENT">Payment</SelectItem>
                    <SelectItem value="WITHDRAWAL">Withdrawal</SelectItem>
                  </SelectContent>
                </Select>
                <div>
                  <Input type="date" className="h-9" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} placeholder="From" />
                </div>
                <div>
                  <Input type="date" className="h-9" value={filterTo} onChange={e => setFilterTo(e.target.value)} placeholder="To" />
                </div>
                <Input className="h-9" placeholder="Search description, ref, material…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* Timeline table */}
          <Card>
            <CardContent className="p-0">
              {filteredEntries.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No activity to show</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Work Value</TableHead>
                      <TableHead className="text-right">Payment</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="w-20 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries.map(entry => (
                      <TableRow key={entry.id} className={entry.type === 'WITHDRAWAL' ? 'bg-orange-50/40' : ''}>
                        <TableCell className="whitespace-nowrap">{new Date(entry.date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          {entry.type === 'WITHDRAWAL' ? (
                            <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">Withdrawal</Badge>
                          ) : entry.subType === 'LABOUR' ? (
                            <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">Labour</Badge>
                          ) : entry.type === 'WORK' ? (
                            <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Work</Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Payment</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{entry.description}</div>
                          {entry.type === 'WORK' && entry.categoryName && (
                            <div className="text-xs text-slate-500">{entry.categoryName}</div>
                          )}
                          {(entry.type === 'PAYMENT' || entry.type === 'WITHDRAWAL') && entry.paymentMode && (
                            <div className="text-xs text-slate-500">via {entry.paymentMode}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.workValue > 0 ? (
                            <span className="text-blue-700 font-medium">₹{fmt(entry.workValue)}</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.type === 'WITHDRAWAL' ? (
                            <span className="text-orange-700 font-medium">−₹{fmt(Math.abs(entry.paymentAmount || 0))}</span>
                          ) : entry.paymentAmount > 0 ? (
                            <span className="text-green-700 font-medium">₹{fmt(entry.paymentAmount)}</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {entry.balance > 0 ? (
                            <span className="text-red-600 font-medium">₹{fmt(entry.balance)}</span>
                          ) : entry.balance < 0 ? (
                            <span className="text-orange-600 font-medium">₹{fmt(Math.abs(entry.balance))} adv</span>
                          ) : (
                            <span className="text-slate-500">₹0</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-slate-500 hover:text-blue-700 hover:bg-blue-50"
                              title="Edit entry"
                              onClick={() => onEditEntry && onEditEntry(entry)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" title="Delete entry">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Delete {entry.type === 'WORK' ? 'Work Entry' : 'Payment'}?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {entry.type === 'WORK'
                                      ? 'This will delete the work entry and all associated payments. This action cannot be undone.'
                                      : 'This will delete this payment. The vendor balance will be recalculated.'}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => onDeleteEntry && onDeleteEntry(entry)}>
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <DrawerFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

// Ledger Drawer Component (for Partners/Purchases/Sales)
const LedgerDrawer = ({ isOpen, onClose, ledgerType, ledgerItem, entries, accounts, sales = [], onAddEntry, onTransfer, onUpdateTransfer, onDeleteEntry, onEditEntry }) => {
  // Default entry type by ledger context: partner → INVESTMENT, sale →
  // SALE_PAYMENT, purchase → PURCHASE_PAYMENT (vs REFUND).
  const defaultEntryType = ledgerType === 'sale'
    ? 'SALE_PAYMENT'
    : ledgerType === 'purchase'
    ? 'PURCHASE_PAYMENT'
    : 'INVESTMENT'

  const [formData, setFormData] = useState({
    type: defaultEntryType,
    amount: '',
    entryDate: '',
    paymentMode: 'Cash',
    accountId: '',
    remark: ''
  })
  const [showAddForm, setShowAddForm] = useState(false)
  const [showTransferDialog, setShowTransferDialog] = useState(false)
  const [transferForm, setTransferForm] = useState({
    destinationSaleId: '',
    amount: '',
    transferDate: '',
    remark: '',
  })
  const [transferBusy, setTransferBusy] = useState(false)
  const [editingTransfer, setEditingTransfer] = useState(null)
  const [editTransferForm, setEditTransferForm] = useState({ amount: '', transferDate: '', remark: '' })
  const [editTransferBusy, setEditTransferBusy] = useState(false)

  useEffect(() => {
    if (editingTransfer) {
      setEditTransferForm({
        amount: (editingTransfer.amount ?? '').toString(),
        transferDate: (editingTransfer.paymentDate || '').toString().split('T')[0],
        remark: editingTransfer.remark || '',
      })
    }
  }, [editingTransfer])

  // All live sales except this one — destination options for an internal
  // transfer. Cross-customer transfers are allowed; the operator decides
  // whether the move makes sense.
  const sameCustomerSales = ledgerType === 'sale' && ledgerItem
    ? (sales || []).filter(s =>
        s.id !== ledgerItem.id
        && s.status !== 'TRANSFERRED'
        && !s.isDeleted
      )
    : []

  // Set default account on mount, matching the selected payment mode
  useEffect(() => {
    if (accounts?.length > 0 && !formData.accountId) {
      const wantType = formData.paymentMode === 'Cash' ? 'CASH' : 'BANK'
      const eligible = accounts.filter(a => a.type === wantType)
      const defaultAccount = eligible.find(a => a.isDefault) || eligible[0]
      if (defaultAccount) setFormData(prev => ({ ...prev, accountId: defaultAccount.id }))
    }
  }, [accounts, formData.paymentMode])
  
  // Reset entry type when ledgerType changes
  useEffect(() => {
    const newDefault = ledgerType === 'sale'
      ? 'SALE_PAYMENT'
      : ledgerType === 'purchase'
      ? 'PURCHASE_PAYMENT'
      : 'INVESTMENT'
    setFormData(prev => ({ ...prev, type: newDefault }))
  }, [ledgerType])

  const getTitle = () => {
    if (!ledgerItem) return ''
    if (ledgerType === 'partner') return `Capital Account Ledger - ${ledgerItem.name}`
    if (ledgerType === 'purchase') return `Payment Entries - ${ledgerItem.partyName}`
    if (ledgerType === 'sale') return `Sale Ledger - ${ledgerItem.customerName}`
    return ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = {
      amount: parseFloat(formData.amount),
      paymentMode: formData.paymentMode,
      accountId: formData.accountId,
      remark: formData.remark
    }

    if (ledgerType === 'partner') {
      payload.type = formData.type
      payload.entryDate = formData.entryDate
    } else if (ledgerType === 'sale') {
      payload.entryType = formData.type  // Sale ledger uses entryType
      payload.paymentDate = formData.entryDate
    } else {
      payload.entryType = formData.type  // Purchase: PURCHASE_PAYMENT | REFUND
      payload.paymentDate = formData.entryDate
    }

    const ok = await onAddEntry(payload)
    if (ok) {
      const resetType = ledgerType === 'sale'
        ? 'SALE_PAYMENT'
        : ledgerType === 'purchase'
        ? 'PURCHASE_PAYMENT'
        : 'INVESTMENT'
      setFormData({
        ...formData,
        type: resetType,
        amount: '',
        entryDate: '',
        remark: ''
      })
      setShowAddForm(false)
    }
  }

  const calculateTotals = () => {
    // Ensure entries is an array before filtering
    const safeEntries = Array.isArray(entries) ? entries : []
    
    if (ledgerType === 'partner') {
      const totalInvestment = safeEntries.filter(e => e.type === 'INVESTMENT').reduce((sum, e) => sum + e.amount, 0)
      const totalWithdrawal = safeEntries.filter(e => e.type === 'WITHDRAWAL').reduce((sum, e) => sum + e.amount, 0)
      const totalProfitPaid = safeEntries.filter(e => e.type === 'PROFIT_PAYOUT').reduce((sum, e) => sum + e.amount, 0)
      const runningBalance = totalInvestment - totalWithdrawal - totalProfitPaid
      
      return { totalInvestment, totalWithdrawal, totalProfitPaid, runningBalance }
    } else if (ledgerType === 'sale') {
      // Sale Ledger: Credits (SALE_PAYMENT + TRANSFER_IN) minus debits
      // (WITHDRAWAL + PROFIT_PAYOUT + TRANSFER_OUT) = Running Balance.
      const isSaleCredit = (t) => t === 'SALE_PAYMENT' || t === 'TRANSFER_IN'
      const totalCredits = safeEntries
        .filter(e => isSaleCredit(e.entryType || 'SALE_PAYMENT'))
        .reduce((sum, e) => sum + e.amount, 0)
      const totalWithdrawals = safeEntries.filter(e => e.entryType === 'WITHDRAWAL').reduce((sum, e) => sum + e.amount, 0)
      const totalProfitPaid = safeEntries.filter(e => e.entryType === 'PROFIT_PAYOUT').reduce((sum, e) => sum + e.amount, 0)
      const totalTransfersOut = safeEntries.filter(e => e.entryType === 'TRANSFER_OUT').reduce((sum, e) => sum + e.amount, 0)
      const runningBalance = totalCredits - totalWithdrawals - totalProfitPaid - totalTransfersOut
      const saleDue = ledgerItem ? (ledgerItem.finalAmount || 0) - runningBalance : 0

      return { totalCredits, totalWithdrawals, totalProfitPaid, totalTransfersOut, runningBalance, saleDue }
    } else {
      // Purchase ledger: PURCHASE_PAYMENT (and legacy entries with no type)
      // increase totalPaid; REFUND reduces it.
      const totalAmount = safeEntries.reduce((sum, entry) => {
        const sign = entry.entryType === 'REFUND' ? -1 : 1
        return sum + sign * (entry.amount || 0)
      }, 0)
      const balance = ledgerItem ? ((ledgerItem.dealAmount || ledgerItem.finalAmount) - totalAmount) : 0
      return { totalAmount, balance }
    }
  }

  const totals = calculateTotals()

  const getEntryTypeLabel = (type) => {
    const labels = {
      'INVESTMENT': 'Investment',
      'WITHDRAWAL': 'Withdrawal',
      'PROFIT_PAYOUT': 'Profit Payout',
      'SALE_PAYMENT': 'Sale Payment',
      'PURCHASE_PAYMENT': 'Payment',
      'REFUND': 'Refund',
      'TRANSFER_IN': 'Transfer In',
      'TRANSFER_OUT': 'Transfer Out',
    }
    return labels[type] || type
  }

  const getEntryTypeBadgeVariant = (type) => {
    if (type === 'INVESTMENT' || type === 'SALE_PAYMENT' || type === 'PURCHASE_PAYMENT') return 'default'
    if (type === 'WITHDRAWAL' || type === 'REFUND' || type === 'TRANSFER_OUT') return 'secondary'
    if (type === 'PROFIT_PAYOUT') return 'outline'
    if (type === 'TRANSFER_IN') return 'default'
    return 'default'
  }

  // Check if entry is a credit (money IN to the parent's running paid total)
  const isCredit = (entry) => {
    if (ledgerType === 'partner') return entry.type === 'INVESTMENT'
    if (ledgerType === 'sale') {
      const t = entry.entryType || 'SALE_PAYMENT'
      return t === 'SALE_PAYMENT' || t === 'TRANSFER_IN'
    }
    if (ledgerType === 'purchase') return (entry.entryType || 'PURCHASE_PAYMENT') === 'PURCHASE_PAYMENT'
    return true
  }

  return (
    <>
    <Drawer open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle>{getTitle()}</DrawerTitle>
          <DrawerDescription>
            {ledgerType === 'partner'
              ? 'View and manage capital account entries (investments, withdrawals, profit payouts)'
              : ledgerType === 'sale'
              ? 'View and manage sale ledger entries (payments, withdrawals, profit payouts, internal transfers)'
              : `View and manage ${ledgerType === 'purchase' ? 'purchase' : 'sale'} payment entries`
            }
          </DrawerDescription>
        </DrawerHeader>
        
        <div className="px-4 overflow-y-auto max-h-[60vh]">
          {/* Summary */}
          <Card className="mb-4 bg-blue-50">
            <CardContent className="pt-6">
              {ledgerType === 'partner' ? (
                <>
                  {/* Pledged vs Actual banner — visible even when no entries exist yet */}
                  {Number(ledgerItem?.expectedInvestment || 0) > 0 && (
                    <div className="mb-4 rounded-lg border border-indigo-200 bg-white px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
                      <div>
                        <p className="text-xs text-slate-500">Expected Investment (pledged)</p>
                        <p className="text-lg font-bold text-indigo-700">₹{fmt(ledgerItem.expectedInvestment)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Actual Contributed</p>
                        <p className="text-lg font-bold text-emerald-600">₹{fmt(totals.totalInvestment)}</p>
                      </div>
                      {(() => {
                        const pledged = Number(ledgerItem.expectedInvestment || 0)
                        const actual = Number(totals.totalInvestment || 0)
                        const remaining = pledged - actual
                        if (remaining > 0) {
                          return (
                            <div>
                              <p className="text-xs text-slate-500">Remaining to Pay</p>
                              <p className="text-lg font-bold text-amber-600">₹{fmt(remaining)}</p>
                            </div>
                          )
                        }
                        if (remaining < 0) {
                          return (
                            <div>
                              <p className="text-xs text-slate-500">Over-Contributed</p>
                              <p className="text-lg font-bold text-rose-600">₹{fmt(Math.abs(remaining))}</p>
                            </div>
                          )
                        }
                        return (
                          <div>
                            <p className="text-xs text-slate-500">Pledge Status</p>
                            <p className="text-lg font-bold text-emerald-600">Fully paid ✓</p>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                  {ledgerItem?.notes && (
                    <p className="mb-3 text-sm italic text-slate-600">📝 {ledgerItem.notes}</p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Total Investment</p>
                      <p className="text-xl font-bold text-green-600">₹{fmt(totals.totalInvestment)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Total Withdrawal</p>
                      <p className="text-xl font-bold text-orange-600">₹{fmt(totals.totalWithdrawal)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Profit Paid Out</p>
                      <p className="text-xl font-bold text-purple-600">₹{fmt(totals.totalProfitPaid)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Running Balance</p>
                      <p className={`text-xl font-bold ${totals.runningBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        ₹{fmt(totals.runningBalance)}
                      </p>
                    </div>
                  </div>
                </>
              ) : ledgerType === 'sale' ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Total Credits</p>
                    <p className="text-xl font-bold text-green-600">₹{fmt(totals.totalCredits)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Withdrawals</p>
                    <p className="text-xl font-bold text-orange-600">₹{fmt(totals.totalWithdrawals)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Profit Paid</p>
                    <p className="text-xl font-bold text-purple-600">₹{fmt(totals.totalProfitPaid)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Running Balance</p>
                    <p className={`text-xl font-bold ${totals.runningBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      ₹{fmt(totals.runningBalance)}
                    </p>
                  </div>
                  <div className="col-span-2 md:col-span-4 pt-2 border-t">
                    <div className="flex justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Final Amount</p>
                        <p className="text-lg font-bold">₹{fmt(ledgerItem?.finalAmount || 0)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600">Sale Due</p>
                        <p className={`text-lg font-bold ${totals.saleDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          ₹{fmt(totals.saleDue)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-600">Total Paid</p>
                    <p className="text-2xl font-bold text-green-600">₹{fmt(totals.totalAmount)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Balance</p>
                    <p className="text-2xl font-bold text-orange-600">₹{fmt(totals.balance)}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Informational: sale already fully paid. Form stays open below
              so withdrawals / profit payouts can still be recorded; the
              backend blocks further SALE_PAYMENT entries on its own. */}
          {ledgerType === 'sale' && ledgerItem?.status !== 'TRANSFERRED' && totals.saleDue <= 0 && (
            <Card className="mb-4 border-green-200 bg-green-50">
              <CardContent className="py-4">
                <div className="flex items-center gap-3 text-green-700">
                  <CheckCircle className="w-5 h-5" />
                  <div>
                    <p className="font-medium">Sale fully paid</p>
                    <p className="text-sm text-green-600">
                      Running balance already covers the final amount. Withdrawals and profit payouts can still be added below.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Entry Form - Hide for transferred sales */}
          {ledgerType === 'sale' && ledgerItem?.status === 'TRANSFERRED' ? (
            <Card className="mb-4 border-purple-200 bg-purple-50">
              <CardContent className="py-4">
                <div className="flex items-center gap-3 text-purple-700">
                  <ArrowRightLeft className="w-5 h-5" />
                  <div>
                    <p className="font-medium">This sale has been transferred via Resale</p>
                    <p className="text-sm text-purple-600">
                      New owner: {ledgerItem.transferredTo}. Use the Resale module for payment tracking.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : !showAddForm ? (
            <div className={`mb-4 grid gap-2 ${ledgerType === 'sale' && sameCustomerSales.length > 0 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setShowAddForm(true)}
              >
                <Plus className="w-4 h-4 mr-2" /> Add New Entry
              </Button>
              {ledgerType === 'sale' && sameCustomerSales.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                  onClick={() => setShowTransferDialog(true)}
                  disabled={totals.runningBalance <= 0}
                  title={totals.runningBalance <= 0 ? 'Source has no paid balance to transfer' : 'Move paid amount to another sale of this customer'}
                >
                  <ArrowRightLeft className="w-4 h-4 mr-2" /> Transfer to another sale
                </Button>
              )}
            </div>
          ) : (
          <Card className="mb-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Add New Entry</CardTitle>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAddForm(false)}
              >
                Cancel
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {ledgerType === 'partner' && (
                  <div>
                    <Label>Entry Type *</Label>
                    <Select value={formData.type} onValueChange={v => setFormData({...formData, type: v})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INVESTMENT">Investment (Credit)</SelectItem>
                        <SelectItem value="WITHDRAWAL">Withdrawal (Debit)</SelectItem>
                        <SelectItem value="PROFIT_PAYOUT">Profit Payout (Debit)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {ledgerType === 'sale' && (
                  <div>
                    <Label>Entry Type *</Label>
                    <Select value={formData.type} onValueChange={v => setFormData({...formData, type: v})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SALE_PAYMENT">Sale Payment (Credit)</SelectItem>
                        <SelectItem value="WITHDRAWAL">Withdrawal (Debit)</SelectItem>
                        <SelectItem value="PROFIT_PAYOUT">Profit Payout (Debit)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {ledgerType === 'purchase' && (
                  <div>
                    <Label>Entry Type *</Label>
                    <Select value={formData.type} onValueChange={v => setFormData({...formData, type: v})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PURCHASE_PAYMENT">Payment (Debit)</SelectItem>
                        <SelectItem value="REFUND">Refund (Credit)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Amount *</Label>
                    <Input
                      type="number"
                      value={formData.amount}
                      onChange={e => setFormData({...formData, amount: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <Label>Date *</Label>
                    <Input
                      type="date"
                      value={formData.entryDate}
                      onChange={e => setFormData({...formData, entryDate: e.target.value})}
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label>Payment Mode *</Label>
                  <Select value={formData.paymentMode} onValueChange={v => setFormData({...formData, paymentMode: v, accountId: ''})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_MODES.map(mode => (
                        <SelectItem key={mode} value={mode}>{mode}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Account *</Label>
                  <Select value={formData.accountId} onValueChange={v => setFormData({...formData, accountId: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts?.filter(acc => formData.paymentMode === 'Cash' ? acc.type === 'CASH' : acc.type === 'BANK').map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.type})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Remark</Label>
                  <Textarea
                    value={formData.remark}
                    onChange={e => setFormData({...formData, remark: e.target.value})}
                  />
                </div>
                <Button type="submit" className="w-full">
                  <Plus className="w-4 h-4 mr-2" /> Add Entry
                </Button>
              </form>
            </CardContent>
          </Card>
          )}

          {/* Entries Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Entry History</CardTitle>
            </CardHeader>
            <CardContent>
              {(!Array.isArray(entries) || entries.length === 0) ? (
                <p className="text-center text-gray-500 py-4">No entries yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      {(ledgerType === 'partner' || ledgerType === 'sale' || ledgerType === 'purchase') && <TableHead>Type</TableHead>}
                      <TableHead>Amount</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Remark</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(Array.isArray(entries) ? entries : []).map(entry => (
                      <TableRow key={entry.id}>
                        <TableCell>{new Date(entry.entryDate || entry.paymentDate).toLocaleDateString()}</TableCell>
                        {ledgerType === 'partner' && (
                          <TableCell>
                            <Badge variant={getEntryTypeBadgeVariant(entry.type)}>
                              {getEntryTypeLabel(entry.type)}
                            </Badge>
                          </TableCell>
                        )}
                        {ledgerType === 'sale' && (
                          <TableCell>
                            <Badge variant={getEntryTypeBadgeVariant(entry.entryType || 'SALE_PAYMENT')}>
                              {getEntryTypeLabel(entry.entryType || 'SALE_PAYMENT')}
                            </Badge>
                          </TableCell>
                        )}
                        {ledgerType === 'purchase' && (
                          <TableCell>
                            <Badge variant={getEntryTypeBadgeVariant(entry.entryType || 'PURCHASE_PAYMENT')}>
                              {getEntryTypeLabel(entry.entryType || 'PURCHASE_PAYMENT')}
                            </Badge>
                          </TableCell>
                        )}
                        <TableCell className={`font-medium ${
                          ledgerType === 'partner'
                            ? entry.type === 'INVESTMENT' ? 'text-green-600' : 'text-red-600'
                            : ledgerType === 'sale'
                            ? isCredit(entry) ? 'text-green-600' : 'text-red-600'
                            : ledgerType === 'purchase'
                            ? isCredit(entry) ? 'text-green-600' : 'text-red-600'
                            : 'text-green-600'
                        }`}>
                          {ledgerType === 'partner' && entry.type !== 'INVESTMENT' && '-'}
                          {ledgerType === 'sale' && !isCredit(entry) && '-'}
                          {ledgerType === 'purchase' && !isCredit(entry) && '-'}
                          ₹{fmt(entry.amount)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline">{entry.paymentMode}</Badge>
                            {(entry.entryType === 'TRANSFER_OUT' || entry.entryType === 'TRANSFER_IN') && entry.otherInventoryLabel && (
                              <span className="text-xs text-indigo-600 whitespace-nowrap">
                                {entry.entryType === 'TRANSFER_OUT' ? '→' : '←'} {entry.otherInventoryLabel}
                                {entry.otherBuyerName ? ` (${entry.otherBuyerName})` : ''}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{entry.remark || '-'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {(ledgerType === 'partner' || ledgerType === 'purchase' || ledgerType === 'sale')
                              && onEditEntry
                              && entry.source !== 'CUSTOMER_PAYMENT_ALLOCATION' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (entry.entryType === 'TRANSFER_IN' || entry.entryType === 'TRANSFER_OUT') {
                                    setEditingTransfer(entry)
                                  } else {
                                    onEditEntry(entry)
                                  }
                                }}
                                title="Edit entry"
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            )}
                            {entry.source === 'CUSTOMER_PAYMENT_ALLOCATION' ? (
                              <Badge variant="outline" className="text-xs">From customer payment</Badge>
                            ) : (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="destructive" size="sm">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Entry?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {(entry.entryType === 'TRANSFER_IN' || entry.entryType === 'TRANSFER_OUT')
                                        ? 'This is an internal transfer. Deleting it will also remove the paired entry on the other sale and revert both balances.'
                                        : 'This action cannot be undone.'}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => onDeleteEntry(entry.id)}>Delete</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <DrawerFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>

    {/* Internal Transfer Dialog — moves a paid amount from this sale to
        another sale of the same customer. No daybook txn is written. */}
    {ledgerType === 'sale' && (
      <Dialog open={showTransferDialog} onOpenChange={(open) => { if (!open && !transferBusy) { setShowTransferDialog(false) } }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Transfer between sales</DialogTitle>
            <DialogDescription>
              Move a paid amount from <span className="font-medium">this sale</span> to any other live sale. Cash account balance is not affected.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!onTransfer) return
              const amount = parseFloat(transferForm.amount) || 0
              if (!(amount > 0)) return
              if (!transferForm.destinationSaleId) return
              setTransferBusy(true)
              const ok = await onTransfer({
                destinationSaleId: transferForm.destinationSaleId,
                amount,
                transferDate: transferForm.transferDate,
                remark: transferForm.remark,
              })
              setTransferBusy(false)
              if (ok) {
                setShowTransferDialog(false)
                setTransferForm({ destinationSaleId: '', amount: '', transferDate: '', remark: '' })
              }
            }}
          >
            <div>
              <Label>Destination Sale *</Label>
              <Select
                value={transferForm.destinationSaleId}
                onValueChange={(v) => setTransferForm(f => ({ ...f, destinationSaleId: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select destination sale" /></SelectTrigger>
                <SelectContent>
                  {sameCustomerSales.map(s => {
                    const flat = s.inventoryNumber && s.inventoryNumber !== 'N/A'
                      ? `${s.inventoryType || ''} ${s.inventoryNumber}`
                      : `Sale ${s.id?.slice(0, 6)}`
                    const customer = s.customerName ? ` (${s.customerName})` : ''
                    const label = `${flat}${customer} — ₹${fmt(s.finalAmount || 0)}`
                    return (
                      <SelectItem key={s.id} value={s.id}>{label}</SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              {sameCustomerSales.length === 0 && (
                <p className="text-xs text-orange-600 mt-1">No other live sales found.</p>
              )}
              {transferForm.destinationSaleId && (() => {
                const dest = sameCustomerSales.find(s => s.id === transferForm.destinationSaleId)
                if (!dest || !ledgerItem?.customerId || dest.customerId === ledgerItem.customerId) return null
                return (
                  <p className="text-xs text-amber-700 mt-1">
                    ⚠ Cross-customer transfer — destination belongs to a different customer ({dest.customerName || 'unknown'}).
                  </p>
                )
              })()}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Amount (₹) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={transferForm.amount}
                  onChange={(e) => setTransferForm(f => ({ ...f, amount: e.target.value }))}
                  required
                />
                <p className="text-xs text-slate-500 mt-1">Available from this sale: ₹{fmt(totals.runningBalance || 0)}</p>
              </div>
              <div>
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={transferForm.transferDate}
                  onChange={(e) => setTransferForm(f => ({ ...f, transferDate: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div>
              <Label>Remark</Label>
              <Textarea
                value={transferForm.remark}
                onChange={(e) => setTransferForm(f => ({ ...f, remark: e.target.value }))}
                placeholder="Reason for the internal transfer (optional)"
              />
            </div>
            <div className="rounded-md bg-indigo-50 border border-indigo-200 p-3 text-sm text-indigo-700">
              <strong>Note:</strong> This is an accounting move only. Two linked entries are recorded — <em>Transfer Out</em> on this sale and <em>Transfer In</em> on the destination. Deleting either side reverses both.
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowTransferDialog(false)} disabled={transferBusy}>Cancel</Button>
              <Button
                type="submit"
                disabled={transferBusy || !transferForm.destinationSaleId || !(parseFloat(transferForm.amount) > 0) || !transferForm.transferDate}
              >
                {transferBusy ? 'Transferring…' : 'Transfer'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    )}

    {/* Edit Transfer Dialog — amount / date / remark only. Destination is
        fixed: to change it, delete and re-create the transfer. */}
    {ledgerType === 'sale' && editingTransfer && (
      <Dialog open={!!editingTransfer} onOpenChange={(open) => { if (!open && !editTransferBusy) setEditingTransfer(null) }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Edit Transfer</DialogTitle>
            <DialogDescription>
              Both legs of this transfer update together. Destination can&apos;t be changed — delete and create a new transfer for that.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const otherSaleId = (() => {
              // Sibling sale id: for a TRANSFER_OUT row we're looking at the
              // source ledger, so the destination is the partner entry on
              // another sale; for a TRANSFER_IN row it's the reverse.
              const sibling = (entries || []).find(e =>
                e.transferGroupId === editingTransfer.transferGroupId
                && e.id !== editingTransfer.id
              )
              return sibling?.saleId || null
            })()
            const otherSale = otherSaleId ? (sales || []).find(s => s.id === otherSaleId) : null
            const otherLabel = otherSale
              ? (otherSale.inventoryNumber && otherSale.inventoryNumber !== 'N/A'
                  ? `${otherSale.inventoryType || ''} ${otherSale.inventoryNumber} — ₹${fmt(otherSale.finalAmount || 0)}`
                  : `Sale ${otherSale.id?.slice(0, 6)} — ₹${fmt(otherSale.finalAmount || 0)}`)
              : (otherSaleId ? `Sale ${otherSaleId.slice(0, 6)}` : 'Other sale')
            const directionLabel = editingTransfer.entryType === 'TRANSFER_OUT'
              ? `Transfer Out → ${otherLabel}`
              : `Transfer In ← ${otherLabel}`
            return (
              <form
                className="space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (!onUpdateTransfer || !editingTransfer.transferGroupId) return
                  const amount = parseFloat(editTransferForm.amount) || 0
                  if (!(amount > 0)) return
                  setEditTransferBusy(true)
                  const ok = await onUpdateTransfer(editingTransfer.transferGroupId, {
                    amount,
                    transferDate: editTransferForm.transferDate,
                    remark: editTransferForm.remark,
                  })
                  setEditTransferBusy(false)
                  if (ok) setEditingTransfer(null)
                }}
              >
                <div className="rounded-md bg-slate-50 border p-3 text-sm">
                  <p className="text-slate-500">Direction</p>
                  <p className="font-medium">{directionLabel}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Amount (₹) *</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editTransferForm.amount}
                      onChange={(e) => setEditTransferForm(f => ({ ...f, amount: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label>Date *</Label>
                    <Input
                      type="date"
                      value={editTransferForm.transferDate}
                      onChange={(e) => setEditTransferForm(f => ({ ...f, transferDate: e.target.value }))}
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label>Remark</Label>
                  <Textarea
                    value={editTransferForm.remark}
                    onChange={(e) => setEditTransferForm(f => ({ ...f, remark: e.target.value }))}
                  />
                </div>
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                  <strong>Note:</strong> Source must still have enough paid balance and destination must have enough remaining due for the new amount.
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setEditingTransfer(null)} disabled={editTransferBusy}>Cancel</Button>
                  <Button
                    type="submit"
                    disabled={editTransferBusy || !(parseFloat(editTransferForm.amount) > 0) || !editTransferForm.transferDate}
                  >
                    {editTransferBusy ? 'Saving…' : 'Update Transfer'}
                  </Button>
                </div>
              </form>
            )
          })()}
        </DialogContent>
      </Dialog>
    )}
    </>
  )
}


// Form Components
const SocietyForm = ({ onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    totalArea: '',
    startDate: '',
    status: 'Active',
    notes: ''
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Society Name *</Label>
        <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
      </div>
      <div>
        <Label>Location *</Label>
        <Input value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} required />
      </div>
      <div>
        <Label>Total Area (sq ft) *</Label>
        <Input type="number" value={formData.totalArea} onChange={e => setFormData({...formData, totalArea: e.target.value})} required />
      </div>
      <div>
        <Label>Start Date *</Label>
        <Input type="date" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} required />
      </div>
      <div>
        <Label>Status</Label>
        <Select value={formData.status} onValueChange={v => setFormData({...formData, status: v})}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
      </div>
      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit">Create Society</Button>
      </div>
    </form>
  )
}

// Master Data Management Dialog Component
const MasterDataDialog = ({ open, onOpenChange, vendorTypes, expenseCategories, onRefresh }) => {
  const [activeTab, setActiveTab] = useState('vendorTypes')
  const [newName, setNewName] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const { toast } = useToast()
  
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  
  const apiCall = async (endpoint, method = 'GET', body = null) => {
    const buildOptions = (otp) => {
      const opts = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          ...(otp ? { 'X-Delete-Otp': otp } : {}),
        },
      }
      if (body) opts.body = JSON.stringify(body)
      return opts
    }

    let otp = null
    if (method === 'DELETE') {
      otp = getDeleteOtp()
      if (!otp) throw new Error('Delete cancelled — OTP required')
    }

    let res = await fetch(`/api${endpoint}`, buildOptions(otp))
    if (res.status === 403 && method === 'DELETE') {
      const errBody = await res.clone().json().catch(() => ({}))
      if (errBody?.code === 'DELETE_OTP_REQUIRED') {
        const fresh = refreshDeleteOtp()
        if (!fresh) throw new Error('Delete cancelled — OTP required')
        res = await fetch(`/api${endpoint}`, buildOptions(fresh))
      }
    }
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      throw new Error(errorData.error || 'API request failed')
    }
    return res.json()
  }

  const handleAdd = async () => {
    if (!newName.trim()) return
    setIsAdding(true)
    try {
      const endpoint = activeTab === 'vendorTypes' ? '/vendor-types' : '/expense-categories'
      await apiCall(endpoint, 'POST', { name: newName.trim() })
      toast({ title: 'Success', description: `${activeTab === 'vendorTypes' ? 'Vendor Type' : 'Category'} added` })
      setNewName('')
      onRefresh()
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
    setIsAdding(false)
  }

  const handleToggleActive = async (item) => {
    try {
      const endpoint = activeTab === 'vendorTypes' ? `/vendor-types/${item.id}` : `/expense-categories/${item.id}`
      await apiCall(endpoint, 'PUT', { isActive: !item.isActive })
      toast({ title: 'Success', description: `${item.name} ${item.isActive ? 'deactivated' : 'activated'}` })
      onRefresh()
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleDelete = async (item) => {
    try {
      const endpoint = activeTab === 'vendorTypes' ? `/vendor-types/${item.id}` : `/expense-categories/${item.id}`
      await apiCall(endpoint, 'DELETE')
      toast({ title: 'Success', description: `${item.name} deleted` })
      onRefresh()
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleUpdate = async () => {
    if (!editingItem?.name?.trim()) return
    try {
      const endpoint = activeTab === 'vendorTypes' ? `/vendor-types/${editingItem.id}` : `/expense-categories/${editingItem.id}`
      await apiCall(endpoint, 'PUT', { name: editingItem.name.trim() })
      toast({ title: 'Success', description: 'Updated successfully' })
      setEditingItem(null)
      onRefresh()
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const items = activeTab === 'vendorTypes' ? vendorTypes : expenseCategories

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-purple-600" />
            Master Data Management
          </DialogTitle>
          <DialogDescription>
            Manage vendor types and expense categories used in dropdowns
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="vendorTypes">Vendor Types ({vendorTypes.length})</TabsTrigger>
            <TabsTrigger value="expenseCategories">Expense Categories ({expenseCategories.length})</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="space-y-4 mt-4">
            {/* Add New */}
            <div className="flex gap-2">
              <Input 
                placeholder={`New ${activeTab === 'vendorTypes' ? 'vendor type' : 'category'} name`}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <Button onClick={handleAdd} disabled={isAdding || !newName.trim()}>
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            </div>

            {/* List */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-20 text-center">Status</TableHead>
                    <TableHead className="w-32 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {editingItem?.id === item.id ? (
                          <div className="flex gap-2">
                            <Input 
                              value={editingItem.name} 
                              onChange={(e) => setEditingItem({...editingItem, name: e.target.value})}
                              onKeyDown={(e) => e.key === 'Enter' && handleUpdate()}
                            />
                            <Button size="sm" onClick={handleUpdate}>Save</Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingItem(null)}>Cancel</Button>
                          </div>
                        ) : (
                          <span className={item.isActive === false ? 'text-gray-400 line-through' : ''}>
                            {item.name}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={item.isActive !== false ? 'default' : 'secondary'}>
                          {item.isActive !== false ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => setEditingItem(item)}
                            disabled={editingItem?.id === item.id}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => handleToggleActive(item)}
                          >
                            {item.isActive !== false ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="text-red-600">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {item.name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will delete the {activeTab === 'vendorTypes' ? 'vendor type' : 'category'}.
                                  If it's in use, you should deactivate it instead.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(item)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-gray-500 py-4">
                        No {activeTab === 'vendorTypes' ? 'vendor types' : 'categories'} yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

const PartnerForm = ({ onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    name: '',
    percentage: '',
    expectedInvestment: '',
    notes: ''
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({
      ...formData,
      percentage: parseFloat(formData.percentage),
      expectedInvestment: parseFloat(formData.expectedInvestment || 0)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Partner Name *</Label>
        <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
      </div>
      <div>
        <Label>Percentage Share (%) *</Label>
        <Input type="number" step="0.01" value={formData.percentage} onChange={e => setFormData({...formData, percentage: e.target.value})} required />
      </div>
      <div>
        <Label>Expected Investment (Optional)</Label>
        <Input type="number" value={formData.expectedInvestment} onChange={e => setFormData({...formData, expectedInvestment: e.target.value})} />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
      </div>
      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit">Add Partner</Button>
      </div>
    </form>
  )
}

// Edit Partner Form Component
const EditPartnerForm = ({ partner, existingPartners, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    name: partner?.name || '',
    percentage: partner?.percentage?.toString() || '',
    expectedInvestment: partner?.expectedInvestment?.toString() || '',
    notes: partner?.notes || '',
  })
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    const newPercentage = parseFloat(formData.percentage)

    // Validation
    if (!formData.name.trim()) {
      setError('Partner name is required')
      return
    }

    if (newPercentage < 0) {
      setError('Percentage cannot be negative')
      return
    }

    // Check total percentage (against OTHER partners only — current partner already excluded by caller)
    const otherPartnersTotal = existingPartners.reduce((sum, p) => sum + p.percentage, 0)
    if (otherPartnersTotal + newPercentage > 100) {
      setError(`Total percentage cannot exceed 100%. Other partners: ${otherPartnersTotal}%, max allowed for this partner: ${100 - otherPartnersTotal}%`)
      return
    }

    onSubmit({
      name: formData.name.trim(),
      percentage: newPercentage,
      expectedInvestment: parseFloat(formData.expectedInvestment || 0),
      notes: formData.notes,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
          {error}
        </div>
      )}
      <div>
        <Label>Partner Name *</Label>
        <Input
          value={formData.name}
          onChange={e => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>
      <div>
        <Label>Percentage Share (%) *</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          max="100"
          value={formData.percentage}
          onChange={e => setFormData({ ...formData, percentage: e.target.value })}
          required
        />
        <p className="text-xs text-gray-500 mt-1">
          Other partners total: {existingPartners.reduce((sum, p) => sum + p.percentage, 0)}%
        </p>
      </div>
      <div>
        <Label>Expected Investment (Optional)</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={formData.expectedInvestment}
          onChange={e => setFormData({ ...formData, expectedInvestment: e.target.value })}
        />
        <p className="text-xs text-gray-500 mt-1">
          Pledged capital. Actual investment is tracked from the ledger entries.
        </p>
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea
          value={formData.notes}
          onChange={e => setFormData({ ...formData, notes: e.target.value })}
          rows={3}
        />
      </div>
      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit">Update Partner</Button>
      </div>
    </form>
  )
}

// Edit Ledger Entry Form Component
// Drives PUT for partner / purchase / sale ledger entries. The "type"
// dropdown is hidden for purchases (always a payment) and shows the right
// options for partner vs. sale.
const EditLedgerEntryForm = ({ entry, ledgerType = 'partner', accounts, onSubmit, onCancel }) => {
  // Default type by ledger context. Partner entries use `entry.type`;
  // sale ledger entries use `entry.entryType` (legacy rows have neither
  // and should default to SALE_PAYMENT).
  const defaultType = ledgerType === 'partner'
    ? (entry?.type || 'INVESTMENT')
    : ledgerType === 'sale'
    ? (entry?.entryType || 'SALE_PAYMENT')
    : ledgerType === 'purchase'
    ? (entry?.entryType || 'PURCHASE_PAYMENT')
    : 'PAYMENT';

  const initialDate = (entry?.entryDate || entry?.paymentDate || '').split('T')[0];

  const [formData, setFormData] = useState({
    type: defaultType,
    amount: entry?.amount?.toString() || '',
    entryDate: initialDate,
    paymentMode: entry?.paymentMode || 'Cash',
    accountId: entry?.accountId || '',
    referenceNo: entry?.referenceNo || '',
    remark: entry?.remark || ''
  })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const showTypeField = ledgerType === 'partner' || ledgerType === 'sale' || ledgerType === 'purchase';

  // Generate idempotency key once when form opens
  const [editGroupId] = useState(() => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`)

  // Set default account if not set
  useEffect(() => {
    if (accounts?.length > 0 && !formData.accountId) {
      const defaultAccount = accounts.find(a => a.isDefault) || accounts[0]
      setFormData(prev => ({ ...prev, accountId: defaultAccount?.id || '' }))
    }
  }, [accounts])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    // Prevent double submission
    if (isSubmitting) return

    const amount = parseFloat(formData.amount)

    if (amount <= 0) {
      setError('Amount must be greater than 0')
      return
    }

    if (!formData.entryDate) {
      setError('Date is required')
      return
    }

    if (!formData.accountId) {
      setError('Account is required')
      return
    }

    setIsSubmitting(true)

    try {
      // Send both `entryDate` and `paymentDate` so backend services that
      // expect either one work without further branching here.
      const payload = {
        amount,
        entryDate: formData.entryDate,
        paymentDate: formData.entryDate,
        paymentMode: formData.paymentMode,
        accountId: formData.accountId,
        remark: formData.remark,
        editGroupId,
      }
      if (showTypeField) {
        payload.type = formData.type
        payload.entryType = formData.type
      }
      await onSubmit(payload)
    } catch (err) {
      setError(err.message || 'Failed to update entry')
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
          {error}
        </div>
      )}
      <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-md text-sm text-yellow-800">
        <strong>Note:</strong>
        <ul className="list-disc ml-4 mt-1">
          <li><strong>Remark-only changes:</strong> Will update in place (no reversal)</li>
          <li><strong>Amount/Type/Account/Date changes:</strong> Will create reversal + replacement entry for audit trail</li>
        </ul>
      </div>
      {showTypeField && (
        <div>
          <Label>Type *</Label>
          <Select value={formData.type} onValueChange={v => setFormData({...formData, type: v})} disabled={isSubmitting}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ledgerType === 'partner' ? (
                <>
                  <SelectItem value="INVESTMENT">Investment (Capital IN)</SelectItem>
                  <SelectItem value="WITHDRAWAL">Withdrawal (Capital OUT)</SelectItem>
                  <SelectItem value="PROFIT_PAYOUT">Profit Payout</SelectItem>
                </>
              ) : ledgerType === 'sale' ? (
                <>
                  <SelectItem value="SALE_PAYMENT">Sale Payment (Credit)</SelectItem>
                  <SelectItem value="WITHDRAWAL">Withdrawal (Debit)</SelectItem>
                  <SelectItem value="PROFIT_PAYOUT">Profit Payout (Debit)</SelectItem>
                </>
              ) : (
                <>
                  <SelectItem value="PURCHASE_PAYMENT">Payment (Debit)</SelectItem>
                  <SelectItem value="REFUND">Refund (Credit)</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </div>
      )}
      <div>
        <Label>Amount (₹) *</Label>
        <Input 
          type="number" 
          min="1"
          value={formData.amount} 
          onChange={e => setFormData({...formData, amount: e.target.value})} 
          required 
          disabled={isSubmitting}
        />
      </div>
      
      <div>
        <Label>Date *</Label>
        <Input 
          type="date" 
          value={formData.entryDate} 
          onChange={e => setFormData({...formData, entryDate: e.target.value})} 
          required 
          disabled={isSubmitting}
        />
      </div>
      
      <div>
        <Label>Payment Mode *</Label>
        <Select value={formData.paymentMode} onValueChange={v => setFormData({...formData, paymentMode: v, accountId: ''})} disabled={isSubmitting}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Cash">Cash</SelectItem>
            <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
            <SelectItem value="Cheque">Cheque</SelectItem>
            <SelectItem value="UPI">UPI</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Account *</Label>
        <Select value={formData.accountId} onValueChange={v => setFormData({...formData, accountId: v})} disabled={isSubmitting}>
          <SelectTrigger>
            <SelectValue placeholder="Select account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.filter(account => formData.paymentMode === 'Cash' ? account.type === 'CASH' : account.type === 'BANK').map(account => (
              <SelectItem key={account.id} value={account.id}>
                {account.name} ({account.type})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div>
        <Label>Remark</Label>
        <Textarea
          value={formData.remark}
          onChange={e => setFormData({...formData, remark: e.target.value})}
          placeholder="Optional notes about this entry"
          disabled={isSubmitting}
        />
      </div>

      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Updating...' : 'Update Entry'}
        </Button>
      </div>
    </form>
  )
}

const InventoryForm = ({ onSubmit, onCancel, initialData }) => {
  const [formData, setFormData] = useState({
    type: initialData?.type || 'Flat',
    phase: initialData?.phase || '',
    inventoryNumber: initialData?.inventoryNumber || '',
    area: initialData?.area?.toString() || '',
    floor: initialData?.floor || '',
    facing: initialData?.facing || '',
    notes: initialData?.notes || ''
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    // Handle area - convert to number if present, otherwise null
    const area = formData.area ? parseFloat(formData.area) : null
    // Handle floor - keep as string or null
    const floor = formData.floor || null
    onSubmit({...formData, area, floor})
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Type *</Label>
        <Select value={formData.type} onValueChange={v => setFormData({...formData, type: v})}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Flat">Flat</SelectItem>
            <SelectItem value="Plot">Plot</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Inventory Number *</Label>
        <Input value={formData.inventoryNumber} onChange={e => setFormData({...formData, inventoryNumber: e.target.value})} required />
      </div>
      <div>
        <Label>Phase/Block</Label>
        <Input value={formData.phase} onChange={e => setFormData({...formData, phase: e.target.value})} />
      </div>
      <div>
        <Label>Area (sq ft)</Label>
        <Input type="number" value={formData.area} onChange={e => setFormData({...formData, area: e.target.value})} placeholder="Optional" />
      </div>
      <div>
        <Label>Floor</Label>
        <Input value={formData.floor} onChange={e => setFormData({...formData, floor: e.target.value})} placeholder="Optional" />
      </div>
      <div>
        <Label>Facing</Label>
        <Input value={formData.facing} onChange={e => setFormData({...formData, facing: e.target.value})} />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
      </div>
      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit">{initialData ? 'Update Inventory' : 'Add Inventory'}</Button>
      </div>
    </form>
  )
}

const PurchaseForm = ({ onSubmit, onCancel, initialData }) => {
  const isEdit = Boolean(initialData?.id)
  const initialDate = (initialData?.agreementDate || initialData?.purchaseDate || '').toString().split('T')[0]
  const [formData, setFormData] = useState({
    partyName: initialData?.partyName || initialData?.vendorName || '',
    dealAmount: (initialData?.dealAmount ?? initialData?.totalCost ?? '').toString(),
    agreementDate: initialDate,
    notes: initialData?.notes || ''
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({...formData, dealAmount: parseFloat(formData.dealAmount)})
  }

  // When editing, deal amount can't be reduced below what's already paid.
  const minDealAmount = isEdit ? (initialData?.totalPaid || 0) : undefined

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Party Name *</Label>
        <Input value={formData.partyName} onChange={e => setFormData({...formData, partyName: e.target.value})} required />
      </div>
      <div>
        <Label>Total Deal Amount *</Label>
        <Input
          type="number"
          min={minDealAmount}
          value={formData.dealAmount}
          onChange={e => setFormData({...formData, dealAmount: e.target.value})}
          required
        />
        {isEdit && minDealAmount > 0 && (
          <p className="text-xs text-slate-500 mt-1">
            Cannot be less than already paid: ₹{(minDealAmount).toLocaleString('en-IN')}
          </p>
        )}
      </div>
      <div>
        <Label>Agreement Date *</Label>
        <Input type="date" value={formData.agreementDate} onChange={e => setFormData({...formData, agreementDate: e.target.value})} required />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
      </div>
      {!isEdit && (
        <p className="text-sm text-gray-500 bg-blue-50 p-3 rounded">
          Note: Payments can be added after creating the purchase record.
        </p>
      )}
      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit">{isEdit ? 'Update Purchase' : 'Add Purchase'}</Button>
      </div>
    </form>
  )
}

const SaleForm = ({ inventory, customers = [], onSubmit, onCancel, initialData, hasPayments, onCreateCustomer, onUpdateCustomer }) => {
  const isEdit = Boolean(initialData?.id)

  // Build the seed item — in edit mode this is the single sale being edited;
  // in new mode it's the first row of the multi-flat picker.
  const buildItemFromInitial = () => {
    const sqft = initialData?.sqft?.toString()
      || (initialData?.inventoryId && inventory.find(i => i.id === initialData.inventoryId)?.area?.toString())
      || ''
    const ratePerSqft = initialData?.ratePerSqft?.toString()
      || (sqft && initialData?.dealPrice
          ? (Number(initialData.dealPrice) / Number(sqft)).toString()
          : '')
    const discountPercent = initialData?.discountPercent?.toString()
      || (initialData?.dealPrice && initialData?.discount
          ? ((Number(initialData.discount) / Number(initialData.dealPrice)) * 100).toFixed(2)
          : '')
    return {
      inventoryId: initialData?.inventoryId || '',
      sqft,
      ratePerSqft,
      dealPrice: initialData?.dealPrice?.toString() || '',
      discountPercent,
      discount: initialData?.discount?.toString() || '0',
    }
  }

  const [items, setItems] = useState(isEdit ? [buildItemFromInitial()] : [])
  const [formData, setFormData] = useState({
    customerId: initialData?.customerId || '',
    customerName: initialData?.customerName || '',
    customerPhone: initialData?.customerPhone || '',
    customerAddress: initialData?.customerAddress || '',
    saleDate: initialData?.saleDate?.split('T')[0] || '',
    status: initialData?.status || 'Booked',
    notes: initialData?.notes || ''
  })

  // Inventory available for the "Add Flat" picker — hide the ones already
  // sitting in `items` so the user can't double-add the same flat.
  const usedInventoryIds = new Set(items.map(it => it.inventoryId).filter(Boolean))
  const pickableInventory = inventory.filter(item => {
    if (isEdit && item.id === initialData?.inventoryId) return true
    if (usedInventoryIds.has(item.id)) return false
    return !item.status || item.status === 'Available'
  })

  const addItem = (invId) => {
    const inv = inventory.find(i => i.id === invId)
    const sqft = inv?.area ? inv.area.toString() : ''
    const rate = inv?.pricePerSqft ? inv.pricePerSqft.toString() : ''
    const sqftN = parseFloat(sqft) || 0
    const rateN = parseFloat(rate) || 0
    const dealPrice = sqftN > 0 && rateN > 0 ? (sqftN * rateN).toString() : ''
    setItems(prev => [...prev, {
      inventoryId: invId,
      sqft,
      ratePerSqft: rate,
      dealPrice,
      discountPercent: '',
      discount: '0',
    }])
  }

  const removeItem = (idx) => {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  // Merge a patch into a single item row and recompute the derived fields
  // (dealPrice from sqft×rate, discount from %). Manual overrides on
  // dealPrice/discount are respected — those updaters skip the auto-recalc.
  const updateItem = (idx, patch, opts = {}) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const next = { ...it, ...patch }
      if (opts.recalcDealPrice) {
        const sqftN = parseFloat(next.sqft) || 0
        const rateN = parseFloat(next.ratePerSqft) || 0
        if (sqftN > 0 && rateN > 0) next.dealPrice = (sqftN * rateN).toString()
      }
      if (opts.recalcDiscountFromPct || opts.recalcDealPrice) {
        const dealPriceN = parseFloat(next.dealPrice) || 0
        const pctN = parseFloat(next.discountPercent) || 0
        if (dealPriceN > 0 && pctN > 0) {
          next.discount = ((dealPriceN * pctN) / 100).toString()
        }
      }
      if (opts.recalcPctFromDiscount) {
        const dealPriceN = parseFloat(next.dealPrice) || 0
        const discN = parseFloat(next.discount) || 0
        next.discountPercent = dealPriceN > 0
          ? ((discN / dealPriceN) * 100).toFixed(2)
          : ''
      }
      return next
    }))
  }
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [newCustomerData, setNewCustomerData] = useState({ name: '', phone: '', address: '' })
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false)
  const [showEditCustomer, setShowEditCustomer] = useState(false)
  const [editCustomerData, setEditCustomerData] = useState({ name: '', phone: '', address: '' })
  const [isEditingCustomer, setIsEditingCustomer] = useState(false)
  const { toast } = useToast()
  
  // Initialize edit customer data when opening edit modal
  const handleOpenEditCustomer = () => {
    const customer = customers.find(c => c.id === formData.customerId)
    if (customer) {
      setEditCustomerData({
        name: customer.name || '',
        phone: customer.phone || '',
        address: customer.address || ''
      })
      setShowEditCustomer(true)
    }
  }
  
  // Handle customer update
  const handleUpdateCustomer = async () => {
    if (!editCustomerData.name.trim()) {
      toast({ title: 'Error', description: 'Customer name cannot be empty', variant: 'destructive' })
      return
    }
    setIsEditingCustomer(true)
    try {
      if (onUpdateCustomer) {
        const updatedCustomer = await onUpdateCustomer(formData.customerId, {
          name: editCustomerData.name.trim(),
          phone: editCustomerData.phone?.trim() || '',
          address: editCustomerData.address?.trim() || ''
        })
        if (updatedCustomer) {
          // Update form data with new customer info
          setFormData({
            ...formData,
            customerName: updatedCustomer.name,
            customerPhone: updatedCustomer.phone || '',
            customerAddress: updatedCustomer.address || ''
          })
          toast({ title: 'Success', description: 'Customer updated successfully' })
        }
      }
      setShowEditCustomer(false)
    } catch (error) {
      toast({ title: 'Error', description: error.message || 'Failed to update customer', variant: 'destructive' })
    }
    setIsEditingCustomer(false)
  }

  // When customer is selected from dropdown, fill the related fields
  const handleCustomerChange = (customerId) => {
    if (customerId === '__add_new__') {
      setShowNewCustomer(true)
      return
    }
    const customer = customers.find(c => c.id === customerId)
    if (customer) {
      setFormData({
        ...formData,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone || '',
        customerAddress: customer.address || ''
      })
    }
  }

  const handleCreateCustomerInline = async () => {
    if (!newCustomerData.name.trim()) {
      toast({ title: 'Error', description: 'Customer name is required', variant: 'destructive' })
      return
    }
    setIsCreatingCustomer(true)
    try {
      if (onCreateCustomer) {
        const newCustomer = await onCreateCustomer(newCustomerData)
        if (newCustomer) {
          setFormData({
            ...formData,
            customerId: newCustomer.id,
            customerName: newCustomer.name,
            customerPhone: newCustomer.phone || '',
            customerAddress: newCustomer.address || ''
          })
          toast({ title: 'Success', description: 'Customer created and selected' })
        }
      }
      setShowNewCustomer(false)
      setNewCustomerData({ name: '', phone: '', address: '' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
    setIsCreatingCustomer(false)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!formData.customerId) {
      toast({ title: 'Error', description: 'Please select a customer', variant: 'destructive' })
      return
    }
    if (items.length === 0) {
      toast({ title: 'Error', description: 'Add at least one flat', variant: 'destructive' })
      return
    }
    const normalized = items.map(it => ({
      inventoryId: it.inventoryId,
      sqft: parseFloat(it.sqft) || 0,
      ratePerSqft: parseFloat(it.ratePerSqft) || 0,
      dealPrice: parseFloat(it.dealPrice) || 0,
      discountPercent: parseFloat(it.discountPercent) || 0,
      discount: parseFloat(it.discount) || 0,
    }))
    if (normalized.some(it => !it.inventoryId || !(it.dealPrice > 0))) {
      toast({ title: 'Error', description: 'Each flat needs a valid deal price', variant: 'destructive' })
      return
    }
    if (isEdit) {
      // Backend still expects a single-flat shape on update — flatten back.
      onSubmit({ ...formData, ...normalized[0] })
    } else {
      onSubmit({ ...formData, items: normalized })
    }
  }

  const grandTotal = items.reduce(
    (sum, it) => sum + ((parseFloat(it.dealPrice) || 0) - (parseFloat(it.discount) || 0)),
    0
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Customer Selection - Required */}
      <div>
        <Label>Customer * <span className="text-xs text-gray-500">(Required for payment allocation)</span></Label>
        {!showNewCustomer && !showEditCustomer ? (
          <div className="flex gap-2">
            <div className="flex-1">
              <Select 
                value={formData.customerId} 
                onValueChange={handleCustomerChange}
                disabled={initialData && hasPayments}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </SelectItem>
                  ))}
                  <SelectItem value="__add_new__" className="text-blue-600 font-medium border-t mt-1 pt-1">
                    + Create New Customer
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Edit Customer Button - only visible when a customer is selected */}
            {formData.customerId && onUpdateCustomer && (
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={handleOpenEditCustomer}
                className="shrink-0"
                title="Edit Customer Details"
              >
                <Pencil className="w-4 h-4 mr-1" />
                Edit
              </Button>
            )}
          </div>
        ) : showEditCustomer ? (
          /* Edit Customer Modal/Form */
          <div className="space-y-3 p-4 border rounded-lg bg-amber-50 border-amber-200">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-amber-800">Edit Customer</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowEditCustomer(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div>
              <Label className="text-xs text-gray-600">Customer ID (Read-only)</Label>
              <Input value={formData.customerId} disabled className="bg-gray-100 text-gray-500 text-xs" />
            </div>
            <div>
              <Label className="text-xs text-gray-600">Full Name *</Label>
              <Input 
                placeholder="Customer Name *" 
                value={editCustomerData.name}
                onChange={e => setEditCustomerData({...editCustomerData, name: e.target.value})}
                className={!editCustomerData.name.trim() ? 'border-red-300' : ''}
              />
              {!editCustomerData.name.trim() && (
                <p className="text-xs text-red-500 mt-1">Name is required</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-gray-600">Phone (Optional)</Label>
              <Input 
                placeholder="Phone Number" 
                value={editCustomerData.phone}
                onChange={e => setEditCustomerData({...editCustomerData, phone: e.target.value})}
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600">Address (Optional)</Label>
              <Input 
                placeholder="Address" 
                value={editCustomerData.address}
                onChange={e => setEditCustomerData({...editCustomerData, address: e.target.value})}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button 
                type="button" 
                size="sm" 
                onClick={handleUpdateCustomer} 
                disabled={isEditingCustomer || !editCustomerData.name.trim()}
              >
                {isEditingCustomer ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowEditCustomer(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 p-3 border rounded-lg bg-blue-50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-blue-800">New Customer</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowNewCustomer(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <Input 
              placeholder="Customer Name *" 
              value={newCustomerData.name}
              onChange={e => setNewCustomerData({...newCustomerData, name: e.target.value})}
            />
            <Input 
              placeholder="Phone Number" 
              value={newCustomerData.phone}
              onChange={e => setNewCustomerData({...newCustomerData, phone: e.target.value})}
            />
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={handleCreateCustomerInline} disabled={isCreatingCustomer}>
                {isCreatingCustomer ? 'Creating...' : 'Create & Select'}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowNewCustomer(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {formData.customerId && !showEditCustomer && (
          <p className="text-xs text-green-600 mt-1">✓ Customer linked: {formData.customerName}</p>
        )}
      </div>

      {/* Customer details (read-only when selected) */}
      {formData.customerId && !showEditCustomer && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-gray-50 rounded-lg">
          <div>
            <Label className="text-xs text-gray-500">Customer Phone</Label>
            <p className="text-sm">{formData.customerPhone || 'Not provided'}</p>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Customer Address</Label>
            <p className="text-sm">{formData.customerAddress || 'Not provided'}</p>
          </div>
        </div>
      )}

      {/* Flats picker — multi-select for new sale, single locked row for edit. */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Flats *{isEdit ? '' : ' (select one or more)'}</Label>
          {!isEdit && (
            <Select
              value=""
              onValueChange={v => { if (v) addItem(v) }}
            >
              <SelectTrigger className="w-56 h-9">
                <SelectValue placeholder={pickableInventory.length === 0 ? 'No flats available' : '+ Add flat'} />
              </SelectTrigger>
              <SelectContent>
                {pickableInventory.map(item => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.type} - {item.inventoryNumber}{item.area > 0 ? ` (${item.area} sq ft)` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {items.length === 0 && (
          <p className="text-sm text-gray-500 bg-blue-50 p-3 rounded">
            Pick one or more flats from the dropdown above. Each flat gets its own sale record.
          </p>
        )}

        {items.map((it, idx) => {
          const inv = inventory.find(i => i.id === it.inventoryId)
          const finalAmt = (parseFloat(it.dealPrice) || 0) - (parseFloat(it.discount) || 0)
          const flatLabel = inv
            ? `${inv.type} - ${inv.inventoryNumber}${inv.area > 0 ? ` (${inv.area} sq ft)` : ''}`
            : 'Flat'
          return (
            <div key={`${it.inventoryId}-${idx}`} className="border rounded-lg p-3 space-y-3 bg-slate-50/40">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">{flatLabel}</p>
                {!isEdit && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
                {isEdit && hasPayments && (
                  <span className="text-xs text-orange-600">Inventory locked (payments made)</span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Square Feet</Label>
                  <Input
                    type="number"
                    value={it.sqft}
                    onChange={e => updateItem(idx, { sqft: e.target.value }, { recalcDealPrice: true })}
                  />
                </div>
                <div>
                  <Label>Rate (₹ per sq ft)</Label>
                  <Input
                    type="number"
                    value={it.ratePerSqft}
                    onChange={e => updateItem(idx, { ratePerSqft: e.target.value }, { recalcDealPrice: true })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Deal Price *</Label>
                  <Input
                    type="number"
                    value={it.dealPrice}
                    onChange={e => updateItem(idx, { dealPrice: e.target.value }, { recalcDiscountFromPct: true })}
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Auto = Sqft × Rate (override allowed)</p>
                </div>
                <div>
                  <Label>Discount (%)</Label>
                  <Input
                    type="number"
                    value={it.discountPercent}
                    onChange={e => updateItem(idx, { discountPercent: e.target.value }, { recalcDiscountFromPct: true })}
                  />
                </div>
              </div>
              <div>
                <Label>Discount (₹)</Label>
                <Input
                  type="number"
                  value={it.discount}
                  onChange={e => updateItem(idx, { discount: e.target.value }, { recalcPctFromDiscount: true })}
                />
              </div>
              <p className="text-sm font-medium text-right">
                Final: ₹{finalAmt.toLocaleString('en-IN')}
              </p>
            </div>
          )
        })}

        {items.length > 1 && (
          <div className="flex items-center justify-end gap-2 px-2 py-2 rounded-md bg-emerald-50 border border-emerald-100">
            <span className="text-sm text-slate-600">Total ({items.length} flats):</span>
            <span className="text-base font-semibold text-emerald-700">₹{grandTotal.toLocaleString('en-IN')}</span>
          </div>
        )}
      </div>

      <div>
        <Label>Sale Date *</Label>
        <Input type="date" value={formData.saleDate} onChange={e => setFormData({...formData, saleDate: e.target.value})} required />
      </div>
      <div>
        <Label>Status</Label>
        <Select value={formData.status} onValueChange={v => setFormData({...formData, status: v})}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Booked">Booked</SelectItem>
            <SelectItem value="Agreement">Agreement</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
      </div>
      {!initialData && (
        <p className="text-sm text-gray-500 bg-blue-50 p-3 rounded">
          Note: Payments can be added after creating the sale record via the Customer tab.
        </p>
      )}
      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={!formData.customerId || items.length === 0}>
          {isEdit ? 'Update Sale' : (items.length > 1 ? `Add ${items.length} Sales` : 'Add Sale')}
        </Button>
      </div>
    </form>
  )
}

// Vendor Form Component
const VendorForm = ({ vendor, onSubmit, onCancel, vendorTypes = [], onAddNewType, defaultType, lockType = false }) => {
  const { toast } = useToast()
  const [formData, setFormData] = useState({
    name: vendor?.name || '',
    type: vendor?.type || defaultType || 'Other',
    phone: vendor?.phone || '',
    notes: vendor?.notes || ''
  })
  const [showAddType, setShowAddType] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [isAddingType, setIsAddingType] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(formData)
  }

  // Use dynamic types if available, fallback to hardcoded
  const types = vendorTypes.length > 0 ? vendorTypes.map(t => t.name) : ['Electrician', 'Broker', 'Labour', 'Legal', 'Marketing', 'Plumber', 'Civil', 'Other']

  const handleAddNewType = async () => {
    if (!newTypeName.trim()) return
    setIsAddingType(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/vendor-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: newTypeName.trim() })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to add type')
      }
      toast({ title: 'Success', description: 'New vendor type added' })
      setFormData({ ...formData, type: newTypeName.trim() })
      setNewTypeName('')
      setShowAddType(false)
      if (onAddNewType) onAddNewType() // Refresh the list
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setIsAddingType(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Vendor Name *</Label>
        <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
      </div>
      <div>
        <Label>Vendor Type *</Label>
        {lockType ? (
          // Locked-type mode (Commission Ledger): show the fixed type as a
          // read-only chip so the user can't change it but still sees it.
          <div className="flex items-center gap-2 mt-1 px-3 py-2 rounded-md border bg-slate-50 text-slate-700">
            <Badge variant="secondary">{formData.type}</Badge>
            <span className="text-xs text-slate-500">Locked for this ledger</span>
          </div>
        ) : showAddType ? (
          <div className="flex gap-2">
            <Input
              value={newTypeName}
              onChange={e => setNewTypeName(e.target.value)}
              placeholder="New type name"
              autoFocus
            />
            <Button type="button" size="sm" onClick={handleAddNewType} disabled={isAddingType || !newTypeName.trim()}>
              {isAddingType ? 'Adding...' : 'Add'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setShowAddType(false); setNewTypeName(''); }}>
              Cancel
            </Button>
          </div>
        ) : (
          <Select value={formData.type} onValueChange={v => {
            if (v === '__add_new__') {
              setShowAddType(true)
            } else {
              setFormData({...formData, type: v})
            }
          }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {types.map(type => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
              <SelectItem value="__add_new__" className="text-blue-600 font-medium">
                + Add New Type
              </SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
      <div>
        <Label>Phone</Label>
        <Input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
      </div>
      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit">{vendor ? 'Update' : 'Add'} Vendor</Button>
      </div>
    </form>
  )
}

// Expense Bill Form Component
const ExpenseBillForm = ({ vendors, accounts = [], onSubmit, onCancel, initialData }) => {
  const { toast } = useToast()
  const isEdit = Boolean(initialData?.id)
  // Quick Pay mode: opened from the vendor ledger's Quick Pay shortcut.
  // Pre-checks "Payment Made Now" and keeps paidAmount auto-synced to
  // billAmount so the entry is recorded as fully paid in one submit.
  const quickPay = Boolean(initialData?.quickPay)

  const initialDate = (initialData?.billDate || '').toString().split('T')[0]

  const [formData, setFormData] = useState({
    vendorId: initialData?.vendorId || '',
    billAmount: (initialData?.billAmount ?? initialData?.amount ?? '').toString(),
    billDate: initialDate,
    description: initialData?.description || ''
  })

  // Inline first-payment capture (only for new bills). Lets the user record
  // an advance/partial payment in the same submit instead of opening the
  // payment drawer after creating the bill.
  const [paymentMadeNow, setPaymentMadeNow] = useState(quickPay)
  const [paymentData, setPaymentData] = useState({
    paidAmount: '',
    paymentMode: 'Cash',
    accountId: '',
    referenceNo: '',
    paymentRemark: '',
  })
  // While quickPay is on AND the user hasn't manually overridden the paid
  // amount, mirror billAmount → paidAmount so it always reflects full payment.
  const [paidAmountTouched, setPaidAmountTouched] = useState(false)
  useEffect(() => {
    if (!quickPay || paidAmountTouched) return
    setPaymentData(prev => ({ ...prev, paidAmount: formData.billAmount }))
  }, [quickPay, paidAmountTouched, formData.billAmount])

  // Default the account to the first one matching the chosen mode whenever
  // mode flips or accounts list arrives.
  useEffect(() => {
    if (!paymentMadeNow) return
    const wantType = paymentData.paymentMode === 'Cash' ? 'CASH' : 'BANK'
    const eligible = (accounts || []).filter(a => a.type === wantType)
    if (!eligible.length) return
    const stillValid = eligible.find(a => a.id === paymentData.accountId)
    if (stillValid) return
    const def = eligible.find(a => a.isDefault) || eligible[0]
    setPaymentData(prev => ({ ...prev, accountId: def.id }))
  }, [paymentMadeNow, paymentData.paymentMode, accounts])

  const workValue = parseFloat(formData.billAmount) || 0
  const paidNow = paymentMadeNow ? (parseFloat(paymentData.paidAmount) || 0) : 0
  const pendingAfterSave = Math.max(0, workValue - paidNow)
  const paymentExceeds = paymentMadeNow && paidNow > workValue

  const handleSubmit = (e) => {
    e.preventDefault()
    if (paymentExceeds) {
      toast({ title: 'Invalid payment', description: 'Paid amount cannot exceed work value', variant: 'destructive' })
      return
    }
    // Vendor's type doubles as the category — keeps the bill classified
    // without making the user pick a second time.
    const selectedVendor = vendors.find(v => v.id === formData.vendorId)
    const payload = {
      ...formData,
      billAmount: workValue,
      category: selectedVendor?.type || '',
    }
    if (!isEdit && paymentMadeNow && paidNow > 0) {
      payload.initialPayment = {
        amount: paidNow,
        paymentDate: formData.billDate,
        paymentMode: paymentData.paymentMode,
        accountId: paymentData.accountId,
        referenceNo: paymentData.referenceNo,
        // Quick Pay reuses the work description as the payment remark — no
        // separate field in that mode, so fall back to description.
        remark: paymentData.paymentRemark || (quickPay ? formData.description : ''),
      }
    }
    onSubmit(payload)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Vendor *</Label>
        <Select value={formData.vendorId} onValueChange={v => setFormData({...formData, vendorId: v})} required>
          <SelectTrigger>
            <SelectValue placeholder="Select vendor" />
          </SelectTrigger>
          <SelectContent>
            {vendors.map(vendor => (
              <SelectItem key={vendor.id} value={vendor.id}>
                {vendor.name} ({vendor.type})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {vendors.length === 0 && (
          <p className="text-sm text-orange-600 mt-1">Please add vendors first from the Vendors tab</p>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>{quickPay ? 'Amount *' : 'Bill Amount *'}</Label>
          <Input type="number" value={formData.billAmount} onChange={e => setFormData({...formData, billAmount: e.target.value})} required />
        </div>
        <div>
          <Label>{quickPay ? 'Date *' : 'Bill Date *'}</Label>
          <Input type="date" value={formData.billDate} onChange={e => setFormData({...formData, billDate: e.target.value})} required />
        </div>
      </div>
      <div>
        <Label>Description</Label>
        <Textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
      </div>
      {!isEdit && (
        <div className={`rounded-md border ${paymentMadeNow ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200'} p-3 space-y-3`}>
          {/* In Quick Pay mode the dialog itself implies a full payment, so we
              hide the toggle and the redundant Paid Amount / Payment Remark
              fields — only the payment-mode/account/reference choices matter. */}
          {!quickPay && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-4 w-4 accent-emerald-600"
                checked={paymentMadeNow}
                onChange={(e) => setPaymentMadeNow(e.target.checked)}
              />
              <span className="font-medium">Payment Made Now</span>
              <span className="text-sm text-slate-500">— record advance/full payment along with this work</span>
            </label>
          )}
          {quickPay && (
            <p className="text-sm text-emerald-800 font-medium flex items-center gap-2">
              <Zap className="w-4 h-4" /> Full payment will be recorded with this entry
            </p>
          )}
          {paymentMadeNow && (
            <div className="space-y-3 pt-1">
              {!quickPay && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Paid Amount (₹) *</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentData.paidAmount}
                      onChange={(e) => {
                        setPaidAmountTouched(true)
                        setPaymentData({ ...paymentData, paidAmount: e.target.value })
                      }}
                      required
                    />
                    {paymentExceeds && (
                      <p className="text-xs text-red-600 mt-1">Paid amount cannot exceed work value</p>
                    )}
                  </div>
                  <div>
                    <Label>Payment Mode *</Label>
                    <Select
                      value={paymentData.paymentMode}
                      onValueChange={(v) => setPaymentData({ ...paymentData, paymentMode: v, accountId: '' })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_MODES.map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              {quickPay && (
                <div>
                  <Label>Payment Mode *</Label>
                  <Select
                    value={paymentData.paymentMode}
                    onValueChange={(v) => setPaymentData({ ...paymentData, paymentMode: v, accountId: '' })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_MODES.map(m => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>From Account</Label>
                  <Select
                    value={paymentData.accountId}
                    onValueChange={(v) => setPaymentData({ ...paymentData, accountId: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {(accounts || [])
                        .filter(a => paymentData.paymentMode === 'Cash' ? a.type === 'CASH' : a.type === 'BANK')
                        .map(a => (
                          <SelectItem key={a.id} value={a.id}>{a.name} ({a.type})</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Reference / Cheque No <span className="text-xs text-slate-500">recommended</span></Label>
                  <Input
                    placeholder="Txn / Ref"
                    value={paymentData.referenceNo}
                    onChange={(e) => setPaymentData({ ...paymentData, referenceNo: e.target.value })}
                  />
                </div>
              </div>
              {!quickPay && (
                <div>
                  <Label>Payment Remark</Label>
                  <Input
                    value={paymentData.paymentRemark}
                    onChange={(e) => setPaymentData({ ...paymentData, paymentRemark: e.target.value })}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {!isEdit && !quickPay && (
        <div className="grid grid-cols-3 gap-3 rounded-md border bg-slate-50 p-3 text-center">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Work Value</p>
            <p className="text-lg font-bold text-blue-700">₹{fmt(workValue)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Paid Now</p>
            <p className="text-lg font-bold text-emerald-700">₹{fmt(paidNow)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Pending After Save</p>
            <p className={`text-lg font-bold ${pendingAfterSave > 0 ? 'text-red-700' : 'text-emerald-700'}`}>₹{fmt(pendingAfterSave)}</p>
          </div>
        </div>
      )}
      {isEdit && (initialData?.totalPaid ?? initialData?.paidAmount ?? 0) > 0 && (
        <p className="text-sm text-orange-700 bg-orange-50 p-3 rounded">
          ₹{((initialData.totalPaid ?? initialData.paidAmount) || 0).toLocaleString('en-IN')} already paid against this bill — bill amount can&apos;t be reduced below that.
        </p>
      )}
      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={vendors.length === 0 || paymentExceeds}>
          {isEdit
            ? 'Update Bill'
            : (quickPay && paidNow > 0 && paidNow === workValue
                ? 'Save Quick Pay (Full)'
                : (paymentMadeNow && paidNow > 0 ? 'Save Work + Payment' : 'Add Work Entry'))}
        </Button>
      </div>
    </form>
  )
}

// Commission Bill Form Component
const CommissionBillForm = ({ brokers, sales, inventory, onSubmit, onCancel, initialData }) => {
  const isEdit = Boolean(initialData?.id)
  const initialDate = (initialData?.commissionDate || initialData?.billDate || '').toString().split('T')[0]
  const [formData, setFormData] = useState({
    brokerVendorId: initialData?.brokerVendorId || '',
    saleId: initialData?.saleId || '',
    commissionAmount: (initialData?.commissionAmount ?? initialData?.amount ?? '').toString(),
    commissionDate: initialDate,
    remark: initialData?.remark || initialData?.description || ''
  })

  const selectedSale = sales.find(s => s.id === formData.saleId)
  const selectedInventory = inventory.find(i => i.id === selectedSale?.inventoryId)

  // Helper to get inventory label for a sale
  const getInventoryLabel = (sale) => {
    const inv = inventory.find(i => i.id === sale?.inventoryId)
    if (inv) {
      return `${inv.type} ${inv.inventoryNumber}`
    }
    // Fallback to sale's stored inventory info
    if (sale?.inventoryNumber || sale?.inventoryName) {
      return sale.inventoryName || sale.inventoryNumber
    }
    return null
  }

  // Build display label for dropdown
  const getSaleDisplayLabel = (sale) => {
    const invLabel = getInventoryLabel(sale)
    const amount = `₹${fmt(sale.finalAmount)}`
    if (invLabel) {
      return `${invLabel} – ${sale.customerName} – ${amount}`
    }
    return `${sale.customerName} – ${amount}`
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({
      ...formData,
      inventoryId: selectedSale?.inventoryId,
      commissionAmount: parseFloat(formData.commissionAmount)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Broker (Vendor type: Broker) *</Label>
        <Select value={formData.brokerVendorId} onValueChange={v => setFormData({...formData, brokerVendorId: v})} required>
          <SelectTrigger>
            <SelectValue placeholder="Select broker" />
          </SelectTrigger>
          <SelectContent>
            {brokers.map(broker => (
              <SelectItem key={broker.id} value={broker.id}>
                {broker.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {brokers.length === 0 && (
          <p className="text-sm text-orange-600 mt-1">Please add a vendor with type Broker first</p>
        )}
      </div>
      <div>
        <Label>Related Sale *</Label>
        <Select value={formData.saleId} onValueChange={v => setFormData({...formData, saleId: v})} required>
          <SelectTrigger>
            <SelectValue placeholder="Select sale" />
          </SelectTrigger>
          <SelectContent>
            {sales.map(sale => (
              <SelectItem key={sale.id} value={sale.id}>
                {getSaleDisplayLabel(sale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {sales.length === 0 && (
          <p className="text-sm text-orange-600 mt-1">Please create sales first from the Sales tab</p>
        )}
      </div>
      {selectedSale && (
        <Card className="bg-gray-50">
          <CardContent className="pt-4">
            <p className="text-sm"><strong>Flat/Inventory:</strong> {getInventoryLabel(selectedSale) || '—'}</p>
            <p className="text-sm"><strong>Customer:</strong> {selectedSale.customerName}</p>
            <p className="text-sm"><strong>Sale Amount:</strong> ₹{fmt(selectedSale.finalAmount)}</p>
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Commission Amount *</Label>
          <Input type="number" value={formData.commissionAmount} onChange={e => setFormData({...formData, commissionAmount: e.target.value})} required />
        </div>
        <div>
          <Label>Commission Date *</Label>
          <Input type="date" value={formData.commissionDate} onChange={e => setFormData({...formData, commissionDate: e.target.value})} required />
        </div>
      </div>
      <div>
        <Label>Remark</Label>
        <Textarea value={formData.remark} onChange={e => setFormData({...formData, remark: e.target.value})} />
      </div>
      {!isEdit && (
        <p className="text-sm text-gray-500 bg-blue-50 p-3 rounded">
          Note: This creates a commission bill for the broker. Payments can be added separately.
        </p>
      )}
      {isEdit && (initialData?.totalPaid ?? initialData?.paidAmount ?? 0) > 0 && (
        <p className="text-sm text-orange-700 bg-orange-50 p-3 rounded">
          ₹{((initialData.totalPaid ?? initialData.paidAmount) || 0).toLocaleString('en-IN')} already paid against this commission — amount can&apos;t be reduced below that.
        </p>
      )}
      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={brokers.length === 0 || sales.length === 0}>{isEdit ? 'Update Commission Bill' : 'Create Commission Bill'}</Button>
      </div>
    </form>
  )
}

// Margin Bill Form — like CommissionBillForm but the recipient is implicit
// (the resale flat). Pick a ResaleDeal, enter amount, date, description.
const MarginBillForm = ({ accounts = [], onSubmit, onCancel, initialData }) => {
  const { toast } = useToast()
  const isEdit = Boolean(initialData?.id)
  const initialDate = (initialData?.billDate || '').toString().split('T')[0]
  const [formData, setFormData] = useState({
    amount: (initialData?.amount ?? '').toString(),
    billDate: initialDate,
    remark: initialData?.description || initialData?.remark || ''
  })

  // Inline first-payment capture — mirrors ExpenseBillForm so the user can
  // record advance/full payment in the same submit instead of opening the
  // payment drawer after creating the bill.
  const [paymentMadeNow, setPaymentMadeNow] = useState(false)
  const [paymentData, setPaymentData] = useState({
    paidAmount: '',
    paymentMode: 'Cash',
    accountId: '',
    referenceNo: '',
    paymentRemark: '',
  })

  useEffect(() => {
    if (!paymentMadeNow) return
    const wantType = paymentData.paymentMode === 'Cash' ? 'CASH' : 'BANK'
    const eligible = (accounts || []).filter(a => a.type === wantType)
    if (!eligible.length) return
    const stillValid = eligible.find(a => a.id === paymentData.accountId)
    if (stillValid) return
    const def = eligible.find(a => a.isDefault) || eligible[0]
    setPaymentData(prev => ({ ...prev, accountId: def.id }))
  }, [paymentMadeNow, paymentData.paymentMode, accounts])

  const marginValue = parseFloat(formData.amount) || 0
  const paidNow = paymentMadeNow ? (parseFloat(paymentData.paidAmount) || 0) : 0
  const pendingAfterSave = Math.max(0, marginValue - paidNow)
  const paymentExceeds = paymentMadeNow && paidNow > marginValue

  const handleSubmit = (e) => {
    e.preventDefault()
    if (paymentExceeds) {
      toast({ title: 'Invalid payment', description: 'Paid amount cannot exceed margin amount', variant: 'destructive' })
      return
    }
    const payload = {
      amount: marginValue,
      billDate: formData.billDate,
      remark: formData.remark,
      description: formData.remark,
    }
    if (!isEdit && paymentMadeNow && paidNow > 0) {
      payload.initialPayment = {
        amount: paidNow,
        paymentDate: formData.billDate,
        paymentMode: paymentData.paymentMode,
        accountId: paymentData.accountId,
        referenceNo: paymentData.referenceNo,
        remark: paymentData.paymentRemark,
      }
    }
    onSubmit(payload)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Margin Amount *</Label>
          <Input
            type="number"
            value={formData.amount}
            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
            required
          />
        </div>
        <div>
          <Label>Date *</Label>
          <Input
            type="date"
            value={formData.billDate}
            onChange={(e) => setFormData({ ...formData, billDate: e.target.value })}
            required
          />
        </div>
      </div>

      <div>
        <Label>Remark</Label>
        <Textarea
          value={formData.remark}
          onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
          placeholder="Add a remark for this margin entry"
        />
      </div>

      {!isEdit && (
        <div className={`rounded-md border ${paymentMadeNow ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200'} p-3 space-y-3`}>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 accent-emerald-600"
              checked={paymentMadeNow}
              onChange={(e) => setPaymentMadeNow(e.target.checked)}
            />
            <span className="font-medium">Payment Made Now</span>
            <span className="text-sm text-slate-500">— record advance/full payment along with this margin</span>
          </label>
          {paymentMadeNow && (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Paid Amount (₹) *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={paymentData.paidAmount}
                    onChange={(e) => setPaymentData({ ...paymentData, paidAmount: e.target.value })}
                    required
                  />
                  {paymentExceeds && (
                    <p className="text-xs text-red-600 mt-1">Paid amount cannot exceed margin amount</p>
                  )}
                </div>
                <div>
                  <Label>Payment Mode *</Label>
                  <Select
                    value={paymentData.paymentMode}
                    onValueChange={(v) => setPaymentData({ ...paymentData, paymentMode: v, accountId: '' })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_MODES.map(m => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>From Account</Label>
                  <Select
                    value={paymentData.accountId}
                    onValueChange={(v) => setPaymentData({ ...paymentData, accountId: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {(accounts || [])
                        .filter(a => paymentData.paymentMode === 'Cash' ? a.type === 'CASH' : a.type === 'BANK')
                        .map(a => (
                          <SelectItem key={a.id} value={a.id}>{a.name} ({a.type})</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Reference / Cheque No <span className="text-xs text-slate-500">recommended</span></Label>
                  <Input
                    placeholder="Txn / Ref"
                    value={paymentData.referenceNo}
                    onChange={(e) => setPaymentData({ ...paymentData, referenceNo: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Payment Remark</Label>
                <Input
                  value={paymentData.paymentRemark}
                  onChange={(e) => setPaymentData({ ...paymentData, paymentRemark: e.target.value })}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {!isEdit && (
        <div className="grid grid-cols-3 gap-3 rounded-md border bg-slate-50 p-3 text-center">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Margin</p>
            <p className="text-lg font-bold text-blue-700">₹{fmt(marginValue)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Paid Now</p>
            <p className="text-lg font-bold text-emerald-700">₹{fmt(paidNow)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Pending After Save</p>
            <p className={`text-lg font-bold ${pendingAfterSave > 0 ? 'text-red-700' : 'text-emerald-700'}`}>₹{fmt(pendingAfterSave)}</p>
          </div>
        </div>
      )}

      {isEdit && (initialData?.totalPaid ?? initialData?.paidAmount ?? 0) > 0 && (
        <p className="text-sm text-orange-700 bg-orange-50 p-3 rounded">
          ₹{((initialData.totalPaid ?? initialData.paidAmount) || 0).toLocaleString('en-IN')} already paid against this bill — margin amount can&apos;t be reduced below that.
        </p>
      )}

      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={paymentExceeds}>
          {isEdit ? 'Update Margin Bill' : (paymentMadeNow && paidNow > 0 ? 'Save Margin + Payment' : 'Create Margin Bill')}
        </Button>
      </div>
    </form>
  )
}

// Resale Deal Form Component
const ResaleDealForm = ({ inventory, sales = [], customers = [], resaleDeals = [], onSubmit, onCancel, onCreateCustomer }) => {
  const [formData, setFormData] = useState({
    inventoryId: '',
    sellerCustomerId: '',
    sellerName: '',
    sellerPhone: '',
    buyerCustomerId: '',
    buyerName: '',
    buyerPhone: '',
    resalePrice: '',
    transferCharges: '0',
    brokerage: '0',
    otherCharges: '0',
    chargesNotes: '',
    dealDate: new Date().toISOString().split('T')[0],
    notes: ''
  })
  
  const [selectedSale, setSelectedSale] = useState(null)
  // Picks the previous-owner ResaleDeal when this inventory has already been
  // resold once (Bhanu→Monu→Sonu chain). When present, the new deal records
  // `previousResaleDealId` so its "original" price/paid come from the prior
  // resale instead of the long-gone Bhanu→company Sale row.
  const [selectedPreviousDeal, setSelectedPreviousDeal] = useState(null)
  const [showNewBuyer, setShowNewBuyer] = useState(false)
  const [newBuyerData, setNewBuyerData] = useState({ name: '', phone: '' })
  const [isCreatingBuyer, setIsCreatingBuyer] = useState(false)
  const { toast } = useToast()

  // When inventory is selected, auto-populate seller info. Prefer an active
  // Sale (first-hop resale); if none exists, fall back to the most recent
  // Active ResaleDeal for that inventory (chained resale).
  const handleInventoryChange = (inventoryId) => {
    setFormData(prev => ({
      ...prev,
      inventoryId,
      sellerCustomerId: '',
      sellerName: '',
      sellerPhone: '',
    }))
    setSelectedSale(null)
    setSelectedPreviousDeal(null)

    const sale = sales.find(s => s.inventoryId === inventoryId && ['Booked', 'Agreement', 'Completed'].includes(s.status))
    if (sale) {
      setSelectedSale(sale)
      setFormData(prev => ({
        ...prev,
        inventoryId,
        sellerCustomerId: sale.customerId || '',
        sellerName: sale.customerName || '',
        sellerPhone: sale.customerPhone || ''
      }))
      return
    }

    // Chained resale: find the most recent ResaleDeal that's the current
    // "head" of the chain for this inventory — not yet chained forward
    // (no nextResaleDealId) and not deleted. Status may be 'Active' or
    // 'TRANSFERRED' (closed via closeDeal); both represent a real owner
    // who can still resell again.
    const candidateDeals = (resaleDeals || [])
      .filter(d =>
        d.inventoryId === inventoryId
        && !d.isDeleted
        && !d.nextResaleDealId
      )
      .sort((a, b) => new Date(b.dealDate || b.createdAt || 0) - new Date(a.dealDate || a.createdAt || 0))
    const lastDeal = candidateDeals[0]
    if (lastDeal) {
      setSelectedPreviousDeal(lastDeal)
      setFormData(prev => ({
        ...prev,
        inventoryId,
        sellerCustomerId: lastDeal.buyerCustomerId || '',
        sellerName: lastDeal.buyerName || '',
        sellerPhone: lastDeal.buyerPhone || ''
      }))
    }
  }

  // When buyer is selected from dropdown
  const handleBuyerChange = (buyerId) => {
    if (buyerId === '__add_new__') {
      setShowNewBuyer(true)
      return
    }
    const buyer = customers.find(c => c.id === buyerId)
    if (buyer) {
      setFormData({
        ...formData,
        buyerCustomerId: buyer.id,
        buyerName: buyer.name,
        buyerPhone: buyer.phone || ''
      })
    }
  }

  const handleCreateBuyerInline = async () => {
    if (!newBuyerData.name.trim()) {
      toast({ title: 'Error', description: 'Buyer name is required', variant: 'destructive' })
      return
    }
    setIsCreatingBuyer(true)
    try {
      if (onCreateCustomer) {
        const newCustomer = await onCreateCustomer(newBuyerData)
        if (newCustomer) {
          setFormData({
            ...formData,
            buyerCustomerId: newCustomer.id,
            buyerName: newCustomer.name,
            buyerPhone: newCustomer.phone || ''
          })
          toast({ title: 'Success', description: 'Buyer created and selected' })
        }
      }
      setShowNewBuyer(false)
      setNewBuyerData({ name: '', phone: '' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
    setIsCreatingBuyer(false)
  }

  // Calculate profit preview
  const calculateProfit = () => {
    const resalePrice = parseFloat(formData.resalePrice) || 0
    // For a first-hop resale, "original" comes from the Sale row. For a
    // chained resale (Monu→Sonu), it comes from the previous ResaleDeal:
    // the seller (Monu) bought at lastDeal.resalePrice and has paid in
    // lastDeal.collectedFromBuyer (sum of ResaleBuyerPayments).
    const originalPrice = selectedSale
      ? (selectedSale.finalAmount || 0)
      : (selectedPreviousDeal?.resalePrice || 0)
    const sellerPrincipal = selectedSale
      ? (selectedSale.totalPaid || 0)
      : (selectedPreviousDeal?.buyerPaid ?? selectedPreviousDeal?.originalSalePaid ?? 0)
    const transferCharges = parseFloat(formData.transferCharges) || 0
    const brokerage = parseFloat(formData.brokerage) || 0
    const otherCharges = parseFloat(formData.otherCharges) || 0
    const totalCharges = transferCharges + brokerage + otherCharges

    const grossProfit = resalePrice - originalPrice
    const netProfit = grossProfit - totalCharges

    // Seller payout = what seller paid + profit (minus charges)
    const sellerPayout = sellerPrincipal + netProfit

    return {
      originalPrice,
      grossProfit,
      totalCharges,
      netProfit,
      sellerPrincipal,
      sellerPayout: Math.max(0, sellerPayout)
    }
  }

  const profit = calculateProfit()

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!formData.buyerCustomerId) {
      toast({ title: 'Error', description: 'Please select or create a buyer', variant: 'destructive' })
      return
    }
    if (!selectedSale && !selectedPreviousDeal) {
      toast({ title: 'Error', description: 'No active owner found for this inventory', variant: 'destructive' })
      return
    }

    // Chained resale (Monu→Sonu): backend will derive originalSalePrice from
    // the previous deal's resalePrice and originalSalePaid from the
    // ResaleBuyerPayments collected against that deal. We still send
    // `previousResaleDealId` so the backend knows it's a chained deal and
    // can mark the previous deal TRANSFERRED.
    const sourceLink = selectedPreviousDeal
      ? { previousResaleDealId: selectedPreviousDeal.id }
      : {
          originalSaleId: selectedSale?.id,
          originalSalePrice: selectedSale?.finalAmount,
          originalSalePaid: selectedSale?.totalPaid || 0,
        }

    onSubmit({
      ...formData,
      resalePrice: parseFloat(formData.resalePrice),
      transferCharges: parseFloat(formData.transferCharges || 0),
      brokerage: parseFloat(formData.brokerage || 0),
      otherCharges: parseFloat(formData.otherCharges || 0),
      ...sourceLink,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Select Property */}
      <div>
        <Label>Select Property (Sold Inventory) *</Label>
        <Select value={formData.inventoryId} onValueChange={handleInventoryChange} required>
          <SelectTrigger>
            <SelectValue placeholder="Choose property to resell" />
          </SelectTrigger>
          <SelectContent>
            {inventory.map(item => {
              const activeSale = sales.find(s => s.inventoryId === item.id && ['Booked', 'Agreement', 'Completed'].includes(s.status))
              const lastDeal = !activeSale
                ? (resaleDeals || [])
                    .filter(d => d.inventoryId === item.id && !d.isDeleted && !d.nextResaleDealId)
                    .sort((a, b) => new Date(b.dealDate || b.createdAt || 0) - new Date(a.dealDate || a.createdAt || 0))[0]
                : null
              const ownerLabel = activeSale
                ? `Owner: ${activeSale.customerName}`
                : (lastDeal ? `Owner: ${lastDeal.buyerName} (from resale)` : '')
              return (
                <SelectItem key={item.id} value={item.id}>
                  {item.type} - {item.inventoryNumber} {ownerLabel ? `(${ownerLabel})` : ''}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
        {inventory.length === 0 && (
          <p className="text-sm text-orange-600 mt-1">No sold inventory available for resale</p>
        )}
      </div>

      {/* Seller Info (Auto-populated from Sale) */}
      {selectedSale && (
        <Card className="bg-gray-50">
          <CardContent className="pt-4">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <UserCircle className="w-4 h-4" /> Current Owner (Seller)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Name:</span> <strong>{formData.sellerName}</strong>
              </div>
              <div>
                <span className="text-gray-500">Phone:</span> {formData.sellerPhone || 'N/A'}
              </div>
              <div>
                <span className="text-gray-500">Original Sale Price:</span> <strong className="text-blue-600">₹{(selectedSale.finalAmount || 0).toLocaleString('en-IN')}</strong>
              </div>
              <div>
                <span className="text-gray-500">Amount Paid:</span> <strong className="text-green-600">₹{(selectedSale.totalPaid || 0).toLocaleString('en-IN')}</strong>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chained resale: seller is the buyer from a previous ResaleDeal */}
      {!selectedSale && selectedPreviousDeal && (
        <Card className="bg-indigo-50/60 border-indigo-200">
          <CardContent className="pt-4">
            <h4 className="font-medium mb-2 flex items-center gap-2 text-indigo-800">
              <ArrowRightLeft className="w-4 h-4" /> Current Owner (from previous resale)
            </h4>
            <p className="text-xs text-indigo-700 mb-2">
              This property was previously resold. The seller here is that resale&apos;s buyer.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Name:</span> <strong>{formData.sellerName}</strong>
              </div>
              <div>
                <span className="text-gray-500">Phone:</span> {formData.sellerPhone || 'N/A'}
              </div>
              <div>
                <span className="text-gray-500">Bought at (prev. resale price):</span>{' '}
                <strong className="text-blue-600">₹{(selectedPreviousDeal.resalePrice || 0).toLocaleString('en-IN')}</strong>
              </div>
              <div>
                <span className="text-gray-500">Paid against prev. resale:</span>{' '}
                <strong className="text-green-600">₹{((selectedPreviousDeal.buyerPaid ?? selectedPreviousDeal.originalSalePaid) || 0).toLocaleString('en-IN')}</strong>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Buyer Selection */}
      <div>
        <Label>Buyer (New Owner) *</Label>
        {!showNewBuyer ? (
          <Select value={formData.buyerCustomerId} onValueChange={handleBuyerChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select buyer" />
            </SelectTrigger>
            <SelectContent>
              {customers.filter(c => c.id !== formData.sellerCustomerId).map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} {c.phone ? `(${c.phone})` : ''}
                </SelectItem>
              ))}
              <SelectItem value="__add_new__" className="text-blue-600 font-medium border-t mt-1 pt-1">
                + Create New Buyer
              </SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <div className="space-y-3 p-3 border rounded-lg bg-blue-50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-blue-800">New Buyer</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowNewBuyer(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <Input 
              placeholder="Buyer Name *" 
              value={newBuyerData.name}
              onChange={e => setNewBuyerData({...newBuyerData, name: e.target.value})}
            />
            <Input 
              placeholder="Phone Number" 
              value={newBuyerData.phone}
              onChange={e => setNewBuyerData({...newBuyerData, phone: e.target.value})}
            />
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={handleCreateBuyerInline} disabled={isCreatingBuyer}>
                {isCreatingBuyer ? 'Creating...' : 'Create & Select'}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowNewBuyer(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {formData.buyerCustomerId && (
          <p className="text-xs text-green-600 mt-1">✓ Buyer selected: {formData.buyerName}</p>
        )}
      </div>
      
      {/* Resale Price */}
      <div>
        <Label>Resale Price * (Amount buyer will pay)</Label>
        <Input 
          type="number" 
          value={formData.resalePrice} 
          onChange={e => setFormData({...formData, resalePrice: e.target.value})} 
          placeholder="Enter resale amount"
          required 
        />
      </div>
      
      {/* Charges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Label>Transfer Charges</Label>
          <Input type="number" value={formData.transferCharges} onChange={e => setFormData({...formData, transferCharges: e.target.value})} />
        </div>
        <div>
          <Label>Brokerage</Label>
          <Input type="number" value={formData.brokerage} onChange={e => setFormData({...formData, brokerage: e.target.value})} />
        </div>
        <div>
          <Label>Margin</Label>
          <Input type="number" value={formData.otherCharges} onChange={e => setFormData({...formData, otherCharges: e.target.value})} />
        </div>
      </div>
      
      {formData.resalePrice && (
        <Input 
          placeholder="Charges notes (optional)" 
          value={formData.chargesNotes}
          onChange={e => setFormData({...formData, chargesNotes: e.target.value})}
        />
      )}
      
      {/* Profit Preview */}
      {formData.resalePrice && (selectedSale || selectedPreviousDeal) && (
        <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-green-200">
          <CardContent className="pt-4">
            <h4 className="font-medium mb-3">💰 Deal Summary</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">{selectedSale ? 'Original Sale Price:' : 'Prev. Resale Price:'}</span>
                  <span>₹{profit.originalPrice.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Resale Price:</span>
                  <span className="text-blue-600 font-medium">₹{(parseFloat(formData.resalePrice) || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Gross Profit:</span>
                  <span className={profit.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                    ₹{profit.grossProfit.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Charges:</span>
                  <span className="text-orange-600">-₹{profit.totalCharges.toLocaleString('en-IN')}</span>
                </div>
              </div>
              <div className="space-y-2 border-l pl-4">
                <div className="flex justify-between">
                  <span className="text-gray-600 font-medium">Net Profit:</span>
                  <span className={`font-bold ${profit.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ₹{profit.netProfit.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Seller Principal (Invested):</span>
                    <span>₹{profit.sellerPrincipal.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span className="text-gray-600">Est. Seller Payout:</span>
                    <span className="text-purple-600">₹{profit.sellerPayout.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      <div>
        <Label>Deal Date *</Label>
        <Input type="date" value={formData.dealDate} onChange={e => setFormData({...formData, dealDate: e.target.value})} required />
      </div>
      
      <div>
        <Label>Notes</Label>
        <Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="Any additional notes about this resale deal" />
      </div>
      
      <p className="text-sm text-gray-500 bg-blue-50 p-3 rounded">
        📋 After creating, you'll record: (1) Buyer payments → Money IN to society, (2) Seller payouts → Principal + Profit to seller.
      </p>
      
      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={inventory.length === 0 || !formData.buyerCustomerId}>Create Resale Deal</Button>
      </div>
    </form>
  )
}

// Resale Payment Drawer Component
const ResalePaymentDrawer = ({ isOpen, onClose, deal, buyerPayments, sellerPayouts, accounts, onAddBuyerPayment, onDeleteBuyerPayment, onEditBuyerPayment, onAddSellerPayout, onDeleteSellerPayout, onEditSellerPayout }) => {
  const [activeTab, setActiveTab] = useState('buyer')
  // editingBuyerId / editingSellerId switch the existing add forms into edit
  // mode. null = creating a new entry, an id = editing that row in place.
  const [editingBuyerId, setEditingBuyerId] = useState(null)
  const [editingSellerId, setEditingSellerId] = useState(null)
  const [buyerFormData, setBuyerFormData] = useState({
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMode: 'Cash',
    accountId: '',
    reference: '',
    remark: ''
  })
  const [sellerFormData, setSellerFormData] = useState({
    principalAmount: '',
    profitAmount: '',
    chargesDeducted: '0',
    payoutDate: new Date().toISOString().split('T')[0],
    payoutMode: 'Cash',
    accountId: '',
    reference: '',
    remark: ''
  })
  const [useAutoBreakdown, setUseAutoBreakdown] = useState(true)

  // Set default account
  useEffect(() => {
    if (accounts?.length > 0) {
      const defaultAccount = accounts.find(a => a.isDefault) || accounts[0]
      if (!buyerFormData.accountId) {
        setBuyerFormData(prev => ({ ...prev, accountId: defaultAccount?.id || '' }))
      }
      if (!sellerFormData.accountId) {
        setSellerFormData(prev => ({ ...prev, accountId: defaultAccount?.id || '' }))
      }
    }
  }, [accounts])

  // Auto-calculate principal/profit when deal changes — skipped while editing
  // a specific payout so the user's loaded values aren't overwritten.
  useEffect(() => {
    if (deal && useAutoBreakdown && !editingSellerId) {
      const sellerPaid = sellerPayouts.reduce((sum, p) => sum + p.amount, 0)
      const sellerBalance = (deal.sellerPayoutAmount || 0) - sellerPaid

      // Calculate remaining principal and profit
      const totalPrincipalPaid = sellerPayouts.reduce((sum, p) => sum + (p.principalAmount || 0), 0)
      const totalProfitPaid = sellerPayouts.reduce((sum, p) => sum + (p.profitAmount || 0), 0)

      const remainingPrincipal = Math.max(0, (deal.sellerPayoutPrincipal || 0) - totalPrincipalPaid)
      const remainingProfit = Math.max(0, (deal.sellerPayoutProfit || deal.netProfit || 0) - totalProfitPaid)

      setSellerFormData(prev => ({
        ...prev,
        principalAmount: remainingPrincipal > 0 ? Math.min(sellerBalance, remainingPrincipal).toString() : '0',
        profitAmount: remainingProfit > 0 ? Math.min(sellerBalance - Math.min(sellerBalance, remainingPrincipal), remainingProfit).toString() : '0'
      }))
    }
  }, [deal, sellerPayouts, useAutoBreakdown, editingSellerId])

  if (!deal) return null

  // Backend `list()` now sums ResaleBuyerPayment + PaymentAllocation
  // (customer-payment → resale-deal allocations) into `deal.buyerPaid`.
  // Prefer that authoritative number when it exists so allocations made
  // from the customer-payment modal show up here too. Fall back to the
  // local sum when the deal row predates the field (older fetches).
  const buyerPaidFromPayments = buyerPayments.reduce((sum, p) => sum + p.amount, 0)
  const buyerPaid = typeof deal.buyerPaid === 'number' ? deal.buyerPaid : buyerPaidFromPayments
  const buyerBalance = (deal.buyerPurchaseAmount || deal.resalePrice || 0) - buyerPaid
  const sellerPaid = sellerPayouts.reduce((sum, p) => sum + p.amount, 0)
  const sellerPayoutExpected = deal.sellerPayoutAmount || Math.max(0, (deal.resalePrice || 0) - (deal.companyCommission || 0))
  const sellerBalance = sellerPayoutExpected - sellerPaid
  
  // Calculate remaining principal and profit
  const totalPrincipalPaid = sellerPayouts.reduce((sum, p) => sum + (p.principalAmount || 0), 0)
  const totalProfitPaid = sellerPayouts.reduce((sum, p) => sum + (p.profitAmount || 0), 0)
  const remainingPrincipal = Math.max(0, (deal.sellerPayoutPrincipal || deal.sellerPrincipal || 0) - totalPrincipalPaid)
  const remainingProfit = Math.max(0, (deal.sellerPayoutProfit || deal.netProfit || 0) - totalProfitPaid)

  const resetBuyerForm = () => setBuyerFormData({
    amount: '', paymentDate: new Date().toISOString().split('T')[0],
    paymentMode: 'Cash', accountId: accounts?.[0]?.id || '', reference: '', remark: '',
  })
  const resetSellerForm = () => setSellerFormData({
    principalAmount: '', profitAmount: '', chargesDeducted: '0',
    payoutDate: new Date().toISOString().split('T')[0], payoutMode: 'Cash',
    accountId: accounts?.[0]?.id || '', reference: '', remark: '',
  })

  // Pre-populate the existing add form with a row's values so the user can
  // edit in place. The form's Submit handler branches on editingBuyerId /
  // editingSellerId to call the edit handler instead of the add handler.
  const startEditBuyer = (payment) => {
    setEditingBuyerId(payment.id)
    setBuyerFormData({
      amount: String(payment.amount ?? ''),
      paymentDate: (payment.paymentDate || '').slice(0, 10) || new Date().toISOString().split('T')[0],
      paymentMode: payment.paymentMode || 'Cash',
      accountId: payment.accountId || '',
      reference: payment.referenceNo || payment.reference || '',
      remark: payment.remark || '',
    })
    // Scroll to top so the now-populated form is visible.
    setTimeout(() => document.querySelector('[data-resale-buyer-form]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  }
  const cancelEditBuyer = () => { setEditingBuyerId(null); resetBuyerForm() }

  const startEditSeller = (payout) => {
    setEditingSellerId(payout.id)
    setSellerFormData({
      principalAmount: String(payout.principalAmount ?? ''),
      profitAmount: String(payout.profitAmount ?? ''),
      chargesDeducted: String(payout.chargesDeducted ?? '0'),
      payoutDate: (payout.payoutDate || payout.paymentDate || '').slice(0, 10) || new Date().toISOString().split('T')[0],
      payoutMode: payout.payoutMode || payout.paymentMode || 'Cash',
      accountId: payout.accountId || '',
      reference: payout.reference || payout.referenceNo || '',
      remark: payout.remark || '',
    })
    setTimeout(() => document.querySelector('[data-resale-seller-form]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  }
  const cancelEditSeller = () => { setEditingSellerId(null); resetSellerForm() }

  const handleBuyerSubmit = (e) => {
    e.preventDefault()
    const payload = {
      amount: parseFloat(buyerFormData.amount),
      paymentDate: buyerFormData.paymentDate,
      paymentMode: buyerFormData.paymentMode,
      accountId: buyerFormData.accountId,
      referenceNo: buyerFormData.reference,
      remark: buyerFormData.remark,
    }
    if (editingBuyerId) {
      onEditBuyerPayment?.(editingBuyerId, payload)
      setEditingBuyerId(null)
    } else {
      onAddBuyerPayment(payload)
    }
    resetBuyerForm()
  }

  const handleSellerSubmit = (e) => {
    e.preventDefault()
    const principal = parseFloat(sellerFormData.principalAmount) || 0
    const profit = parseFloat(sellerFormData.profitAmount) || 0
    const charges = parseFloat(sellerFormData.chargesDeducted) || 0
    const totalAmount = principal + profit - charges

    if (totalAmount <= 0) {
      return
    }

    const payload = {
      amount: totalAmount,
      principalAmount: principal,
      profitAmount: profit,
      chargesDeducted: charges,
      payoutDate: sellerFormData.payoutDate,
      payoutMode: sellerFormData.payoutMode,
      accountId: sellerFormData.accountId,
      reference: sellerFormData.reference,
      remark: sellerFormData.remark,
    }
    if (editingSellerId) {
      onEditSellerPayout?.(editingSellerId, payload)
      setEditingSellerId(null)
    } else {
      onAddSellerPayout(payload)
    }
    resetSellerForm()
  }

  const sellerPayoutTotal = (parseFloat(sellerFormData.principalAmount) || 0) + 
                           (parseFloat(sellerFormData.profitAmount) || 0) - 
                           (parseFloat(sellerFormData.chargesDeducted) || 0)

  return (
    <Drawer open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle>Resale Payments - {deal?.inventoryName || deal?.inventoryNumber}</DrawerTitle>
          <DrawerDescription>
            {deal?.sellerName} → {deal?.buyerName}
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 overflow-y-auto max-h-[60vh]">
          {/* Deal Overview — single-glance view of every important number on
              the deal: parties, flat, pricing, margin, charges, profit, status.
              Replaces the old two-card summary so the user doesn't need to dig
              into the create form to see what the deal actually consists of. */}
          {(() => {
            const transferCharges = Number(deal.transferCharges) || 0
            const brokerage = Number(deal.brokerage) || 0
            const otherCharges = Number(deal.otherCharges) || 0
            const companyCommission = Number(deal.companyCommission) || 0
            const originalSalePrice = Number(deal.originalSalePrice) || 0
            const originalSalePaid = Number(deal.originalSalePaid) || 0
            const resalePrice = Number(deal.resalePrice) || 0
            const grossProfit = resalePrice - originalSalePrice
            const netProfit = Number(deal.netProfit ?? (grossProfit - companyCommission))
            const dealDateStr = deal.dealDate
              ? new Date(deal.dealDate).toLocaleDateString()
              : (deal.createdAt ? new Date(deal.createdAt).toLocaleDateString() : '—')
            const isClosed = (deal.status || '').toLowerCase() === 'closed'
            return (
              <Card className="mb-4 border-blue-200 bg-gradient-to-br from-blue-50/60 via-white to-purple-50/60">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <CardTitle className="text-base">Deal Overview</CardTitle>
                      <CardDescription>Flat {deal.inventoryName || deal.inventoryNumber || '-'} · Booked on {dealDateStr}</CardDescription>
                    </div>
                    <Badge variant={isClosed ? 'secondary' : 'default'} className={isClosed ? '' : 'bg-emerald-600'}>
                      {(deal.status || 'Active').toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Parties */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-md border bg-white p-3">
                      <p className="text-[11px] uppercase tracking-wide text-orange-700">Seller (TRANSFERRED)</p>
                      <p className="font-semibold text-slate-900 mt-0.5">{deal.sellerName || '—'}</p>
                      {deal.sellerPhone && <p className="text-xs text-slate-500">{deal.sellerPhone}</p>}
                    </div>
                    <div className="rounded-md border bg-white p-3">
                      <p className="text-[11px] uppercase tracking-wide text-green-700">Buyer (NEW OWNER)</p>
                      <p className="font-semibold text-slate-900 mt-0.5">{deal.buyerName || '—'}</p>
                      {deal.buyerPhone && <p className="text-xs text-slate-500">{deal.buyerPhone}</p>}
                    </div>
                  </div>

                  {/* Pricing chain — Original buy → Resale → Gross → Net profit */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="rounded-md bg-slate-50 p-2 text-center">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">Original Buy</p>
                      <p className="font-bold text-slate-800">₹{fmt(originalSalePrice)}</p>
                      {originalSalePaid > 0 && (
                        <p className="text-[10px] text-slate-500">paid: ₹{fmt(originalSalePaid)}</p>
                      )}
                    </div>
                    <div className="rounded-md bg-blue-50 p-2 text-center">
                      <p className="text-[10px] uppercase tracking-wide text-blue-700">Resale Price</p>
                      <p className="font-bold text-blue-700">₹{fmt(resalePrice)}</p>
                    </div>
                    <div className="rounded-md bg-purple-50 p-2 text-center">
                      <p className="text-[10px] uppercase tracking-wide text-purple-700">Gross Profit</p>
                      <p className={`font-bold ${grossProfit >= 0 ? 'text-purple-700' : 'text-red-600'}`}>₹{fmt(grossProfit)}</p>
                    </div>
                    <div className="rounded-md bg-emerald-50 p-2 text-center">
                      <p className="text-[10px] uppercase tracking-wide text-emerald-700">Net Profit</p>
                      <p className={`font-bold ${netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>₹{fmt(netProfit)}</p>
                      <p className="text-[10px] text-slate-500">(after commission)</p>
                    </div>
                  </div>

                  {/* Company commission + charges breakdown */}
                  <div className="rounded-md border bg-amber-50/50 border-amber-200 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold text-amber-800">Company Commission / Margin</p>
                      <p className="font-bold text-amber-700">₹{fmt(companyCommission)}</p>
                    </div>
                    {(transferCharges || brokerage || otherCharges) ? (
                      <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-600">
                        <div>Transfer: <span className="font-medium text-slate-800">₹{fmt(transferCharges)}</span></div>
                        <div>Brokerage: <span className="font-medium text-slate-800">₹{fmt(brokerage)}</span></div>
                        <div>Other: <span className="font-medium text-slate-800">₹{fmt(otherCharges)}</span></div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500">No charges breakdown recorded</p>
                    )}
                    {deal.chargesNotes && (
                      <p className="text-[11px] text-slate-500 mt-1 italic">{deal.chargesNotes}</p>
                    )}
                  </div>

                  {/* Money flow recap — same numbers as the old IN/OUT cards
                      but condensed so the overview card carries one place to
                      look. Status badges show progress at a glance. */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-md border bg-green-50/60 border-green-200 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-green-700">Money IN (Buyer)</p>
                        <Badge variant={buyerBalance <= 0.01 ? 'default' : 'secondary'} className={buyerBalance <= 0.01 ? 'bg-green-600' : ''}>
                          {buyerBalance <= 0.01 ? 'FULLY RECEIVED' : buyerPaid > 0 ? 'PARTIAL' : 'PENDING'}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                        <div><span className="text-gray-600">Total:</span> <span className="font-bold block">₹{fmt(deal.buyerPurchaseAmount || resalePrice)}</span></div>
                        <div><span className="text-gray-600">Received:</span> <span className="font-bold text-green-600 block">₹{fmt(buyerPaid)}</span></div>
                        <div><span className="text-gray-600">Due:</span> <span className="font-bold text-orange-600 block">₹{fmt(Math.max(0, buyerBalance))}</span></div>
                      </div>
                    </div>
                    <div className="rounded-md border bg-orange-50/60 border-orange-200 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-orange-700">Money OUT (Seller)</p>
                        <Badge variant={sellerBalance <= 0.01 ? 'default' : 'secondary'} className={sellerBalance <= 0.01 ? 'bg-orange-600' : ''}>
                          {sellerBalance <= 0.01 ? 'FULLY PAID' : sellerPaid > 0 ? 'PARTIAL' : 'PENDING'}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                        <div><span className="text-gray-600">Total:</span> <span className="font-bold block">₹{fmt(sellerPayoutExpected)}</span></div>
                        <div><span className="text-gray-600">Paid:</span> <span className="font-bold text-green-600 block">₹{fmt(sellerPaid)}</span></div>
                        <div><span className="text-gray-600">Due:</span> <span className="font-bold text-orange-600 block">₹{fmt(Math.max(0, sellerBalance))}</span></div>
                      </div>
                    </div>
                  </div>

                  {deal.notes && (
                    <div className="rounded-md bg-slate-50 border p-2 text-xs text-slate-600">
                      <span className="font-medium text-slate-700">Notes:</span> {deal.notes}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })()}

          {/* Tabs for Buyer/Seller */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="buyer">Buyer Payments (IN)</TabsTrigger>
              <TabsTrigger value="seller">Seller Payouts (OUT)</TabsTrigger>
            </TabsList>
            
            {/* Buyer Payments Tab */}
            <TabsContent value="buyer" className="space-y-4">
              {(buyerBalance > 0 || editingBuyerId) && (
                <Card data-resale-buyer-form>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{editingBuyerId ? 'Edit Buyer Payment' : 'Add Buyer Payment'}</CardTitle>
                      {editingBuyerId && (
                        <Button type="button" variant="ghost" size="sm" onClick={cancelEditBuyer}>
                          Cancel edit
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleBuyerSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label>Amount *{editingBuyerId ? '' : ` (Max: ₹${fmt(buyerBalance)})`}</Label>
                          <Input
                            type="number"
                            value={buyerFormData.amount}
                            onChange={e => setBuyerFormData({...buyerFormData, amount: e.target.value})}
                            max={editingBuyerId ? undefined : buyerBalance}
                            required
                          />
                          {editingBuyerId && (
                            <p className="text-[11px] text-gray-500 mt-1">
                              Editing existing entry — limit not enforced.
                            </p>
                          )}
                        </div>
                        <div>
                          <Label>Payment Date *</Label>
                          <Input
                            type="date"
                            value={buyerFormData.paymentDate}
                            onChange={e => setBuyerFormData({...buyerFormData, paymentDate: e.target.value})}
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Payment Mode *</Label>
                        <Select value={buyerFormData.paymentMode} onValueChange={v => setBuyerFormData({...buyerFormData, paymentMode: v, accountId: ''})}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAYMENT_MODES.map(mode => (
                              <SelectItem key={mode} value={mode}>{mode}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Account *</Label>
                        <Select value={buyerFormData.accountId} onValueChange={v => setBuyerFormData({...buyerFormData, accountId: v})}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select account" />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts?.filter(acc => buyerFormData.paymentMode === 'Cash' ? acc.type === 'CASH' : acc.type === 'BANK').map(acc => (
                              <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.type})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Remark</Label>
                        <Textarea
                          value={buyerFormData.remark}
                          onChange={e => setBuyerFormData({...buyerFormData, remark: e.target.value})}
                        />
                      </div>
                      <Button type="submit" className="w-full bg-green-600 hover:bg-green-700">
                        {editingBuyerId ? (
                          <><Edit className="w-4 h-4 mr-2" /> Save Changes</>
                        ) : (
                          <><Plus className="w-4 h-4 mr-2" /> Add Buyer Payment</>
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Buyer Payment History</CardTitle>
                </CardHeader>
                <CardContent>
                  {buyerPayments.length === 0 ? (
                    <p className="text-center text-gray-500 py-4">No buyer payments recorded yet</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Mode</TableHead>
                          <TableHead>Remark</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {buyerPayments.map(payment => (
                          <TableRow key={payment.id} className={editingBuyerId === payment.id ? 'bg-blue-50/40' : ''}>
                            <TableCell>{new Date(payment.paymentDate).toLocaleDateString()}</TableCell>
                            <TableCell className="text-green-600 font-medium">₹{fmt(payment.amount)}</TableCell>
                            <TableCell><Badge variant="outline">{payment.paymentMode}</Badge></TableCell>
                            <TableCell>{payment.remark || '-'}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  title="Edit"
                                  onClick={() => startEditBuyer(payment)}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" title="Delete">
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Payment?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will also reverse the daybook entry. This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => onDeleteBuyerPayment(payment.id)}>Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Seller Payouts Tab */}
            <TabsContent value="seller" className="space-y-4">
              {/* Principal/Profit Summary */}
              {deal && (
                <Card className="bg-purple-50 border-purple-200">
                  <CardContent className="pt-4">
                    <h4 className="font-medium text-purple-800 mb-2">Seller Payout Breakdown</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Principal (Invested):</span>
                          <span>₹{fmt(deal.sellerPayoutPrincipal || deal.sellerPrincipal || 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Profit:</span>
                          <span className="text-green-600">₹{fmt(deal.sellerPayoutProfit || deal.netProfit || 0)}</span>
                        </div>
                        <div className="flex justify-between font-medium border-t pt-1 mt-1">
                          <span>Total Payable:</span>
                          <span className="text-purple-600">₹{fmt(deal.sellerPayoutAmount || 0)}</span>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Principal Paid:</span>
                          <span className="text-blue-600">₹{fmt(totalPrincipalPaid)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Profit Paid:</span>
                          <span className="text-green-600">₹{fmt(totalProfitPaid)}</span>
                        </div>
                        <div className="flex justify-between font-medium border-t pt-1 mt-1">
                          <span>Remaining:</span>
                          <span className="text-orange-600">₹{fmt(sellerBalance)}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {(sellerBalance > 0 || editingSellerId) && (
                <Card data-resale-seller-form>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">{editingSellerId ? 'Edit Seller Payout' : 'Add Seller Payout'}</CardTitle>
                        <CardDescription>
                          {editingSellerId
                            ? 'Editing existing entry — remaining caps are not enforced.'
                            : `Principal remaining: ₹${fmt(remainingPrincipal)} | Profit remaining: ₹${fmt(remainingProfit)}`}
                        </CardDescription>
                      </div>
                      {editingSellerId && (
                        <Button type="button" variant="ghost" size="sm" onClick={cancelEditSeller}>
                          Cancel edit
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSellerSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <Label>Principal Amount</Label>
                          <Input
                            type="number"
                            value={sellerFormData.principalAmount}
                            onChange={e => setSellerFormData({...sellerFormData, principalAmount: e.target.value})}
                            placeholder={`Max: ${fmt(remainingPrincipal)}`}
                          />
                          <p className="text-xs text-gray-500 mt-1">Remaining: ₹{fmt(remainingPrincipal)}</p>
                        </div>
                        <div>
                          <Label>Profit Amount</Label>
                          <Input
                            type="number"
                            value={sellerFormData.profitAmount}
                            onChange={e => setSellerFormData({...sellerFormData, profitAmount: e.target.value})}
                            placeholder={`Max: ${fmt(remainingProfit)}`}
                          />
                          <p className="text-xs text-gray-500 mt-1">Remaining: ₹{fmt(remainingProfit)}</p>
                        </div>
                        <div>
                          <Label>Charges Deducted</Label>
                          <Input
                            type="number"
                            value={sellerFormData.chargesDeducted}
                            onChange={e => setSellerFormData({...sellerFormData, chargesDeducted: e.target.value})}
                            placeholder="0"
                          />
                        </div>
                      </div>
                      
                      {/* Payout Preview */}
                      <div className="p-3 bg-gray-100 rounded-lg">
                        <div className="flex justify-between font-medium">
                          <span>Total Payout:</span>
                          <span className={sellerPayoutTotal > 0 ? 'text-green-600' : 'text-gray-400'}>
                            ₹{fmt(sellerPayoutTotal)}
                          </span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label>Payout Date *</Label>
                          <Input
                            type="date"
                            value={sellerFormData.payoutDate}
                            onChange={e => setSellerFormData({...sellerFormData, payoutDate: e.target.value})}
                            required
                          />
                        </div>
                        <div>
                          <Label>Payout Mode *</Label>
                          <Select value={sellerFormData.payoutMode} onValueChange={v => setSellerFormData({...sellerFormData, payoutMode: v, accountId: ''})}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PAYMENT_MODES.map(mode => (
                                <SelectItem key={mode} value={mode}>{mode}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label>Account *</Label>
                          <Select value={sellerFormData.accountId} onValueChange={v => setSellerFormData({...sellerFormData, accountId: v})}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select account" />
                            </SelectTrigger>
                            <SelectContent>
                              {accounts.filter(acc => sellerFormData.payoutMode === 'Cash' ? acc.type === 'CASH' : acc.type === 'BANK').map(acc => (
                                <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Reference (UTR/Cheque)</Label>
                          <Input
                            value={sellerFormData.reference}
                            onChange={e => setSellerFormData({...sellerFormData, reference: e.target.value})}
                            placeholder="Transaction reference"
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Remark</Label>
                        <Textarea
                          value={sellerFormData.remark}
                          onChange={e => setSellerFormData({...sellerFormData, remark: e.target.value})}
                          placeholder="Additional notes about this payout"
                        />
                      </div>
                      <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700" disabled={sellerPayoutTotal <= 0}>
                        {editingSellerId ? (
                          <><Edit className="w-4 h-4 mr-2" /> Save Changes (₹{fmt(sellerPayoutTotal)})</>
                        ) : (
                          <><Plus className="w-4 h-4 mr-2" /> Add Seller Payout (₹{fmt(sellerPayoutTotal)})</>
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              )}
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Seller Payout History</CardTitle>
                </CardHeader>
                <CardContent>
                  {sellerPayouts.length === 0 ? (
                    <p className="text-center text-gray-500 py-4">No seller payouts recorded yet</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Principal</TableHead>
                          <TableHead>Profit</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Mode</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sellerPayouts.map(payout => {
                          const dateStr = payout.payoutDate || payout.paymentDate
                          const parsedDate = dateStr ? new Date(dateStr) : null
                          const dateLabel = parsedDate && !isNaN(parsedDate.getTime())
                            ? parsedDate.toLocaleDateString()
                            : '—'
                          const modeLabel = payout.payoutMode || payout.paymentMode || '—'
                          return (
                          <TableRow key={payout.id} className={editingSellerId === payout.id ? 'bg-orange-50/40' : ''}>
                            <TableCell>{dateLabel}</TableCell>
                            <TableCell className="text-blue-600">₹{fmt(payout.principalAmount || 0)}</TableCell>
                            <TableCell className="text-green-600">₹{fmt(payout.profitAmount || 0)}</TableCell>
                            <TableCell className="text-orange-600 font-medium">₹{fmt(payout.amount)}</TableCell>
                            <TableCell><Badge variant="outline">{modeLabel}</Badge></TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  title="Edit"
                                  onClick={() => startEditSeller(payout)}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" title="Delete">
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Payout?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will also reverse the daybook entry.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => onDeleteSellerPayout(payout.id)}>Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <DrawerFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

// Customer Form Component
const CustomerForm = ({ customer, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    name: customer?.name || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    address: customer?.address || '',
    panNumber: customer?.panNumber || '',
    aadharNumber: customer?.aadharNumber || '',
    notes: customer?.notes || ''
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Customer Name *</Label>
        <Input 
          value={formData.name} 
          onChange={e => setFormData({...formData, name: e.target.value})} 
          placeholder="Full name"
          required 
        />
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Phone</Label>
          <Input 
            value={formData.phone} 
            onChange={e => setFormData({...formData, phone: e.target.value})} 
            placeholder="10-digit phone number"
          />
        </div>
        <div>
          <Label>Email</Label>
          <Input 
            type="email"
            value={formData.email} 
            onChange={e => setFormData({...formData, email: e.target.value})} 
            placeholder="email@example.com"
          />
        </div>
      </div>
      
      <div>
        <Label>Address</Label>
        <Input 
          value={formData.address} 
          onChange={e => setFormData({...formData, address: e.target.value})} 
          placeholder="Full address"
        />
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>PAN Number</Label>
          <Input 
            value={formData.panNumber} 
            onChange={e => setFormData({...formData, panNumber: e.target.value.toUpperCase()})} 
            placeholder="AAAAA0000A"
            maxLength={10}
          />
        </div>
        <div>
          <Label>Aadhar Number</Label>
          <Input 
            value={formData.aadharNumber} 
            onChange={e => setFormData({...formData, aadharNumber: e.target.value})} 
            placeholder="0000 0000 0000"
            maxLength={14}
          />
        </div>
      </div>
      
      <div>
        <Label>Notes</Label>
        <Input 
          value={formData.notes} 
          onChange={e => setFormData({...formData, notes: e.target.value})} 
          placeholder="Any additional notes"
        />
      </div>
      
      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit">{customer ? 'Update Customer' : 'Add Customer'}</Button>
      </div>
    </form>
  )
}

// Customer Payment Form Component
const CustomerPaymentForm = ({ customers, accounts, payment, onSubmit, onCancel }) => {
  // When `payment` is provided we're editing an existing row — seed all the
  // fields from it. Otherwise it's a fresh entry, default to today + the
  // user's default cash account.
  const isEdit = !!payment
  const initialDefault = accounts.filter(a => a.type === 'CASH')
  const [formData, setFormData] = useState(() => isEdit ? {
    customerId: payment.customerId || '',
    amount: String(payment.amount ?? ''),
    paymentDate: (payment.paymentDate || '').slice(0, 10) || new Date().toISOString().split('T')[0],
    paymentMode: payment.paymentMode || 'Cash',
    accountId: payment.accountId || '',
    reference: payment.referenceNo || payment.reference || '',
    remark: payment.remark || '',
  } : {
    customerId: '',
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMode: 'Cash',
    accountId: (initialDefault.find(a => a.isDefault) || initialDefault[0])?.id || '',
    reference: '',
    remark: ''
  })

  useEffect(() => {
    // Default-account picker only runs in CREATE mode — in edit mode the user
    // already has an account set and we don't want to clobber it when they
    // toggle the payment mode (they'll pick a matching account themselves).
    if (!isEdit && accounts.length > 0 && !formData.accountId) {
      const wantType = formData.paymentMode === 'Cash' ? 'CASH' : 'BANK'
      const eligible = accounts.filter(a => a.type === wantType)
      const defaultAccount = eligible.find(a => a.isDefault) || eligible[0]
      if (defaultAccount) setFormData(prev => ({ ...prev, accountId: defaultAccount.id }))
    }
  }, [accounts, formData.paymentMode, isEdit])

  // `skipAllocation` lets the caller record a payment and stop there — no
  // allocation modal pops up after save. Used by the "Direct Add" button to
  // mimic the Bank-Withdrawal-style flow the user asked for: just credit the
  // customer, with edit/delete/history available from the payments table.
  const submitWith = (skipAllocation) => {
    onSubmit({
      ...formData,
      amount: parseFloat(formData.amount),
      skipAllocation,
    })
  }
  const handleSubmit = (e) => {
    e.preventDefault()
    submitWith(false)
  }

  const selectedCustomer = customers.find(c => c.id === formData.customerId)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Customer *</Label>
        {/* Customer is locked in edit mode — switching customers would orphan
            the existing allocations on the prior customer's sales. To change
            the customer, delete this payment and record a new one. */}
        <Select value={formData.customerId} onValueChange={v => setFormData({...formData, customerId: v})} disabled={isEdit}>
          <SelectTrigger>
            <SelectValue placeholder="Select customer" />
          </SelectTrigger>
          <SelectContent>
            {customers.map(c => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} {c.phone ? `(${c.phone})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedCustomer && (
          <p className="text-xs text-muted-foreground mt-1">
            Flats: {selectedCustomer.salesCount || 0} | Outstanding: ₹{(selectedCustomer.balance || 0).toLocaleString('en-IN')}
          </p>
        )}
        {isEdit && (
          <p className="text-[11px] text-muted-foreground mt-1 italic">
            Customer is locked while editing — to change the customer, delete and re-record.
          </p>
        )}
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Amount (₹) *</Label>
          <Input 
            type="number"
            value={formData.amount} 
            onChange={e => setFormData({...formData, amount: e.target.value})} 
            placeholder="Enter amount"
            required 
          />
        </div>
        <div>
          <Label>Payment Date *</Label>
          <Input 
            type="date"
            value={formData.paymentDate} 
            onChange={e => setFormData({...formData, paymentDate: e.target.value})} 
            required 
          />
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Payment Mode *</Label>
          <Select value={formData.paymentMode} onValueChange={v => setFormData({...formData, paymentMode: v, accountId: ''})}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Cash">Cash</SelectItem>
              <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
              <SelectItem value="Cheque">Cheque</SelectItem>
              <SelectItem value="UPI">UPI</SelectItem>
              <SelectItem value="RTGS">RTGS</SelectItem>
              <SelectItem value="NEFT">NEFT</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Account *</Label>
          <Select value={formData.accountId} onValueChange={v => setFormData({...formData, accountId: v})}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accounts.filter(a => formData.paymentMode === 'Cash' ? a.type === 'CASH' : a.type === 'BANK').map(a => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Reference Number</Label>
          <Input 
            value={formData.reference} 
            onChange={e => setFormData({...formData, reference: e.target.value})} 
            placeholder="Cheque no., UTR, etc."
          />
        </div>
        <div>
          <Label>Remark</Label>
          <Input 
            value={formData.remark} 
            onChange={e => setFormData({...formData, remark: e.target.value})} 
            placeholder="Optional notes"
          />
        </div>
      </div>
      
      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        {/* In edit mode there's only one save path — no allocation modal opens.
            On create, the user picks: just record (Direct Add) or record +
            allocate. Both create the same CustomerPayment row; the difference
            is only whether the allocation modal pops up next. */}
        {!isEdit && (
          <Button
            type="button"
            variant="secondary"
            disabled={!formData.customerId || !formData.amount}
            onClick={() => submitWith(true)}
            title="Record payment without opening the allocation modal — allocate later if needed"
          >
            Direct Add
          </Button>
        )}
        <Button type="submit" disabled={!formData.customerId || !formData.amount}>
          {isEdit ? 'Save Changes' : 'Record Payment & Allocate'}
        </Button>
      </div>
    </form>
  )
}

// Payment Allocation Form Component with Create Sale capability
const PaymentAllocationForm = ({ payment, sales, onSave, onCancel, inventory = [], customer, onCreateSale }) => {
  // Amount starts as '' when there is no existing allocation so the input
  // renders blank instead of "0" — easier to type into. Existing allocations
  // (re-opening the modal to tweak) keep their saved number so the user sees
  // what's already there.
  //
  // Each row carries `targetId` + `isResale` so it can map back to either a
  // Sale or a ResaleDeal on save without us having to thread two arrays.
  const [allocations, setAllocations] = useState(
    sales.map(sale => ({
      targetId: sale.id,
      isResale: !!sale._isResale,
      amount: sale.currentAllocation ? sale.currentAllocation : '',
      maxAmount: sale.pendingBalance + (sale.currentAllocation || 0),
    }))
  )
  const [showCreateSaleForm, setShowCreateSaleForm] = useState(false)
  const [saleFormData, setSaleFormData] = useState({
    inventoryId: '',
    dealPrice: '',
    discount: '0',
    saleDate: new Date().toISOString().split('T')[0],
    status: 'Booked',
    notes: ''
  })
  const [isCreatingSale, setIsCreatingSale] = useState(false)

  // Update allocations when sales change (after creating new sale). Mirrors
  // the initial-state shape — empty string for never-allocated rows so the
  // input renders blank.
  useEffect(() => {
    setAllocations(
      sales.map(sale => ({
        targetId: sale.id,
        isResale: !!sale._isResale,
        amount: sale.currentAllocation ? sale.currentAllocation : '',
        maxAmount: sale.pendingBalance + (sale.currentAllocation || 0),
      }))
    )
  }, [sales])

  const totalAllocated = allocations.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0)
  const unallocated = payment.amount - totalAllocated
  const isValid = Math.abs(unallocated) < 0.01 // Allow small floating point differences

  const handleAllocationChange = (targetId, value) => {
    // Allow empty string (user clearing the field)
    if (value === '') {
      setAllocations(prev => prev.map(a => a.targetId === targetId ? { ...a, amount: '' } : a))
      return
    }
    const numValue = parseFloat(value)
    if (isNaN(numValue) || numValue < 0) return

    setAllocations(prev => {
      const target = prev.find(a => a.targetId === targetId)
      if (!target) return prev
      // Cap by both: this row's remaining balance AND the payment's
      // unallocated portion — neither limit can be exceeded.
      const otherAllocated = prev
        .filter(a => a.targetId !== targetId)
        .reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0)
      const remainingPayment = Math.max(0, (payment.amount || 0) - otherAllocated)
      const cap = Math.min(target.maxAmount || 0, remainingPayment)
      const capped = Math.min(numValue, cap)
      return prev.map(a => a.targetId === targetId ? { ...a, amount: capped } : a)
    })
  }

  const handleAutoAllocate = () => {
    let remaining = payment.amount
    const newAllocations = allocations.map(a => {
      const alloc = Math.min(remaining, a.maxAmount)
      remaining -= alloc
      return { ...a, amount: alloc }
    })
    setAllocations(newAllocations)
  }

  const handleClearAll = () => {
    setAllocations(prev => prev.map(a => ({ ...a, amount: '' })))
  }

  const handleSave = () => {
    // Backend allocations carry exactly one of saleId / resaleDealId. We
    // route every row by its `isResale` flag so a saved resale allocation
    // shows up in the resale deal's buyerPaid total rather than getting
    // dropped on the floor (no saleId match = silent loss).
    onSave(
      allocations.map(a => {
        const amt = parseFloat(a.amount) || 0
        return a.isResale
          ? { resaleDealId: a.targetId, amount: amt }
          : { saleId: a.targetId, amount: amt }
      })
    )
  }

  const handleCreateSaleSubmit = async (e) => {
    e.preventDefault()
    if (!onCreateSale || !customer) return
    
    setIsCreatingSale(true)
    try {
      await onCreateSale({
        inventoryId: saleFormData.inventoryId,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone || '',
        customerAddress: customer.address || '',
        dealPrice: parseFloat(saleFormData.dealPrice),
        discount: parseFloat(saleFormData.discount) || 0,
        saleDate: saleFormData.saleDate,
        status: saleFormData.status,
        notes: saleFormData.notes
      })
      // Reset form and close
      setSaleFormData({
        inventoryId: '',
        dealPrice: '',
        discount: '0',
        saleDate: new Date().toISOString().split('T')[0],
        status: 'Booked',
        notes: ''
      })
      setShowCreateSaleForm(false)
    } catch (error) {
      console.error('Failed to create sale:', error)
    } finally {
      setIsCreatingSale(false)
    }
  }

  const availableInventory = (inventory || []).filter(i => !i.status || i.status === 'Available')

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
        <div className="text-center">
          <div className="text-sm text-muted-foreground">Payment Amount</div>
          <div className="text-xl font-bold text-green-600">₹{payment.amount.toLocaleString('en-IN')}</div>
        </div>
        <div className="text-center">
          <div className="text-sm text-muted-foreground">Total Allocated</div>
          <div className="text-xl font-bold text-blue-600">₹{totalAllocated.toLocaleString('en-IN')}</div>
        </div>
        <div className="text-center">
          <div className="text-sm text-muted-foreground">Unallocated</div>
          <div className={`text-xl font-bold ${unallocated > 0 ? 'text-orange-600' : unallocated < 0 ? 'text-red-600' : 'text-green-600'}`}>
            ₹{unallocated.toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      {sales.length > 0 && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleAutoAllocate}>
            Auto-Allocate
          </Button>
          <Button variant="outline" size="sm" onClick={handleClearAll}>
            Clear All
          </Button>
        </div>
      )}

      {/* Sales/Flats List OR Empty State with Create Sale */}
      {sales.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-8">
          {!showCreateSaleForm ? (
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-orange-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">No Flats/Sales Found</h3>
                <p className="text-muted-foreground mt-1">
                  This customer has no pending sales to allocate this payment to.
                </p>
              </div>
              {onCreateSale && availableInventory.length > 0 && (
                <Button onClick={() => setShowCreateSaleForm(true)} className="mt-4">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Sale / Flat
                </Button>
              )}
              {onCreateSale && availableInventory.length === 0 && (
                <p className="text-sm text-orange-600 mt-2">
                  No available inventory to create a sale. Please add inventory first.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="font-semibold">Create New Sale for {customer?.name}</h3>
                <Button variant="ghost" size="sm" onClick={() => setShowCreateSaleForm(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <form onSubmit={handleCreateSaleSubmit} className="space-y-4">
                <div>
                  <Label>Select Flat/Unit *</Label>
                  <Select 
                    value={saleFormData.inventoryId} 
                    onValueChange={v => setSaleFormData({...saleFormData, inventoryId: v})}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose inventory" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableInventory.map(item => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.type} - {item.inventoryNumber}{item.area > 0 ? ` (${item.area} sq ft)` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Deal Price *</Label>
                    <Input 
                      type="number" 
                      value={saleFormData.dealPrice} 
                      onChange={e => setSaleFormData({...saleFormData, dealPrice: e.target.value})} 
                      required 
                      placeholder="Enter deal price"
                    />
                  </div>
                  <div>
                    <Label>Discount</Label>
                    <Input 
                      type="number" 
                      value={saleFormData.discount} 
                      onChange={e => setSaleFormData({...saleFormData, discount: e.target.value})} 
                      placeholder="0"
                    />
                  </div>
                </div>
                {saleFormData.dealPrice && (
                  <p className="text-sm font-medium text-green-600">
                    Final Amount: ₹{((parseFloat(saleFormData.dealPrice) || 0) - (parseFloat(saleFormData.discount) || 0)).toLocaleString('en-IN')}
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Sale Date *</Label>
                    <Input 
                      type="date" 
                      value={saleFormData.saleDate} 
                      onChange={e => setSaleFormData({...saleFormData, saleDate: e.target.value})} 
                      required 
                    />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={saleFormData.status} onValueChange={v => setSaleFormData({...saleFormData, status: v})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Booked">Booked</SelectItem>
                        <SelectItem value="Agreement">Agreement</SelectItem>
                        <SelectItem value="Completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea 
                    value={saleFormData.notes} 
                    onChange={e => setSaleFormData({...saleFormData, notes: e.target.value})} 
                    placeholder="Optional notes about this sale"
                    rows={2}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreateSaleForm(false)} disabled={isCreatingSale}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isCreatingSale || !saleFormData.inventoryId || !saleFormData.dealPrice}>
                    {isCreatingSale ? 'Creating...' : 'Create Sale'}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Flat / Unit</TableHead>
                <TableHead className="text-right">Sale Amount</TableHead>
                <TableHead className="text-right">Already Paid</TableHead>
                <TableHead className="text-right">Pending Balance</TableHead>
                <TableHead className="text-right">Allocate Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((sale, idx) => {
                const allocation = allocations.find(a => a.targetId === sale.id)
                return (
                  <TableRow key={sale.id}>
                    <TableCell>
                      <div className="font-medium flex items-center gap-2">
                        <span>{sale.inventoryNumber} {sale.inventoryType ? `(${sale.inventoryType})` : ''}</span>
                        {sale._isResale && (
                          <Badge variant="secondary" className="text-[10px] bg-purple-100 text-purple-700 hover:bg-purple-100">Resale</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">Phase: {sale.phase || 'N/A'}</div>
                    </TableCell>
                    <TableCell className="text-right">₹{(sale.finalAmount || 0).toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-right text-green-600">
                      ₹{(sale.allocatedAmount || 0).toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell className="text-right text-red-600">
                      ₹{(sale.pendingBalance || 0).toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        className="w-32 text-right"
                        value={allocation?.amount ?? ''}
                        onChange={e => handleAllocationChange(sale.id, e.target.value)}
                        max={allocation?.maxAmount || 0}
                        min={0}
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        Max: ₹{(allocation?.maxAmount || 0).toLocaleString('en-IN')}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          
          {/* Option to add more sales */}
          {onCreateSale && availableInventory.length > 0 && !showCreateSaleForm && (
            <div className="border-t pt-4">
              <Button variant="outline" size="sm" onClick={() => setShowCreateSaleForm(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Another Sale
              </Button>
            </div>
          )}
          
          {/* Inline Create Sale Form when there are existing sales */}
          {showCreateSaleForm && (
            <Card className="border-blue-200 bg-blue-50/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Add New Sale for {customer?.name}</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowCreateSaleForm(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateSaleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Select Flat/Unit *</Label>
                      <Select 
                        value={saleFormData.inventoryId} 
                        onValueChange={v => setSaleFormData({...saleFormData, inventoryId: v})}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose inventory" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableInventory.map(item => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.type} - {item.inventoryNumber}{item.area > 0 ? ` (${item.area} sq ft)` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Sale Date *</Label>
                      <Input 
                        type="date" 
                        value={saleFormData.saleDate} 
                        onChange={e => setSaleFormData({...saleFormData, saleDate: e.target.value})} 
                        required 
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <Label>Deal Price *</Label>
                      <Input 
                        type="number" 
                        value={saleFormData.dealPrice} 
                        onChange={e => setSaleFormData({...saleFormData, dealPrice: e.target.value})} 
                        required 
                        placeholder="Enter price"
                      />
                    </div>
                    <div>
                      <Label>Discount</Label>
                      <Input 
                        type="number" 
                        value={saleFormData.discount} 
                        onChange={e => setSaleFormData({...saleFormData, discount: e.target.value})} 
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label>Status</Label>
                      <Select value={saleFormData.status} onValueChange={v => setSaleFormData({...saleFormData, status: v})}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Booked">Booked</SelectItem>
                          <SelectItem value="Agreement">Agreement</SelectItem>
                          <SelectItem value="Completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {saleFormData.dealPrice && (
                    <p className="text-sm font-medium text-green-600">
                      Final Amount: ₹{((parseFloat(saleFormData.dealPrice) || 0) - (parseFloat(saleFormData.discount) || 0)).toLocaleString('en-IN')}
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateSaleForm(false)} disabled={isCreatingSale}>
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={isCreatingSale || !saleFormData.inventoryId || !saleFormData.dealPrice}>
                      {isCreatingSale ? 'Creating...' : 'Create Sale'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Validation Message */}
      {sales.length > 0 && unallocated !== 0 && (
        <div className={`p-3 rounded-lg ${unallocated > 0 ? 'bg-orange-50 text-orange-800' : 'bg-red-50 text-red-800'}`}>
          {unallocated > 0 
            ? `⚠️ ₹${unallocated.toLocaleString('en-IN')} remains unallocated. You must allocate the full payment amount.`
            : `❌ Over-allocated by ₹${Math.abs(unallocated).toLocaleString('en-IN')}. Please reduce allocations.`
          }
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} disabled={!isValid || sales.length === 0}>
          Save Allocations
        </Button>
      </div>
    </div>
  )
}

// Unassigned Sale Row Component - For admin utility
const UnassignedSaleRow = ({ sale, customers, onAssign }) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [isAssigning, setIsAssigning] = useState(false)
  
  const handleAssign = async () => {
    if (!selectedCustomerId) return
    setIsAssigning(true)
    try {
      await onAssign(sale.id, selectedCustomerId)
    } finally {
      setIsAssigning(false)
    }
  }
  
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{sale.inventoryNumber}</div>
        <div className="text-xs text-muted-foreground">{sale.inventoryType}</div>
      </TableCell>
      <TableCell>
        <div className="text-sm">{sale.customerName}</div>
        <div className="text-xs text-muted-foreground">{sale.customerPhone}</div>
      </TableCell>
      <TableCell className="text-right">₹{(sale.finalAmount || 0).toLocaleString('en-IN')}</TableCell>
      <TableCell>{sale.saleDate ? new Date(sale.saleDate).toLocaleDateString() : 'N/A'}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select customer" />
            </SelectTrigger>
            <SelectContent>
              {customers.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} {c.phone ? `(${c.phone})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            size="sm" 
            onClick={handleAssign} 
            disabled={!selectedCustomerId || isAssigning}
          >
            {isAssigning ? 'Assigning...' : 'Assign'}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

// Customer Ledger View Component
const CustomerLedgerView = ({ data }) => {
  const { customer, summary, ledger } = data
  
  const fmt = (num) => (num || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-blue-50">
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Total Sales</div>
            <div className="text-xl font-bold text-blue-700">₹{fmt(summary.totalSales)}</div>
          </CardContent>
        </Card>
        <Card className="bg-green-50">
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Total Payments</div>
            <div className="text-xl font-bold text-green-700">₹{fmt(summary.totalPayments)}</div>
          </CardContent>
        </Card>
        <Card className="bg-purple-50">
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Total Allocated</div>
            <div className="text-xl font-bold text-purple-700">₹{fmt(summary.totalAllocated)}</div>
          </CardContent>
        </Card>
        <Card className={summary.outstandingBalance > 0 ? 'bg-red-50' : 'bg-green-50'}>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Outstanding</div>
            <div className={`text-xl font-bold ${summary.outstandingBalance > 0 ? 'text-red-700' : 'text-green-700'}`}>
              ₹{fmt(summary.outstandingBalance)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Unallocated Warning */}
      {summary.unallocatedPayments > 0 && (
        <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-orange-800">
          ⚠️ Unallocated Payments: ₹{fmt(summary.unallocatedPayments)} - Please allocate these to flats.
        </div>
      )}

      {/* Ledger Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Transaction Ledger</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Debit (Sale)</TableHead>
                <TableHead className="text-right">Credit (Payment)</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.map((entry, idx) => (
                <TableRow key={entry.id}>
                  <TableCell>{new Date(entry.date).toLocaleDateString('en-IN')}</TableCell>
                  <TableCell>
                    <div className="font-medium">{entry.description}</div>
                    {entry.type === 'PAYMENT' && entry.allocationDetails?.length > 0 && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Allocated to: {entry.allocationDetails.map(a => `${a.inventoryNumber} (₹${fmt(a.amount)})`).join(', ')}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-red-600">
                    {entry.debit > 0 ? `₹${fmt(entry.debit)}` : '-'}
                  </TableCell>
                  <TableCell className="text-right text-green-600">
                    {entry.credit > 0 ? `₹${fmt(entry.credit)}` : '-'}
                  </TableCell>
                  <TableCell className={`text-right font-semibold ${entry.runningBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    ₹{fmt(entry.runningBalance)}
                  </TableCell>
                  <TableCell>
                    {entry.type === 'PAYMENT' && (
                      <Badge 
                        variant={entry.status === 'FULLY_ALLOCATED' ? 'default' : 'outline'}
                        className={entry.status === 'FULLY_ALLOCATED' ? 'bg-green-500' : entry.status === 'PARTIAL' ? 'bg-yellow-500 text-black' : 'bg-orange-100 text-orange-800'}
                      >
                        {entry.status === 'FULLY_ALLOCATED' ? 'Allocated' : entry.status === 'PARTIAL' ? 'Partial' : 'Pending'}
                      </Badge>
                    )}
                    {entry.type === 'SALE' && entry.pendingBalance > 0 && (
                      <Badge variant="outline" className="bg-red-50 text-red-700">
                        Pending ₹{fmt(entry.pendingBalance)}
                      </Badge>
                    )}
                    {entry.type === 'SALE' && entry.pendingBalance <= 0 && (
                      <Badge className="bg-green-500">Paid</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

// Daybook Tab Component
const DaybookTab = ({ accounts, societies, transactions, summary, filters, setFilters, onRefresh, onFilterChange, apiCall, toast, loadAccounts }) => {
  const [showAccountDialog, setShowAccountDialog] = useState(false)
  const [showOpeningBalanceDialog, setShowOpeningBalanceDialog] = useState(false)
  const [showAccountSettingsDialog, setShowAccountSettingsDialog] = useState(false)
  const [selectedAccountForOpening, setSelectedAccountForOpening] = useState(null)
  const [selectedAccountForSettings, setSelectedAccountForSettings] = useState(null)
  const [newAccount, setNewAccount] = useState({ name: '', type: 'BANK', openingAmount: 0, overdraftEnabled: false, scope: 'GLOBAL', societyId: '' })
  const [openingBalance, setOpeningBalance] = useState({ openingAmount: 0, openingDate: '' })

  const handleCreateAccount = async (e) => {
    e.preventDefault()
    try {
      await apiCall('/accounts', 'POST', {
        ...newAccount,
        openingAmount: parseFloat(newAccount.openingAmount) || 0,
      })
      await loadAccounts()
      setShowAccountDialog(false)
      setNewAccount({ name: '', type: 'BANK', openingAmount: 0, overdraftEnabled: false, scope: 'GLOBAL', societyId: '' })
      toast({ title: 'Success', description: 'Account created successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleUpdateOpeningBalance = async (e) => {
    e.preventDefault()
    try {
      await apiCall(`/accounts/${selectedAccountForOpening.id}/opening-balance`, 'PUT', {
        ...openingBalance,
        openingAmount: parseFloat(openingBalance.openingAmount) || 0,
      })
      await loadAccounts()
      onRefresh()
      setShowOpeningBalanceDialog(false)
      toast({ title: 'Success', description: 'Opening balance updated' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleToggleOverdraft = async (account, enabled) => {
    try {
      await apiCall(`/accounts/${account.id}`, 'PUT', { overdraftEnabled: enabled })
      await loadAccounts()
      toast({ title: 'Success', description: enabled ? 'Overdraft enabled' : 'Overdraft disabled' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleDeleteAccount = async (accountId) => {
    try {
      await apiCall(`/accounts/${accountId}`, 'DELETE')
      await loadAccounts()
      onRefresh()
      toast({ title: 'Success', description: 'Account deleted' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const clearFilters = () => {
    const defaultFilters = {
      societyId: 'all',
      accountId: 'all',
      direction: 'all',
      sourceType: 'all',
      startDate: '',
      endDate: ''
    }
    onFilterChange(defaultFilters)
  }

  const setQuickDateFilter = (type) => {
    const today = new Date()
    let startDate = ''
    let endDate = today.toISOString().split('T')[0]
    
    switch (type) {
      case 'today':
        startDate = endDate
        break
      case 'yesterday':
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        startDate = yesterday.toISOString().split('T')[0]
        endDate = startDate
        break
      case 'week':
        const weekStart = new Date(today)
        weekStart.setDate(weekStart.getDate() - 7)
        startDate = weekStart.toISOString().split('T')[0]
        break
      case 'month':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
        startDate = monthStart.toISOString().split('T')[0]
        break
    }
    
    onFilterChange({ ...filters, startDate, endDate })
  }

  // Calculate running balance for transactions
  let runningBalance = summary?.openingBalance || 0
  const transactionsWithBalance = [...transactions].reverse().map(txn => {
    if (txn.direction === 'IN') {
      runningBalance += txn.amount
    } else {
      runningBalance -= txn.amount
    }
    return { ...txn, runningBalance }
  }).reverse()

  return (
    <div className="space-y-4">
      {/* Header with Account Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Universal Daybook (Cash/Bank Book)
            </CardTitle>
            <div className="flex gap-2">
              <Dialog open={showAccountDialog} onOpenChange={setShowAccountDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Plus className="w-4 h-4 mr-1" /> Add Account
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Account</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateAccount} className="space-y-4">
                    <div>
                      <Label>Account Name *</Label>
                      <Input value={newAccount.name} onChange={e => setNewAccount({...newAccount, name: e.target.value})} required />
                    </div>
                    <div>
                      <Label>Account Type *</Label>
                      <Select value={newAccount.type} onValueChange={v => setNewAccount({...newAccount, type: v})}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CASH">Cash</SelectItem>
                          <SelectItem value="BANK">Bank</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Account Scope *</Label>
                      <Select value={newAccount.scope} onValueChange={v => setNewAccount({...newAccount, scope: v, societyId: v === 'GLOBAL' ? '' : newAccount.societyId})}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="GLOBAL">Global (All Societies)</SelectItem>
                          <SelectItem value="SOCIETY">Assign to Specific Society</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500 mt-1">
                        {newAccount.scope === 'GLOBAL' 
                          ? 'Account will be available in all societies (e.g., Cash in Hand)' 
                          : 'Account will only be visible in the selected society'}
                      </p>
                    </div>
                    {newAccount.scope === 'SOCIETY' && (
                      <div>
                        <Label>Select Society *</Label>
                        <Select value={newAccount.societyId} onValueChange={v => setNewAccount({...newAccount, societyId: v})} required>
                          <SelectTrigger>
                            <SelectValue placeholder="Select society" />
                          </SelectTrigger>
                          <SelectContent>
                            {societies.map(society => (
                              <SelectItem key={society.id} value={society.id}>
                                {society.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div>
                      <Label>Opening Balance</Label>
                      <Input type="number" value={newAccount.openingAmount} onChange={e => setNewAccount({...newAccount, openingAmount: e.target.value})} />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setShowAccountDialog(false)}>Cancel</Button>
                      <Button type="submit" disabled={newAccount.scope === 'SOCIETY' && !newAccount.societyId}>Create Account</Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
              <Button variant="outline" size="sm" onClick={onRefresh}>
                <RefreshCw className="w-4 h-4 mr-1" /> Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Account Balances */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {accounts.map(account => (
              <Card key={account.id} className={account.type === 'CASH' ? 'bg-green-50' : 'bg-blue-50'}>
                <CardContent className="pt-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium text-gray-600">{account.name}</p>
                      <p className={`text-xl font-bold ${account.currentBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ₹{fmt(account.currentBalance)}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <Badge variant={account.type === 'CASH' ? 'default' : 'secondary'} className="text-xs">
                          {account.type}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {(account.scope || 'GLOBAL') === 'GLOBAL' ? '🌐 Global' : '🏢 Society'}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 w-6 p-0"
                        title="Set Opening Balance"
                        onClick={() => {
                          setSelectedAccountForOpening(account)
                          setOpeningBalance({ openingAmount: account.openingAmount || 0, openingDate: account.openingDate || '' })
                          setShowOpeningBalanceDialog(true)
                        }}
                      >
                        <Edit className="w-3 h-3" />
                      </Button>
                      {account.type === 'BANK' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-6 w-6 p-0 ${account.overdraftEnabled ? 'text-green-500' : 'text-gray-400'}`}
                          title={account.overdraftEnabled ? 'Overdraft Enabled (Click to disable)' : 'Overdraft Disabled (Click to enable)'}
                          onClick={() => handleToggleOverdraft(account, !account.overdraftEnabled)}
                        >
                          <AlertTriangle className="w-3 h-3" />
                        </Button>
                      )}
                      {!account.isDefault && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500">
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Account?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will delete the account. If it has transactions, it will be deactivated.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteAccount(account.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-xs">
                      {account.type}
                    </Badge>
                    {account.type === 'BANK' && account.overdraftEnabled && (
                      <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">
                        Overdraft OK
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Opening Balance Dialog */}
      <Dialog open={showOpeningBalanceDialog} onOpenChange={setShowOpeningBalanceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Opening Balance - {selectedAccountForOpening?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateOpeningBalance} className="space-y-4">
            <div>
              <Label>Opening Amount</Label>
              <Input type="number" value={openingBalance.openingAmount} onChange={e => setOpeningBalance({...openingBalance, openingAmount: e.target.value})} />
            </div>
            <div>
              <Label>Opening Date</Label>
              <Input type="date" value={openingBalance.openingDate} onChange={e => setOpeningBalance({...openingBalance, openingDate: e.target.value})} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowOpeningBalanceDialog(false)}>Cancel</Button>
              <Button type="submit">Update</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gray-50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Opening Balance</p>
                  <p className="text-2xl font-bold text-gray-700">₹{fmt(summary.openingBalance)}</p>
                </div>
                <Wallet className="w-8 h-8 text-gray-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-green-50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total IN</p>
                  <p className="text-2xl font-bold text-green-600">₹{fmt(summary.totalIn)}</p>
                </div>
                <ArrowDownCircle className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-red-50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total OUT</p>
                  <p className="text-2xl font-bold text-red-600">₹{fmt(summary.totalOut)}</p>
                </div>
                <ArrowUpCircle className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
          <Card className={summary.closingBalance >= 0 ? 'bg-blue-50' : 'bg-orange-50'}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Closing Balance</p>
                  <p className={`text-2xl font-bold ${summary.closingBalance >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                    ₹{fmt(summary.closingBalance)}
                  </p>
                </div>
                <IndianRupee className={`w-8 h-8 ${summary.closingBalance >= 0 ? 'text-blue-500' : 'text-orange-500'}`} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            {/* Quick Date Filters */}
            <div className="col-span-2 md:col-span-6 flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setQuickDateFilter('today')}>Today</Button>
              <Button variant="outline" size="sm" onClick={() => setQuickDateFilter('yesterday')}>Yesterday</Button>
              <Button variant="outline" size="sm" onClick={() => setQuickDateFilter('week')}>This Week</Button>
              <Button variant="outline" size="sm" onClick={() => setQuickDateFilter('month')}>This Month</Button>
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <X className="w-4 h-4 mr-1" /> Clear Filters
              </Button>
            </div>
            
            <div>
              <Label className="text-xs">Society</Label>
              <Select value={filters.societyId} onValueChange={v => onFilterChange({...filters, societyId: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="All Societies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Societies</SelectItem>
                  {societies.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label className="text-xs">Account</Label>
              <Select value={filters.accountId} onValueChange={v => onFilterChange({...filters, accountId: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="All Accounts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  {accounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label className="text-xs">Direction</Label>
              <Select value={filters.direction} onValueChange={v => onFilterChange({...filters, direction: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="IN">Money IN</SelectItem>
                  <SelectItem value="OUT">Money OUT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={filters.sourceType} onValueChange={v => onFilterChange({...filters, sourceType: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="SALE_PAYMENT">Sale Payment</SelectItem>
                  <SelectItem value="PURCHASE_PAYMENT">Purchase Payment</SelectItem>
                  <SelectItem value="EXPENSE_PAYMENT">Expense Payment</SelectItem>
                  <SelectItem value="BROKER_COMMISSION">Broker Commission</SelectItem>
                  <SelectItem value="PARTNER_CAPITAL">Partner Capital</SelectItem>
                  <SelectItem value="RESALE_BUYER_PAYMENT">Resale - Buyer</SelectItem>
                  <SelectItem value="RESALE_SELLER_PAYOUT">Resale - Seller</SelectItem>
                  <SelectItem value="RESALE_COMPANY_COMMISSION">Resale - Company Fee</SelectItem>
                  <SelectItem value="OPENING_BALANCE">Opening Balance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label className="text-xs">From Date</Label>
              <Input type="date" value={filters.startDate} onChange={e => onFilterChange({...filters, startDate: e.target.value})} />
            </div>
            
            <div>
              <Label className="text-xs">To Date</Label>
              <Input type="date" value={filters.endDate} onChange={e => onFilterChange({...filters, endDate: e.target.value})} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Transactions ({transactions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="text-center py-8">
              <BookOpen className="w-12 h-12 mx-auto text-gray-300 mb-2" />
              <p className="text-gray-500">No transactions found</p>
              <p className="text-sm text-gray-400">Transactions will appear here when payments are made in any module</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Society</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Party</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead className="text-right text-green-600">IN (₹)</TableHead>
                    <TableHead className="text-right text-red-600">OUT (₹)</TableHead>
                    <TableHead className="text-right">Balance (₹)</TableHead>
                    <TableHead>Remark</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactionsWithBalance.map(txn => (
                    <TableRow key={txn.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(txn.txnDate).toLocaleDateString()} {new Date(txn.txnDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </TableCell>
                      <TableCell>{txn.societyName || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{txn.accountName}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={txn.direction === 'IN' ? 'default' : 'secondary'}>
                          {txn.sourceTypeLabel || SOURCE_TYPE_LABELS[txn.sourceType] || txn.sourceType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{txn.partyType}: </span>
                        <span className="font-medium">{txn.partyName}</span>
                      </TableCell>
                      <TableCell>{txn.paymentMode}</TableCell>
                      <TableCell className="text-right text-green-600 font-medium">
                        {txn.direction === 'IN' ? `₹${fmt(txn.amount)}` : '-'}
                      </TableCell>
                      <TableCell className="text-right text-red-600 font-medium">
                        {txn.direction === 'OUT' ? `₹${fmt(txn.amount)}` : '-'}
                      </TableCell>
                      <TableCell className={`text-right font-bold ${txn.runningBalance >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                        ₹{fmt(txn.runningBalance)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{txn.remark || '-'}</TableCell>
                      <TableCell>
                        {txn.isLocked && (
                          <span title={txn.lockReason || 'Transaction locked after 7 days'}>
                            <Lock className="w-4 h-4 text-gray-400" />
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default App
