'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from '@/components/ui/sheet'
import { Toaster } from '@/components/ui/toaster'
import { useToast } from '@/hooks/use-toast'
import { Building2, ArrowLeft, Plus, Download, Search, Filter, Calendar, Wallet, CreditCard, Receipt, Trash2, Edit, Eye, RefreshCw, MinusCircle, X, ChevronLeft, ChevronRight } from 'lucide-react'
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
      loadExpenses()
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
      loadExpenses()
    } catch (error) {
      console.error('Failed to delete expense:', error)
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to delete expense' })
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

      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Expenses</h1>
          <p className="text-sm text-slate-500 mt-0.5">Society & company expenses, payments and breakdowns</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
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
          <Button onClick={openAddExpense} className="h-9 gradient-bg text-white shadow-md hover:opacity-95">
            <Plus className="w-4 h-4 mr-2" /> Add Expense
          </Button>
        </div>
      </div>

      <div>
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
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

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Expense</p>
                  <p className="text-2xl font-bold text-red-600">₹{fmt(summary.totalExpense)}</p>
                </div>
                <MinusCircle className="w-8 h-8 text-red-200" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Cash Expense</p>
                  <p className="text-2xl font-bold text-green-600">₹{fmt(summary.cashExpense)}</p>
                </div>
                <Wallet className="w-8 h-8 text-green-200" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Bank/Other</p>
                  <p className="text-2xl font-bold text-blue-600">₹{fmt(summary.bankExpense)}</p>
                </div>
                <CreditCard className="w-8 h-8 text-blue-200" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500"># Transactions</p>
                  <p className="text-2xl font-bold">{summary.transactionCount}</p>
                </div>
                <Receipt className="w-8 h-8 text-gray-200" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-end gap-4">
              {/* Date Presets */}
              <div>
                <Label className="text-xs text-gray-500">Quick Date</Label>
                <div className="flex gap-1 mt-1">
                  <Button variant="outline" size="sm" onClick={() => setDateFilter('today')}>Today</Button>
                  <Button variant="outline" size="sm" onClick={() => setDateFilter('week')}>This Week</Button>
                  <Button variant="outline" size="sm" onClick={() => setDateFilter('month')}>This Month</Button>
                  <Button variant="outline" size="sm" onClick={() => setDateFilter('all')}>All</Button>
                </div>
              </div>
              
              {/* Custom Date Range */}
              <div>
                <Label className="text-xs text-gray-500">From</Label>
                <Input 
                  type="date" 
                  value={filters.startDate}
                  onChange={e => setFilters({...filters, startDate: e.target.value})}
                  className="w-36"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-500">To</Label>
                <Input 
                  type="date" 
                  value={filters.endDate}
                  onChange={e => setFilters({...filters, endDate: e.target.value})}
                  className="w-36"
                />
              </div>
              
              {/* Account Filter */}
              <div>
                <Label className="text-xs text-gray-500">Account</Label>
                <Select value={filters.accountId} onValueChange={v => setFilters({...filters, accountId: v})}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Accounts</SelectItem>
                    {accounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Category Filter */}
              <div>
                <Label className="text-xs text-gray-500">Category</Label>
                <Select value={filters.category} onValueChange={v => setFilters({...filters, category: v})}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {expenseCategories.map(c => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Payment Mode Filter */}
              <div>
                <Label className="text-xs text-gray-500">Payment Mode</Label>
                <Select value={filters.paymentMode} onValueChange={v => setFilters({...filters, paymentMode: v})}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
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
              
              {/* Vendor Search */}
              <div>
                <Label className="text-xs text-gray-500">Search Vendor/Remark</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search..."
                    value={filters.vendorSearch}
                    onChange={e => setFilters({...filters, vendorSearch: e.target.value})}
                    className="pl-8 w-48"
                  />
                </div>
              </div>
              
              {/* Clear Filters */}
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
          </CardContent>
        </Card>

        {/* Expenses Table */}
        <Card>
          <CardHeader>
            <CardTitle>Expense Transactions</CardTitle>
            <CardDescription>
              {activeTab === 'society' ? `Society: ${societies.find(s => s.id === selectedSociety)?.name || 'All'}` : 'Company Level'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : expenses.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <MinusCircle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No expenses found</p>
                <p className="text-sm">Click "Add Expense" to create one</p>
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
                      <TableHead>Vendor/Party</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Remark</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map(expense => (
                      <TableRow key={expense.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setViewingExpense(expense)}>
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
                        <TableCell>{expense.partyName || '-'}</TableCell>
                        <TableCell>{expense.paymentMode}</TableCell>
                        <TableCell className="text-right font-medium text-red-600">
                          ₹{fmt(expense.amount)}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate" title={expense.remark}>
                          {expense.remark || '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" onClick={() => setViewingExpense(expense)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => openEditExpense(expense)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleDeleteExpense(expense)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                
                {/* Pagination */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
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

      {/* Add/Edit Expense Drawer */}
      <Sheet open={showAddExpense} onOpenChange={setShowAddExpense}>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <MinusCircle className="w-5 h-5 text-red-600" />
              {editingExpense ? 'Edit Expense' : 'Add New Expense'}
            </SheetTitle>
            <SheetDescription>
              {editingExpense ? 'Update the expense details' : 'Record a new expense transaction'}
            </SheetDescription>
          </SheetHeader>
          
          <div className="space-y-4 py-6">
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
          
          <SheetFooter>
            <Button variant="outline" onClick={() => { setShowAddExpense(false); setEditingExpense(null); }}>
              Cancel
            </Button>
            <Button onClick={handleAddExpense} className="bg-red-600 hover:bg-red-700">
              <MinusCircle className="w-4 h-4 mr-2" />
              {editingExpense ? 'Update Expense' : 'Save Expense'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

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
