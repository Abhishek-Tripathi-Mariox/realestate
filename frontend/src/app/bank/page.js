'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { Toaster } from '@/components/ui/toaster'
import {
  Landmark, ArrowDownCircle, ArrowLeftRight, Edit, Trash2,
  RefreshCw, Filter, X, Search, Download, Wallet, ArrowRight,
} from 'lucide-react'
import { AppShell } from '@/components/dashboard/AppShell'
import { getDeleteOtp, refreshDeleteOtp } from '@/lib/deleteOtp'

const fmt = (value) => {
  const n = Math.round((Number(value) || 0) * 100) / 100
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function BankPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [token, setToken] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('WITHDRAWAL')

  const [accounts, setAccounts] = useState([])
  const [operations, setOperations] = useState([])
  const [summary, setSummary] = useState({
    totalWithdrawal: 0, totalTransfer: 0, totalDirectPayment: 0,
    withdrawalCount: 0, transferCount: 0, directPaymentCount: 0, opCount: 0,
  })

  const [showFilters, setShowFilters] = useState(true)
  const [filters, setFilters] = useState({
    accountId: 'all',
    from: '',
    to: '',
    search: '',
  })

  // Forms
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [withdrawForm, setWithdrawForm] = useState({
    fromAccountId: '',
    amount: '',
    txnDate: todayISO(),
    note: '',
  })

  const [showTransfer, setShowTransfer] = useState(false)
  const [transferForm, setTransferForm] = useState({
    fromAccountId: '',
    toAccountId: '',
    amount: '',
    txnDate: todayISO(),
    note: '',
  })

  const [showDirectPayment, setShowDirectPayment] = useState(false)
  const [directPaymentForm, setDirectPaymentForm] = useState({
    fromAccountId: '',
    amount: '',
    txnDate: todayISO(),
    note: '',
  })

  const [editingOp, setEditingOp] = useState(null)

  // ---------- API helper
  const apiCall = async (endpoint, method = 'GET', body = null) => {
    const authToken = token || localStorage.getItem('token')
    const buildOptions = (otp) => {
      const opts = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
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

  // ---------- Loads
  const loadAccounts = async () => {
    try { setAccounts(await apiCall('/accounts')) }
    catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }) }
  }
  const loadOperations = async () => {
    try {
      const qs = new URLSearchParams()
      qs.append('kind', activeTab)
      Object.entries(filters).forEach(([k, v]) => { if (v && v !== 'all') qs.append(k, v) })
      const list = await apiCall(`/bank/operations?${qs.toString()}`)
      setOperations(list)
      const s = await apiCall(`/bank/operations/summary?${qs.toString()}`)
      setSummary(s)
    } catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }) }
  }
  const refreshAll = async () => {
    setLoading(true)
    try { await Promise.all([loadAccounts(), loadOperations()]) }
    finally { setLoading(false) }
  }

  useEffect(() => { if (isAuthenticated) refreshAll() }, [isAuthenticated])
  useEffect(() => { if (isAuthenticated) loadOperations() }, [filters, activeTab])

  // ---------- Withdrawal
  const openAddWithdraw = () => {
    setEditingOp(null)
    setWithdrawForm({ fromAccountId: '', amount: '', txnDate: todayISO(), note: '' })
    setShowWithdraw(true)
  }
  const openEditWithdraw = (op) => {
    setEditingOp(op)
    setWithdrawForm({
      fromAccountId: op.fromAccountId || '',
      amount: String(op.amount || ''),
      txnDate: (op.txnDate || '').slice(0, 10),
      note: op.note || '',
    })
    setShowWithdraw(true)
  }
  const handleSaveWithdraw = async () => {
    const amount = parseFloat(withdrawForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) { toast({ variant: 'destructive', title: 'Error', description: 'Amount must be greater than 0' }); return }
    if (!withdrawForm.fromAccountId) { toast({ variant: 'destructive', title: 'Error', description: 'Pick a bank account' }); return }
    if (!withdrawForm.txnDate) { toast({ variant: 'destructive', title: 'Error', description: 'Date is required' }); return }
    try {
      const payload = { ...withdrawForm, amount }
      if (editingOp) {
        await apiCall(`/bank/operations/${editingOp.id}`, 'PUT', payload)
        toast({ title: 'Saved', description: 'Withdrawal updated' })
      } else {
        await apiCall('/bank/withdrawals', 'POST', payload)
        toast({ title: 'Saved', description: 'Withdrawal recorded' })
      }
      setShowWithdraw(false)
      await Promise.all([loadOperations(), loadAccounts()])
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message })
    }
  }

  // ---------- Transfer
  const openAddTransfer = () => {
    setEditingOp(null)
    setTransferForm({ fromAccountId: '', toAccountId: '', amount: '', txnDate: todayISO(), note: '' })
    setShowTransfer(true)
  }
  const openEditTransfer = (op) => {
    setEditingOp(op)
    setTransferForm({
      fromAccountId: op.fromAccountId || '',
      toAccountId: op.toAccountId || '',
      amount: String(op.amount || ''),
      txnDate: (op.txnDate || '').slice(0, 10),
      note: op.note || '',
    })
    setShowTransfer(true)
  }
  const handleSaveTransfer = async () => {
    const amount = parseFloat(transferForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) { toast({ variant: 'destructive', title: 'Error', description: 'Amount must be greater than 0' }); return }
    if (!transferForm.fromAccountId) { toast({ variant: 'destructive', title: 'Error', description: 'Pick a source account' }); return }
    if (!transferForm.toAccountId) { toast({ variant: 'destructive', title: 'Error', description: 'Pick a destination account' }); return }
    if (transferForm.fromAccountId === transferForm.toAccountId) { toast({ variant: 'destructive', title: 'Error', description: 'Source and destination must differ' }); return }
    if (!transferForm.txnDate) { toast({ variant: 'destructive', title: 'Error', description: 'Date is required' }); return }
    try {
      const payload = { ...transferForm, amount }
      if (editingOp) {
        await apiCall(`/bank/operations/${editingOp.id}`, 'PUT', payload)
        toast({ title: 'Saved', description: 'Transfer updated' })
      } else {
        await apiCall('/bank/transfers', 'POST', payload)
        toast({ title: 'Saved', description: 'Transfer recorded' })
      }
      setShowTransfer(false)
      await Promise.all([loadOperations(), loadAccounts()])
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message })
    }
  }

  // ---------- Direct Payment
  const openAddDirectPayment = () => {
    setEditingOp(null)
    setDirectPaymentForm({ fromAccountId: '', amount: '', txnDate: todayISO(), note: '' })
    setShowDirectPayment(true)
  }
  const openEditDirectPayment = (op) => {
    setEditingOp(op)
    setDirectPaymentForm({
      fromAccountId: op.fromAccountId || '',
      amount: String(op.amount || ''),
      txnDate: (op.txnDate || '').slice(0, 10),
      note: op.note || '',
    })
    setShowDirectPayment(true)
  }
  const handleSaveDirectPayment = async () => {
    const amount = parseFloat(directPaymentForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) { toast({ variant: 'destructive', title: 'Error', description: 'Amount must be greater than 0' }); return }
    if (!directPaymentForm.fromAccountId) { toast({ variant: 'destructive', title: 'Error', description: 'Pick an account' }); return }
    if (!directPaymentForm.txnDate) { toast({ variant: 'destructive', title: 'Error', description: 'Date is required' }); return }
    try {
      const payload = { ...directPaymentForm, amount }
      if (editingOp) {
        await apiCall(`/bank/operations/${editingOp.id}`, 'PUT', payload)
        toast({ title: 'Saved', description: 'Direct payment updated' })
      } else {
        await apiCall('/bank/direct-payments', 'POST', payload)
        toast({ title: 'Saved', description: 'Direct payment recorded' })
      }
      setShowDirectPayment(false)
      await Promise.all([loadOperations(), loadAccounts()])
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message })
    }
  }

  // ---------- Delete
  const handleDeleteOp = async (op) => {
    if (!confirm('Delete this entry?')) return
    try {
      await apiCall(`/bank/operations/${op.id}`, 'DELETE')
      toast({ title: 'Deleted', description: 'Entry removed' })
      await Promise.all([loadOperations(), loadAccounts()])
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message })
    }
  }

  // ---------- CSV export (filtered to current tab)
  const exportCSV = () => {
    if (!operations.length) { toast({ title: 'Nothing to export', description: 'No operations match the current filters' }); return }
    const isTransfer = activeTab === 'TRANSFER'
    const headers = isTransfer
      ? ['Date', 'From', 'To', 'Amount', 'Note']
      : ['Date', 'Account', 'Amount', 'Note']
    const rows = operations.map(o => {
      const fromName = accounts.find(a => a.id === o.fromAccountId)?.name || ''
      const toName = accounts.find(a => a.id === o.toAccountId)?.name || ''
      return isTransfer
        ? [(o.txnDate || '').slice(0, 10), fromName, toName, o.amount || 0, (o.note || '').replace(/"/g, '""')]
        : [(o.txnDate || '').slice(0, 10), fromName, o.amount || 0, (o.note || '').replace(/"/g, '""')]
    })
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bank_${activeTab.toLowerCase()}_${todayISO()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!isAuthenticated) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
  }

  const bankAccounts = accounts.filter(a => a.type === 'BANK')
  const allAccounts = accounts // bank + cash for transfer

  return (
    <AppShell user={user} onLogout={handleLogout} searchPlaceholder="Search bank operations...">
      <Toaster />

      <div className="space-y-4">
        {/* Hero header */}
        <div className="rounded-2xl p-5 bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-500 text-white shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
                <Landmark className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Bank</h2>
                <p className="text-sm text-white/90">Withdrawals, internal transfers, and direct payments into accounts.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={exportCSV}>
                <Download className="w-4 h-4 mr-2" /> Excel
              </Button>
              {activeTab === 'WITHDRAWAL' && (
                <Button size="sm" className="bg-rose-600 hover:bg-rose-700 text-white border-0" onClick={openAddWithdraw}>
                  <ArrowDownCircle className="w-4 h-4 mr-2" /> Withdraw
                </Button>
              )}
              {activeTab === 'TRANSFER' && (
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white border-0" onClick={openAddTransfer}>
                  <ArrowLeftRight className="w-4 h-4 mr-2" /> Transfer
                </Button>
              )}
              {activeTab === 'DIRECT_PAYMENT' && (
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white border-0" onClick={openAddDirectPayment}>
                  <ArrowDownCircle className="w-4 h-4 mr-2" /> Direct Add
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Account balances strip */}
        {bankAccounts.length > 0 && (
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="w-4 h-4 text-indigo-600" />
                <h3 className="font-semibold text-slate-900 text-sm">Account Balances</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {allAccounts.map(a => (
                  <div key={a.id} className="rounded-lg border bg-slate-50/60 p-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-500 truncate" title={a.name}>{a.name}</p>
                      <Badge variant="outline" className="text-[10px]">{a.type}</Badge>
                    </div>
                    <p className={`text-base font-bold mt-1 ${(a.currentBalance || 0) >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                      ₹{fmt(a.currentBalance)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 h-11">
            <TabsTrigger value="WITHDRAWAL" className="text-sm">
              <ArrowDownCircle className="w-4 h-4 mr-2" /> Withdrawal
            </TabsTrigger>
            <TabsTrigger value="TRANSFER" className="text-sm">
              <ArrowLeftRight className="w-4 h-4 mr-2" /> Internal Transfer
            </TabsTrigger>
            <TabsTrigger value="DIRECT_PAYMENT" className="text-sm">
              <ArrowDownCircle className="w-4 h-4 mr-2 rotate-180" /> Direct Payment
            </TabsTrigger>
          </TabsList>

          {/* ===== Summary cards =====*/}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
            {activeTab === 'WITHDRAWAL' && (
              <>
                <Card className="bg-rose-50/60">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide text-rose-700">Total Withdrawn</p>
                    <p className="text-2xl font-bold text-rose-700 mt-1">₹{fmt(summary.totalWithdrawal)}</p>
                    <p className="text-xs text-slate-500 mt-1">Across {summary.withdrawalCount} entries</p>
                  </CardContent>
                </Card>
                <Card className="bg-slate-50/60">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-700">Entries</p>
                    <p className="text-2xl font-bold text-slate-700 mt-1">{summary.withdrawalCount}</p>
                    <p className="text-xs text-slate-500 mt-1">In current view</p>
                  </CardContent>
                </Card>
              </>
            )}
            {activeTab === 'TRANSFER' && (
              <>
                <Card className="bg-emerald-50/60">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide text-emerald-700">Total Transferred</p>
                    <p className="text-2xl font-bold text-emerald-700 mt-1">₹{fmt(summary.totalTransfer)}</p>
                    <p className="text-xs text-slate-500 mt-1">Across {summary.transferCount} transfers</p>
                  </CardContent>
                </Card>
                <Card className="bg-slate-50/60">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-700">Entries</p>
                    <p className="text-2xl font-bold text-slate-700 mt-1">{summary.transferCount}</p>
                    <p className="text-xs text-slate-500 mt-1">In current view</p>
                  </CardContent>
                </Card>
              </>
            )}
            {activeTab === 'DIRECT_PAYMENT' && (
              <>
                <Card className="bg-indigo-50/60">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide text-indigo-700">Total Added</p>
                    <p className="text-2xl font-bold text-indigo-700 mt-1">₹{fmt(summary.totalDirectPayment)}</p>
                    <p className="text-xs text-slate-500 mt-1">Across {summary.directPaymentCount} entries</p>
                  </CardContent>
                </Card>
                <Card className="bg-slate-50/60">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-700">Entries</p>
                    <p className="text-2xl font-bold text-slate-700 mt-1">{summary.directPaymentCount}</p>
                    <p className="text-xs text-slate-500 mt-1">In current view</p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {/* Filters */}
          <Card className="mt-3">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-3">
                <Button variant="ghost" size="sm" className="text-slate-600" onClick={() => setShowFilters(v => !v)}>
                  <Filter className="w-4 h-4 mr-1" /> Filters
                </Button>
                <div className="ml-auto flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setFilters({ accountId: 'all', from: '', to: '', search: '' })}>
                    <X className="w-4 h-4 mr-1" /> Clear
                  </Button>
                  <Button variant="outline" size="sm" onClick={refreshAll}>
                    <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
                  </Button>
                </div>
              </div>
              {showFilters && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Select value={filters.accountId} onValueChange={v => setFilters(f => ({ ...f, accountId: v }))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="All Accounts" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Accounts</SelectItem>
                      {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="date" className="h-9" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
                  <Input type="date" className="h-9" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                    <Input className="h-9 pl-8" placeholder="Search note..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Withdrawal table */}
          <TabsContent value="WITHDRAWAL" className="mt-3">
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <div className="flex items-center gap-2">
                    <ArrowDownCircle className="w-4 h-4 text-rose-600" />
                    <h3 className="font-semibold text-slate-900">Withdrawals</h3>
                    <Badge variant="secondary">{operations.length}</Badge>
                  </div>
                </div>
                {operations.length === 0 ? (
                  <div className="text-center py-10 text-slate-500">
                    <ArrowDownCircle className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                    <p>No withdrawals yet</p>
                    <p className="text-sm text-slate-400">
                      Click <span className="text-rose-600 font-medium">Withdraw</span> above to record one
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {operations.map(op => {
                        const fromAcc = accounts.find(a => a.id === op.fromAccountId)
                        return (
                          <TableRow key={op.id}>
                            <TableCell className="whitespace-nowrap text-slate-600">{(op.txnDate || '').slice(0, 10)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-800">{fromAcc?.name || '—'}</span>
                                {fromAcc && <Badge variant="outline" className="text-[10px]">{fromAcc.type}</Badge>}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-rose-700 font-semibold">↑ ₹{fmt(op.amount)}</span>
                            </TableCell>
                            <TableCell className="max-w-[320px] truncate text-slate-600" title={op.note}>{op.note || '—'}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditWithdraw(op)}>
                                  <Edit className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" onClick={() => handleDeleteOp(op)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
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

          {/* Transfer table */}
          <TabsContent value="TRANSFER" className="mt-3">
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <div className="flex items-center gap-2">
                    <ArrowLeftRight className="w-4 h-4 text-emerald-600" />
                    <h3 className="font-semibold text-slate-900">Internal Transfers</h3>
                    <Badge variant="secondary">{operations.length}</Badge>
                  </div>
                </div>
                {operations.length === 0 ? (
                  <div className="text-center py-10 text-slate-500">
                    <ArrowLeftRight className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                    <p>No transfers yet</p>
                    <p className="text-sm text-slate-400">
                      Click <span className="text-emerald-600 font-medium">Transfer</span> above to move money between accounts
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>From</TableHead>
                        <TableHead>To</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {operations.map(op => {
                        const fromAcc = accounts.find(a => a.id === op.fromAccountId)
                        const toAcc = accounts.find(a => a.id === op.toAccountId)
                        return (
                          <TableRow key={op.id}>
                            <TableCell className="whitespace-nowrap text-slate-600">{(op.txnDate || '').slice(0, 10)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-800">{fromAcc?.name || '—'}</span>
                                {fromAcc && <Badge variant="outline" className="text-[10px]">{fromAcc.type}</Badge>}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <ArrowRight className="w-3 h-3 text-slate-400" />
                                <span className="font-medium text-slate-800">{toAcc?.name || '—'}</span>
                                {toAcc && <Badge variant="outline" className="text-[10px]">{toAcc.type}</Badge>}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-emerald-700 font-semibold">₹{fmt(op.amount)}</span>
                            </TableCell>
                            <TableCell className="max-w-[280px] truncate text-slate-600" title={op.note}>{op.note || '—'}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditTransfer(op)}>
                                  <Edit className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" onClick={() => handleDeleteOp(op)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
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

          {/* Direct Payment table */}
          <TabsContent value="DIRECT_PAYMENT" className="mt-3">
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <div className="flex items-center gap-2">
                    <ArrowDownCircle className="w-4 h-4 text-indigo-600 rotate-180" />
                    <h3 className="font-semibold text-slate-900">Direct Payments</h3>
                    <Badge variant="secondary">{operations.length}</Badge>
                  </div>
                </div>
                {operations.length === 0 ? (
                  <div className="text-center py-10 text-slate-500">
                    <ArrowDownCircle className="w-12 h-12 mx-auto text-slate-300 mb-2 rotate-180" />
                    <p>No direct payments yet</p>
                    <p className="text-sm text-slate-400">
                      Click <span className="text-indigo-600 font-medium">Direct Add</span> above to record one
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {operations.map(op => {
                        const fromAcc = accounts.find(a => a.id === op.fromAccountId)
                        return (
                          <TableRow key={op.id}>
                            <TableCell className="whitespace-nowrap text-slate-600">{(op.txnDate || '').slice(0, 10)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-800">{fromAcc?.name || '—'}</span>
                                {fromAcc && <Badge variant="outline" className="text-[10px]">{fromAcc.type}</Badge>}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-indigo-700 font-semibold">↓ ₹{fmt(op.amount)}</span>
                            </TableCell>
                            <TableCell className="max-w-[320px] truncate text-slate-600" title={op.note}>{op.note || '—'}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditDirectPayment(op)}>
                                  <Edit className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" onClick={() => handleDeleteOp(op)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
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

      {/* Withdrawal modal */}
      <Dialog open={showWithdraw} onOpenChange={setShowWithdraw}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="-mx-6 -mt-6 px-6 py-4 rounded-t-lg bg-rose-500 text-white">
              <DialogTitle className="flex items-center gap-2 text-white">
                <ArrowDownCircle className="w-5 h-5" />
                {editingOp ? 'Edit Withdrawal' : 'Bank Withdrawal'}
              </DialogTitle>
              <DialogDescription className="text-white/90">
                Money pulled out of an account. Balance reduces by this amount.
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <div className="sm:col-span-2">
              <Label>Bank Account *</Label>
              <Select value={withdrawForm.fromAccountId} onValueChange={v => setWithdrawForm({ ...withdrawForm, fromAccountId: v })}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {bankAccounts.length === 0 && (
                    <div className="px-2 py-3 text-sm text-slate-400 text-center">No bank accounts found</div>
                  )}
                  {bankAccounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} — ₹{fmt(a.currentBalance)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (₹) *</Label>
              <Input type="number" min="0" step="0.01" placeholder="0" value={withdrawForm.amount} onChange={e => setWithdrawForm({ ...withdrawForm, amount: e.target.value })} />
            </div>
            <div>
              <Label>Date *</Label>
              <Input type="date" max={todayISO()} value={withdrawForm.txnDate} onChange={e => setWithdrawForm({ ...withdrawForm, txnDate: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Note / Remark</Label>
              <Textarea rows={3} placeholder="e.g., Cash withdrawn at HDFC branch" value={withdrawForm.note} onChange={e => setWithdrawForm({ ...withdrawForm, note: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWithdraw(false)}>Cancel</Button>
            <Button className="bg-rose-600 hover:bg-rose-700" onClick={handleSaveWithdraw}>
              {editingOp ? 'Save Changes' : 'Record Withdrawal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer modal */}
      <Dialog open={showTransfer} onOpenChange={setShowTransfer}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="-mx-6 -mt-6 px-6 py-4 rounded-t-lg bg-emerald-500 text-white">
              <DialogTitle className="flex items-center gap-2 text-white">
                <ArrowLeftRight className="w-5 h-5" />
                {editingOp ? 'Edit Transfer' : 'Internal Transfer'}
              </DialogTitle>
              <DialogDescription className="text-white/90">
                Move money between two accounts. Both balances update accordingly.
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <div>
              <Label>From Account *</Label>
              <Select value={transferForm.fromAccountId} onValueChange={v => setTransferForm({ ...transferForm, fromAccountId: v })}>
                <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                <SelectContent>
                  {allAccounts.map(a => (
                    <SelectItem key={a.id} value={a.id} disabled={a.id === transferForm.toAccountId}>
                      {a.name} ({a.type}) — ₹{fmt(a.currentBalance)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>To Account *</Label>
              <Select value={transferForm.toAccountId} onValueChange={v => setTransferForm({ ...transferForm, toAccountId: v })}>
                <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
                <SelectContent>
                  {allAccounts.map(a => (
                    <SelectItem key={a.id} value={a.id} disabled={a.id === transferForm.fromAccountId}>
                      {a.name} ({a.type}) — ₹{fmt(a.currentBalance)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (₹) *</Label>
              <Input type="number" min="0" step="0.01" placeholder="0" value={transferForm.amount} onChange={e => setTransferForm({ ...transferForm, amount: e.target.value })} />
            </div>
            <div>
              <Label>Date *</Label>
              <Input type="date" max={todayISO()} value={transferForm.txnDate} onChange={e => setTransferForm({ ...transferForm, txnDate: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Note / Remark</Label>
              <Textarea rows={3} placeholder="e.g., Moved surplus from HDFC to ICICI" value={transferForm.note} onChange={e => setTransferForm({ ...transferForm, note: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransfer(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSaveTransfer}>
              {editingOp ? 'Save Changes' : 'Record Transfer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Direct Payment modal — mirrors the Withdrawal form layout exactly,
          only the direction differs (money goes IN instead of OUT). */}
      <Dialog open={showDirectPayment} onOpenChange={setShowDirectPayment}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="-mx-6 -mt-6 px-6 py-4 rounded-t-lg bg-indigo-500 text-white">
              <DialogTitle className="flex items-center gap-2 text-white">
                <ArrowDownCircle className="w-5 h-5 rotate-180" />
                {editingOp ? 'Edit Direct Payment' : 'Direct Add Payment'}
              </DialogTitle>
              <DialogDescription className="text-white/90">
                Money added directly to an account. Balance increases by this amount.
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <div className="sm:col-span-2">
              <Label>Account *</Label>
              <Select value={directPaymentForm.fromAccountId} onValueChange={v => setDirectPaymentForm({ ...directPaymentForm, fromAccountId: v })}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {allAccounts.length === 0 && (
                    <div className="px-2 py-3 text-sm text-slate-400 text-center">No accounts found</div>
                  )}
                  {allAccounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.type}) — ₹{fmt(a.currentBalance)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (₹) *</Label>
              <Input type="number" min="0" step="0.01" placeholder="0" value={directPaymentForm.amount} onChange={e => setDirectPaymentForm({ ...directPaymentForm, amount: e.target.value })} />
            </div>
            <div>
              <Label>Date *</Label>
              <Input type="date" max={todayISO()} value={directPaymentForm.txnDate} onChange={e => setDirectPaymentForm({ ...directPaymentForm, txnDate: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Note / Remark</Label>
              <Textarea rows={3} placeholder="e.g., Direct cash deposit into HDFC" value={directPaymentForm.note} onChange={e => setDirectPaymentForm({ ...directPaymentForm, note: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDirectPayment(false)}>Cancel</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={handleSaveDirectPayment}>
              {editingOp ? 'Save Changes' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
