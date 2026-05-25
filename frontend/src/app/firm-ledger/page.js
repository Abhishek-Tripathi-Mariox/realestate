'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Toaster } from '@/components/ui/toaster'
import { Briefcase, Plus, Edit, Trash2, Eye, ArrowDownCircle, ArrowUpCircle, Building2, Filter, X, Download, Search, RefreshCw, MoreVertical } from 'lucide-react'
import { AppShell } from '@/components/dashboard/AppShell'
import { getDeleteOtp, refreshDeleteOtp } from '@/lib/deleteOtp'

const PAYMENT_MODES = ['Cash', 'Bank Transfer', 'Cheque', 'RTGS', 'UPI']

const fmt = (value) => {
  const n = Math.round((Number(value) || 0) * 100) / 100
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const FIRM_GRADIENTS = [
  'from-teal-500 to-emerald-500',
  'from-blue-500 to-sky-500',
  'from-indigo-500 to-blue-500',
  'from-amber-500 to-yellow-500',
  'from-rose-500 to-red-500',
  'from-purple-500 to-fuchsia-500',
]
const pickGradient = (key = '') => {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return FIRM_GRADIENTS[h % FIRM_GRADIENTS.length]
}
const initials = (name = '') => {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map(p => p[0]?.toUpperCase() || '').join('') || '?'
}

export default function FirmLedgerPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [token, setToken] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const [firms, setFirms] = useState([])
  const [accounts, setAccounts] = useState([])
  const [transactions, setTransactions] = useState([])
  const [summary, setSummary] = useState({ totalIn: 0, totalOut: 0, netBalance: 0, firmsActive: 0, txnCount: 0 })

  const [showFilters, setShowFilters] = useState(true)
  const [filters, setFilters] = useState({
    firmId: 'all',
    type: 'all',
    paymentMode: 'all',
    from: '',
    to: '',
    search: '',
  })

  // Add/Edit transaction
  const [showAddTxn, setShowAddTxn] = useState(false)
  const [txnFormType, setTxnFormType] = useState('IN')
  const [editingTxn, setEditingTxn] = useState(null)
  const [txnForm, setTxnForm] = useState({
    type: 'IN',
    amount: '',
    firmId: '',
    accountId: '',
    counterparty: '',
    paymentMode: 'Cash',
    txnDate: todayISO(),
    note: '',
  })

  // Manage firms
  const [showManageFirms, setShowManageFirms] = useState(false)
  const [firmForm, setFirmForm] = useState({ name: '', remark: '' })
  const [editingFirm, setEditingFirm] = useState(null)

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
  const loadFirms = async () => {
    try { setFirms(await apiCall('/firms')) }
    catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }) }
  }
  const loadAccounts = async () => {
    try { setAccounts(await apiCall('/accounts')) }
    catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }) }
  }
  const loadTransactions = async () => {
    try {
      const qs = new URLSearchParams()
      Object.entries(filters).forEach(([k, v]) => { if (v && v !== 'all') qs.append(k, v) })
      const list = await apiCall(`/firm-ledger/transactions?${qs.toString()}`)
      setTransactions(list)
      const s = await apiCall(`/firm-ledger/transactions/summary?${qs.toString()}`)
      setSummary(s)
    } catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }) }
  }
  const refreshAll = async () => {
    setLoading(true)
    try { await Promise.all([loadFirms(), loadAccounts(), loadTransactions()]) }
    finally { setLoading(false) }
  }

  useEffect(() => { if (isAuthenticated) refreshAll() }, [isAuthenticated])
  useEffect(() => { if (isAuthenticated) loadTransactions() }, [filters])

  // ---------- Firm CRUD
  const openManageFirms = () => {
    setFirmForm({ name: '', remark: '' })
    setEditingFirm(null)
    setShowManageFirms(true)
  }
  const handleSaveFirm = async () => {
    const name = firmForm.name.trim()
    if (!name) { toast({ variant: 'destructive', title: 'Error', description: 'Firm name is required' }); return }
    try {
      if (editingFirm) {
        await apiCall(`/firms/${editingFirm.id}`, 'PUT', firmForm)
        toast({ title: 'Saved', description: 'Firm updated' })
      } else {
        await apiCall('/firms', 'POST', firmForm)
        toast({ title: 'Saved', description: 'Firm added' })
      }
      setFirmForm({ name: '', remark: '' })
      setEditingFirm(null)
      await loadFirms()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message })
    }
  }
  const handleDeleteFirm = async (f) => {
    if (!confirm(`Delete firm "${f.name}"?`)) return
    try {
      await apiCall(`/firms/${f.id}`, 'DELETE')
      toast({ title: 'Deleted', description: 'Firm removed' })
      await loadFirms()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message })
    }
  }

  // ---------- Transaction CRUD
  const openAddTxn = (type) => {
    setEditingTxn(null)
    setTxnFormType(type)
    setTxnForm({
      type,
      amount: '',
      firmId: firms.length === 1 ? firms[0].id : '',
      accountId: '',
      counterparty: '',
      paymentMode: 'Cash',
      txnDate: todayISO(),
      note: '',
    })
    setShowAddTxn(true)
  }
  const openEditTxn = (t) => {
    setEditingTxn(t)
    setTxnFormType(t.type)
    setTxnForm({
      type: t.type,
      amount: String(t.amount || ''),
      firmId: t.firmId || '',
      accountId: t.accountId || '',
      counterparty: t.counterparty || '',
      paymentMode: t.paymentMode || 'Cash',
      txnDate: (t.txnDate || '').slice(0, 10),
      note: t.note || '',
    })
    setShowAddTxn(true)
  }
  const handleSaveTxn = async () => {
    const amount = parseFloat(txnForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) { toast({ variant: 'destructive', title: 'Error', description: 'Amount must be greater than 0' }); return }
    if (!txnForm.firmId) { toast({ variant: 'destructive', title: 'Error', description: 'Pick a firm' }); return }
    if (!txnForm.accountId) { toast({ variant: 'destructive', title: 'Error', description: 'Pick an account' }); return }
    if (!txnForm.txnDate) { toast({ variant: 'destructive', title: 'Error', description: 'Transaction date is required' }); return }
    try {
      const payload = { ...txnForm, amount }
      if (editingTxn) {
        await apiCall(`/firm-ledger/transactions/${editingTxn.id}`, 'PUT', payload)
        toast({ title: 'Saved', description: 'Entry updated' })
      } else {
        await apiCall('/firm-ledger/transactions', 'POST', payload)
        toast({ title: 'Saved', description: `${txnForm.type} entry added` })
      }
      setShowAddTxn(false)
      await Promise.all([loadTransactions(), loadFirms(), loadAccounts()])
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message })
    }
  }
  const handleDeleteTxn = async (t) => {
    if (!confirm('Delete this entry?')) return
    try {
      await apiCall(`/firm-ledger/transactions/${t.id}`, 'DELETE')
      toast({ title: 'Deleted', description: 'Entry removed' })
      await Promise.all([loadTransactions(), loadFirms(), loadAccounts()])
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message })
    }
  }

  // ---------- CSV export
  const exportCSV = () => {
    if (!transactions.length) { toast({ title: 'Nothing to export', description: 'No transactions match the current filters' }); return }
    const headers = ['Date', 'Firm', 'Type', 'Counterparty', 'Amount', 'Mode', 'Account', 'Note']
    const rows = transactions.map(t => [
      (t.txnDate || '').slice(0, 10),
      firms.find(f => f.id === t.firmId)?.name || '',
      t.type,
      t.counterparty || '',
      t.amount || 0,
      t.paymentMode || '',
      accounts.find(a => a.id === t.accountId)?.name || '',
      (t.note || '').replace(/"/g, '""'),
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `firm_ledger_${todayISO()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!isAuthenticated) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
  }

  return (
    <AppShell user={user} onLogout={handleLogout} searchPlaceholder="Search firms / notes...">
      <Toaster />

      <div className="space-y-4">
        {/* Hero header — teal/blue gradient to differentiate from Dasti */}
        <div className="rounded-2xl p-5 bg-gradient-to-r from-teal-600 via-cyan-500 to-blue-500 text-white shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
                <Briefcase className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Firm Ledger</h2>
                <p className="text-sm text-white/90">Per-firm money IN / OUT — standalone, simple, fast.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={exportCSV}>
                <Download className="w-4 h-4 mr-2" /> Excel
              </Button>
              <Button variant="secondary" size="sm" onClick={openManageFirms}>
                <Building2 className="w-4 h-4 mr-2" /> Firms
              </Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white border-0" onClick={() => openAddTxn('IN')}>
                <ArrowDownCircle className="w-4 h-4 mr-2" /> Add IN
              </Button>
              <Button size="sm" className="bg-rose-600 hover:bg-rose-700 text-white border-0" onClick={() => openAddTxn('OUT')}>
                <ArrowUpCircle className="w-4 h-4 mr-2" /> Add OUT
              </Button>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-emerald-50/60">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Total IN</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">₹{fmt(summary.totalIn)}</p>
              <p className="text-xs text-slate-500 mt-1">Money received</p>
            </CardContent>
          </Card>
          <Card className="bg-rose-50/60">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-rose-700">Total OUT</p>
              <p className="text-2xl font-bold text-rose-700 mt-1">₹{fmt(summary.totalOut)}</p>
              <p className="text-xs text-slate-500 mt-1">Money paid</p>
            </CardContent>
          </Card>
          <Card className={summary.netBalance >= 0 ? 'bg-blue-50/60' : 'bg-amber-50/60'}>
            <CardContent className="p-4">
              <p className={`text-xs uppercase tracking-wide ${summary.netBalance >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>Net Balance</p>
              <p className={`text-2xl font-bold mt-1 ${summary.netBalance >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>
                ₹{fmt(Math.abs(summary.netBalance))}
              </p>
              <p className="text-xs text-slate-500 mt-1">{summary.netBalance >= 0 ? 'Net inflow' : 'Net outflow'}</p>
            </CardContent>
          </Card>
          <Card className="bg-purple-50/60">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-purple-700">Activities</p>
              <p className="text-2xl font-bold text-purple-700 mt-1">{summary.txnCount}</p>
              <p className="text-xs text-slate-500 mt-1">{firms.length} firms</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-3">
              <Button variant="ghost" size="sm" className="text-slate-600" onClick={() => setShowFilters(v => !v)}>
                <Filter className="w-4 h-4 mr-1" /> Filters
              </Button>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setFilters({ firmId: 'all', type: 'all', paymentMode: 'all', from: '', to: '', search: '' })}>
                  <X className="w-4 h-4 mr-1" /> Clear
                </Button>
                <Button variant="outline" size="sm" onClick={refreshAll}>
                  <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
                </Button>
              </div>
            </div>
            {showFilters && (
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                <Select value={filters.firmId} onValueChange={v => setFilters(f => ({ ...f, firmId: v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="All Firms" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Firms</SelectItem>
                    {firms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filters.type} onValueChange={v => setFilters(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="All Types" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="IN">IN — Money received</SelectItem>
                    <SelectItem value="OUT">OUT — Money paid</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filters.paymentMode} onValueChange={v => setFilters(f => ({ ...f, paymentMode: v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="All Modes" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Modes</SelectItem>
                    {PAYMENT_MODES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="date" className="h-9" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
                <Input type="date" className="h-9" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                  <Input className="h-9 pl-8" placeholder="Search note / party..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Firms grid (each firm card = own ledger) */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-teal-600" />
                <h3 className="font-semibold text-slate-900">Firms</h3>
                <Badge variant="secondary">{firms.length}</Badge>
              </div>
              <Button size="sm" onClick={openManageFirms}>
                <Plus className="w-4 h-4 mr-1" /> Add Firm
              </Button>
            </div>
            {firms.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Building2 className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                <p>No firms yet</p>
                <p className="text-sm text-slate-400">Click &ldquo;Add Firm&rdquo; to set up your first one</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {firms.map(f => {
                  const balPositive = (f.balance || 0) >= 0
                  return (
                    <Link key={f.id} href={`/firm-ledger/${f.id}`} className="block group">
                      <Card className="overflow-hidden hover:shadow-md transition-shadow">
                        <div className={`h-1.5 bg-gradient-to-r ${pickGradient(f.id)}`} />
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${pickGradient(f.id)} text-white font-bold flex items-center justify-center shrink-0`}>
                                {initials(f.name)}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 truncate">{f.name}</p>
                                {f.remark && <p className="text-xs text-slate-500 truncate">{f.remark}</p>}
                              </div>
                            </div>
                            {/* The whole card already links to the detail page;
                                the eye button just makes that affordance
                                discoverable next to edit/delete. */}
                            <div className="flex items-center gap-1" onClick={e => { e.preventDefault(); e.stopPropagation() }}>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-600 hover:text-teal-600" title="View ledger" onClick={() => router.push(`/firm-ledger/${f.id}`)}>
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Edit" onClick={() => { setEditingFirm(f); setFirmForm({ name: f.name, remark: f.remark || '' }); setShowManageFirms(true) }}>
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" title="Delete" onClick={() => handleDeleteFirm(f)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 mt-3">
                            <div className="rounded-md bg-emerald-50 p-2 text-center">
                              <p className="text-[10px] uppercase tracking-wide text-emerald-700">IN</p>
                              <p className="text-sm font-bold text-emerald-700">₹{fmt(f.totalIn)}</p>
                            </div>
                            <div className="rounded-md bg-rose-50 p-2 text-center">
                              <p className="text-[10px] uppercase tracking-wide text-rose-700">OUT</p>
                              <p className="text-sm font-bold text-rose-700">₹{fmt(f.totalOut)}</p>
                            </div>
                            <div className={`rounded-md p-2 text-center ${balPositive ? 'bg-blue-50' : 'bg-amber-50'}`}>
                              <p className={`text-[10px] uppercase tracking-wide ${balPositive ? 'text-blue-700' : 'text-amber-700'}`}>BAL</p>
                              <p className={`text-sm font-bold ${balPositive ? 'text-blue-700' : 'text-amber-700'}`}>
                                ₹{fmt(Math.abs(f.balance || 0))}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transactions table */}
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <MoreVertical className="w-4 h-4 text-teal-600" />
                <h3 className="font-semibold text-slate-900">Transactions</h3>
                <Badge variant="secondary">{transactions.length}</Badge>
              </div>
            </div>
            {transactions.length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                <Briefcase className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                <p>No transactions yet</p>
                <p className="text-sm text-slate-400">
                  Click <span className="text-emerald-600 font-medium">+ Add IN</span> or{' '}
                  <span className="text-rose-600 font-medium">+ Add OUT</span> to start tracking
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Firm</TableHead>
                    <TableHead>Counterparty</TableHead>
                    <TableHead className="text-right">IN</TableHead>
                    <TableHead className="text-right">OUT</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map(t => {
                    const firm = firms.find(f => f.id === t.firmId)
                    const account = accounts.find(a => a.id === t.accountId)
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="whitespace-nowrap text-slate-600">{(t.txnDate || '').slice(0, 10)}</TableCell>
                        <TableCell>
                          {firm ? (
                            <Link href={`/firm-ledger/${firm.id}`} className="flex items-center gap-2 hover:underline">
                              <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${pickGradient(firm.id)} text-white text-xs font-bold flex items-center justify-center`}>
                                {initials(firm.name)}
                              </div>
                              <span className="font-medium text-slate-800">{firm.name}</span>
                            </Link>
                          ) : (
                            <span className="text-slate-400 text-sm">— removed —</span>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-600 text-sm">{t.counterparty || '-'}</TableCell>
                        <TableCell className="text-right">
                          {t.type === 'IN' ? <span className="text-emerald-700 font-semibold">↓ ₹{fmt(t.amount)}</span> : <span className="text-slate-300">—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          {t.type === 'OUT' ? <span className="text-rose-700 font-semibold">↑ ₹{fmt(t.amount)}</span> : <span className="text-slate-300">—</span>}
                        </TableCell>
                        <TableCell><Badge variant="outline">{t.paymentMode}</Badge></TableCell>
                        <TableCell className="text-slate-600 text-sm">{account?.name || '-'}</TableCell>
                        <TableCell className="max-w-[240px] truncate text-slate-600" title={t.note}>{t.note || '—'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditTxn(t)}>
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" onClick={() => handleDeleteTxn(t)}>
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
      </div>

      {/* Add/Edit Transaction modal */}
      <Dialog open={showAddTxn} onOpenChange={setShowAddTxn}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className={`-mx-6 -mt-6 px-6 py-4 rounded-t-lg ${txnFormType === 'IN' ? 'bg-emerald-500' : 'bg-rose-500'} text-white`}>
              <DialogTitle className="flex items-center gap-2 text-white">
                {txnFormType === 'IN' ? <ArrowDownCircle className="w-5 h-5" /> : <ArrowUpCircle className="w-5 h-5" />}
                {editingTxn ? 'Edit Entry' : `Add ${txnFormType} Entry`}
              </DialogTitle>
              <DialogDescription className="text-white/90">
                {txnFormType === 'IN' ? 'Money received by the firm' : 'Money paid out by the firm'}
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <div>
              <Label>Type *</Label>
              <Select value={txnForm.type} onValueChange={v => { setTxnForm({ ...txnForm, type: v }); setTxnFormType(v) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN">IN — Money received</SelectItem>
                  <SelectItem value="OUT">OUT — Money paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (₹) *</Label>
              <Input type="number" min="0" step="0.01" placeholder="0" value={txnForm.amount} onChange={e => setTxnForm({ ...txnForm, amount: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Firm *</Label>
              <Select value={txnForm.firmId} onValueChange={v => setTxnForm({ ...txnForm, firmId: v })}>
                <SelectTrigger><SelectValue placeholder="Pick firm" /></SelectTrigger>
                <SelectContent>
                  {firms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <button type="button" className="text-sm text-teal-600 hover:underline mt-1 inline-flex items-center gap-1" onClick={() => { setShowAddTxn(false); openManageFirms() }}>
                <Plus className="w-3.5 h-3.5" /> Manage firms
              </button>
            </div>
            <div className="sm:col-span-2">
              <Label>Counterparty (From / To whom)</Label>
              <Input placeholder="e.g., Rahul Garg / Cement Vendor / Salary" value={txnForm.counterparty} onChange={e => setTxnForm({ ...txnForm, counterparty: e.target.value })} />
            </div>
            <div>
              <Label>Payment Mode *</Label>
              <Select value={txnForm.paymentMode} onValueChange={v => setTxnForm({ ...txnForm, paymentMode: v, accountId: '' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Account *</Label>
              <Select value={txnForm.accountId} onValueChange={v => setTxnForm({ ...txnForm, accountId: v })}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {accounts
                    .filter(a => txnForm.paymentMode === 'Cash' ? a.type === 'CASH' : a.type === 'BANK')
                    .map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {accounts.filter(a => txnForm.paymentMode === 'Cash' ? a.type === 'CASH' : a.type === 'BANK').length === 0 && (
                <p className="text-xs text-red-600 mt-1">No {txnForm.paymentMode === 'Cash' ? 'cash' : 'bank'} account available</p>
              )}
            </div>
            <div className="sm:col-span-2">
              <Label>Transaction Date *</Label>
              <Input type="date" max={todayISO()} value={txnForm.txnDate} onChange={e => setTxnForm({ ...txnForm, txnDate: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Note / Remark</Label>
              <Textarea rows={3} placeholder="e.g., Q1 capital infusion from partner / Cement bill #1234" value={txnForm.note} onChange={e => setTxnForm({ ...txnForm, note: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddTxn(false)}>Cancel</Button>
            <Button
              className={txnFormType === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}
              onClick={handleSaveTxn}
            >
              {editingTxn ? 'Save Changes' : `Save ${txnFormType} Entry`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Firms modal — same shape as on Dasti page */}
      <Dialog open={showManageFirms} onOpenChange={setShowManageFirms}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-teal-600" />
              Manage Firms
            </DialogTitle>
            <DialogDescription>Your firms / companies. Shared between Dasti Ledger and Firm Ledger.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_auto] gap-2">
              <Input placeholder="Firm name (e.g., A1)" value={firmForm.name} onChange={e => setFirmForm({ ...firmForm, name: e.target.value })} />
              <Input placeholder="Remark (optional)" value={firmForm.remark} onChange={e => setFirmForm({ ...firmForm, remark: e.target.value })} />
              <Button onClick={handleSaveFirm}>{editingFirm ? 'Save' : 'Add'}</Button>
            </div>
            <div className="border rounded-md divide-y">
              {firms.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-6">No firms yet — add one above</p>
              ) : firms.map(f => (
                <div key={f.id} className="flex items-center justify-between p-2.5">
                  <div>
                    <p className="font-medium text-slate-800">{f.name}</p>
                    {f.remark && <p className="text-xs text-slate-500">{f.remark}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setEditingFirm(f); setFirmForm({ name: f.name, remark: f.remark || '' }) }}>
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600" onClick={() => handleDeleteFirm(f)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManageFirms(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
