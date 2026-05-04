'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useToast } from '@/hooks/use-toast'
import { Toaster } from '@/components/ui/toaster'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { ArrowLeft, Plus, Edit, Trash2, Users, CreditCard, Wallet, TrendingDown, TrendingUp, Eye, RefreshCw, DollarSign, Banknote, FileText, ArrowDownCircle, ArrowUpCircle, HandCoins, PiggyBank } from 'lucide-react'
import { AppShell } from '@/components/dashboard/AppShell'
import { getDeleteOtp, refreshDeleteOtp } from '@/lib/deleteOtp'

const PAYMENT_MODES = ['Cash', 'Bank Transfer', 'Cheque', 'RTGS', 'UPI']
const PHONE_RX = /^[0-9+\-\s()]{7,20}$/

// Safe number formatter
const fmt = (value) => {
  const n = Math.round((Number(value) || 0) * 100) / 100
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// today (local) as YYYY-MM-DD for date-input max attribute and comparisons
const todayISO = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Validators — return null if ok, otherwise an error message string.
const validatePartyForm = (form) => {
  const name = (form.name || '').trim()
  if (name.length < 2) return 'Name must be at least 2 characters'
  if (name.length > 100) return 'Name must be 100 characters or less'
  const phone = (form.phone || '').trim()
  if (phone && !PHONE_RX.test(phone)) return 'Phone format is invalid'
  if ((form.address || '').length > 250) return 'Address must be 250 characters or less'
  if ((form.notes || '').length > 500) return 'Notes must be 500 characters or less'
  return null
}

const validateLoanForm = (form) => {
  if (!form.partyId) return 'Please select a party'
  const amount = parseFloat(form.principalAmount)
  if (!Number.isFinite(amount) || amount <= 0) return 'Principal amount must be greater than 0'
  if (amount > 1e12) return 'Principal amount is unrealistically large'
  if (!form.loanDate) return 'Loan date is required'
  if (form.loanDate > todayISO()) return 'Loan date cannot be in the future'
  if (!form.accountId) return 'Please select an account'
  if (!PAYMENT_MODES.includes(form.paymentMode)) return 'Invalid payment mode'
  if ((form.purpose || '').length > 500) return 'Purpose must be 500 characters or less'
  return null
}

const validateRepaymentForm = (form, loan) => {
  if (!loan) return 'No loan selected'
  if (loan.status === 'CLOSED') return 'This loan is already closed'
  const amount = parseFloat(form.amount)
  if (!Number.isFinite(amount) || amount <= 0) return 'Repayment amount must be greater than 0'
  if (amount > Number(loan.balancePrincipal) + 0.005) {
    return `Amount exceeds outstanding balance (₹${Number(loan.balancePrincipal).toFixed(2)})`
  }
  if (!form.repaymentDate) return 'Repayment date is required'
  if (form.repaymentDate > todayISO()) return 'Repayment date cannot be in the future'
  if (loan.loanDate && form.repaymentDate < String(loan.loanDate).slice(0, 10)) {
    return 'Repayment date cannot be before the loan date'
  }
  if (!form.accountId) return 'Please select an account'
  if (!PAYMENT_MODES.includes(form.paymentMode)) return 'Invalid payment mode'
  if ((form.remark || '').length > 500) return 'Remark must be 500 characters or less'
  return null
}

export default function BorrowLoansPage() {
  const router = useRouter()
  const { toast } = useToast()
  
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  
  // Current mode: 'BORROWED' (we receive money) or 'GIVEN' (we give money)
  const [loanMode, setLoanMode] = useState('BORROWED')
  
  // Data
  const [parties, setParties] = useState([])
  const [loans, setLoans] = useState([])
  const [accounts, setAccounts] = useState([])
  
  // Dialog/Drawer states
  const [showPartyDialog, setShowPartyDialog] = useState(false)
  const [showLoanDialog, setShowLoanDialog] = useState(false)
  const [showRepaymentsDrawer, setShowRepaymentsDrawer] = useState(false)
  const [showPartyLedger, setShowPartyLedger] = useState(false)
  
  // Form data
  const [partyForm, setPartyForm] = useState({ name: '', phone: '', address: '', notes: '' })
  const [loanForm, setLoanForm] = useState({ 
    partyId: '', principalAmount: '', loanDate: '', accountId: '', 
    purpose: '', paymentMode: 'Bank Transfer'
  })
  const [repaymentForm, setRepaymentForm] = useState({
    amount: '', repaymentDate: '', accountId: '', paymentMode: 'Cash', remark: ''
  })
  
  // Selected items
  const [selectedLoan, setSelectedLoan] = useState(null)
  const [selectedParty, setSelectedParty] = useState(null)
  const [repayments, setRepayments] = useState([])
  const [partyLedger, setPartyLedger] = useState(null)
  
  // Filters
  const [loanFilters, setLoanFilters] = useState({ status: 'all', partyId: 'all' })

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
    if (typeof window === 'undefined') return

    const token = localStorage.getItem('token')
    const userData = localStorage.getItem('user')
    if (token && userData) {
      setUser(JSON.parse(userData))
      setIsAuthenticated(true)
      setLoading(false)
    } else {
      router.push('/')
    }
  }, [router])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/')
  }

  // Load data
  useEffect(() => {
    if (isAuthenticated) {
      loadParties()
      loadLoans()
      loadAccounts()
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (isAuthenticated) {
      loadLoans()
    }
  }, [loanFilters, loanMode])

  const loadParties = async () => {
    try {
      const data = await apiCall('/parties')
      setParties(data)
    } catch (error) {
      console.error('Failed to load parties:', error)
    }
  }

  const loadLoans = async () => {
    try {
      const params = new URLSearchParams()
      params.append('direction', loanMode)
      if (loanFilters.status !== 'all') params.append('status', loanFilters.status)
      if (loanFilters.partyId !== 'all') params.append('partyId', loanFilters.partyId)
      
      const data = await apiCall(`/loans?${params.toString()}`)
      setLoans(data)
    } catch (error) {
      console.error('Failed to load loans:', error)
    }
  }

  const loadAccounts = async () => {
    try {
      // Loans are company-level only — never show society-scoped accounts here
      const data = await apiCall('/accounts?scope=COMPANY')
      setAccounts(data)
    } catch (error) {
      console.error('Failed to load accounts:', error)
    }
  }

  const loadRepayments = async (loanId) => {
    try {
      const data = await apiCall(`/loans/${loanId}/repayments`)
      setRepayments(data)
    } catch (error) {
      console.error('Failed to load repayments:', error)
    }
  }

  const loadPartyLedger = async (partyId) => {
    try {
      const data = await apiCall(`/parties/${partyId}/ledger`)
      setPartyLedger(data)
    } catch (error) {
      console.error('Failed to load party ledger:', error)
    }
  }

  // Handlers
  const handleCreateParty = async (e) => {
    e.preventDefault()
    const err = validatePartyForm(partyForm)
    if (err) {
      toast({ title: 'Validation error', description: err, variant: 'destructive' })
      return
    }
    try {
      await apiCall('/parties', 'POST', {
        name: partyForm.name.trim(),
        phone: (partyForm.phone || '').trim(),
        address: (partyForm.address || '').trim(),
        notes: (partyForm.notes || '').trim(),
      })
      await loadParties()
      setShowPartyDialog(false)
      setPartyForm({ name: '', phone: '', address: '', notes: '' })
      toast({ title: 'Success', description: 'Party created successfully' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleDeleteParty = async (partyId) => {
    try {
      await apiCall(`/parties/${partyId}`, 'DELETE')
      await loadParties()
      toast({ title: 'Success', description: 'Party deleted' })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleCreateLoan = async (e) => {
    e.preventDefault()
    const err = validateLoanForm(loanForm)
    if (err) {
      toast({ title: 'Validation error', description: err, variant: 'destructive' })
      return
    }
    try {
      await apiCall('/loans', 'POST', {
        ...loanForm,
        direction: loanMode
      })
      await loadLoans()
      await loadParties()
      setShowLoanDialog(false)
      setLoanForm({ 
        partyId: '', principalAmount: '', loanDate: '', accountId: '', 
        purpose: '', paymentMode: 'Bank Transfer'
      })
      toast({ 
        title: 'Success', 
        description: loanMode === 'BORROWED' 
          ? 'Loan borrowed and added to Daybook' 
          : 'Loan given and added to Daybook' 
      })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleDeleteLoan = async (loanId) => {
    // Optimistic UI update - immediately remove from list
    const previousLoans = [...loans]
    setLoans(prev => prev.filter(loan => loan.id !== loanId))
    
    try {
      await apiCall(`/loans/${loanId}`, 'DELETE')
      
      // Refetch to ensure server truth
      await loadLoans()
      await loadParties()
      
      toast({ 
        title: 'Loan Deleted', 
        description: 'Loan and related transactions have been deleted successfully'
      })
    } catch (error) {
      // Rollback on error
      setLoans(previousLoans)
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleCreateRepayment = async (e) => {
    e.preventDefault()
    if (!selectedLoan) return
    const err = validateRepaymentForm(repaymentForm, selectedLoan)
    if (err) {
      toast({ title: 'Validation error', description: err, variant: 'destructive' })
      return
    }

    try {
      await apiCall(`/loans/${selectedLoan.id}/repayments`, 'POST', repaymentForm)
      await loadRepayments(selectedLoan.id)
      await loadLoans()
      await loadParties()
      setRepaymentForm({ amount: '', repaymentDate: '', accountId: '', paymentMode: 'Cash', remark: '' })
      toast({ 
        title: 'Success', 
        description: selectedLoan.direction === 'BORROWED' 
          ? 'Repayment recorded (paid out)' 
          : 'Repayment received and added to Daybook'
      })
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const handleDeleteRepayment = async (repaymentId) => {
    if (!selectedLoan) return
    
    // Optimistic UI update - immediately remove from repayments list
    const previousRepayments = [...repayments]
    setRepayments(prev => prev.filter(r => r.id !== repaymentId))
    
    try {
      await apiCall(`/loans/${selectedLoan.id}/repayments/${repaymentId}`, 'DELETE')
      
      // Refetch to ensure server truth
      await loadRepayments(selectedLoan.id)
      await loadLoans()
      await loadParties()
      
      toast({ 
        title: 'Repayment Deleted', 
        description: 'Repayment has been deleted successfully'
      })
    } catch (error) {
      // Rollback on error
      setRepayments(previousRepayments)
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    }
  }

  const openRepaymentsDrawer = async (loan) => {
    setSelectedLoan(loan)
    await loadRepayments(loan.id)
    setShowRepaymentsDrawer(true)
  }

  const openPartyLedger = async (party) => {
    setSelectedParty(party)
    await loadPartyLedger(party.id)
    setShowPartyLedger(true)
  }

  // Calculate totals based on current mode
  const borrowedLoans = loans.filter(l => l.direction === 'BORROWED')
  const givenLoans = loans.filter(l => l.direction === 'GIVEN')
  
  const totalBorrowed = borrowedLoans.reduce((sum, l) => sum + l.principalAmount, 0)
  const totalBorrowRepaid = borrowedLoans.reduce((sum, l) => sum + (l.totalRepaid || 0), 0)
  const borrowOutstanding = totalBorrowed - totalBorrowRepaid
  const openBorrowCount = borrowedLoans.filter(l => l.status === 'OPEN').length
  
  const totalGiven = givenLoans.reduce((sum, l) => sum + l.principalAmount, 0)
  const totalGivenReceived = givenLoans.reduce((sum, l) => sum + (l.totalRepaid || 0), 0)
  const givenOutstanding = totalGiven - totalGivenReceived
  const openGivenCount = givenLoans.filter(l => l.status === 'OPEN').length

  // Mode-specific labels
  const modeConfig = {
    BORROWED: {
      title: 'Borrow Loans',
      subtitle: 'Money we receive from lenders, later repay',
      icon: ArrowDownCircle,
      partyLabel: 'Lender',
      loanAction: 'Record Borrowed Loan',
      accountLabel: 'Received In Account',
      repaymentAccountLabel: 'Pay From Account',
      repaymentAction: 'Record Repayment (Pay Out)',
      color: 'purple'
    },
    GIVEN: {
      title: 'Give Loans',
      subtitle: 'Money we lend to borrowers, later receive back',
      icon: ArrowUpCircle,
      partyLabel: 'Borrower',
      loanAction: 'Record Given Loan',
      accountLabel: 'Paid From Account',
      repaymentAccountLabel: 'Receive In Account',
      repaymentAction: 'Record Repayment (Receive)',
      color: 'blue'
    }
  }
  
  const config = modeConfig[loanMode]
  const currentLoans = loanMode === 'BORROWED' ? borrowedLoans : givenLoans

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <AppShell user={user} onLogout={handleLogout} searchPlaceholder="Search loans, parties...">
      <Toaster />

      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Loans Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">Borrow and give loans at company level</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={loadLoans}
            className="h-9"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Badge variant="secondary" className="text-sm">Company Level</Badge>
        </div>
      </div>

      <div className="space-y-6">
        
        {/* Mode Toggle */}
        <div className="flex justify-center">
          <div className="inline-flex bg-white rounded-lg border p-1 shadow-sm">
            <button
              onClick={() => setLoanMode('BORROWED')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                loanMode === 'BORROWED' 
                  ? 'bg-purple-100 text-purple-700' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <ArrowDownCircle className="w-4 h-4" />
              Borrow Loans
            </button>
            <button
              onClick={() => setLoanMode('GIVEN')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                loanMode === 'GIVEN' 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <ArrowUpCircle className="w-4 h-4" />
              Give Loans
            </button>
          </div>
        </div>
        
        {/* Summary Cards - Combined View */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {/* Borrow Summary */}
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="pt-4">
              <div className="text-center">
                <p className="text-xs text-purple-600 font-medium">Total Borrowed</p>
                <p className="text-xl font-bold text-purple-700">₹{fmt(totalBorrowed)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="pt-4">
              <div className="text-center">
                <p className="text-xs text-purple-600 font-medium">Borrow Repaid</p>
                <p className="text-xl font-bold text-green-600">₹{fmt(totalBorrowRepaid)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className={`${borrowOutstanding > 0 ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
            <CardContent className="pt-4">
              <div className="text-center">
                <p className="text-xs text-gray-600 font-medium">We Owe (Borrow)</p>
                <p className={`text-xl font-bold ${borrowOutstanding > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  ₹{fmt(borrowOutstanding)}
                </p>
              </div>
            </CardContent>
          </Card>
          
          {/* Give Summary */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="text-center">
                <p className="text-xs text-blue-600 font-medium">Total Given</p>
                <p className="text-xl font-bold text-blue-700">₹{fmt(totalGiven)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="text-center">
                <p className="text-xs text-blue-600 font-medium">Given Received</p>
                <p className="text-xl font-bold text-green-600">₹{fmt(totalGivenReceived)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className={`${givenOutstanding > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
            <CardContent className="pt-4">
              <div className="text-center">
                <p className="text-xs text-gray-600 font-medium">They Owe (Given)</p>
                <p className={`text-xl font-bold ${givenOutstanding > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                  ₹{fmt(givenOutstanding)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Mode-specific header */}
        <Card className={`${loanMode === 'BORROWED' ? 'bg-purple-50 border-purple-200' : 'bg-blue-50 border-blue-200'}`}>
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <config.icon className={`w-6 h-6 ${loanMode === 'BORROWED' ? 'text-purple-600' : 'text-blue-600'}`} />
                <div>
                  <h2 className="font-semibold text-gray-900">{config.title}</h2>
                  <p className="text-sm text-gray-600">{config.subtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="outline">
                  {loanMode === 'BORROWED' ? openBorrowCount : openGivenCount} Open Loans
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="loans" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="loans">Loans</TabsTrigger>
            <TabsTrigger value="parties">Parties</TabsTrigger>
          </TabsList>

          {/* Loans Tab */}
          <TabsContent value="loans" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5" />
                    {config.title}
                  </CardTitle>
                  <Dialog open={showLoanDialog} onOpenChange={setShowLoanDialog}>
                    <DialogTrigger asChild>
                      <Button className={loanMode === 'BORROWED' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'}>
                        <Plus className="w-4 h-4 mr-2" /> {config.loanAction}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>{config.loanAction}</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleCreateLoan} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="col-span-2">
                            <Label>{config.partyLabel} *</Label>
                            <Select value={loanForm.partyId} onValueChange={v => setLoanForm({...loanForm, partyId: v})}>
                              <SelectTrigger>
                                <SelectValue placeholder={`Select ${config.partyLabel.toLowerCase()}`} />
                              </SelectTrigger>
                              <SelectContent>
                                {parties.map(p => (
                                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Principal Amount *</Label>
                            <Input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={loanForm.principalAmount}
                              onChange={e => setLoanForm({...loanForm, principalAmount: e.target.value})}
                              required
                            />
                          </div>
                          <div>
                            <Label>Loan Date *</Label>
                            <Input
                              type="date"
                              value={loanForm.loanDate}
                              max={todayISO()}
                              onChange={e => setLoanForm({...loanForm, loanDate: e.target.value})}
                              required
                            />
                          </div>
                          <div>
                            <Label>{config.accountLabel} *</Label>
                            <Select value={loanForm.accountId} onValueChange={v => setLoanForm({...loanForm, accountId: v})}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select account" />
                              </SelectTrigger>
                              <SelectContent>
                                {accounts.map(a => (
                                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Payment Mode</Label>
                            <Select value={loanForm.paymentMode} onValueChange={v => setLoanForm({...loanForm, paymentMode: v})}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PAYMENT_MODES.map(m => (
                                  <SelectItem key={m} value={m}>{m}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2">
                            <Label>Purpose (Optional)</Label>
                            <Textarea 
                              value={loanForm.purpose} 
                              onChange={e => setLoanForm({...loanForm, purpose: e.target.value})}
                              placeholder={loanMode === 'BORROWED' ? 'e.g., Working capital, Land purchase' : 'e.g., Personal loan to friend'}
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button type="button" variant="outline" onClick={() => setShowLoanDialog(false)}>Cancel</Button>
                          <Button type="submit" className={loanMode === 'BORROWED' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'}>
                            {config.loanAction}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
                {/* Filters */}
                <div className="flex gap-4 mt-4">
                  <div className="w-48">
                    <Label className="text-xs">Status</Label>
                    <Select value={loanFilters.status} onValueChange={v => setLoanFilters({...loanFilters, status: v})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="OPEN">Open</SelectItem>
                        <SelectItem value="CLOSED">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-48">
                    <Label className="text-xs">{config.partyLabel}</Label>
                    <Select value={loanFilters.partyId} onValueChange={v => setLoanFilters({...loanFilters, partyId: v})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All {config.partyLabel}s</SelectItem>
                        {parties.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {currentLoans.length === 0 ? (
                  <div className="text-center py-8">
                    <CreditCard className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                    <p className="text-gray-500">No {loanMode === 'BORROWED' ? 'borrowed' : 'given'} loans yet</p>
                    <p className="text-sm text-gray-400">Add a party first, then record loans</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>{config.partyLabel}</TableHead>
                        <TableHead>Principal</TableHead>
                        <TableHead>{loanMode === 'BORROWED' ? 'Repaid' : 'Received'}</TableHead>
                        <TableHead>Balance</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentLoans.map(loan => (
                        <TableRow key={loan.id}>
                          <TableCell>{new Date(loan.loanDate).toLocaleDateString()}</TableCell>
                          <TableCell className="font-medium">{loan.partyName}</TableCell>
                          <TableCell>₹{fmt(loan.principalAmount)}</TableCell>
                          <TableCell className="text-green-600">₹{fmt(loan.totalRepaid)}</TableCell>
                          <TableCell className={`font-medium ${loan.balancePrincipal > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                            ₹{fmt(loan.balancePrincipal)}
                          </TableCell>
                          <TableCell><Badge variant="outline">{loan.accountName}</Badge></TableCell>
                          <TableCell>
                            <Badge variant={loan.status === 'CLOSED' ? 'default' : 'secondary'}>
                              {loan.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" onClick={() => openRepaymentsDrawer(loan)}>
                                <DollarSign className="w-4 h-4 mr-1" /> {loanMode === 'BORROWED' ? 'Repay' : 'Receive'}
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="destructive" size="sm">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Loan?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will delete the loan and all associated repayments from Daybook. This cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteLoan(loan.id)}>Delete</AlertDialogAction>
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

          {/* Parties Tab */}
          <TabsContent value="parties" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Parties (Lenders / Borrowers)
                  </CardTitle>
                  <Dialog open={showPartyDialog} onOpenChange={setShowPartyDialog}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="w-4 h-4 mr-2" /> Add Party
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add New Party</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleCreateParty} className="space-y-4">
                        <div>
                          <Label>Name *</Label>
                          <Input 
                            value={partyForm.name} 
                            onChange={e => setPartyForm({...partyForm, name: e.target.value})} 
                            required 
                          />
                        </div>
                        <div>
                          <Label>Phone</Label>
                          <Input 
                            value={partyForm.phone} 
                            onChange={e => setPartyForm({...partyForm, phone: e.target.value})} 
                          />
                        </div>
                        <div>
                          <Label>Address</Label>
                          <Input 
                            value={partyForm.address} 
                            onChange={e => setPartyForm({...partyForm, address: e.target.value})} 
                          />
                        </div>
                        <div>
                          <Label>Notes</Label>
                          <Textarea 
                            value={partyForm.notes} 
                            onChange={e => setPartyForm({...partyForm, notes: e.target.value})} 
                          />
                        </div>
                        <DialogFooter>
                          <Button type="button" variant="outline" onClick={() => setShowPartyDialog(false)}>Cancel</Button>
                          <Button type="submit">Add Party</Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {parties.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                    <p className="text-gray-500">No parties added yet</p>
                    <p className="text-sm text-gray-400">Add parties to record loans with them</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead className="text-center">We Owe (Borrowed)</TableHead>
                        <TableHead className="text-center">They Owe (Given)</TableHead>
                        <TableHead>Net Balance</TableHead>
                        <TableHead>Loans</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parties.map(party => {
                        const weOwe = (party.totalBorrowed || 0) - (party.totalBorrowRepaid || 0)
                        const theyOwe = (party.totalGiven || 0) - (party.totalGivenReceived || 0)
                        const netBalance = theyOwe - weOwe // Positive = they owe us, Negative = we owe them
                        
                        return (
                          <TableRow key={party.id}>
                            <TableCell className="font-medium">{party.name}</TableCell>
                            <TableCell>{party.phone || '-'}</TableCell>
                            <TableCell className="text-center">
                              <span className={weOwe > 0 ? 'text-orange-600 font-medium' : 'text-gray-500'}>
                                ₹{fmt(weOwe)}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className={theyOwe > 0 ? 'text-blue-600 font-medium' : 'text-gray-500'}>
                                ₹{fmt(theyOwe)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className={`font-bold ${netBalance > 0 ? 'text-green-600' : netBalance < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                                {netBalance > 0 ? '+' : ''}{fmt(netBalance)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                {(party.openBorrowLoans || 0) > 0 && (
                                  <Badge variant="outline" className="text-purple-600 border-purple-300">
                                    {party.openBorrowLoans} borrow
                                  </Badge>
                                )}
                                {(party.openGivenLoans || 0) > 0 && (
                                  <Badge variant="outline" className="text-blue-600 border-blue-300">
                                    {party.openGivenLoans} given
                                  </Badge>
                                )}
                                {(party.openBorrowLoans || 0) === 0 && (party.openGivenLoans || 0) === 0 && (
                                  <Badge variant="outline" className="text-gray-500">No open loans</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" onClick={() => openPartyLedger(party)}>
                                  <Eye className="w-4 h-4 mr-1" /> Ledger
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm" disabled={party.totalLoans > 0}>
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Party?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will permanently delete the party. This cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDeleteParty(party.id)}>Delete</AlertDialogAction>
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

      {/* Repayments Drawer */}
      <Drawer open={showRepaymentsDrawer} onOpenChange={setShowRepaymentsDrawer}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle>
              {selectedLoan?.direction === 'BORROWED' ? 'Loan Repayments' : 'Received Repayments'} - {selectedLoan?.partyName}
            </DrawerTitle>
            <DrawerDescription>
              {selectedLoan?.direction === 'BORROWED' 
                ? 'Manage repayments for this borrowed loan (money OUT)' 
                : 'Manage repayments received for this given loan (money IN)'}
            </DrawerDescription>
          </DrawerHeader>
          
          <div className="px-4 overflow-y-auto max-h-[60vh]">
            {selectedLoan && (
              <>
                {/* Loan Summary */}
                <Card className={`mb-4 ${selectedLoan.direction === 'BORROWED' ? 'bg-purple-50' : 'bg-blue-50'}`}>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-4 gap-4 text-center">
                      <div>
                        <p className="text-sm text-gray-600">Principal</p>
                        <p className="text-xl font-bold">₹{fmt(selectedLoan.principalAmount)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">{selectedLoan.direction === 'BORROWED' ? 'Repaid' : 'Received'}</p>
                        <p className="text-xl font-bold text-green-600">₹{fmt(selectedLoan.totalRepaid)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Balance</p>
                        <p className="text-xl font-bold text-orange-600">₹{fmt(selectedLoan.balancePrincipal)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Status</p>
                        <Badge variant={selectedLoan.status === 'CLOSED' ? 'default' : 'secondary'} className="text-lg">
                          {selectedLoan.status}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Add Repayment Form */}
                {selectedLoan.status === 'OPEN' && (
                  <Card className="mb-4">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">
                        {selectedLoan.direction === 'BORROWED' ? 'Add Repayment (Pay Out)' : 'Add Repayment (Receive)'}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleCreateRepayment} className="grid grid-cols-5 gap-3">
                        <div>
                          <Label className="text-xs">Amount *</Label>
                          <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={repaymentForm.amount}
                            onChange={e => setRepaymentForm({...repaymentForm, amount: e.target.value})}
                            max={selectedLoan.balancePrincipal}
                            required
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Date *</Label>
                          <Input
                            type="date"
                            value={repaymentForm.repaymentDate}
                            min={selectedLoan.loanDate ? String(selectedLoan.loanDate).slice(0, 10) : undefined}
                            max={todayISO()}
                            onChange={e => setRepaymentForm({...repaymentForm, repaymentDate: e.target.value})}
                            required
                          />
                        </div>
                        <div>
                          <Label className="text-xs">
                            {selectedLoan.direction === 'BORROWED' ? 'Pay From' : 'Receive In'} *
                          </Label>
                          <Select value={repaymentForm.accountId} onValueChange={v => setRepaymentForm({...repaymentForm, accountId: v})}>
                            <SelectTrigger>
                              <SelectValue placeholder="Account" />
                            </SelectTrigger>
                            <SelectContent>
                              {accounts.map(a => (
                                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Mode</Label>
                          <Select value={repaymentForm.paymentMode} onValueChange={v => setRepaymentForm({...repaymentForm, paymentMode: v})}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PAYMENT_MODES.map(m => (
                                <SelectItem key={m} value={m}>{m}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-end">
                          <Button 
                            type="submit" 
                            className={`w-full ${selectedLoan.direction === 'BORROWED' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                          >
                            Add
                          </Button>
                        </div>
                      </form>
                    </CardContent>
                  </Card>
                )}

                {/* Repayments List */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">
                      {selectedLoan.direction === 'BORROWED' ? 'Repayment History' : 'Received History'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {repayments.length === 0 ? (
                      <p className="text-center text-gray-500 py-4">No repayments yet</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Account</TableHead>
                            <TableHead>Mode</TableHead>
                            <TableHead>Remark</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {repayments.map(repayment => (
                            <TableRow key={repayment.id}>
                              <TableCell>{new Date(repayment.repaymentDate).toLocaleDateString()}</TableCell>
                              <TableCell className="text-green-600 font-medium">₹{fmt(repayment.amount)}</TableCell>
                              <TableCell><Badge variant="outline">{repayment.accountName}</Badge></TableCell>
                              <TableCell>{repayment.paymentMode}</TableCell>
                              <TableCell>{repayment.remark || '-'}</TableCell>
                              <TableCell>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm">
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Repayment?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will delete the repayment and its Daybook entry.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDeleteRepayment(repayment.id)}>Delete</AlertDialogAction>
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
              </>
            )}
          </div>

          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline">Close</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Party Ledger Drawer */}
      <Drawer open={showPartyLedger} onOpenChange={setShowPartyLedger}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle>Party Ledger - {selectedParty?.name}</DrawerTitle>
            <DrawerDescription>
              All loan transactions with this party
            </DrawerDescription>
          </DrawerHeader>
          
          <div className="px-4 overflow-y-auto max-h-[60vh]">
            {partyLedger && (
              <>
                {/* Summary */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <Card className="bg-purple-50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-purple-700">Borrowed (We Owe)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-2 text-center text-sm">
                        <div>
                          <p className="text-gray-500">Total</p>
                          <p className="font-bold">₹{fmt(partyLedger.summary.totalBorrowed)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Repaid</p>
                          <p className="font-bold text-green-600">₹{fmt(partyLedger.summary.totalBorrowRepaid)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Balance</p>
                          <p className="font-bold text-orange-600">₹{fmt(partyLedger.summary.borrowBalance)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-blue-50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-blue-700">Given (They Owe)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-2 text-center text-sm">
                        <div>
                          <p className="text-gray-500">Total</p>
                          <p className="font-bold">₹{fmt(partyLedger.summary.totalGiven)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Received</p>
                          <p className="font-bold text-green-600">₹{fmt(partyLedger.summary.totalGivenReceived)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Balance</p>
                          <p className="font-bold text-yellow-600">₹{fmt(partyLedger.summary.givenBalance)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                
                <Card className={`mb-4 ${partyLedger.summary.netBalance >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Net Balance:</span>
                      <span className={`text-xl font-bold ${partyLedger.summary.netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {partyLedger.summary.netBalance >= 0 ? '+' : ''}₹{fmt(partyLedger.summary.netBalance)}
                        <span className="text-sm font-normal ml-2">
                          ({partyLedger.summary.netBalance >= 0 ? 'They owe us' : 'We owe them'})
                        </span>
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Ledger Table */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Transaction History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {partyLedger.entries.length === 0 ? (
                      <p className="text-center text-gray-500 py-4">No transactions yet</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">We Owe (Cr)</TableHead>
                            <TableHead className="text-right">They Owe (Dr)</TableHead>
                            <TableHead className="text-right">Balance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {partyLedger.entries.map(entry => (
                            <TableRow key={entry.id}>
                              <TableCell>{new Date(entry.date).toLocaleDateString()}</TableCell>
                              <TableCell>
                                <Badge variant={entry.direction === 'BORROWED' ? 'default' : 'secondary'} className={entry.direction === 'BORROWED' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}>
                                  {entry.type} ({entry.direction})
                                </Badge>
                              </TableCell>
                              <TableCell>{entry.description}</TableCell>
                              <TableCell className="text-right text-purple-600">
                                {entry.credit > 0 ? `₹${fmt(entry.credit)}` : '-'}
                              </TableCell>
                              <TableCell className="text-right text-blue-600">
                                {entry.debit > 0 ? `₹${fmt(entry.debit)}` : '-'}
                              </TableCell>
                              <TableCell className={`text-right font-bold ${entry.balance >= 0 ? 'text-purple-600' : 'text-blue-600'}`}>
                                ₹{fmt(Math.abs(entry.balance))}
                                <span className="text-xs ml-1">
                                  {entry.balance >= 0 ? '(we owe)' : '(they owe)'}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline">Close</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </AppShell>
  )
}
