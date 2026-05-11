'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Toaster } from '@/components/ui/toaster'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { BookOpen, ArrowLeft, Plus, Edit, Trash2, RefreshCw, Filter, X, Wallet, ArrowDownCircle, ArrowUpCircle, IndianRupee, Lock, AlertTriangle, Building2, Banknote } from 'lucide-react'
import { AppShell } from '@/components/dashboard/AppShell'
import { getDeleteOtp, refreshDeleteOtp } from '@/lib/deleteOtp'

const SOURCE_TYPE_LABELS = {
  'SALE_PAYMENT': 'Sale Payment',
  'PURCHASE_PAYMENT': 'Purchase Payment',
  'EXPENSE_PAYMENT': 'Expense Payment',
  'BROKER_COMMISSION': 'Broker Commission',
  'PARTNER_CAPITAL': 'Partner Capital',
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

// Safe number formatter
const fmt = (value) => {
  const n = Math.round((Number(value) || 0) * 100) / 100
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function DaybookPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [societies, setSocieties] = useState([])
  const [selectedSociety, setSelectedSociety] = useState(searchParams.get('societyId') || '')
  const [accounts, setAccounts] = useState([])
  const [transactions, setTransactions] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  
  // Scope: 'SOCIETY' or 'COMPANY'
  const [scope, setScope] = useState('SOCIETY')
  
  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    totalCount: 0,
    totalPages: 0
  })
  
  const [filters, setFilters] = useState({
    societyId: searchParams.get('societyId') || 'all',
    accountId: 'all',
    direction: 'all',
    sourceType: 'all',
    txnStatus: 'all', // Default to 'all' to show ALL including deleted/voided for audit trail
    startDate: '',
    endDate: ''
  })

  // Dialog states
  const [showAccountDialog, setShowAccountDialog] = useState(false)
  const [showOpeningBalanceDialog, setShowOpeningBalanceDialog] = useState(false)
  const [selectedAccountForOpening, setSelectedAccountForOpening] = useState(null)
  const [newAccount, setNewAccount] = useState({ name: '', type: 'BANK', openingAmount: 0, overdraftEnabled: false, scope: 'GLOBAL', societyId: '' })
  const [openingBalance, setOpeningBalance] = useState({ openingAmount: 0, openingDate: '' })

  const apiCall = async (endpoint, method = 'GET', body = null) => {
    const token = localStorage.getItem('token')

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

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || 'API call failed')
    }
    return data
  }

  // Check authentication
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return

    const token = localStorage.getItem('token')
    const userData = localStorage.getItem('user')
    if (token && userData) {
      setUser(JSON.parse(userData))
      setIsAuthenticated(true)
      setLoading(false)
    } else {
      // Redirect to home page for login
      router.push('/')
    }
  }, [router])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/')
  }

  // Load societies
  useEffect(() => {
    if (isAuthenticated) {
      loadSocieties()
      loadAccounts()
    }
  }, [isAuthenticated])

  // Load transactions and accounts when filters, scope, or pagination change
  useEffect(() => {
    if (isAuthenticated) {
      loadTransactions()
      loadSummary()
      loadAccounts()  // Reload accounts when society filter changes (for scope filtering)
    }
  }, [isAuthenticated, filters, scope, pagination.page, pagination.limit])

  // Update filters when society changes
  useEffect(() => {
    if (selectedSociety) {
      setFilters(f => ({ ...f, societyId: selectedSociety }))
    }
  }, [selectedSociety])

  const loadSocieties = async () => {
    try {
      const data = await apiCall('/societies')
      setSocieties(data)
      // Set default society if not set
      if (!selectedSociety && data.length > 0) {
        const defaultSocietyId = searchParams.get('societyId') || data[0].id
        setSelectedSociety(defaultSocietyId)
        setFilters(f => ({ ...f, societyId: defaultSocietyId }))
      }
    } catch (error) {
      console.error('Failed to load societies:', error)
    }
  }

  const loadAccounts = async () => {
    try {
      // Company Daybook is a roll-up across all societies + company-only,
      // so it needs every account visible (txn rows can touch any account).
      // Society Daybook stays scoped to that society's accounts.
      const params = new URLSearchParams()
      if (scope === 'COMPANY') {
        // no scope/society filter — return all accounts
      } else {
        const societyId = filters.societyId && filters.societyId !== 'all' ? filters.societyId : selectedSociety
        if (societyId) params.append('societyId', societyId)
      }
      const qs = params.toString()
      const data = await apiCall(`/accounts${qs ? `?${qs}` : ''}`)
      setAccounts(data)
    } catch (error) {
      console.error('Failed to load accounts:', error)
    }
  }

  const loadTransactions = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      
      // Add scope parameter
      params.append('scope', scope)
      
      // Add pagination parameters
      params.append('page', pagination.page.toString())
      params.append('limit', pagination.limit.toString())
      
      // Add txnStatus filter for audit trail visibility
      if (filters.txnStatus && filters.txnStatus !== 'all') {
        params.append('txnStatus', filters.txnStatus)
      } else {
        params.append('txnStatus', 'all') // Show ALL including deleted/voided
      }
      
      if (scope === 'SOCIETY' && filters.societyId && filters.societyId !== 'all') {
        params.append('societyId', filters.societyId)
      }
      if (filters.accountId && filters.accountId !== 'all') params.append('accountId', filters.accountId)
      if (filters.direction && filters.direction !== 'all') params.append('direction', filters.direction)
      if (filters.sourceType && filters.sourceType !== 'all') params.append('sourceType', filters.sourceType)
      if (filters.startDate) params.append('startDate', filters.startDate)
      if (filters.endDate) params.append('endDate', filters.endDate)
      
      const data = await apiCall(`/daybook?${params.toString()}`)
      setTransactions(data.transactions || [])
      
      // Update pagination info from server response
      if (data.pagination) {
        setPagination(prev => ({
          ...prev,
          totalCount: data.pagination.totalCount || 0,
          totalPages: data.pagination.totalPages || 0
        }))
      }
    } catch (error) {
      console.error('Failed to load transactions:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadSummary = async () => {
    try {
      const params = new URLSearchParams()
      
      // Add scope parameter
      params.append('scope', scope)
      
      if (scope === 'SOCIETY' && filters.societyId && filters.societyId !== 'all') {
        params.append('societyId', filters.societyId)
      }
      if (filters.accountId && filters.accountId !== 'all') params.append('accountId', filters.accountId)
      if (filters.startDate) params.append('startDate', filters.startDate)
      if (filters.endDate) params.append('endDate', filters.endDate)
      
      const data = await apiCall(`/daybook/summary?${params.toString()}`)
      setSummary(data)
    } catch (error) {
      console.error('Failed to load summary:', error)
    }
  }

  const handleRefresh = () => {
    loadTransactions()
    loadSummary()
    loadAccounts()
  }

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
      handleRefresh()
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
      handleRefresh()
      toast({ title: 'Success', description: 'Account deleted' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const clearFilters = () => {
    setFilters({
      societyId: selectedSociety || 'all',
      accountId: 'all',
      direction: 'all',
      sourceType: 'all',
      txnStatus: 'all',
      startDate: '',
      endDate: ''
    })
    // Reset pagination to first page when clearing filters
    setPagination(prev => ({ ...prev, page: 1 }))
  }
  
  // Pagination handlers
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, page: newPage }))
    }
  }
  
  const handleLimitChange = (newLimit) => {
    setPagination(prev => ({ ...prev, limit: parseInt(newLimit), page: 1 })) // Reset to page 1 on limit change
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
    
    setFilters(f => ({ ...f, startDate, endDate }))
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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <AppShell user={user} onLogout={handleLogout} searchPlaceholder="Search transactions...">
      <Toaster />

      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Universal Daybook</h1>
          <p className="text-sm text-slate-500 mt-0.5">Cash & bank book — society and company scoped</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Society</Label>
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
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="h-9">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        
        {/* Scope Toggle - Society vs Company */}
        <div className="flex justify-center">
          <div className="inline-flex bg-white rounded-lg border p-1 shadow-sm">
            <button
              onClick={() => setScope('SOCIETY')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                scope === 'SOCIETY' 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Building2 className="w-4 h-4" />
              Society Daybook
            </button>
            <button
              onClick={() => setScope('COMPANY')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                scope === 'COMPANY' 
                  ? 'bg-purple-100 text-purple-700' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Banknote className="w-4 h-4" />
              Company Daybook
            </button>
          </div>
        </div>
        
        {/* Header with Account Management */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Wallet className="w-5 h-5" />
                Account Balances
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
                <Button variant="outline" size="sm" onClick={handleRefresh}>
                  <RefreshCw className="w-4 h-4 mr-1" /> Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Account Balances */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {accounts.map(account => (
                <Card key={account.id} className={account.type === 'CASH' ? 'bg-green-50' : 'bg-blue-50'}>
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-gray-600">{account.name}</p>
                        <p className={`text-xl font-bold ${(account.currentBalance ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ₹{fmt(account.currentBalance)}
                        </p>
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
            <Card className={(summary.closingBalance ?? 0) >= 0 ? 'bg-blue-50' : 'bg-orange-50'}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Closing Balance</p>
                    <p className={`text-2xl font-bold ${(summary.closingBalance ?? 0) >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                      ₹{fmt(summary.closingBalance)}
                    </p>
                  </div>
                  <IndianRupee className={`w-8 h-8 ${(summary.closingBalance ?? 0) >= 0 ? 'text-blue-500' : 'text-orange-500'}`} />
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
                <Select value={filters.societyId} onValueChange={v => setFilters({...filters, societyId: v})}>
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
                <Select value={filters.accountId} onValueChange={v => setFilters({...filters, accountId: v})}>
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
                <Select value={filters.direction} onValueChange={v => setFilters({...filters, direction: v})}>
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
                <Select value={filters.sourceType} onValueChange={v => setFilters({...filters, sourceType: v})}>
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
                    <SelectItem value="LOAN_BORROWED">Loan Borrowed</SelectItem>
                    <SelectItem value="LOAN_BORROWED_REPAYMENT">Loan Repaid</SelectItem>
                    <SelectItem value="LOAN_GIVEN">Loan Given</SelectItem>
                    <SelectItem value="LOAN_GIVEN_REPAYMENT">Loan Received Back</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label className="text-xs">Transaction Status</Label>
                <Select value={filters.txnStatus} onValueChange={v => {
                  setFilters({...filters, txnStatus: v})
                  setPagination(prev => ({ ...prev, page: 1 })) // Reset to page 1 on filter change
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="All (Full Audit Trail)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">📋 All (incl. Deleted/Voided)</SelectItem>
                    <SelectItem value="active">✅ Active Only (excl. Voided)</SelectItem>
                    <SelectItem value="normal">📌 Normal Only</SelectItem>
                    <SelectItem value="reversals">🔄 Reversals Only</SelectItem>
                    <SelectItem value="edited">✏️ Edited Only</SelectItem>
                    <SelectItem value="voided">🗑️ Deleted/Voided Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label className="text-xs">From Date</Label>
                <Input type="date" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} />
              </div>
              
              <div>
                <Label className="text-xs">To Date</Label>
                <Input type="date" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Transactions Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Transactions 
                <span className="text-sm font-normal text-gray-500 ml-2">
                  (Showing {transactions.length} of {pagination.totalCount} total)
                </span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-gray-600">Rows per page:</Label>
                <Select value={pagination.limit.toString()} onValueChange={handleLimitChange}>
                  <SelectTrigger className="w-20">
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
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <RefreshCw className="w-8 h-8 mx-auto text-gray-300 animate-spin mb-2" />
                <p className="text-gray-500">Loading transactions...</p>
              </div>
            ) : transactions.length === 0 ? (
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
                      <TableHead>ID</TableHead>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Society</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
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
                      <TableRow key={txn.id} className={`${txn.isVoided ? 'bg-gray-100 opacity-60' : ''} ${txn.isReversal ? 'bg-yellow-50' : ''} ${txn.isEdited ? 'bg-blue-50' : ''}`}>
                        <TableCell className="font-mono text-xs text-gray-500">
                          #{txn.shortId || txn.id?.substring(0, 8)}
                        </TableCell>
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
                          {txn.statusBadge && (
                            <div className="flex flex-col gap-1">
                              <Badge variant={
                                txn.statusBadge === 'REVERSAL' ? 'destructive' : 
                                txn.statusBadge === 'VOIDED' ? 'secondary' : 
                                txn.statusBadge === 'EDITED' ? 'outline' : 'default'
                              } className="text-xs">
                                {txn.statusBadge}
                              </Badge>
                              {txn.linkageInfo && (
                                <span className="text-xs text-gray-500">{txn.linkageInfo}</span>
                              )}
                            </div>
                          )}
                          {!txn.statusBadge && <span className="text-xs text-gray-400">Normal</span>}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{txn.partyType}: </span>
                          <span className="font-medium">{txn.partyName}</span>
                        </TableCell>
                        <TableCell>{txn.paymentMode}</TableCell>
                        <TableCell className={`text-right font-medium ${txn.isVoided ? 'line-through text-gray-400' : 'text-green-600'}`}>
                          {txn.direction === 'IN' ? `₹${fmt(txn.amount)}` : '-'}
                        </TableCell>
                        <TableCell className={`text-right font-medium ${txn.isVoided ? 'line-through text-gray-400' : 'text-red-600'}`}>
                          {txn.direction === 'OUT' ? `₹${fmt(txn.amount)}` : '-'}
                        </TableCell>
                        <TableCell className={`text-right font-bold ${(txn.runningBalance ?? 0) >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                          {txn.isVoided ? '-' : `₹${fmt(txn.runningBalance)}`}
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
            
            {/* Pagination Controls */}
            {pagination.totalPages > 0 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="text-sm text-gray-600">
                  Page {pagination.page} of {pagination.totalPages} ({pagination.totalCount} total records)
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(1)}
                    disabled={pagination.page <= 1}
                  >
                    First
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                  >
                    Previous
                  </Button>
                  
                  {/* Page number display */}
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      let pageNum
                      if (pagination.totalPages <= 5) {
                        pageNum = i + 1
                      } else if (pagination.page <= 3) {
                        pageNum = i + 1
                      } else if (pagination.page >= pagination.totalPages - 2) {
                        pageNum = pagination.totalPages - 4 + i
                      } else {
                        pageNum = pagination.page - 2 + i
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={pagination.page === pageNum ? "default" : "outline"}
                          size="sm"
                          className="w-8"
                          onClick={() => handlePageChange(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      )
                    })}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                  >
                    Next
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.totalPages)}
                    disabled={pagination.page >= pagination.totalPages}
                  >
                    Last
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
