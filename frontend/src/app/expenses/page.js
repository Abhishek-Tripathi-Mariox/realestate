'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Toaster } from '@/components/ui/toaster'
import { useToast } from '@/hooks/use-toast'
import { Building2, Plus, Download, Search, Filter, Wallet, CreditCard, Receipt, Trash2, Edit, Eye, RefreshCw, MinusCircle, X, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react'
import { AppShell } from '@/components/dashboard/AppShell'
import { getDeleteOtp, refreshDeleteOtp } from '@/lib/deleteOtp'

export default function ExpensesPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [token, setToken] = useState(null)
  const [user, setUser] = useState(null)
  
  // Data state
  const [societies, setSocieties] = useState([])
  const [accounts, setAccounts] = useState([])
  const [expenseCategories, setExpenseCategories] = useState([])
  const [expenses, setExpenses] = useState([])
  const [summary, setSummary] = useState({
    totalExpense: 0,
    cashExpense: 0,
    bankExpense: 0,
    transactionCount: 0
  })
  
  // UI state
  const [selectedSociety, setSelectedSociety] = useState(searchParams.get('societyId') || '')
  const [activeTab, setActiveTab] = useState('society') // 'society' | 'company'
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [viewingExpense, setViewingExpense] = useState(null)
  const [loading, setLoading] = useState(true)
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const pageSize = 20
  
  // Filters
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    accountId: 'all',
    category: 'all',
    paymentMode: 'all',
    vendorSearch: ''
  })
  
  // Form state
  const [formData, setFormData] = useState({
    scope: 'SOCIETY',
    societyId: '',
    accountId: '',
    amount: '',
    expenseDate: new Date().toISOString().split('T')[0],
    category: '',
    vendorName: '',
    paymentMode: 'Cash',
    remark: ''
  })
  
  // Inline Add Category state
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)

  // ===== Bill workflow state (entry → payments → ledger) =====
  const [showAddBill, setShowAddBill] = useState(false)
  const [editingBill, setEditingBill] = useState(null)
  const [billForm, setBillForm] = useState({
    scope: 'SOCIETY',
    societyId: '',
    category: '',
    vendorName: '',
    billAmount: '',
    billDate: new Date().toISOString().split('T')[0],
    description: '',
    payNow: false,
    initialAmount: '',
    initialPaymentMode: 'Cash',
    initialAccountId: '',
    initialReferenceNo: '',
    initialRemark: '',
  })

  // Payments drawer state
  const [paymentsBill, setPaymentsBill] = useState(null) // full bill row
  const [billPayments, setBillPayments] = useState([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  // Which underlying bill type the open drawer reflects:
  // 'expense' (editable here) | 'margin' | 'commission' (read-only — managed
  // from their own ledger pages)
  const [paymentsBillType, setPaymentsBillType] = useState('expense')
  // Which action panel is open inside the drawer: 'payment' | 'bill' | null
  const [drawerAction, setDrawerAction] = useState(null)
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMode: 'Cash',
    accountId: '',
    referenceNo: '',
    remark: '',
  })
  // Inline edit dialog for an existing Bill Activity row. We can't edit a
  // payment's `type` (PAYMENT/ADDITION/WITHDRAWAL) since each flips the
  // bill balance differently — only the value fields are editable here.
  const [editingPayment, setEditingPayment] = useState(null)
  const [editPaymentForm, setEditPaymentForm] = useState({
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMode: 'Cash',
    accountId: '',
    referenceNo: '',
    remark: '',
  })
  // Form for adding more work value to an existing bill (vendor-ledger style).
  // Optionally records a payment along with the addition.
  const [billAddForm, setBillAddForm] = useState({
    addAmount: '',
    addDate: new Date().toISOString().split('T')[0],
    note: '',
    payNow: false,
    paidAmount: '',
    paymentMode: 'Cash',
    accountId: '',
    referenceNo: '',
    remark: '',
  })

  const fmt = (num) => {
    const n = Math.round((Number(num) || 0) * 100) / 100
    return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  // API helper
  const apiCall = async (endpoint, method = 'GET', body = null) => {
    const authToken = token || localStorage.getItem('token')

    const buildOptions = (otp) => {
      const opts = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
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

    let response = await fetch(`/api${endpoint}`, buildOptions(otp))
    if (response.status === 403 && method === 'DELETE') {
      const errBody = await response.clone().json().catch(() => ({}))
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

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    const storedUser = localStorage.getItem('user')
    if (storedToken) {
      setToken(storedToken)
      if (storedUser) setUser(JSON.parse(storedUser))
      setIsAuthenticated(true)
    } else {
      router.push('/')
    }
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/')
  }

  // Load initial data
  useEffect(() => {
    if (isAuthenticated) {
      loadSocieties()
      loadExpenseCategories()
    }
  }, [isAuthenticated])

  // Re-fetch accounts when the active tab or society changes — keeps the
  // account dropdown scoped to the current view (no society leaks).
  useEffect(() => {
    if (isAuthenticated) {
      loadAccounts()
    }
  }, [isAuthenticated, activeTab, selectedSociety])

  // Load expenses when filters change
  useEffect(() => {
    if (isAuthenticated) {
      loadExpenses()
    }
  }, [isAuthenticated, selectedSociety, activeTab, filters, currentPage])

  const loadSocieties = async () => {
    try {
      const data = await apiCall('/societies')
      setSocieties(data)
      if (!selectedSociety && data.length > 0) {
        setSelectedSociety(data[0].id)
      }
    } catch (error) {
      console.error('Failed to load societies:', error)
    }
  }

  const loadAccounts = async () => {
    try {
      // Filter accounts by current scope so society-specific accounts don't
      // leak into the Company Expenses tab and vice versa.
      const params = new URLSearchParams()
      if (activeTab === 'company') {
        params.append('scope', 'COMPANY')
      } else if (activeTab === 'society' && selectedSociety) {
        params.append('societyId', selectedSociety)
      }
      const qs = params.toString()
      const data = await apiCall(`/accounts${qs ? `?${qs}` : ''}`)
      setAccounts(data)
    } catch (error) {
      console.error('Failed to load accounts:', error)
    }
  }

  const loadExpenseCategories = async () => {
    try {
      const data = await apiCall('/expense-categories')
      setExpenseCategories(data)
    } catch (error) {
      console.error('Failed to load expense categories:', error)
    }
  }

  const loadExpenses = async () => {
    setLoading(true)
    try {
      // Build query params
      const params = new URLSearchParams()
      params.append('sourceType', 'QUICK_EXPENSE')
      params.append('direction', 'OUT')
      
      if (activeTab === 'society') {
        params.append('scope', 'SOCIETY')
        if (selectedSociety) {
          params.append('societyId', selectedSociety)
        }
      } else {
        params.append('scope', 'COMPANY')
      }
      
      if (filters.startDate) params.append('startDate', filters.startDate)
      if (filters.endDate) params.append('endDate', filters.endDate)
      if (filters.accountId !== 'all') params.append('accountId', filters.accountId)
      if (filters.paymentMode !== 'all') params.append('paymentMode', filters.paymentMode)
      
      params.append('page', currentPage)
      params.append('limit', pageSize)
      
      const data = await apiCall(`/expenses?${params.toString()}`)
      
      // Filter by category and vendor search on client side if needed
      let filteredExpenses = data.transactions || []
      if (filters.category !== 'all') {
        filteredExpenses = filteredExpenses.filter(e => e.referenceNo === filters.category)
      }
      if (filters.vendorSearch) {
        const search = filters.vendorSearch.toLowerCase()
        filteredExpenses = filteredExpenses.filter(e => 
          e.partyName?.toLowerCase().includes(search) ||
          e.remark?.toLowerCase().includes(search)
        )
      }
      
      setExpenses(filteredExpenses)
      setSummary(data.summary || {
        totalExpense: filteredExpenses.reduce((s, e) => s + e.amount, 0),
        cashExpense: filteredExpenses.filter(e => e.paymentMode === 'Cash').reduce((s, e) => s + e.amount, 0),
        bankExpense: filteredExpenses.filter(e => e.paymentMode !== 'Cash').reduce((s, e) => s + e.amount, 0),
        transactionCount: filteredExpenses.length
      })
      setTotalPages(Math.ceil((data.total || filteredExpenses.length) / pageSize))
    } catch (error) {
      console.error('Failed to load expenses:', error)
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load expenses' })
    } finally {
      setLoading(false)
    }
  }

  const handleAddExpense = async () => {
    try {
      // Validation
      const amount = parseFloat(formData.amount)
      if (isNaN(amount) || amount <= 0) {
        toast({ variant: 'destructive', title: 'Error', description: 'Please enter a valid amount' })
        return
      }
      if (!formData.accountId) {
        toast({ variant: 'destructive', title: 'Error', description: 'Please select an account' })
        return
      }
      if (!formData.category) {
        toast({ variant: 'destructive', title: 'Error', description: 'Please select a category' })
        return
      }
      if (formData.scope === 'SOCIETY' && !formData.societyId) {
        toast({ variant: 'destructive', title: 'Error', description: 'Please select a society' })
        return
      }

      const txnData = {
        txnDate: formData.expenseDate,
        societyId: formData.scope === 'SOCIETY' ? formData.societyId : null,
        scope: formData.scope,
        accountId: formData.accountId,
        direction: 'OUT',
        amount: amount,
        paymentMode: formData.paymentMode,
        partyType: 'Vendor',
        partyName: formData.vendorName || formData.category,
        sourceType: 'QUICK_EXPENSE',
        referenceNo: formData.category,
        remark: formData.remark || `${formData.category}${formData.vendorName ? ' - ' + formData.vendorName : ''}`
      }

      if (editingExpense) {
        // For edit, we'll create a reversal and new entry
        await apiCall(`/expenses/${editingExpense.id}`, 'PUT', txnData)
        toast({ title: 'Success', description: 'Expense updated successfully!' })
      } else {
        await apiCall('/daybook', 'POST', txnData)
        toast({ title: 'Success', description: 'Expense added successfully!' })
      }

      setShowAddExpense(false)
      setEditingExpense(null)
      resetForm()
      // Refresh accounts alongside expenses — every save (add or edit) moves
      // money on an account, so the cached `currentBalance` is stale and the
      // next Edit dialog would show the pre-update number in its account
      // dropdown.
      await Promise.all([loadExpenses(), loadAccounts()])
    } catch (error) {
      console.error('Failed to save expense:', error)
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to save expense' })
    }
  }

  const handleDeleteExpense = async (expense) => {
    if (!confirm('Are you sure you want to delete this expense? A reversal entry will be created.')) {
      return
    }

    try {
      await apiCall(`/expenses/${expense.id}`, 'DELETE')
      toast({ title: 'Success', description: 'Expense deleted (reversal created)' })
      await Promise.all([loadExpenses(), loadAccounts()])
    } catch (error) {
      console.error('Failed to delete expense:', error)
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to delete expense' })
    }
  }

  // ===== Bill workflow handlers =====
  const resetBillForm = () => {
    setBillForm({
      scope: activeTab === 'society' ? 'SOCIETY' : 'COMPANY',
      societyId: selectedSociety,
      category: '',
      vendorName: '',
      billAmount: '',
      billDate: new Date().toISOString().split('T')[0],
      description: '',
      payNow: false,
      initialAmount: '',
      initialPaymentMode: 'Cash',
      initialAccountId: '',
      initialReferenceNo: '',
      initialRemark: '',
    })
  }

  const openAddBill = () => {
    resetBillForm()
    setEditingBill(null)
    setShowAddBill(true)
  }

  const openEditBill = (row) => {
    // For payment-style rows the backend now sends `billId`; virtual _isBill
    // rows carry the bill id in `sourceId`; a directly-fetched ExpenseBill
    // carries it in `id`.
    const billId = row.billId || row.sourceId || row.id
    setEditingBill({ ...row, id: billId })
    setBillForm({
      scope: row.scope || 'SOCIETY',
      societyId: row.societyId || '',
      category: row.referenceNo || row.category || '',
      vendorName: row.partyName || row.vendorName || '',
      billAmount: (row.billAmount ?? row.amount ?? '').toString(),
      billDate: (row.billDate || row.txnDate || '').toString().split('T')[0],
      description: row.remark || row.description || '',
      payNow: false,
      initialAmount: '',
      initialPaymentMode: 'Cash',
      initialAccountId: '',
      initialReferenceNo: '',
      initialRemark: '',
    })
    setShowAddBill(true)
  }

  const handleSaveBill = async () => {
    try {
      const billAmount = parseFloat(billForm.billAmount)
      if (isNaN(billAmount) || billAmount <= 0) {
        toast({ variant: 'destructive', title: 'Error', description: 'Please enter a valid bill amount' })
        return
      }
      if (!billForm.category) {
        toast({ variant: 'destructive', title: 'Error', description: 'Please select a category' })
        return
      }
      if (billForm.scope === 'SOCIETY' && !billForm.societyId) {
        toast({ variant: 'destructive', title: 'Error', description: 'Please select a society' })
        return
      }

      const payload = {
        scope: billForm.scope,
        societyId: billForm.scope === 'SOCIETY' ? billForm.societyId : null,
        category: billForm.category,
        vendorName: billForm.vendorName || billForm.category,
        billAmount,
        billDate: billForm.billDate,
        description: billForm.description || '',
      }

      if (editingBill) {
        await apiCall(`/expense-bills/${editingBill.id}`, 'PUT', payload)
        toast({ title: 'Success', description: 'Bill updated' })
      } else {
        // Validate initial payment BEFORE creating the bill so we don't end up
        // with an orphan bill + missing payment when the form is invalid.
        let initialPayment = null
        if (billForm.payNow) {
          const paid = parseFloat(billForm.initialAmount)
          if (isNaN(paid) || paid <= 0) {
            toast({ variant: 'destructive', title: 'Error', description: 'Initial payment amount must be positive' })
            return
          }
          if (paid > billAmount) {
            toast({ variant: 'destructive', title: 'Error', description: 'Initial payment cannot exceed bill amount' })
            return
          }
          if (!billForm.initialAccountId) {
            toast({ variant: 'destructive', title: 'Error', description: 'Select an account for the initial payment' })
            return
          }
          initialPayment = {
            amount: paid,
            paymentDate: billForm.billDate,
            paymentMode: billForm.initialPaymentMode,
            accountId: billForm.initialAccountId,
            referenceNo: billForm.initialReferenceNo,
            remark: billForm.initialRemark,
          }
        }

        // Backend `/expense-bills` POST does NOT accept `initialPayment` — it
        // silently drops it. So create the bill first, then replay the payment
        // as a separate POST to /:id/payments.
        const bill = await apiCall('/expense-bills', 'POST', payload)
        if (initialPayment && bill?.id) {
          try {
            await apiCall(`/expense-bills/${bill.id}/payments`, 'POST', initialPayment)
            toast({ title: 'Success', description: 'Bill saved with payment' })
          } catch (payErr) {
            toast({
              title: 'Bill saved, payment failed',
              description: payErr.message || 'Add the payment from the bill’s Payments drawer.',
              variant: 'destructive',
            })
          }
        } else {
          toast({ title: 'Success', description: 'Bill created' })
        }
      }

      setShowAddBill(false)
      setEditingBill(null)
      resetBillForm()
      await Promise.all([loadExpenses(), loadAccounts()])
    } catch (error) {
      console.error('Failed to save bill:', error)
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to save bill' })
    }
  }

  const handleDeleteBill = async (row) => {
    if (!confirm('Delete this bill? Any payments will also be reversed.')) return
    try {
      const billId = row.billId || row.sourceId || row.id
      await apiCall(`/expense-bills/${billId}`, 'DELETE')
      toast({ title: 'Success', description: 'Bill deleted' })
      await Promise.all([loadExpenses(), loadAccounts()])
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to delete bill' })
    }
  }

  // Detect what kind of bill this row reflects so we can route to the right
  // API. Virtual `_isBill` rows already carry sourceType; payment transactions
  // carry sourceType=*_PAYMENT.
  const detectBillType = (row) => {
    if (!row) return null
    const st = row.sourceType || ''
    if (st === 'EXPENSE_BILL' || st === 'EXPENSE_PAYMENT' || st === 'QUICK_EXPENSE') return 'expense'
    if (st === 'MARGIN_BILL' || st === 'MARGIN_PAYMENT') return 'margin'
    if (st === 'COMMISSION_BILL' || st === 'COMMISSION_PAYMENT') return 'commission'
    if (row._isBill) return 'expense' // fallback for legacy virtual rows
    return null
  }

  // Endpoints keyed by bill type — keeps the drawer logic generic across
  // expense / margin / commission bills.
  const BILL_ENDPOINTS = {
    expense:    { bills: '/expense-bills',    payments: (id) => `/expense-bills/${id}/payments` },
    margin:     { bills: '/margin-bills',     payments: (id) => `/margin-bills/${id}/payments` },
    commission: { bills: '/commission-bills', payments: (id) => `/commission-bills/${id}/payments` },
  }

  // Open payments drawer — fetches the full bill record (so we have bill
  // amount / paid / balance) and its payment ledger.
  const openBillPayments = async (row) => {
    const billType = detectBillType(row) || 'expense'
    const endpoints = BILL_ENDPOINTS[billType] || BILL_ENDPOINTS.expense
    try {
      setPaymentsLoading(true)
      setPaymentsBillType(billType)
      // Quick expense rows are one-shot transactions, not bills — synthesize
      // a bill-shaped object so the drawer can still show "this much was, this
      // much paid" without an extra fetch.
      if (row.sourceType === 'QUICK_EXPENSE') {
        const amount = row.amount || 0
        setPaymentsBill({
          id: row.id,
          _quickExpense: true,
          vendorName: row.partyName || '',
          category: row.referenceNo || '',
          billDate: row.txnDate,
          billAmount: amount,
          totalPaid: amount,
          balance: 0,
          status: 'PAID',
          societyId: row.societyId,
        })
        // Surface the quick expense itself as a synthetic single payment
        setBillPayments([{
          id: row.id,
          paymentDate: row.txnDate,
          paymentMode: row.paymentMode,
          accountId: row.accountId,
          amount,
          referenceNo: row.referenceNo,
          remark: row.remark,
          _quickExpense: true,
        }])
        return
      }
      // Backend now resolves `billId` for payment-style rows; fall back to
      // sourceId / id for legacy virtual bill rows.
      const billId = row.billId || row.sourceId || row.id
      const bills = await apiCall(`${endpoints.bills}?societyId=${row.societyId || ''}`)
      const fullBill = bills.find(b => b.id === billId) || {
        id: billId,
        vendorName: row.partyName || row.vendorName || row.brokerName || '',
        category: row.referenceNo || row.category || '',
        billDate: row.billDate || row.txnDate,
        billAmount: row.billAmount || row.amount || 0,
        totalPaid: 0,
        balance: row.amount || 0,
        status: row.status || 'PENDING',
      }
      const payments = await apiCall(endpoints.payments(billId))
      setPaymentsBill(fullBill)
      setBillPayments(payments || [])
      const balance = fullBill.balance ?? Math.max(0, (fullBill.billAmount || fullBill.amount || 0) - (fullBill.totalPaid || 0))
      setPaymentForm({
        amount: balance ? balance.toString() : '',
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMode: 'Cash',
        accountId: '',
        referenceNo: '',
        remark: '',
      })
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to load payments' })
    } finally {
      setPaymentsLoading(false)
    }
  }

  const refreshPayments = async () => {
    if (!paymentsBill || paymentsBill._quickExpense) return
    try {
      const endpoints = BILL_ENDPOINTS[paymentsBillType] || BILL_ENDPOINTS.expense
      const bills = await apiCall(`${endpoints.bills}?societyId=${paymentsBill.societyId || ''}`)
      const refreshed = bills.find(b => b.id === paymentsBill.id)
      if (refreshed) setPaymentsBill(refreshed)
      const payments = await apiCall(endpoints.payments(paymentsBill.id))
      setBillPayments(payments || [])
    } catch (error) {
      console.error('Failed to refresh payments:', error)
    }
  }

  const handleAddBillPayment = async () => {
    try {
      const amount = parseFloat(paymentForm.amount)
      if (isNaN(amount) || amount <= 0) {
        toast({ variant: 'destructive', title: 'Error', description: 'Payment amount must be positive' })
        return
      }
      if (!paymentForm.accountId) {
        toast({ variant: 'destructive', title: 'Error', description: 'Select an account' })
        return
      }
      const balance = paymentsBill.balance ?? Math.max(0, (paymentsBill.billAmount || paymentsBill.amount || 0) - (paymentsBill.totalPaid || 0))
      if (amount > balance + 0.01) {
        toast({ variant: 'destructive', title: 'Error', description: `Payment exceeds balance (₹${fmt(balance)})` })
        return
      }
      await apiCall(`/expense-bills/${paymentsBill.id}/payments`, 'POST', {
        amount,
        paymentDate: paymentForm.paymentDate,
        paymentMode: paymentForm.paymentMode,
        accountId: paymentForm.accountId,
        referenceNo: paymentForm.referenceNo,
        remark: paymentForm.remark,
      })
      toast({ title: 'Success', description: 'Payment added' })
      setPaymentForm({
        amount: '',
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMode: 'Cash',
        accountId: '',
        referenceNo: '',
        remark: '',
      })
      await refreshPayments()
      await Promise.all([loadExpenses(), loadAccounts()])
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to add payment' })
    }
  }

  const handleDeleteBillPayment = async (paymentId) => {
    if (!confirm('Delete this payment? The account balance will be reversed.')) return
    try {
      await apiCall(`/expense-payments/${paymentId}`, 'DELETE')
      toast({ title: 'Success', description: 'Payment deleted' })
      await refreshPayments()
      await Promise.all([loadExpenses(), loadAccounts()])
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to delete payment' })
    }
  }

  const openEditBillPayment = (p) => {
    setEditingPayment(p)
    setEditPaymentForm({
      amount: p.amount?.toString() || '',
      paymentDate: (p.paymentDate || '').slice(0, 10) || new Date().toISOString().split('T')[0],
      paymentMode: p.paymentMode || 'Cash',
      accountId: p.accountId || '',
      referenceNo: p.referenceNo || '',
      remark: p.remark || '',
    })
  }

  const handleSaveBillPaymentEdit = async () => {
    if (!editingPayment) return
    const amount = parseFloat(editPaymentForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Amount must be greater than 0' })
      return
    }
    // ADDITION rows don't move money, so the account field shouldn't be sent
    // — let the backend keep it null. For PAYMENT / WITHDRAWAL, an account is
    // required so the daybook reversal+repost knows which balance to swing.
    const isAddition = editingPayment.type === 'ADDITION'
    if (!isAddition && !editPaymentForm.accountId) {
      toast({ variant: 'destructive', title: 'Error', description: 'Pick an account' })
      return
    }
    try {
      await apiCall(`/expense-payments/${editingPayment.id}`, 'PUT', {
        amount,
        paymentDate: editPaymentForm.paymentDate,
        paymentMode: editPaymentForm.paymentMode,
        accountId: isAddition ? null : editPaymentForm.accountId,
        referenceNo: editPaymentForm.referenceNo,
        remark: editPaymentForm.remark,
      })
      toast({ title: 'Saved', description: 'Payment updated' })
      setEditingPayment(null)
      await refreshPayments()
      await Promise.all([loadExpenses(), loadAccounts()])
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to update payment' })
    }
  }

  // Add more work value to an existing bill (vendor-ledger "Add Work" flow).
  // PUTs the bill with new total = current + delta, then optionally posts a
  // payment for the just-added portion.
  // "Add to Bill" records a separate ledger row of type=ADDITION on the same
  // bill — the bill's amount grows by delta but each addition stays as its
  // own line in the activity ledger (so the user can see "₹X added on date").
  // A payment alongside is posted as a normal PAYMENT row.
  const handleAddToBill = async () => {
    if (!paymentsBill) return
    try {
      const delta = parseFloat(billAddForm.addAmount)
      if (isNaN(delta) || delta <= 0) {
        toast({ variant: 'destructive', title: 'Error', description: 'Amount to add must be positive' })
        return
      }
      let paymentPayload = null
      if (billAddForm.payNow) {
        const paid = parseFloat(billAddForm.paidAmount)
        if (isNaN(paid) || paid <= 0) {
          toast({ variant: 'destructive', title: 'Error', description: 'Payment amount must be positive' })
          return
        }
        if (paid > delta) {
          toast({ variant: 'destructive', title: 'Error', description: 'Payment cannot exceed the amount being added' })
          return
        }
        if (!billAddForm.accountId) {
          toast({ variant: 'destructive', title: 'Error', description: 'Select an account for the payment' })
          return
        }
        paymentPayload = {
          amount: paid,
          paymentDate: billAddForm.addDate,
          paymentMode: billAddForm.paymentMode,
          accountId: billAddForm.accountId,
          referenceNo: billAddForm.referenceNo,
          remark: billAddForm.remark,
        }
      }

      // Record the addition as its own ledger row (type=ADDITION). Backend
      // grows the bill amount and re-derives status without touching paid.
      await apiCall(`/expense-bills/${paymentsBill.id}/payments`, 'POST', {
        type: 'ADDITION',
        amount: delta,
        paymentDate: billAddForm.addDate,
        remark: '',
      })

      if (paymentPayload) {
        try {
          await apiCall(`/expense-bills/${paymentsBill.id}/payments`, 'POST', paymentPayload)
          toast({ title: 'Success', description: `₹${fmt(delta)} added, ₹${fmt(paymentPayload.amount)} paid` })
        } catch (payErr) {
          toast({
            title: 'Bill updated, payment failed',
            description: payErr.message || 'Retry the payment from Add Payment.',
            variant: 'destructive',
          })
        }
      } else {
        toast({ title: 'Success', description: `₹${fmt(delta)} added to bill` })
      }

      setBillAddForm({
        addAmount: '',
        addDate: new Date().toISOString().split('T')[0],
        note: '',
        payNow: false,
        paidAmount: '',
        paymentMode: 'Cash',
        accountId: '',
        referenceNo: '',
        remark: '',
      })
      setDrawerAction(null)
      await refreshPayments()
      await Promise.all([loadExpenses(), loadAccounts()])
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to update bill' })
    }
  }

  // Handle adding a new category inline
  const handleAddNewCategory = async () => {
    if (!newCategoryName.trim()) return
    
    setAddingCategory(true)
    try {
      const newCategory = await apiCall('/expense-categories', 'POST', {
        name: newCategoryName.trim(),
        scope: formData.scope,
        societyId: formData.scope === 'SOCIETY' ? formData.societyId : null
      })
      
      // Refresh categories list
      await loadExpenseCategories()
      
      // Auto-select the new category
      setFormData({ ...formData, category: newCategory.name })
      
      // Reset inline form
      setShowAddCategory(false)
      setNewCategoryName('')
      
      toast({ title: 'Success', description: `Category "${newCategory.name}" created!` })
    } catch (error) {
      console.error('Failed to add category:', error)
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to add category' })
    } finally {
      setAddingCategory(false)
    }
  }

  const handleExportCSV = () => {
    const headers = ['Date', 'Scope', 'Society', 'Account', 'Category', 'Vendor/Party', 'Mode', 'Amount', 'Remark']
    const rows = expenses.map(e => [
      e.txnDate,
      e.scope || 'SOCIETY',
      societies.find(s => s.id === e.societyId)?.name || '-',
      accounts.find(a => a.id === e.accountId)?.name || '-',
      e.referenceNo || '-',
      e.partyName || '-',
      e.paymentMode || '-',
      e.amount,
      e.remark || ''
    ])
    
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `expenses_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const resetForm = () => {
    setFormData({
      scope: activeTab === 'society' ? 'SOCIETY' : 'COMPANY',
      societyId: selectedSociety,
      accountId: '',
      amount: '',
      expenseDate: new Date().toISOString().split('T')[0],
      category: '',
      vendorName: '',
      paymentMode: 'Cash',
      remark: ''
    })
  }

  const openAddExpense = () => {
    resetForm()
    setEditingExpense(null)
    setShowAddExpense(true)
  }

  const openEditExpense = (expense) => {
    setFormData({
      scope: expense.scope || 'SOCIETY',
      societyId: expense.societyId || '',
      accountId: expense.accountId || '',
      amount: expense.amount?.toString() || '',
      expenseDate: expense.txnDate || new Date().toISOString().split('T')[0],
      category: expense.referenceNo || '',
      vendorName: expense.partyName || '',
      paymentMode: expense.paymentMode || 'Cash',
      remark: expense.remark || ''
    })
    setEditingExpense(expense)
    setShowAddExpense(true)
  }

  const setDateFilter = (preset) => {
    const today = new Date()
    let startDate = ''
    let endDate = today.toISOString().split('T')[0]
    
    switch (preset) {
      case 'today':
        startDate = endDate
        break
      case 'week':
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
        startDate = weekAgo.toISOString().split('T')[0]
        break
      case 'month':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
        break
      case 'all':
        startDate = ''
        endDate = ''
        break
    }
    
    setFilters({ ...filters, startDate, endDate })
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <AppShell user={user} onLogout={handleLogout} searchPlaceholder="Search expenses...">
      <Toaster />

      <div className="space-y-4">
        {/* Header — vendor/margin ledger style */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-red-100 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Expense Ledger</h2>
              <p className="text-sm text-slate-500">Society &amp; Company Expenses — Payments &amp; Breakdowns</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activeTab === 'society' && (
              <Select value={selectedSociety} onValueChange={setSelectedSociety}>
                <SelectTrigger className="w-56 h-9">
                  <SelectValue placeholder="Select Society" />
                </SelectTrigger>
                <SelectContent>
                  {societies.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" onClick={loadExpenses} className="h-9">
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="h-9">
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
            <Button variant="outline" onClick={openAddBill} className="h-9">
              <Receipt className="w-4 h-4 mr-2" /> Add Bill
            </Button>
            <Button onClick={openAddExpense} className="h-9">
              <Plus className="w-4 h-4 mr-2" /> Quick Expense
            </Button>
          </div>
        </div>

        {/* Scope tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="society" className="gap-2">
              <Building2 className="w-4 h-4" />
              Society Expenses
            </TabsTrigger>
            <TabsTrigger value="company" className="gap-2">
              <Wallet className="w-4 h-4" />
              Company Expenses
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Summary cards — ledger-style compact colored grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <Card className="bg-red-50/60">
            <CardContent className="p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-red-700">Total Paid</p>
              <p className="text-2xl font-bold text-red-700 mt-1">₹{fmt(summary.totalExpense)}</p>
            </CardContent>
          </Card>
          <Card className="bg-amber-50/60">
            <CardContent className="p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-amber-700">Pending</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">₹{fmt(summary.totalPending || 0)}</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50/60">
            <CardContent className="p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-green-700">Cash Expense</p>
              <p className="text-2xl font-bold text-green-700 mt-1">₹{fmt(summary.cashExpense)}</p>
            </CardContent>
          </Card>
          <Card className="bg-blue-50/60">
            <CardContent className="p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-blue-700">Bank / Other</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">₹{fmt(summary.bankExpense)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-slate-500"># Transactions</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{summary.transactionCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filter bar — ledger style */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Filters</span>
              <div className="ml-auto flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setDateFilter('today')}>Today</Button>
                <Button variant="outline" size="sm" onClick={() => setDateFilter('week')}>This Week</Button>
                <Button variant="outline" size="sm" onClick={() => setDateFilter('month')}>This Month</Button>
                <Button variant="outline" size="sm" onClick={() => setDateFilter('all')}>All</Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFilters({
                    startDate: '',
                    endDate: '',
                    accountId: 'all',
                    category: 'all',
                    paymentMode: 'all',
                    vendorSearch: ''
                  })}
                >
                  <X className="w-4 h-4 mr-1" />
                  Clear
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <Label className="text-xs text-gray-500">From Date</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={filters.startDate}
                  onChange={e => setFilters({ ...filters, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500">To Date</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={filters.endDate}
                  onChange={e => setFilters({ ...filters, endDate: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500">Account</Label>
                <Select value={filters.accountId} onValueChange={v => setFilters({ ...filters, accountId: v })}>
                  <SelectTrigger className="h-9">
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
                <Label className="text-xs text-gray-500">Category</Label>
                <Select value={filters.category} onValueChange={v => setFilters({ ...filters, category: v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {expenseCategories.map(c => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-500">Payment Mode</Label>
                <Select value={filters.paymentMode} onValueChange={v => setFilters({ ...filters, paymentMode: v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All Modes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Modes</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    <SelectItem value="UPI">UPI</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                    <SelectItem value="Card">Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-500">Search Vendor / Remark</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search..."
                    className="h-9 pl-8"
                    value={filters.vendorSearch}
                    onChange={e => setFilters({ ...filters, vendorSearch: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Expense table card */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : expenses.length === 0 ? (
              <div className="text-center py-12">
                <MinusCircle className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                <p className="text-gray-500">No expenses found</p>
                <p className="text-sm text-gray-400">Click &ldquo;Add Expense&rdquo; to create one</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Scope</TableHead>
                      {activeTab === 'company' && <TableHead>Society</TableHead>}
                      <TableHead>Account</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Vendor / Party</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Remark</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map(expense => {
                      const billType = detectBillType(expense)
                      const isPending = expense._isBill || expense.status === 'PENDING' || expense.status === 'PARTIAL'
                      const isBillLinked = !!billType  // any row tied to a bill (paid or pending)
                      const isExpenseBill = billType === 'expense' && (expense._isBill || expense.sourceType === 'EXPENSE_PAYMENT')
                      const statusVariant = expense.status === 'PAID' ? 'default' : expense.status === 'PARTIAL' ? 'secondary' : 'destructive'
                      return (
                        <TableRow key={expense.id} className={`cursor-pointer hover:bg-gray-50 ${isPending ? 'bg-orange-50/40' : ''}`} onClick={() => setViewingExpense(expense)}>
                          <TableCell>{expense.txnDate}</TableCell>
                          <TableCell>
                            <Badge variant={expense.scope === 'COMPANY' ? 'secondary' : 'outline'}>
                              {expense.scope || 'SOCIETY'}
                            </Badge>
                          </TableCell>
                          {activeTab === 'company' && (
                            <TableCell>{societies.find(s => s.id === expense.societyId)?.name || '-'}</TableCell>
                          )}
                          <TableCell>{accounts.find(a => a.id === expense.accountId)?.name || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{expense.referenceNo || '-'}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">{expense.partyName || '-'}</TableCell>
                          <TableCell>{expense.paymentMode}</TableCell>
                          <TableCell className="text-right">
                            <div className={`font-medium ${expense.status === 'PAID' ? 'text-red-600' : 'text-slate-900'}`}>
                              ₹{fmt(expense.amount)}
                            </div>
                            {isPending && expense.balance > 0 && (
                              <div className="text-xs text-orange-600">₹{fmt(expense.balance)} pending</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant}>{expense.status || 'PAID'}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-slate-500" title={expense.remark}>
                            {expense.remark || '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              {/* Payments button shows the bill context for ANY bill-linked row
                                  (pending expense bill, paid expense/margin/commission payment,
                                  or a quick expense rendered as a 1-payment ledger). */}
                              {(isBillLinked || expense.sourceType === 'QUICK_EXPENSE') && (
                                <Button variant="outline" size="sm" onClick={() => openBillPayments(expense)}>
                                  <CreditCard className="w-4 h-4 mr-1" /> Payments
                                </Button>
                              )}
                              {isExpenseBill ? (
                                <>
                                  <Button variant="ghost" size="sm" onClick={() => openEditBill(expense)} title="Edit bill">
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleDeleteBill(expense)} title="Delete bill">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </>
                              ) : (!isBillLinked || expense.sourceType === 'QUICK_EXPENSE') ? (
                                // Quick expenses look bill-linked (detectBillType returns 'expense')
                                // because they live in the same view as bill payments, but the
                                // underlying txn is a standalone OUT entry with no ExpenseBill
                                // record — same edit/delete flow as a free expense applies.
                                <>
                                  <Button variant="ghost" size="sm" onClick={() => openEditExpense(expense)}>
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleDeleteExpense(expense)}>
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>

                {/* Pagination */}
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-gray-500">
                    Showing {expenses.length} of {summary.transactionCount} expenses
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(p => p - 1)}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm">Page {currentPage} of {totalPages}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage(p => p + 1)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Expense Dialog — centered modal, matching the other Add forms */}
      <Dialog open={showAddExpense} onOpenChange={(open) => { setShowAddExpense(open); if (!open) setEditingExpense(null) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MinusCircle className="w-5 h-5 text-red-600" />
              {editingExpense ? 'Edit Expense' : 'Add New Expense'}
            </DialogTitle>
            <DialogDescription>
              {editingExpense ? 'Update the expense details' : 'Record a new expense transaction'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Expense Scope */}
            <div>
              <Label>Expense Scope *</Label>
              <Select 
                value={formData.scope} 
                onValueChange={v => setFormData({...formData, scope: v, societyId: v === 'SOCIETY' ? selectedSociety : ''})}
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
                {formData.scope === 'SOCIETY' ? 'Expense will be recorded under the selected society' : 'Expense will be recorded at company level'}
              </p>
            </div>

            {/* Society Selection (if Society scope) */}
            {formData.scope === 'SOCIETY' && (
              <div>
                <Label>Society *</Label>
                <Select 
                  value={formData.societyId} 
                  onValueChange={v => setFormData({...formData, societyId: v})}
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
                value={formData.accountId} 
                onValueChange={v => setFormData({...formData, accountId: v})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts
                    .filter(a => {
                      const scopeOk = formData.scope === 'COMPANY'
                        ? (a.scope === 'GLOBAL' || !a.societyId)
                        : (a.scope === 'GLOBAL' || !a.societyId || a.societyId === formData.societyId)
                      const typeOk = formData.paymentMode === 'Cash' ? a.type === 'CASH' : a.type === 'BANK'
                      return scopeOk && typeOk
                    })
                    .map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({a.type}) - ₹{fmt(a.currentBalance || 0)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Amount */}
              <div>
                <Label>Amount *</Label>
                <Input
                  type="number"
                  placeholder="Enter amount"
                  min="1"
                  step="1"
                  value={formData.amount}
                  onChange={e => setFormData({...formData, amount: e.target.value})}
                  className={formData.amount && (isNaN(Number(formData.amount)) || Number(formData.amount) <= 0) ? 'border-red-500' : ''}
                />
                {formData.amount && (isNaN(Number(formData.amount)) || Number(formData.amount) <= 0) && (
                  <p className="text-xs text-red-500 mt-1">Amount must be positive</p>
                )}
              </div>

              {/* Date */}
              <div>
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={formData.expenseDate}
                  onChange={e => setFormData({...formData, expenseDate: e.target.value})}
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <Label>Category *</Label>
              <Select 
                value={formData.category} 
                onValueChange={v => {
                  if (v === '__ADD_NEW__') {
                    setShowAddCategory(true)
                  } else {
                    setFormData({...formData, category: v})
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
              {showAddCategory && (
                <div className="mt-2 p-3 border rounded-lg bg-blue-50 space-y-2">
                  <Label className="text-xs text-blue-700">New Category Name</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter category name"
                      value={newCategoryName}
                      onChange={e => setNewCategoryName(e.target.value)}
                      className="flex-1 h-8 text-sm"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newCategoryName.trim()) {
                          handleAddNewCategory()
                        } else if (e.key === 'Escape') {
                          setShowAddCategory(false)
                          setNewCategoryName('')
                        }
                      }}
                    />
                    <Button 
                      size="sm" 
                      className="h-8 px-3 bg-blue-600 hover:bg-blue-700"
                      disabled={!newCategoryName.trim() || addingCategory}
                      onClick={handleAddNewCategory}
                    >
                      {addingCategory ? 'Saving...' : 'Save'}
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-8 px-3"
                      onClick={() => {
                        setShowAddCategory(false)
                        setNewCategoryName('')
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Vendor/Party */}
              <div>
                <Label>Vendor/Party</Label>
                <Input
                  placeholder="Optional"
                  value={formData.vendorName}
                  onChange={e => setFormData({...formData, vendorName: e.target.value})}
                />
              </div>

              {/* Payment Mode */}
              <div>
                <Label>Payment Mode</Label>
                <Select
                  value={formData.paymentMode}
                  onValueChange={v => setFormData({...formData, paymentMode: v, accountId: ''})}
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
                value={formData.remark}
                onChange={e => setFormData({...formData, remark: e.target.value})}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddExpense(false); setEditingExpense(null); }}>
              Cancel
            </Button>
            <Button onClick={handleAddExpense} className="bg-red-600 hover:bg-red-700">
              <MinusCircle className="w-4 h-4 mr-2" />
              {editingExpense ? 'Update Expense' : 'Save Expense'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Add/Edit Bill Dialog — centered modal, matching other Add forms ===== */}
      <Dialog open={showAddBill} onOpenChange={(open) => { setShowAddBill(open); if (!open) setEditingBill(null) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-orange-600" />
              {editingBill ? 'Edit Expense Bill' : 'Add Expense Bill'}
            </DialogTitle>
            <DialogDescription>
              {editingBill ? 'Update bill details' : 'Record an expense bill — pay it later via Payments'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Scope *</Label>
              <Select
                value={billForm.scope}
                onValueChange={v => setBillForm({ ...billForm, scope: v, societyId: v === 'SOCIETY' ? selectedSociety : '' })}
                disabled={!!editingBill}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SOCIETY">Society</SelectItem>
                  <SelectItem value="COMPANY">Company</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {billForm.scope === 'SOCIETY' && (
              <div>
                <Label>Society *</Label>
                <Select value={billForm.societyId} onValueChange={v => setBillForm({ ...billForm, societyId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select society" /></SelectTrigger>
                  <SelectContent>
                    {societies.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Category *</Label>
              <Select value={billForm.category} onValueChange={v => setBillForm({ ...billForm, category: v })}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {expenseCategories.map(c => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Bill Amount *</Label>
                <Input
                  type="number"
                  placeholder="0"
                  min="1"
                  step="1"
                  value={billForm.billAmount}
                  onChange={e => setBillForm({ ...billForm, billAmount: e.target.value })}
                />
              </div>
              <div>
                <Label>Bill Date *</Label>
                <Input
                  type="date"
                  value={billForm.billDate}
                  onChange={e => setBillForm({ ...billForm, billDate: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Vendor / Party</Label>
              <Input
                placeholder="Optional"
                value={billForm.vendorName}
                onChange={e => setBillForm({ ...billForm, vendorName: e.target.value })}
              />
            </div>

            <div>
              <Label>Description</Label>
              <Input
                placeholder="Optional note"
                value={billForm.description}
                onChange={e => setBillForm({ ...billForm, description: e.target.value })}
              />
            </div>

            {!editingBill && (
              <div className={`rounded-md border p-3 space-y-3 ${billForm.payNow ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200'}`}>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-emerald-600"
                    checked={billForm.payNow}
                    onChange={(e) => setBillForm({ ...billForm, payNow: e.target.checked })}
                  />
                  <span className="font-medium">Payment Made Now</span>
                  <span className="text-sm text-slate-500">— record initial/full payment with this bill</span>
                </label>
                {billForm.payNow && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Paid Amount *</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={billForm.initialAmount}
                          onChange={(e) => setBillForm({ ...billForm, initialAmount: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Payment Mode *</Label>
                        <Select
                          value={billForm.initialPaymentMode}
                          onValueChange={(v) => setBillForm({ ...billForm, initialPaymentMode: v, initialAccountId: '' })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
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
                    <div>
                      <Label>From Account *</Label>
                      <Select
                        value={billForm.initialAccountId}
                        onValueChange={(v) => setBillForm({ ...billForm, initialAccountId: v })}
                      >
                        <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                        <SelectContent>
                          {accounts
                            .filter(a => billForm.initialPaymentMode === 'Cash' ? a.type === 'CASH' : a.type === 'BANK')
                            .map(a => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name} ({a.type}) — ₹{fmt(a.currentBalance || 0)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Reference No.</Label>
                        <Input
                          placeholder="Txn / Ref"
                          value={billForm.initialReferenceNo}
                          onChange={(e) => setBillForm({ ...billForm, initialReferenceNo: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Remark</Label>
                        <Input
                          value={billForm.initialRemark}
                          onChange={(e) => setBillForm({ ...billForm, initialRemark: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Live summary */}
            {!editingBill && (
              <div className="grid grid-cols-3 gap-3 rounded-md border bg-slate-50 p-3 text-center">
                {(() => {
                  const total = parseFloat(billForm.billAmount) || 0
                  const paid = billForm.payNow ? (parseFloat(billForm.initialAmount) || 0) : 0
                  const pending = Math.max(0, total - paid)
                  return (
                    <>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">Bill Amount</p>
                        <p className="text-lg font-bold text-blue-700">₹{fmt(total)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">Paid Now</p>
                        <p className="text-lg font-bold text-emerald-700">₹{fmt(paid)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">Pending</p>
                        <p className={`text-lg font-bold ${pending > 0 ? 'text-red-700' : 'text-emerald-700'}`}>₹{fmt(pending)}</p>
                      </div>
                    </>
                  )
                })()}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddBill(false); setEditingBill(null) }}>
              Cancel
            </Button>
            <Button onClick={handleSaveBill}>
              <Receipt className="w-4 h-4 mr-2" />
              {editingBill ? 'Update Bill' : 'Save Bill'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Bill Payments Drawer (vaul, slides up — vendor-ledger style) ===== */}
      <Drawer open={!!paymentsBill} onOpenChange={(open) => { if (!open) { setPaymentsBill(null); setBillPayments([]); setDrawerAction(null) } }}>
        <DrawerContent className="max-h-[95vh]">
          <DrawerHeader className="pb-2 max-w-4xl mx-auto w-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => { setPaymentsBill(null); setBillPayments([]); setDrawerAction(null) }}>
                  <X className="w-4 h-4" />
                </Button>
                <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-left">
                  <DrawerTitle className="text-lg">{paymentsBill?.vendorName || paymentsBill?.partyName || 'Bill'}</DrawerTitle>
                  <DrawerDescription>
                    {paymentsBill?.category || '-'} · {paymentsBill?.billDate || '-'}
                  </DrawerDescription>
                </div>
              </div>
            </div>
          </DrawerHeader>

          {paymentsBill && (
            <div className="px-4 pb-6 overflow-y-auto space-y-4 max-w-4xl mx-auto w-full">
              {/* Hero summary — vendor-ledger style gradient card */}
              <div className={`rounded-xl p-5 text-white shadow ${
                (paymentsBill.balance ?? Math.max(0, (paymentsBill.billAmount || paymentsBill.amount || 0) - (paymentsBill.totalPaid || paymentsBill.paidAmount || 0))) > 0
                  ? 'bg-gradient-to-r from-orange-500 to-red-500'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-500'
              }`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider opacity-80 flex items-center gap-2">
                      <Receipt className="w-4 h-4" /> Bill Summary
                    </p>
                    <p className="text-3xl font-bold mt-1">₹{fmt(paymentsBill.billAmount ?? paymentsBill.amount ?? 0)}</p>
                    <p className="text-sm opacity-90 mt-0.5">
                      {paymentsBill.vendorName || paymentsBill.partyName || 'Bill'} · {paymentsBill.category || '-'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wider opacity-80">Status</p>
                    <p className="text-2xl font-bold mt-1">{paymentsBill.status || 'PENDING'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/20">
                  <div>
                    <p className="text-xs uppercase tracking-wider opacity-80">Bill Amount</p>
                    <p className="text-lg font-bold mt-0.5">₹{fmt(paymentsBill.billAmount ?? paymentsBill.amount ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider opacity-80">Paid</p>
                    <p className="text-lg font-bold mt-0.5">₹{fmt(paymentsBill.totalPaid ?? paymentsBill.paidAmount ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider opacity-80">Balance</p>
                    <p className="text-lg font-bold mt-0.5">
                      ₹{fmt(paymentsBill.balance ?? Math.max(0, (paymentsBill.billAmount || paymentsBill.amount || 0) - (paymentsBill.totalPaid || paymentsBill.paidAmount || 0)))}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action buttons — vendor-ledger style. Hidden for read-only
                  views (margin/commission bills are managed from their own
                  ledger pages; quick expenses are one-shot transactions). */}
              {paymentsBillType === 'expense' && !paymentsBill._quickExpense && (
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    className={`h-11 text-white font-semibold ${drawerAction === 'bill' ? 'bg-blue-700 hover:bg-blue-800 ring-2 ring-blue-300' : 'bg-blue-600 hover:bg-blue-700'}`}
                    onClick={() => setDrawerAction(drawerAction === 'bill' ? null : 'bill')}
                  >
                    <Plus className="w-4 h-4 mr-2" /> Add to Bill
                  </Button>
                  <Button
                    className={`h-11 text-white font-semibold ${drawerAction === 'payment' ? 'bg-emerald-700 hover:bg-emerald-800 ring-2 ring-emerald-300' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                    onClick={() => setDrawerAction(drawerAction === 'payment' ? null : 'payment')}
                  >
                    <CreditCard className="w-4 h-4 mr-2" /> Add Payment
                  </Button>
                </div>
              )}

              {/* Read-only banner for non-expense or quick-expense rows */}
              {(paymentsBillType !== 'expense' || paymentsBill._quickExpense) && (
                <div className="rounded-md border bg-slate-50 p-3 text-sm text-slate-600">
                  {paymentsBill._quickExpense
                    ? 'This is a one-shot expense — paid in full when recorded.'
                    : paymentsBillType === 'margin'
                      ? 'Margin bills are managed from the Margin Ledger page.'
                      : 'Commission bills are managed from the Commissions tab.'}
                </div>
              )}

              {/* Add to Bill panel — bumps the existing bill's amount in place. */}
              {drawerAction === 'bill' && (
                <div className="rounded-md border p-4 space-y-3 bg-blue-50/40">
                  <h4 className="text-sm font-semibold text-slate-700">Add to Bill Amount</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Additional Amount *</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="e.g. 10000"
                        value={billAddForm.addAmount}
                        onChange={e => setBillAddForm({ ...billAddForm, addAmount: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Date *</Label>
                      <Input
                        type="date"
                        value={billAddForm.addDate}
                        onChange={e => setBillAddForm({ ...billAddForm, addDate: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className={`rounded-md border p-3 space-y-3 ${billAddForm.payNow ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-white'}`}>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-emerald-600"
                        checked={billAddForm.payNow}
                        onChange={(e) => setBillAddForm({ ...billAddForm, payNow: e.target.checked })}
                      />
                      <span className="font-medium">Pay some of this now</span>
                      <span className="text-sm text-slate-500">— record a payment along with the addition</span>
                    </label>
                    {billAddForm.payNow && (
                      <div className="space-y-3 pt-1">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Paid Now *</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="e.g. 5000"
                              value={billAddForm.paidAmount}
                              onChange={e => setBillAddForm({ ...billAddForm, paidAmount: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>Payment Mode *</Label>
                            <Select
                              value={billAddForm.paymentMode}
                              onValueChange={v => setBillAddForm({ ...billAddForm, paymentMode: v, accountId: '' })}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
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
                        <div>
                          <Label>From Account *</Label>
                          <Select
                            value={billAddForm.accountId}
                            onValueChange={v => setBillAddForm({ ...billAddForm, accountId: v })}
                          >
                            <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                            <SelectContent>
                              {accounts
                                .filter(a => billAddForm.paymentMode === 'Cash' ? a.type === 'CASH' : a.type === 'BANK')
                                .map(a => (
                                  <SelectItem key={a.id} value={a.id}>
                                    {a.name} ({a.type}) — ₹{fmt(a.currentBalance || 0)}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Reference No.</Label>
                            <Input
                              placeholder="Txn / Ref"
                              value={billAddForm.referenceNo}
                              onChange={e => setBillAddForm({ ...billAddForm, referenceNo: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>Remark</Label>
                            <Input
                              value={billAddForm.remark}
                              onChange={e => setBillAddForm({ ...billAddForm, remark: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Live preview — combined bill numbers after the addition */}
                  {(() => {
                    const cur = paymentsBill.billAmount ?? paymentsBill.amount ?? 0
                    const paidAlready = paymentsBill.totalPaid ?? paymentsBill.paidAmount ?? 0
                    const delta = parseFloat(billAddForm.addAmount) || 0
                    const payNow = billAddForm.payNow ? (parseFloat(billAddForm.paidAmount) || 0) : 0
                    const newTotal = cur + delta
                    const newPaid = paidAlready + payNow
                    const newBalance = Math.max(0, newTotal - newPaid)
                    return (
                      <div className="grid grid-cols-3 gap-3 rounded-md border bg-white p-3 text-center">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-500">New Bill Amount</p>
                          <p className="text-base font-bold text-blue-700">₹{fmt(newTotal)}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-500">Total Paid</p>
                          <p className="text-base font-bold text-emerald-700">₹{fmt(newPaid)}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-500">New Balance</p>
                          <p className={`text-base font-bold ${newBalance > 0 ? 'text-red-700' : 'text-emerald-700'}`}>₹{fmt(newBalance)}</p>
                        </div>
                      </div>
                    )
                  })()}

                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" className="flex-1" onClick={() => setDrawerAction(null)}>Cancel</Button>
                    <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={handleAddToBill}>
                      <Plus className="w-4 h-4 mr-2" /> Add to Bill
                    </Button>
                  </div>
                </div>
              )}

              {/* Payment ledger */}
              <div className="rounded-xl border bg-white overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-slate-500" />
                    <h4 className="text-sm font-semibold text-slate-700">Bill Activity</h4>
                    <span className="text-xs text-slate-500">({billPayments.length})</span>
                  </div>
                  <Badge variant="outline" className="font-medium">
                    Total Paid: ₹{fmt(paymentsBill.totalPaid ?? paymentsBill.paidAmount ?? 0)}
                  </Badge>
                </div>
                {paymentsLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  </div>
                ) : billPayments.length === 0 ? (
                  <div className="text-center py-10">
                    <Receipt className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="text-sm text-gray-500">No activity yet</p>
                    <p className="text-xs text-gray-400">Use &ldquo;Add to Bill&rdquo; or &ldquo;Add Payment&rdquo; above</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Mode</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {billPayments.map(p => {
                        const isAddition = p.type === 'ADDITION'
                        const isWithdrawal = p.type === 'WITHDRAWAL'
                        return (
                          <TableRow key={p.id} className={isAddition ? 'bg-blue-50/40' : isWithdrawal ? 'bg-orange-50/40' : ''}>
                            <TableCell className="font-medium">{p.paymentDate}</TableCell>
                            <TableCell>
                              {isAddition ? (
                                <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Bill Add</Badge>
                              ) : isWithdrawal ? (
                                <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">Withdrawal</Badge>
                              ) : (
                                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Payment</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {isAddition ? <span className="text-slate-400">—</span> : <Badge variant="outline">{p.paymentMode}</Badge>}
                            </TableCell>
                            <TableCell className="text-slate-600">
                              {isAddition ? <span className="text-slate-400">—</span> : (accounts.find(a => a.id === p.accountId)?.name || '-')}
                            </TableCell>
                            <TableCell className="text-slate-500 text-sm">{p.referenceNo || '-'}</TableCell>
                            <TableCell className={`text-right font-semibold ${isAddition ? 'text-blue-700' : isWithdrawal ? 'text-orange-700' : 'text-emerald-700'}`}>
                              {isAddition ? '+' : isWithdrawal ? '−' : ''}₹{fmt(p.amount)}
                            </TableCell>
                            <TableCell>
                              {paymentsBillType === 'expense' && !p._quickExpense && (
                                <div className="flex items-center justify-end gap-0.5">
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Edit" onClick={() => openEditBillPayment(p)}>
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <Button variant="ghost" size="sm" className="text-red-600 h-8 w-8 p-0" title="Delete" onClick={() => handleDeleteBillPayment(p.id)}>
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* Add payment form */}
              {drawerAction === 'payment' && (paymentsBill.balance ?? Math.max(0, (paymentsBill.billAmount || paymentsBill.amount || 0) - (paymentsBill.totalPaid || paymentsBill.paidAmount || 0))) > 0 && (
                <div className="rounded-md border p-4 space-y-3 bg-emerald-50/40">
                  <h4 className="text-sm font-semibold text-slate-700">Add Payment</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Amount *</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={paymentForm.amount}
                        onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Date *</Label>
                      <Input
                        type="date"
                        value={paymentForm.paymentDate}
                        onChange={e => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Payment Mode *</Label>
                      <Select
                        value={paymentForm.paymentMode}
                        onValueChange={v => setPaymentForm({ ...paymentForm, paymentMode: v, accountId: '' })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Cash">Cash</SelectItem>
                          <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                          <SelectItem value="UPI">UPI</SelectItem>
                          <SelectItem value="Cheque">Cheque</SelectItem>
                          <SelectItem value="Card">Card</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>From Account *</Label>
                      <Select
                        value={paymentForm.accountId}
                        onValueChange={v => setPaymentForm({ ...paymentForm, accountId: v })}
                      >
                        <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                        <SelectContent>
                          {accounts
                            .filter(a => paymentForm.paymentMode === 'Cash' ? a.type === 'CASH' : a.type === 'BANK')
                            .map(a => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name} ({a.type}) — ₹{fmt(a.currentBalance || 0)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Reference No.</Label>
                      <Input
                        placeholder="Txn / Ref"
                        value={paymentForm.referenceNo}
                        onChange={e => setPaymentForm({ ...paymentForm, referenceNo: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Remark</Label>
                      <Input
                        value={paymentForm.remark}
                        onChange={e => setPaymentForm({ ...paymentForm, remark: e.target.value })}
                      />
                    </div>
                  </div>
                  <Button onClick={handleAddBillPayment} className="w-full">
                    <Plus className="w-4 h-4 mr-2" /> Add Payment
                  </Button>
                </div>
              )}
            </div>
          )}
        </DrawerContent>
      </Drawer>

      {/* Edit Bill Activity row — payment / addition / withdrawal */}
      <Dialog open={!!editingPayment} onOpenChange={(open) => { if (!open) setEditingPayment(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Edit {editingPayment?.type === 'ADDITION' ? 'Bill Addition' : editingPayment?.type === 'WITHDRAWAL' ? 'Withdrawal' : 'Payment'}
            </DialogTitle>
            <DialogDescription>
              Updating reposts the underlying daybook txn so balances stay in sync.
            </DialogDescription>
          </DialogHeader>
          {editingPayment && (
            <div className="grid grid-cols-2 gap-3 py-2">
              <div>
                <Label>Amount *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editPaymentForm.amount}
                  onChange={e => setEditPaymentForm({ ...editPaymentForm, amount: e.target.value })}
                />
              </div>
              <div>
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={editPaymentForm.paymentDate}
                  onChange={e => setEditPaymentForm({ ...editPaymentForm, paymentDate: e.target.value })}
                />
              </div>
              {/* ADDITION rows don't touch an account, so hide the mode + account
                  fields for them — backend null-outs accountId on the way through. */}
              {editingPayment.type !== 'ADDITION' && (
                <>
                  <div>
                    <Label>Payment Mode *</Label>
                    <Select
                      value={editPaymentForm.paymentMode}
                      onValueChange={v => setEditPaymentForm({ ...editPaymentForm, paymentMode: v, accountId: '' })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                        <SelectItem value="UPI">UPI</SelectItem>
                        <SelectItem value="Cheque">Cheque</SelectItem>
                        <SelectItem value="Card">Card</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Account *</Label>
                    <Select
                      value={editPaymentForm.accountId}
                      onValueChange={v => setEditPaymentForm({ ...editPaymentForm, accountId: v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>
                        {accounts
                          .filter(a => editPaymentForm.paymentMode === 'Cash' ? a.type === 'CASH' : a.type === 'BANK')
                          .map(a => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name} ({a.type}) — ₹{fmt(a.currentBalance || 0)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              <div className="col-span-2">
                <Label>Reference No.</Label>
                <Input
                  value={editPaymentForm.referenceNo}
                  onChange={e => setEditPaymentForm({ ...editPaymentForm, referenceNo: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label>Remark</Label>
                <Input
                  value={editPaymentForm.remark}
                  onChange={e => setEditPaymentForm({ ...editPaymentForm, remark: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPayment(null)}>Cancel</Button>
            <Button onClick={handleSaveBillPaymentEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Expense Details Sheet */}
      <Sheet open={!!viewingExpense} onOpenChange={() => setViewingExpense(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Expense Details</SheetTitle>
          </SheetHeader>
          {viewingExpense && (
            <div className="space-y-4 py-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-gray-500">Date</Label>
                  <p className="font-medium">{viewingExpense.txnDate}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Amount</Label>
                  <p className="font-medium text-red-600">₹{fmt(viewingExpense.amount)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-gray-500">Scope</Label>
                  <p className="font-medium">{viewingExpense.scope || 'SOCIETY'}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Society</Label>
                  <p className="font-medium">{societies.find(s => s.id === viewingExpense.societyId)?.name || '-'}</p>
                </div>
              </div>
              <div>
                <Label className="text-xs text-gray-500">Account</Label>
                <p className="font-medium">{accounts.find(a => a.id === viewingExpense.accountId)?.name || '-'}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-gray-500">Category</Label>
                  <p className="font-medium">{viewingExpense.referenceNo || '-'}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Vendor/Party</Label>
                  <p className="font-medium">{viewingExpense.partyName || '-'}</p>
                </div>
              </div>
              <div>
                <Label className="text-xs text-gray-500">Payment Mode</Label>
                <p className="font-medium">{viewingExpense.paymentMode}</p>
              </div>
              <div>
                <Label className="text-xs text-gray-500">Remark</Label>
                <p className="font-medium">{viewingExpense.remark || '-'}</p>
              </div>
              <div>
                <Label className="text-xs text-gray-500">Transaction ID</Label>
                <p className="font-mono text-xs">{viewingExpense.id}</p>
              </div>
              
              <div className="flex gap-2 pt-4">
                <Button variant="outline" className="flex-1" onClick={() => { openEditExpense(viewingExpense); setViewingExpense(null); }}>
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Button>
                <Button variant="destructive" className="flex-1" onClick={() => { handleDeleteExpense(viewingExpense); setViewingExpense(null); }}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AppShell>
  )
}
