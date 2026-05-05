'use client'

import { useState, useEffect } from 'react'
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
import { Building2, Users, Package, ShoppingCart, TrendingUp, TrendingDown, DollarSign, LogOut, Plus, Edit, Trash2, Home, Eye, EyeOff, Receipt, UserCheck, CreditCard, Percent, RefreshCw, ArrowRightLeft, CheckCircle, XCircle, BookOpen, Wallet, ArrowDownCircle, ArrowUpCircle, Filter, X, Download, FileText, FileSpreadsheet, Lock, Settings, AlertTriangle, Pencil, IndianRupee, UserCircle, MinusCircle, Globe } from 'lucide-react'
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

const VENDOR_TYPES = ['Electrician', 'Broker', 'Labour', 'Legal', 'Marketing', 'Plumber', 'Civil', 'Other']
const EXPENSE_CATEGORIES = ['Civil', 'Tiles', 'Electrical', 'Plumbing', 'Paint', 'Labour', 'Legal', 'Marketing', 'Office', 'Other']
const PAYMENT_MODES = ['Cash', 'Bank Transfer', 'Cheque', 'RTGS', 'UPI']
const SOURCE_TYPE_LABELS = {
  'SALE_PAYMENT': 'Sale Payment',
  'PURCHASE_PAYMENT': 'Purchase Payment',
  'EXPENSE_PAYMENT': 'Expense Payment',
  'BROKER_COMMISSION': 'Broker Commission',
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

const App = () => {
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
  const [societies, setSocieties] = useState([])
  const [selectedSociety, setSelectedSociety] = useState(null)
  const [partners, setPartners] = useState([])
  const [partnerSummary, setPartnerSummary] = useState(null)
  const [inventory, setInventory] = useState([])
  const [purchases, setPurchases] = useState([])
  const [sales, setSales] = useState([])
  const [salesSummary, setSalesSummary] = useState(null)
  const [vendors, setVendors] = useState([])
  const [expenseBills, setExpenseBills] = useState([])
  const [commissionBills, setCommissionBills] = useState([])
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
    limit: 10,
    total: 0,
    totalPages: 0
  })
  const [customerPaymentsLoading, setCustomerPaymentsLoading] = useState(false)
  const [showCustomerForm, setShowCustomerForm] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
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
    endDate: ''
  })
  const [commissionFilters, setCommissionFilters] = useState({
    status: 'all',
    brokerId: 'all',
    startDate: '',
    endDate: ''
  })

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    const storedUser = localStorage.getItem('user')

    if (storedToken && storedUser) {
      setToken(storedToken)
      setUser(JSON.parse(storedUser))
      setIsAuthenticated(true)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      loadSocieties()
      loadMasterData() // Load vendor types and expense categories
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (isAuthenticated) {
      loadAccounts()
      loadDaybook()
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (selectedSociety) {
      loadSocietyData()
      loadAccounts()  // Reload accounts when society changes (for scope filtering)
    }
  }, [selectedSociety])

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

  const loadSocietyData = async () => {
    try {
      const [partnersData, inventoryData, purchasesData, salesData, vendorsData, expenseBillsData, commissionBillsData, resaleDealsData, summaryData, customersData] = await Promise.all([
        apiCall(`/societies/${selectedSociety}/partners`),
        apiCall(`/societies/${selectedSociety}/inventory`),
        apiCall(`/societies/${selectedSociety}/purchases`),
        apiCall(`/societies/${selectedSociety}/sales`),
        apiCall(`/vendors?societyId=${selectedSociety}`),
        apiCall(`/expense-bills?societyId=${selectedSociety}`),
        apiCall(`/commission-bills?societyId=${selectedSociety}`),
        apiCall(`/resales?societyId=${selectedSociety}`),
        apiCall(`/societies/${selectedSociety}/summary`),
        apiCall(`/customers?societyId=${selectedSociety}`)
      ])
      
      // Handle new partners response format with summary
      if (partnersData.partners) {
        setPartners(partnersData.partners)
        setPartnerSummary(partnersData.summary)
      } else {
        setPartners(partnersData)
        setPartnerSummary(null)
      }
      
      setInventory(inventoryData)
      setPurchases(purchasesData)
      
      // Handle new sales response format with summary
      if (salesData.sales) {
        setSales(salesData.sales)
        setSalesSummary(salesData.summary)
      } else {
        setSales(salesData)
        setSalesSummary(null)
      }
      
      setVendors(vendorsData)
      setExpenseBills(expenseBillsData)
      setCommissionBills(commissionBillsData)
      setResaleDeals(resaleDealsData)
      setSummary(summaryData)
      setCustomers(customersData || [])
      
      // Load customer payments with pagination (reset to page 1)
      await loadCustomerPayments(1, customerPaymentsPagination.limit)
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      })
    }
  }
  
  // Dedicated function to load customer payments with pagination
  const loadCustomerPayments = async (page = 1, limit = 10) => {
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
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleUpdateLedgerEntry = async (formData) => {
    try {
      await apiCall(`/ledger-entries/${editingLedgerEntry.id}`, 'PUT', formData)
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
      }
      
      await openBillPayments(paymentBillType, paymentBill)
      await loadSocietyData()
      
      toast({ title: 'Success', description: 'Payment deleted successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  // Vendor Ledger functions
  const openVendorLedger = async (vendor) => {
    setVendorLedgerItem(vendor)
    setIsVendorLedgerOpen(true)
    
    try {
      const entries = await apiCall(`/vendors/${vendor.id}/ledger`)
      setVendorLedgerEntries(entries)
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      })
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
      const result = await apiCall('/customer-payments', 'POST', formData)
      
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
      
      // Merge existing allocations into sales data
      const salesWithAllocations = customerSales.map(sale => {
        const existing = existingAllocations.find(a => a.saleId === sale.id)
        return {
          ...sale,
          currentAllocation: existing?.allocatedAmount || 0
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
        const salesWithAllocations = customerSales.map(sale => {
          const existing = existingAllocations.find(a => a.saleId === sale.id)
          return {
            ...sale,
            currentAllocation: existing?.allocatedAmount || 0
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

  const handleCreateSale = async (formData) => {
    try {
      await apiCall(`/societies/${selectedSociety}/sales`, 'POST', formData)
      await loadSocietyData()
      setIsDialogOpen(false)
      toast({ title: 'Success', description: 'Sale created successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
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
      await loadSocietyData()
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
      await loadSocietyData()
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

  // Audit Log handlers
  const loadAuditLogs = async () => {
    try {
      const data = await apiCall('/admin/audit-logs?limit=50')
      setAuditLogsData(data)
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  // Vendor Management
  const handleCreateVendor = async (formData) => {
    try {
      await apiCall('/vendors', 'POST', { ...formData, societyId: selectedSociety })
      await loadSocietyData()
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
      await apiCall('/expense-bills', 'POST', { ...formData, societyId: selectedSociety })
      await loadSocietyData()
      setIsDialogOpen(false)
      toast({ title: 'Success', description: 'Expense bill created successfully' })
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
                  placeholder="admin@realestate.com"
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
            {/* <div className="mt-6 pt-5 border-t border-slate-200/70">
              <p className="text-xs text-center text-slate-500">
                Default credentials:{' '}
                <span className="font-mono text-slate-700">admin@realestate.com</span>{' '}
                /{' '}
                <span className="font-mono text-slate-700">Admin@123</span>
              </p>
            </div> */}
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
    return true
  })

  // Filter commission bills based on filters
  const filteredCommissionBills = commissionBills.filter(bill => {
    if (commissionFilters.status !== 'all' && bill.status !== commissionFilters.status) return false
    if (commissionFilters.brokerId !== 'all' && bill.brokerVendorId !== commissionFilters.brokerId) return false
    if (commissionFilters.startDate && new Date(bill.commissionDate) < new Date(commissionFilters.startDate)) return false
    if (commissionFilters.endDate && new Date(bill.commissionDate) > new Date(commissionFilters.endDate)) return false
    return true
  })

  // Calculate expense totals based on filtered data
  const expenseTotals = {
    totalBill: filteredExpenseBills.reduce((sum, b) => sum + b.billAmount, 0),
    totalPaid: filteredExpenseBills.reduce((sum, b) => sum + (b.totalPaid || 0), 0),
    totalBalance: filteredExpenseBills.reduce((sum, b) => sum + (b.balance || 0), 0)
  }

  // Calculate commission totals based on filtered data
  const commissionTotals = {
    totalCommission: filteredCommissionBills.reduce((sum, b) => sum + b.commissionAmount, 0),
    totalPaid: filteredCommissionBills.reduce((sum, b) => sum + (b.totalPaid || 0), 0),
    totalBalance: filteredCommissionBills.reduce((sum, b) => sum + (b.balance || 0), 0)
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
    setExpenseFilters({
      status: 'all',
      vendorId: 'all',
      categoryId: 'all',
      startDate: '',
      endDate: ''
    })
  }

  // Clear commission filters
  const clearCommissionFilters = () => {
    setCommissionFilters({
      status: 'all',
      brokerId: 'all',
      startDate: '',
      endDate: ''
    })
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
    <AppShell user={user} onLogout={handleLogout} searchPlaceholder="Search properties, customers, partners...">
      <Toaster />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Overview of your real estate societies</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Society Selector & Actions */}
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
          </div>
        </div>

        {selectedSociety && summary && (
          <>
            {/* Dashboard Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
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
                value={`₹${fmt(summary.totalExpenses)}`}
                sub={`${(summary.expenseBillCount || 0) + (summary.commissionBillCount || 0)} bills`}
                color="orange"
                Icon={TrendingDown}
                percent={(() => {
                  const total = (summary.totalExpenses || 0) + (summary.totalSalesAmount || 0)
                  return total > 0 ? Math.min(100, ((summary.totalExpenses || 0) / total) * 100) : 0
                })()}
              />
              <StatCard
                label="Total Payables"
                value={`₹${fmt(summary.totalPayables)}`}
                sub="Unpaid bills"
                color="amber"
                Icon={CreditCard}
                percent={(() => {
                  const total = (summary.totalExpenses || 0)
                  return total > 0 ? Math.min(100, ((summary.totalPayables || 0) / total) * 100) : 0
                })()}
              />
              <StatCard
                label="Net Profit / Loss"
                value={`₹${fmt(summary.netProfitLoss)}`}
                sub={summary.netProfitLoss >= 0 ? 'Profitable' : 'In loss'}
                color={summary.netProfitLoss >= 0 ? 'emerald' : 'rose'}
                Icon={DollarSign}
                percent={(() => {
                  const total = summary.totalSalesAmount || 0
                  if (total <= 0) return 0
                  return Math.min(100, Math.max(0, ((summary.netProfitLoss || 0) / total) * 100))
                })()}
              />
            </div>

            {/* Tabs for different modules */}
            <Tabs defaultValue="partners" className="space-y-4">
              <TabsList className="flex w-full overflow-x-auto whitespace-nowrap lg:grid lg:grid-cols-9 h-11 p-1 bg-slate-100/80 border border-slate-200/70 rounded-xl">
                <TabsTrigger value="partners" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-soft data-[state=active]:text-primary font-medium">Partners</TabsTrigger>
                <TabsTrigger value="inventory" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-soft data-[state=active]:text-primary font-medium">Inventory</TabsTrigger>
                <TabsTrigger value="purchases" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-soft data-[state=active]:text-primary font-medium">Purchases</TabsTrigger>
                <TabsTrigger value="customers" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-soft data-[state=active]:text-primary font-medium">Customers</TabsTrigger>
                <TabsTrigger value="sales" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-soft data-[state=active]:text-primary font-medium">Sales</TabsTrigger>
                <TabsTrigger value="resales" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-soft data-[state=active]:text-primary font-medium">Resale</TabsTrigger>
                <TabsTrigger value="vendors" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-soft data-[state=active]:text-primary font-medium">Vendors</TabsTrigger>
                <TabsTrigger value="expenses" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-soft data-[state=active]:text-primary font-medium">Expenses</TabsTrigger>
                <TabsTrigger value="commissions" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-soft data-[state=active]:text-primary font-medium">Commissions</TabsTrigger>
              </TabsList>

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
                    
                    {partners.length === 0 ? (
                      <p className="text-center text-gray-500 py-8">No partners added yet</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>%</TableHead>
                            <TableHead>Expected Investment</TableHead>
                            <TableHead>Total Investment</TableHead>
                            <TableHead>Withdrawals</TableHead>
                            <TableHead>Profit Paid</TableHead>
                            <TableHead>Running Balance</TableHead>
                            <TableHead>Profit Share</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {partners.map(partner => {
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
                    {inventory.length === 0 ? (
                      <p className="text-center text-gray-500 py-8">No inventory added yet</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Number</TableHead>
                            <TableHead>Area</TableHead>
                            <TableHead>Phase</TableHead>
                            <TableHead>Floor</TableHead>
                            <TableHead>Facing</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {inventory.map(item => (
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
                    {purchases.length === 0 ? (
                      <p className="text-center text-gray-500 py-8">No purchases recorded yet</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Party Name</TableHead>
                            <TableHead>Deal Amount</TableHead>
                            <TableHead>Total Paid</TableHead>
                            <TableHead>Balance</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {purchases.map(purchase => (
                            <TableRow key={purchase.id}>
                              <TableCell className="font-medium">{purchase.partyName}</TableCell>
                              <TableCell>₹{fmt(purchase.dealAmount)}</TableCell>
                              <TableCell className="text-green-600">₹{fmt(purchase.totalPaid)}</TableCell>
                              <TableCell className="text-orange-600">₹{fmt(purchase.balance)}</TableCell>
                              <TableCell>{new Date(purchase.agreementDate).toLocaleDateString()}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Button variant="outline" size="sm" onClick={() => openLedger('purchase', purchase)}>
                                    <Receipt className="w-4 h-4 mr-1" /> Payments
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
                    {/* Customer Summary Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                      <Card className="bg-blue-50">
                        <CardContent className="pt-4">
                          <div className="text-sm text-muted-foreground">Total Customers</div>
                          <div className="text-2xl font-bold text-blue-700">{customers.length}</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-green-50">
                        <CardContent className="pt-4">
                          <div className="text-sm text-muted-foreground">Total Payments</div>
                          <div className="text-2xl font-bold text-green-700">
                            ₹{fmt(customerPayments.reduce((sum, p) => sum + p.amount, 0))}
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="bg-purple-50">
                        <CardContent className="pt-4">
                          <div className="text-sm text-muted-foreground">Fully Allocated</div>
                          <div className="text-2xl font-bold text-purple-700">
                            {customerPayments.filter(p => p.status === 'FULLY_ALLOCATED').length}
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="bg-orange-50">
                        <CardContent className="pt-4">
                          <div className="text-sm text-muted-foreground">Pending Allocation</div>
                          <div className="text-2xl font-bold text-orange-700">
                            {customerPayments.filter(p => p.status !== 'FULLY_ALLOCATED').length}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Customer List */}
                    <h3 className="font-semibold mb-3">Customer List</h3>
                    {customers.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No customers added yet. Add a customer to start recording payments.
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Customer Name</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead className="text-right">Flats</TableHead>
                            <TableHead className="text-right">Total Sale</TableHead>
                            <TableHead className="text-right">Total Paid</TableHead>
                            <TableHead className="text-right">Outstanding</TableHead>
                            <TableHead className="text-right">Unallocated</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {customers.map(customer => (
                            <TableRow key={customer.id}>
                              <TableCell className="font-medium">{customer.name}</TableCell>
                              <TableCell>{customer.phone || '-'}</TableCell>
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
                                  <Button variant="outline" size="sm" className="text-red-500" onClick={() => handleDeleteCustomer(customer.id)}>
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
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
                            <SelectItem value="10">10</SelectItem>
                            <SelectItem value="20">20</SelectItem>
                            <SelectItem value="50">50</SelectItem>
                            <SelectItem value="100">100</SelectItem>
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
                    
                    {sales.length === 0 ? (
                      <p className="text-center text-gray-500 py-8">No sales recorded yet</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Inventory</TableHead>
                              <TableHead>Customer</TableHead>
                              <TableHead>Phone</TableHead>
                              <TableHead>Final Amount</TableHead>
                              <TableHead>Total Paid</TableHead>
                              <TableHead>Balance</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sales.map(sale => (
                              <TableRow key={sale.id}>
                                <TableCell>
                                  <span className="font-medium">{sale.inventoryNumber || sale.inventoryName}</span>
                                  {sale.inventoryArea > 0 && <span className="text-xs text-gray-500 block">{sale.inventoryArea} sq ft</span>}
                                </TableCell>
                                <TableCell className="font-medium">{sale.customerName}</TableCell>
                                <TableCell>{sale.customerPhone}</TableCell>
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
                                            // Find and view the resale deal
                                            const resaleDeal = resaleDeals.find(r => r.id === sale.resaleDealId)
                                            if (resaleDeal) {
                                              setActiveTab('resale')
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
                            ))}
                          </TableBody>
                        </Table>
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
                            inventory={inventory.filter(i => i.status === 'Sold')} 
                            sales={sales}
                            customers={customers}
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
                    
                    {resaleDeals.length === 0 ? (
                      <div className="text-center py-8">
                        <ArrowRightLeft className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                        <p className="text-gray-500">No resale deals recorded yet</p>
                        <p className="text-sm text-gray-400">Create a resale deal when an existing owner sells to a new buyer</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Inventory</TableHead>
                              <TableHead>Seller → Buyer</TableHead>
                              <TableHead>Buyer Amt</TableHead>
                              <TableHead>Buyer Paid</TableHead>
                              <TableHead>Seller Amt</TableHead>
                              <TableHead>Seller Paid</TableHead>
                              <TableHead>Net Profit</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {resaleDeals.map(deal => (
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
                                <TableCell>₹{fmt(deal.buyerPurchaseAmount)}</TableCell>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="text-green-600">₹{fmt(deal.buyerPaid)}</span>
                                    <Badge variant={deal.buyerStatus === 'PAID' ? 'default' : deal.buyerStatus === 'PARTIAL' ? 'secondary' : 'destructive'} className="text-xs mt-1 w-fit">
                                      {deal.buyerStatus}
                                    </Badge>
                                  </div>
                                </TableCell>
                                <TableCell>₹{fmt(deal.sellerPayoutAmount)}</TableCell>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="text-orange-600">₹{fmt(deal.sellerPaid)}</span>
                                    <Badge variant={deal.sellerStatus === 'PAID' ? 'default' : deal.sellerStatus === 'PARTIAL' ? 'secondary' : 'destructive'} className="text-xs mt-1 w-fit">
                                      {deal.sellerStatus}
                                    </Badge>
                                  </div>
                                </TableCell>
                                <TableCell className={deal.netProfit >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                                  ₹{fmt(deal.netProfit)}
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
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Vendors Tab */}
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

              {/* Expenses Tab */}
              <TabsContent value="expenses" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <TrendingDown className="w-5 h-5" />
                        Expense Bills
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={exportExpensesToCSV}>
                          <FileSpreadsheet className="w-4 h-4 mr-1" /> CSV
                        </Button>
                        <Button variant="outline" size="sm" onClick={exportExpensesToPDF}>
                          <FileText className="w-4 h-4 mr-1" /> PDF
                        </Button>
                        <Dialog open={dialogMode === 'createExpenseBill' && isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setDialogMode('') }}>
                          <DialogTrigger asChild>
                            <Button onClick={() => { setDialogMode('createExpenseBill'); setCurrentItem(null); }}>
                              <Plus className="w-4 h-4 mr-2" /> Add Expense Bill
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Add Expense Bill</DialogTitle>
                            </DialogHeader>
                            <ExpenseBillForm vendors={vendors} categories={expenseCategories} onSubmit={handleCreateExpenseBill} onCancel={() => setIsDialogOpen(false)} onAddNewCategory={loadMasterData} />
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                    {/* Filter Bar */}
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                      <div className="flex items-center gap-2 mb-3">
                        <Filter className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">Filters</span>
                        <Button variant="ghost" size="sm" onClick={clearExpenseFilters} className="ml-auto">
                          <X className="w-4 h-4 mr-1" /> Clear
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div>
                          <Label className="text-xs text-gray-500">Status</Label>
                          <Select value={expenseFilters.status} onValueChange={(v) => setExpenseFilters(f => ({ ...f, status: v }))}>
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
                          <Label className="text-xs text-gray-500">Vendor</Label>
                          <Select value={expenseFilters.vendorId} onValueChange={(v) => setExpenseFilters(f => ({ ...f, vendorId: v }))}>
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="All Vendors" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Vendors</SelectItem>
                              {vendors.map(v => (
                                <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">Category</Label>
                          <Select value={expenseFilters.categoryId} onValueChange={(v) => setExpenseFilters(f => ({ ...f, categoryId: v }))}>
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="All Categories" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Categories</SelectItem>
                              {EXPENSE_CATEGORIES.map(cat => (
                                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">From Date</Label>
                          <Input 
                            type="date" 
                            className="h-9"
                            value={expenseFilters.startDate}
                            onChange={(e) => setExpenseFilters(f => ({ ...f, startDate: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">To Date</Label>
                          <Input 
                            type="date" 
                            className="h-9"
                            value={expenseFilters.endDate}
                            onChange={(e) => setExpenseFilters(f => ({ ...f, endDate: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {expenseBills.length === 0 ? (
                      <div className="text-center py-8">
                        <TrendingDown className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                        <p className="text-gray-500">No expense bills recorded yet</p>
                        <p className="text-sm text-gray-400">Add vendors first, then create expense bills</p>
                      </div>
                    ) : filteredExpenseBills.length === 0 ? (
                      <div className="text-center py-8">
                        <Filter className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                        <p className="text-gray-500">No bills match your filters</p>
                        <Button variant="link" onClick={clearExpenseFilters}>Clear Filters</Button>
                      </div>
                    ) : (
                      <>
                        {/* Totals Summary */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 p-3 bg-blue-50 rounded-lg">
                          <div className="text-center">
                            <p className="text-xs text-gray-500">Total Bill</p>
                            <p className="text-lg font-semibold">₹{fmt(expenseTotals.totalBill)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500">Total Paid</p>
                            <p className="text-lg font-semibold text-green-600">₹{fmt(expenseTotals.totalPaid)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500">Total Balance</p>
                            <p className="text-lg font-semibold text-orange-600">₹{fmt(expenseTotals.totalBalance)}</p>
                          </div>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Vendor</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead>Bill Amount</TableHead>
                              <TableHead>Paid</TableHead>
                              <TableHead>Balance</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredExpenseBills.map(bill => (
                              <TableRow key={bill.id}>
                                <TableCell>{new Date(bill.billDate).toLocaleDateString()}</TableCell>
                                <TableCell className="font-medium">{bill.vendorName}</TableCell>
                                <TableCell>{bill.categoryName || '-'}</TableCell>
                                <TableCell>₹{fmt(bill.billAmount)}</TableCell>
                                <TableCell className="text-green-600">₹{fmt(bill.totalPaid)}</TableCell>
                                <TableCell className="text-orange-600">₹{fmt(bill.balance)}</TableCell>
                                <TableCell>
                                  <Badge variant={bill.status === 'PAID' ? 'default' : bill.status === 'PARTIAL' ? 'secondary' : 'destructive'}>
                                    {bill.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={() => openBillPayments('expense', bill)}>
                                      <CreditCard className="w-4 h-4 mr-1" /> Payments
                                    </Button>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="destructive" size="sm">
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Delete Expense Bill?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            This will delete the bill and all associated payments. This action cannot be undone.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => handleDeleteExpenseBill(bill.id)}>Delete</AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <div className="mt-2 text-sm text-gray-500 text-right">
                          Showing {filteredExpenseBills.length} of {expenseBills.length} bills
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Commissions Tab */}
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
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <Label className="text-xs text-gray-500">Status</Label>
                          <Select value={commissionFilters.status} onValueChange={(v) => setCommissionFilters(f => ({ ...f, status: v }))}>
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
                          <Select value={commissionFilters.brokerId} onValueChange={(v) => setCommissionFilters(f => ({ ...f, brokerId: v }))}>
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
                            onChange={(e) => setCommissionFilters(f => ({ ...f, startDate: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">To Date</Label>
                          <Input 
                            type="date" 
                            className="h-9"
                            value={commissionFilters.endDate}
                            onChange={(e) => setCommissionFilters(f => ({ ...f, endDate: e.target.value }))}
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
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Broker</TableHead>
                              <TableHead>Sale (Customer)</TableHead>
                              <TableHead>Inventory</TableHead>
                              <TableHead>Commission</TableHead>
                              <TableHead>Paid</TableHead>
                              <TableHead>Balance</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredCommissionBills.map(bill => (
                              <TableRow key={bill.id}>
                                <TableCell>{new Date(bill.commissionDate).toLocaleDateString()}</TableCell>
                                <TableCell className="font-medium">{bill.brokerName}</TableCell>
                                <TableCell>{bill.customerName}</TableCell>
                                <TableCell>{bill.inventoryName}</TableCell>
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
                        <div className="mt-2 text-sm text-gray-500 text-right">
                          Showing {filteredCommissionBills.length} of {commissionBills.length} bills
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {/* Partner/Purchase/Sale Ledger Drawer */}
      <LedgerDrawer 
        isOpen={isLedgerDrawerOpen}
        onClose={() => setIsLedgerDrawerOpen(false)}
        ledgerType={ledgerType}
        ledgerItem={ledgerItem}
        entries={ledgerEntries}
        accounts={accounts}
        onAddEntry={handleAddLedgerEntry}
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
      />

      {/* Vendor Ledger Drawer */}
      <VendorLedgerDrawer 
        isOpen={isVendorLedgerOpen}
        onClose={() => setIsVendorLedgerOpen(false)}
        vendor={vendorLedgerItem}
        entries={vendorLedgerEntries}
        onExportCSV={exportVendorLedgerToCSV}
        onExportPDF={exportVendorLedgerToPDF}
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
        onAddSellerPayout={handleAddSellerPayout}
        onDeleteSellerPayout={handleDeleteSellerPayout}
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
            {/* Summary Stats */}
            <div className="text-sm text-gray-600">
              Showing last {auditLogsData.logs?.length || 0} activities
            </div>
            
            {/* Logs Table */}
            {!auditLogsData.logs || auditLogsData.logs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <BookOpen className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                <p>No audit logs yet</p>
              </div>
            ) : (
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
                  {auditLogsData.logs.map((log) => (
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

      {/* Customer Payment Form Dialog */}
      <Dialog open={showPaymentForm} onOpenChange={setShowPaymentForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Customer Payment</DialogTitle>
            <DialogDescription>
              Record a single payment. After saving, you'll allocate this payment to flats.
            </DialogDescription>
          </DialogHeader>
          <CustomerPaymentForm 
            customers={customers}
            accounts={accounts}
            onSubmit={handleCreatePayment}
            onCancel={() => setShowPaymentForm(false)}
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
const BillPaymentDrawer = ({ isOpen, onClose, billType, bill, payments, accounts, onAddPayment, onDeletePayment }) => {
  const [formData, setFormData] = useState({
    amount: '',
    paymentDate: '',
    paymentMode: 'Cash',
    accountId: '',
    remark: ''
  })

  // Set default account on mount
  useEffect(() => {
    if (accounts?.length > 0 && !formData.accountId) {
      const defaultAccount = accounts.find(a => a.isDefault) || accounts[0]
      setFormData(prev => ({ ...prev, accountId: defaultAccount?.id || '' }))
    }
  }, [accounts])

  const getTitle = () => {
    if (!bill) return ''
    if (billType === 'expense') return `Expense Payments - ${bill.vendorName}`
    if (billType === 'commission') return `Commission Payments - ${bill.brokerName}`
    return ''
  }

  const getBillAmount = () => {
    if (!bill) return 0
    return billType === 'expense' ? bill.billAmount : bill.commissionAmount
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
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle>{getTitle()}</DrawerTitle>
          <DrawerDescription>
            Manage payments for this {billType === 'expense' ? 'expense' : 'commission'} bill
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
                    <Select value={formData.paymentMode} onValueChange={v => setFormData({...formData, paymentMode: v})}>
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
                        {accounts?.map(acc => (
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
                    {payments.map(payment => (
                      <TableRow key={payment.id}>
                        <TableCell>{new Date(payment.paymentDate).toLocaleDateString()}</TableCell>
                        <TableCell className="text-green-600 font-medium">₹{fmt(payment.amount)}</TableCell>
                        <TableCell><Badge variant="outline">{payment.paymentMode}</Badge></TableCell>
                        <TableCell>{payment.remark || '-'}</TableCell>
                        <TableCell>
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
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

// Vendor Ledger Drawer Component
const VendorLedgerDrawer = ({ isOpen, onClose, vendor, entries, onExportCSV, onExportPDF }) => {
  const totalPaid = entries.reduce((sum, e) => sum + e.amount, 0)

  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <div className="flex items-center justify-between">
            <div>
              <DrawerTitle>Vendor Ledger - {vendor?.name}</DrawerTitle>
              <DrawerDescription>
                All payments made to this vendor from Expenses and Commissions
              </DrawerDescription>
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
        
        <div className="px-4 overflow-y-auto max-h-[60vh]">
          {/* Summary */}
          <Card className="mb-4 bg-green-50">
            <CardContent className="pt-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-600">Total Paid to Vendor</p>
                  <p className="text-2xl font-bold text-green-600">₹{fmt(totalPaid)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Vendor Type</p>
                  <Badge variant="secondary" className="text-lg">{vendor?.type}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ledger Entries */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Payment History</CardTitle>
            </CardHeader>
            <CardContent>
              {entries.length === 0 ? (
                <p className="text-center text-gray-500 py-4">No payments to this vendor yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Remark</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map(entry => (
                      <TableRow key={entry.id}>
                        <TableCell>{new Date(entry.date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant={entry.source === 'EXPENSE' ? 'secondary' : 'default'}>
                            {entry.source}
                          </Badge>
                        </TableCell>
                        <TableCell>{entry.reference}</TableCell>
                        <TableCell className="text-green-600 font-medium">₹{fmt(entry.amount)}</TableCell>
                        <TableCell><Badge variant="outline">{entry.paymentMode}</Badge></TableCell>
                        <TableCell>{entry.remark || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

// Ledger Drawer Component (for Partners/Purchases/Sales)
const LedgerDrawer = ({ isOpen, onClose, ledgerType, ledgerItem, entries, accounts, onAddEntry, onDeleteEntry, onEditEntry }) => {
  // For sale ledger, default to SALE_PAYMENT; for partner, default to INVESTMENT
  const defaultEntryType = ledgerType === 'sale' ? 'SALE_PAYMENT' : 'INVESTMENT'
  
  const [formData, setFormData] = useState({
    type: defaultEntryType,
    amount: '',
    entryDate: '',
    paymentMode: 'Cash',
    accountId: '',
    remark: ''
  })

  // Set default account on mount
  useEffect(() => {
    if (accounts?.length > 0 && !formData.accountId) {
      const defaultAccount = accounts.find(a => a.isDefault) || accounts[0]
      setFormData(prev => ({ ...prev, accountId: defaultAccount?.id || '' }))
    }
  }, [accounts])
  
  // Reset entry type when ledgerType changes
  useEffect(() => {
    const newDefault = ledgerType === 'sale' ? 'SALE_PAYMENT' : 'INVESTMENT'
    setFormData(prev => ({ ...prev, type: newDefault }))
  }, [ledgerType])

  const getTitle = () => {
    if (!ledgerItem) return ''
    if (ledgerType === 'partner') return `Capital Account Ledger - ${ledgerItem.name}`
    if (ledgerType === 'purchase') return `Payment Entries - ${ledgerItem.partyName}`
    if (ledgerType === 'sale') return `Sale Ledger - ${ledgerItem.customerName}`
    return ''
  }

  const handleSubmit = (e) => {
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
      payload.paymentDate = formData.entryDate
    }
    
    onAddEntry(payload)
    setFormData({ 
      ...formData,
      type: ledgerType === 'sale' ? 'SALE_PAYMENT' : 'INVESTMENT',
      amount: '', 
      entryDate: '', 
      remark: '' 
    })
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
      // Sale Ledger: Credits - (Withdrawals + Profit Payouts) = Running Balance
      const totalCredits = safeEntries.filter(e => (e.entryType || 'SALE_PAYMENT') === 'SALE_PAYMENT').reduce((sum, e) => sum + e.amount, 0)
      const totalWithdrawals = safeEntries.filter(e => e.entryType === 'WITHDRAWAL').reduce((sum, e) => sum + e.amount, 0)
      const totalProfitPaid = safeEntries.filter(e => e.entryType === 'PROFIT_PAYOUT').reduce((sum, e) => sum + e.amount, 0)
      const runningBalance = totalCredits - totalWithdrawals - totalProfitPaid
      const saleDue = ledgerItem ? (ledgerItem.finalAmount || 0) - runningBalance : 0
      
      return { totalCredits, totalWithdrawals, totalProfitPaid, runningBalance, saleDue }
    } else {
      const totalAmount = safeEntries.reduce((sum, entry) => sum + entry.amount, 0)
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
      'SALE_PAYMENT': 'Sale Payment'
    }
    return labels[type] || type
  }

  const getEntryTypeBadgeVariant = (type) => {
    if (type === 'INVESTMENT' || type === 'SALE_PAYMENT') return 'default'
    if (type === 'WITHDRAWAL') return 'secondary'
    if (type === 'PROFIT_PAYOUT') return 'outline'
    return 'default'
  }
  
  // Check if entry is a credit (money IN)
  const isCredit = (entry) => {
    if (ledgerType === 'partner') return entry.type === 'INVESTMENT'
    if (ledgerType === 'sale') return (entry.entryType || 'SALE_PAYMENT') === 'SALE_PAYMENT'
    return true  // Purchases are always money out, so entries are credits to the vendor
  }

  return (
    <Drawer open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle>{getTitle()}</DrawerTitle>
          <DrawerDescription>
            {ledgerType === 'partner'
              ? 'View and manage capital account entries (investments, withdrawals, profit payouts)'
              : ledgerType === 'sale'
              ? 'View and manage sale ledger entries (payments, withdrawals, profit payouts)'
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
          ) : (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">Add New Entry</CardTitle>
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
                  <Select value={formData.paymentMode} onValueChange={v => setFormData({...formData, paymentMode: v})}>
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
                      {accounts?.map(acc => (
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
                      {(ledgerType === 'partner' || ledgerType === 'sale') && <TableHead>Type</TableHead>}
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
                        <TableCell className={`font-medium ${
                          ledgerType === 'partner'
                            ? entry.type === 'INVESTMENT' ? 'text-green-600' : 'text-red-600'
                            : ledgerType === 'sale'
                            ? isCredit(entry) ? 'text-green-600' : 'text-red-600'
                            : 'text-green-600'
                        }`}>
                          {ledgerType === 'partner' && entry.type !== 'INVESTMENT' && '-'}
                          {ledgerType === 'sale' && !isCredit(entry) && '-'}
                          ₹{fmt(entry.amount)}
                        </TableCell>
                        <TableCell><Badge variant="outline">{entry.paymentMode}</Badge></TableCell>
                        <TableCell>{entry.remark || '-'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {ledgerType === 'partner' && onEditEntry && (
                              <Button variant="outline" size="sm" onClick={() => onEditEntry(entry)}>
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
                                  <AlertDialogTitle>Delete Entry?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => onDeleteEntry(entry.id)}>Delete</AlertDialogAction>
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
const EditLedgerEntryForm = ({ entry, accounts, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    type: entry?.type || 'INVESTMENT',
    amount: entry?.amount?.toString() || '',
    entryDate: entry?.entryDate?.split('T')[0] || '',
    paymentMode: entry?.paymentMode || 'Cash',
    accountId: entry?.accountId || '',
    remark: entry?.remark || ''
  })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Generate idempotency key once when form opens
  const [editGroupId] = useState(() => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)

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
      await onSubmit({
        type: formData.type,
        amount: amount,
        entryDate: formData.entryDate,
        paymentMode: formData.paymentMode,
        accountId: formData.accountId,
        remark: formData.remark,
        editGroupId: editGroupId // Include idempotency key
      })
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
      
      <div>
        <Label>Type *</Label>
        <Select value={formData.type} onValueChange={v => setFormData({...formData, type: v})} disabled={isSubmitting}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="INVESTMENT">Investment (Capital IN)</SelectItem>
            <SelectItem value="WITHDRAWAL">Withdrawal (Capital OUT)</SelectItem>
            <SelectItem value="PROFIT_PAYOUT">Profit Payout</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
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
        <Select value={formData.paymentMode} onValueChange={v => setFormData({...formData, paymentMode: v})} disabled={isSubmitting}>
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
            {accounts.map(account => (
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

const PurchaseForm = ({ onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    partyName: '',
    dealAmount: '',
    agreementDate: '',
    notes: ''
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({...formData, dealAmount: parseFloat(formData.dealAmount)})
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Party Name *</Label>
        <Input value={formData.partyName} onChange={e => setFormData({...formData, partyName: e.target.value})} required />
      </div>
      <div>
        <Label>Total Deal Amount *</Label>
        <Input type="number" value={formData.dealAmount} onChange={e => setFormData({...formData, dealAmount: e.target.value})} required />
      </div>
      <div>
        <Label>Agreement Date *</Label>
        <Input type="date" value={formData.agreementDate} onChange={e => setFormData({...formData, agreementDate: e.target.value})} required />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
      </div>
      <p className="text-sm text-gray-500 bg-blue-50 p-3 rounded">
        Note: Payments can be added after creating the purchase record.
      </p>
      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit">Add Purchase</Button>
      </div>
    </form>
  )
}

const SaleForm = ({ inventory, customers = [], onSubmit, onCancel, initialData, hasPayments, onCreateCustomer, onUpdateCustomer }) => {
  const [formData, setFormData] = useState({
    inventoryId: initialData?.inventoryId || '',
    customerId: initialData?.customerId || '',
    customerName: initialData?.customerName || '',
    customerPhone: initialData?.customerPhone || '',
    customerAddress: initialData?.customerAddress || '',
    dealPrice: initialData?.dealPrice?.toString() || '',
    discount: initialData?.discount?.toString() || '0',
    saleDate: initialData?.saleDate?.split('T')[0] || '',
    status: initialData?.status || 'Booked',
    notes: initialData?.notes || ''
  })
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
    onSubmit({
      ...formData,
      dealPrice: parseFloat(formData.dealPrice),
      discount: parseFloat(formData.discount)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Select Inventory *</Label>
        <Select 
          value={formData.inventoryId} 
          onValueChange={v => setFormData({...formData, inventoryId: v})} 
          disabled={initialData && hasPayments}
          required
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose inventory" />
          </SelectTrigger>
          <SelectContent>
            {inventory
              .filter(item => !item.status || item.status === 'Available' || item.id === formData.inventoryId)
              .map(item => (
                <SelectItem key={item.id} value={item.id}>
                  {item.type} - {item.inventoryNumber}{item.area > 0 ? ` (${item.area} sq ft)` : ''}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {initialData && hasPayments && (
          <p className="text-xs text-orange-600 mt-1">Cannot change inventory after payments have been made</p>
        )}
      </div>
      
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Deal Price *</Label>
          <Input type="number" value={formData.dealPrice} onChange={e => setFormData({...formData, dealPrice: e.target.value})} required />
        </div>
        <div>
          <Label>Discount</Label>
          <Input type="number" value={formData.discount} onChange={e => setFormData({...formData, discount: e.target.value})} />
        </div>
      </div>
      {formData.dealPrice && (
        <p className="text-sm font-medium">Final Amount: ₹{((parseFloat(formData.dealPrice) || 0) - (parseFloat(formData.discount) || 0)).toLocaleString()}</p>
      )}
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
        <Button type="submit" disabled={!formData.customerId || !formData.inventoryId}>{initialData ? 'Update Sale' : 'Add Sale'}</Button>
      </div>
    </form>
  )
}

// Vendor Form Component
const VendorForm = ({ vendor, onSubmit, onCancel, vendorTypes = [], onAddNewType }) => {
  const { toast } = useToast()
  const [formData, setFormData] = useState({
    name: vendor?.name || '',
    type: vendor?.type || 'Other',
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
        {showAddType ? (
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
const ExpenseBillForm = ({ vendors, categories = [], onSubmit, onCancel, onAddNewCategory }) => {
  const { toast } = useToast()
  // Use dynamic categories if available, fallback to hardcoded
  const categoryOptions = categories.length > 0 ? categories : [
    { id: 'Civil', name: 'Civil' },
    { id: 'Tiles', name: 'Tiles' },
    { id: 'Electrical', name: 'Electrical' },
    { id: 'Plumbing', name: 'Plumbing' },
    { id: 'Paint', name: 'Paint' },
    { id: 'Labour', name: 'Labour' },
    { id: 'Legal', name: 'Legal' },
    { id: 'Marketing', name: 'Marketing' },
    { id: 'Office', name: 'Office' },
    { id: 'Other', name: 'Other' }
  ]

  const [formData, setFormData] = useState({
    vendorId: '',
    categoryId: categoryOptions[0]?.id || '',
    billAmount: '',
    billDate: '',
    description: ''
  })
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [isAddingCategory, setIsAddingCategory] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({
      ...formData,
      billAmount: parseFloat(formData.billAmount)
    })
  }

  const handleAddNewCategory = async () => {
    if (!newCategoryName.trim()) return
    setIsAddingCategory(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/expense-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: newCategoryName.trim() })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to add category')
      }
      const newCat = await res.json()
      toast({ title: 'Success', description: 'New category added' })
      setFormData({ ...formData, categoryId: newCat.id })
      setNewCategoryName('')
      setShowAddCategory(false)
      if (onAddNewCategory) onAddNewCategory() // Refresh the list
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setIsAddingCategory(false)
    }
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
      <div>
        <Label>Category *</Label>
        {showAddCategory ? (
          <div className="flex gap-2">
            <Input 
              value={newCategoryName} 
              onChange={e => setNewCategoryName(e.target.value)} 
              placeholder="New category name"
              autoFocus
            />
            <Button type="button" size="sm" onClick={handleAddNewCategory} disabled={isAddingCategory || !newCategoryName.trim()}>
              {isAddingCategory ? 'Adding...' : 'Add'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setShowAddCategory(false); setNewCategoryName(''); }}>
              Cancel
            </Button>
          </div>
        ) : (
          <Select value={formData.categoryId} onValueChange={v => {
            if (v === '__add_new__') {
              setShowAddCategory(true)
            } else {
              setFormData({...formData, categoryId: v})
            }
          }} required>
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map(cat => (
                <SelectItem key={cat.id} value={cat.id || cat.name}>{cat.name}</SelectItem>
              ))}
              <SelectItem value="__add_new__" className="text-blue-600 font-medium">
                + Add New Category
              </SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Bill Amount *</Label>
          <Input type="number" value={formData.billAmount} onChange={e => setFormData({...formData, billAmount: e.target.value})} required />
        </div>
        <div>
          <Label>Bill Date *</Label>
          <Input type="date" value={formData.billDate} onChange={e => setFormData({...formData, billDate: e.target.value})} required />
        </div>
      </div>
      <div>
        <Label>Description</Label>
        <Textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
      </div>
      <p className="text-sm text-gray-500 bg-blue-50 p-3 rounded">
        Note: This creates a bill (amount due). You can add payments separately after creating the bill.
      </p>
      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={vendors.length === 0}>Create Bill</Button>
      </div>
    </form>
  )
}

// Commission Bill Form Component
const CommissionBillForm = ({ brokers, sales, inventory, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    brokerVendorId: '',
    saleId: '',
    commissionAmount: '',
    commissionDate: '',
    remark: ''
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
      <p className="text-sm text-gray-500 bg-blue-50 p-3 rounded">
        Note: This creates a commission bill for the broker. Payments can be added separately.
      </p>
      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={brokers.length === 0 || sales.length === 0}>Create Commission Bill</Button>
      </div>
    </form>
  )
}

// Resale Deal Form Component
const ResaleDealForm = ({ inventory, sales = [], customers = [], onSubmit, onCancel, onCreateCustomer }) => {
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
  const [showNewBuyer, setShowNewBuyer] = useState(false)
  const [newBuyerData, setNewBuyerData] = useState({ name: '', phone: '' })
  const [isCreatingBuyer, setIsCreatingBuyer] = useState(false)
  const { toast } = useToast()

  // When inventory is selected, auto-populate seller info
  const handleInventoryChange = (inventoryId) => {
    setFormData({ ...formData, inventoryId })
    
    // Find the sale for this inventory
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
    const originalPrice = selectedSale?.finalAmount || 0
    const transferCharges = parseFloat(formData.transferCharges) || 0
    const brokerage = parseFloat(formData.brokerage) || 0
    const otherCharges = parseFloat(formData.otherCharges) || 0
    const totalCharges = transferCharges + brokerage + otherCharges
    
    const grossProfit = resalePrice - originalPrice
    const netProfit = grossProfit - totalCharges
    
    // Seller payout = what seller paid + profit (minus charges)
    const sellerPrincipal = selectedSale?.totalPaid || 0  // From allocations
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
    onSubmit({
      ...formData,
      resalePrice: parseFloat(formData.resalePrice),
      transferCharges: parseFloat(formData.transferCharges || 0),
      brokerage: parseFloat(formData.brokerage || 0),
      otherCharges: parseFloat(formData.otherCharges || 0),
      originalSaleId: selectedSale?.id,
      originalSalePrice: selectedSale?.finalAmount
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
              const sale = sales.find(s => s.inventoryId === item.id)
              return (
                <SelectItem key={item.id} value={item.id}>
                  {item.type} - {item.inventoryNumber} {sale ? `(Owner: ${sale.customerName})` : ''}
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
          <Label>Other Charges</Label>
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
      {formData.resalePrice && selectedSale && (
        <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-green-200">
          <CardContent className="pt-4">
            <h4 className="font-medium mb-3">💰 Deal Summary</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Original Sale Price:</span>
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
const ResalePaymentDrawer = ({ isOpen, onClose, deal, buyerPayments, sellerPayouts, accounts, onAddBuyerPayment, onDeleteBuyerPayment, onAddSellerPayout, onDeleteSellerPayout }) => {
  const [activeTab, setActiveTab] = useState('buyer')
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

  // Auto-calculate principal/profit when deal changes
  useEffect(() => {
    if (deal && useAutoBreakdown) {
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
  }, [deal, sellerPayouts, useAutoBreakdown])

  if (!deal) return null

  const buyerPaid = buyerPayments.reduce((sum, p) => sum + p.amount, 0)
  const buyerBalance = (deal.buyerPurchaseAmount || deal.resalePrice || 0) - buyerPaid
  const sellerPaid = sellerPayouts.reduce((sum, p) => sum + p.amount, 0)
  const sellerBalance = (deal.sellerPayoutAmount || 0) - sellerPaid
  
  // Calculate remaining principal and profit
  const totalPrincipalPaid = sellerPayouts.reduce((sum, p) => sum + (p.principalAmount || 0), 0)
  const totalProfitPaid = sellerPayouts.reduce((sum, p) => sum + (p.profitAmount || 0), 0)
  const remainingPrincipal = Math.max(0, (deal.sellerPayoutPrincipal || deal.sellerPrincipal || 0) - totalPrincipalPaid)
  const remainingProfit = Math.max(0, (deal.sellerPayoutProfit || deal.netProfit || 0) - totalProfitPaid)

  const handleBuyerSubmit = (e) => {
    e.preventDefault()
    onAddBuyerPayment({
      amount: parseFloat(buyerFormData.amount),
      paymentDate: buyerFormData.paymentDate,
      paymentMode: buyerFormData.paymentMode,
      accountId: buyerFormData.accountId,
      reference: buyerFormData.reference,
      remark: buyerFormData.remark
    })
    setBuyerFormData({ ...buyerFormData, amount: '', paymentDate: new Date().toISOString().split('T')[0], reference: '', remark: '' })
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
    
    onAddSellerPayout({
      amount: totalAmount,
      principalAmount: principal,
      profitAmount: profit,
      chargesDeducted: charges,
      payoutDate: sellerFormData.payoutDate,
      payoutMode: sellerFormData.payoutMode,
      accountId: sellerFormData.accountId,
      reference: sellerFormData.reference,
      remark: sellerFormData.remark
    })
    setSellerFormData({ 
      ...sellerFormData, 
      principalAmount: '', 
      profitAmount: '', 
      chargesDeducted: '0',
      payoutDate: new Date().toISOString().split('T')[0], 
      reference: '',
      remark: '' 
    })
  }

  const sellerPayoutTotal = (parseFloat(sellerFormData.principalAmount) || 0) + 
                           (parseFloat(sellerFormData.profitAmount) || 0) - 
                           (parseFloat(sellerFormData.chargesDeducted) || 0)

  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle>Resale Payments - {deal?.inventoryName}</DrawerTitle>
          <DrawerDescription>
            {deal?.sellerName} → {deal?.buyerName}
          </DrawerDescription>
        </DrawerHeader>
        
        <div className="px-4 overflow-y-auto max-h-[60vh]">
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <Card className="bg-green-50">
              <CardContent className="pt-4">
                <p className="text-sm font-medium text-green-700">Money IN (From Buyer)</p>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div>
                    <p className="text-xs text-gray-600">Amount</p>
                    <p className="font-bold">₹{fmt(deal.buyerPurchaseAmount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Received</p>
                    <p className="font-bold text-green-600">₹{fmt(buyerPaid)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Due</p>
                    <p className="font-bold text-orange-600">₹{fmt(buyerBalance)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-orange-50">
              <CardContent className="pt-4">
                <p className="text-sm font-medium text-orange-700">Money OUT (To Seller)</p>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div>
                    <p className="text-xs text-gray-600">Amount</p>
                    <p className="font-bold">₹{fmt(deal.sellerPayoutAmount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Paid</p>
                    <p className="font-bold text-green-600">₹{fmt(sellerPaid)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Due</p>
                    <p className="font-bold text-orange-600">₹{fmt(sellerBalance)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs for Buyer/Seller */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="buyer">Buyer Payments (IN)</TabsTrigger>
              <TabsTrigger value="seller">Seller Payouts (OUT)</TabsTrigger>
            </TabsList>
            
            {/* Buyer Payments Tab */}
            <TabsContent value="buyer" className="space-y-4">
              {buyerBalance > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Add Buyer Payment</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleBuyerSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label>Amount * (Max: ₹{fmt(buyerBalance)})</Label>
                          <Input
                            type="number"
                            value={buyerFormData.amount}
                            onChange={e => setBuyerFormData({...buyerFormData, amount: e.target.value})}
                            max={buyerBalance}
                            required
                          />
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
                        <Select value={buyerFormData.paymentMode} onValueChange={v => setBuyerFormData({...buyerFormData, paymentMode: v})}>
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
                            {accounts?.map(acc => (
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
                        <Plus className="w-4 h-4 mr-2" /> Add Buyer Payment
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
                          <TableRow key={payment.id}>
                            <TableCell>{new Date(payment.paymentDate).toLocaleDateString()}</TableCell>
                            <TableCell className="text-green-600 font-medium">₹{fmt(payment.amount)}</TableCell>
                            <TableCell><Badge variant="outline">{payment.paymentMode}</Badge></TableCell>
                            <TableCell>{payment.remark || '-'}</TableCell>
                            <TableCell>
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
                                    <AlertDialogAction onClick={() => onDeleteBuyerPayment(payment.id)}>Delete</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
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

              {sellerBalance > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Add Seller Payout</CardTitle>
                    <CardDescription>Principal remaining: ₹{fmt(remainingPrincipal)} | Profit remaining: ₹{fmt(remainingProfit)}</CardDescription>
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
                          <Select value={sellerFormData.payoutMode} onValueChange={v => setSellerFormData({...sellerFormData, payoutMode: v})}>
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
                              {accounts.map(acc => (
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
                        <Plus className="w-4 h-4 mr-2" /> Add Seller Payout (₹{fmt(sellerPayoutTotal)})
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
                        {sellerPayouts.map(payout => (
                          <TableRow key={payout.id}>
                            <TableCell>{new Date(payout.payoutDate).toLocaleDateString()}</TableCell>
                            <TableCell className="text-blue-600">₹{fmt(payout.principalAmount || 0)}</TableCell>
                            <TableCell className="text-green-600">₹{fmt(payout.profitAmount || 0)}</TableCell>
                            <TableCell className="text-orange-600 font-medium">₹{fmt(payout.amount)}</TableCell>
                            <TableCell><Badge variant="outline">{payout.payoutMode}</Badge></TableCell>
                            <TableCell>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="destructive" size="sm">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Payout?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will also remove the daybook entry.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => onDeleteSellerPayout(payout.id)}>Delete</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
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
const CustomerPaymentForm = ({ customers, accounts, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    customerId: '',
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMode: 'Cash',
    accountId: accounts.find(a => a.isDefault)?.id || accounts[0]?.id || '',
    reference: '',
    remark: ''
  })

  useEffect(() => {
    if (accounts.length > 0 && !formData.accountId) {
      const defaultAccount = accounts.find(a => a.isDefault) || accounts[0]
      setFormData(prev => ({ ...prev, accountId: defaultAccount?.id || '' }))
    }
  }, [accounts])

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({
      ...formData,
      amount: parseFloat(formData.amount)
    })
  }

  const selectedCustomer = customers.find(c => c.id === formData.customerId)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Customer *</Label>
        <Select value={formData.customerId} onValueChange={v => setFormData({...formData, customerId: v})}>
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
          <Select value={formData.paymentMode} onValueChange={v => setFormData({...formData, paymentMode: v})}>
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
              {accounts.map(a => (
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
        <Button type="submit" disabled={!formData.customerId || !formData.amount}>
          Record Payment & Allocate
        </Button>
      </div>
    </form>
  )
}

// Payment Allocation Form Component with Create Sale capability
const PaymentAllocationForm = ({ payment, sales, onSave, onCancel, inventory = [], customer, onCreateSale }) => {
  const [allocations, setAllocations] = useState(
    sales.map(sale => ({
      saleId: sale.id,
      amount: sale.currentAllocation || 0,
      maxAmount: sale.pendingBalance + (sale.currentAllocation || 0)
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

  // Update allocations when sales change (after creating new sale)
  useEffect(() => {
    setAllocations(
      sales.map(sale => ({
        saleId: sale.id,
        amount: sale.currentAllocation || 0,
        maxAmount: sale.pendingBalance + (sale.currentAllocation || 0)
      }))
    )
  }, [sales])

  const totalAllocated = allocations.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0)
  const unallocated = payment.amount - totalAllocated
  const isValid = Math.abs(unallocated) < 0.01 // Allow small floating point differences

  const handleAllocationChange = (saleId, value) => {
    setAllocations(prev => prev.map(a => 
      a.saleId === saleId ? { ...a, amount: parseFloat(value) || 0 } : a
    ))
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
    setAllocations(prev => prev.map(a => ({ ...a, amount: 0 })))
  }

  const handleSave = () => {
    onSave(allocations.map(a => ({ saleId: a.saleId, amount: a.amount })))
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
                const allocation = allocations.find(a => a.saleId === sale.id)
                return (
                  <TableRow key={sale.id}>
                    <TableCell>
                      <div className="font-medium">{sale.inventoryNumber} ({sale.inventoryType})</div>
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
                        value={allocation?.amount || 0}
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
      await apiCall('/accounts', 'POST', newAccount)
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
      await apiCall(`/accounts/${selectedAccountForOpening.id}/opening-balance`, 'PUT', openingBalance)
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
                      <Input type="number" value={newAccount.openingAmount} onChange={e => setNewAccount({...newAccount, openingAmount: parseFloat(e.target.value) || 0})} />
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
              <Input type="number" value={openingBalance.openingAmount} onChange={e => setOpeningBalance({...openingBalance, openingAmount: parseFloat(e.target.value) || 0})} />
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
                <DollarSign className={`w-8 h-8 ${summary.closingBalance >= 0 ? 'text-blue-500' : 'text-orange-500'}`} />
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
