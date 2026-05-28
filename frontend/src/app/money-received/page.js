'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Toaster } from '@/components/ui/toaster'
import {
  ArrowDownToLine, Filter, X, Search, Download, RefreshCw, Calendar,
} from 'lucide-react'
import { AppShell } from '@/components/dashboard/AppShell'

const SOURCE_TYPE_LABELS = {
  'SALE_PAYMENT': 'Sale Payment',
  'CUSTOMER_PAYMENT': 'Customer Payment',
  'PURCHASE_PAYMENT': 'Purchase Payment',
  'EXPENSE_PAYMENT': 'Expense Payment',
  'COMMISSION_PAYMENT': 'Commission Payment',
  'BROKER_COMMISSION': 'Broker Commission',
  'PARTNER_CAPITAL': 'Partner Capital',
  'RESALE_BUYER_PAYMENT': 'Resale - Buyer',
  'RESALE_SELLER_PAYOUT': 'Resale - Seller',
  'RESALE_COMPANY_COMMISSION': 'Resale - Company Fee',
  'LOAN_BORROWED': 'Loan Borrowed',
  'LOAN_BORROWED_REPAYMENT': 'Loan Repaid',
  'LOAN_GIVEN_REPAYMENT': 'Loan Received Back',
  'FIRM_TRANSACTION': 'Firm Ledger',
  'DASTI_TRANSACTION': 'Dasti Ledger',
  'OPENING_BALANCE': 'Opening Balance',
  'QUICK_EXPENSE': 'Manual Entry',
  'OTHER': 'Other',
}

const PAYMENT_MODES = ['Cash', 'Bank Transfer', 'Cheque', 'RTGS', 'UPI']

const fmt = (value) => {
  const n = Math.round((Number(value) || 0) * 100) / 100
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const labelFor = (sourceType) =>
  SOURCE_TYPE_LABELS[sourceType] || (sourceType || '').replace(/_/g, ' ') || 'Other'

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const fmtDate = (s) => {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return String(s).slice(0, 10)
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' })
}

const fmtDateTime = (s) => {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return String(s)
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function MoneyReceivedPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [token, setToken] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const [transactions, setTransactions] = useState([])
  const [summary, setSummary] = useState({ totalAmount: 0, matchCount: 0, pageCount: 0 })
  const [accounts, setAccounts] = useState([])
  const [societies, setSocieties] = useState([])

  const [pagination, setPagination] = useState({ page: 1, limit: 50, totalCount: 0, totalPages: 0 })

  const [showFilters, setShowFilters] = useState(true)
  const [filters, setFilters] = useState({
    societyId: 'all',
    accountId: 'all',
    sourceType: 'all',
    paymentMode: 'all',
    txnFrom: '',
    txnTo: '',
    createdFrom: '',
    createdTo: '',
    search: '',
  })

  // ---------- API helper
  const apiCall = async (endpoint) => {
    const authToken = token || localStorage.getItem('token')
    const response = await fetch(`/api${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
    })
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

  const loadAccounts = async () => {
    try { setAccounts(await apiCall('/accounts')) }
    catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }) }
  }
  const loadSocieties = async () => {
    try { setSocieties(await apiCall('/societies')) }
    catch (e) { /* non-fatal */ }
  }

  // Stable JSON signature of the filters so we can tell "filters changed" vs
  // "only the page changed" — pagination shouldn't re-run the expensive
  // summary aggregate on the server.
  const filtersJson = useMemo(() => JSON.stringify(filters), [filters])
  const lastFiltersRef = useRef('')

  const loadList = async ({ includeSummary }) => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.append('page', String(pagination.page))
      params.append('limit', String(pagination.limit))
      if (!includeSummary) params.append('skipSummary', '1')
      Object.entries(filters).forEach(([k, v]) => {
        if (v && v !== 'all' && k !== 'search') params.append(k, v)
      })
      const data = await apiCall(`/money-received?${params.toString()}`)
      let rows = data.transactions || []
      // The `search` filter runs client-side on the current page — keeps the
      // server endpoint simple and avoids a special-cased text index.
      if (filters.search) {
        const q = filters.search.toLowerCase()
        rows = rows.filter(t =>
          (t.partyName || '').toLowerCase().includes(q) ||
          (t.remark || '').toLowerCase().includes(q) ||
          (t.referenceNo || '').toLowerCase().includes(q),
        )
      }
      setTransactions(rows)
      // Only overwrite summary on full loads — otherwise keep the totals the
      // user last saw so they don't blink to ₹0 while paginating.
      if (includeSummary && data.summary) {
        setSummary(data.summary)
      }
      if (data.pagination && data.pagination.totalCount != null) {
        setPagination(prev => ({
          ...prev,
          totalCount: data.pagination.totalCount,
          totalPages: data.pagination.totalPages,
        }))
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      loadAccounts()
      loadSocieties()
    }
  }, [isAuthenticated])

  // Single effect drives all list loads. Behaviour:
  //   • filters changed AND page > 1 → reset to page 1, don't fetch yet
  //     (the page change re-fires this effect and the fetch happens then).
  //   • filters changed AND page = 1 → full fetch with summary.
  //   • only page/limit changed → paginated fetch, skip summary.
  // This avoids the previous double-fetch where a filter change first reset
  // page and then re-triggered another full load.
  useEffect(() => {
    if (!isAuthenticated) return

    const filtersChanged = filtersJson !== lastFiltersRef.current
    if (filtersChanged && pagination.page !== 1) {
      // Don't update the ref yet — let the page-1 trigger run the actual fetch.
      setPagination(p => ({ ...p, page: 1 }))
      return
    }

    lastFiltersRef.current = filtersJson
    loadList({ includeSummary: filtersChanged })
  }, [isAuthenticated, filtersJson, pagination.page, pagination.limit])

  const clearFilters = () => setFilters({
    societyId: 'all', accountId: 'all', sourceType: 'all', paymentMode: 'all',
    txnFrom: '', txnTo: '', createdFrom: '', createdTo: '', search: '',
  })

  const applyPreset = (preset, basis) => {
    const today = new Date()
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    let from = '', to = iso(today)
    if (preset === 'today') from = iso(today)
    else if (preset === 'week') {
      const start = new Date(today); start.setDate(today.getDate() - today.getDay()); from = iso(start)
    } else if (preset === 'month') {
      from = iso(new Date(today.getFullYear(), today.getMonth(), 1))
    } else if (preset === 'lastMonth') {
      from = iso(new Date(today.getFullYear(), today.getMonth() - 1, 1))
      to = iso(new Date(today.getFullYear(), today.getMonth(), 0))
    } else if (preset === 'year') {
      from = iso(new Date(today.getFullYear(), 0, 1))
    }
    if (basis === 'txn') setFilters(f => ({ ...f, txnFrom: from, txnTo: to }))
    else setFilters(f => ({ ...f, createdFrom: from, createdTo: to }))
  }

  // ---------- CSV export (current page only — same scope as the table view)
  const exportCSV = () => {
    if (!transactions.length) { toast({ title: 'Nothing to export', description: 'No entries match the current filters' }); return }
    const headers = ['Txn Date', 'Entry Created', 'Source', 'Society', 'Account', 'Mode', 'Party', 'Reference', 'Amount', 'Remark']
    const rows = transactions.map(t => [
      (t.txnDate || '').slice(0, 10),
      t.createdAt ? new Date(t.createdAt).toISOString() : '',
      labelFor(t.sourceType),
      t.societyName || '',
      t.accountName || '',
      t.paymentMode || '',
      t.partyName || '',
      t.referenceNo || '',
      t.amount || 0,
      (t.remark || '').replace(/"/g, '""'),
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `money_received_${todayISO()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!isAuthenticated) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
  }

  return (
    <AppShell user={user} onLogout={handleLogout} searchPlaceholder="Search money received...">
      <Toaster />

      <div className="space-y-4">
        {/* Hero header */}
        <div className="rounded-2xl p-5 bg-gradient-to-r from-emerald-600 via-green-500 to-teal-500 text-white shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
                <ArrowDownToLine className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Money Received</h2>
                <p className="text-sm text-white/90">Every IN entry — filter by transaction date and entry creation date.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={exportCSV}>
                <Download className="w-4 h-4 mr-2" /> Excel
              </Button>
              <Button variant="secondary" size="sm" onClick={loadList}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card className="bg-emerald-50/60">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Total Received</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">₹{fmt(summary.totalAmount)}</p>
              <p className="text-xs text-slate-500 mt-1">Across {summary.matchCount} entries</p>
            </CardContent>
          </Card>
          <Card className="bg-blue-50/60">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-blue-700">Filtered</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{summary.matchCount}</p>
              <p className="text-xs text-slate-500 mt-1">Matching current filters</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-50/60">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-slate-700">On This Page</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{transactions.length}</p>
              <p className="text-xs text-slate-500 mt-1">Page {pagination.page} / {Math.max(1, pagination.totalPages || 1)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="text-slate-600" onClick={() => setShowFilters(v => !v)}>
                <Filter className="w-4 h-4 mr-1" /> Filters
              </Button>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  <X className="w-4 h-4 mr-1" /> Clear
                </Button>
              </div>
            </div>

            {showFilters && (
              <>
                {/* Transaction-date range — the date the user entered for the
                    actual cash movement. */}
                <div className="rounded-md border bg-slate-50/50 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-emerald-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Transaction Date</p>
                    <div className="ml-auto flex flex-wrap items-center gap-1">
                      {['today', 'week', 'month', 'lastMonth', 'year'].map(p => (
                        <Button key={p} type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => applyPreset(p, 'txn')}>
                          {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : p === 'lastMonth' ? 'Last Month' : 'This Year'}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-slate-600">From</Label>
                      <Input type="date" className="h-9" value={filters.txnFrom} onChange={e => setFilters(f => ({ ...f, txnFrom: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">To</Label>
                      <Input type="date" className="h-9" value={filters.txnTo} onChange={e => setFilters(f => ({ ...f, txnTo: e.target.value }))} />
                    </div>
                  </div>
                </div>

                {/* Entry-created range — when the row was actually logged in
                    the system. Useful for catching late/backdated entries. */}
                <div className="rounded-md border bg-slate-50/50 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Entry Created Date</p>
                    <div className="ml-auto flex flex-wrap items-center gap-1">
                      {['today', 'week', 'month', 'lastMonth', 'year'].map(p => (
                        <Button key={p} type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => applyPreset(p, 'created')}>
                          {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : p === 'lastMonth' ? 'Last Month' : 'This Year'}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-slate-600">From</Label>
                      <Input type="date" className="h-9" value={filters.createdFrom} onChange={e => setFilters(f => ({ ...f, createdFrom: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">To</Label>
                      <Input type="date" className="h-9" value={filters.createdTo} onChange={e => setFilters(f => ({ ...f, createdTo: e.target.value }))} />
                    </div>
                  </div>
                </div>

                {/* Other filters */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <Select value={filters.societyId} onValueChange={v => setFilters(f => ({ ...f, societyId: v }))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="All Societies" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Societies</SelectItem>
                      <SelectItem value="company">Company (no society)</SelectItem>
                      {societies.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filters.accountId} onValueChange={v => setFilters(f => ({ ...f, accountId: v }))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="All Accounts" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Accounts</SelectItem>
                      {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filters.sourceType} onValueChange={v => setFilters(f => ({ ...f, sourceType: v }))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="All Sources" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sources</SelectItem>
                      {Object.entries(SOURCE_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filters.paymentMode} onValueChange={v => setFilters(f => ({ ...f, paymentMode: v }))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="All Modes" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Modes</SelectItem>
                      {PAYMENT_MODES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                    <Input className="h-9 pl-8" placeholder="Search party / remark..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <ArrowDownToLine className="w-4 h-4 text-emerald-600" />
                <h3 className="font-semibold text-slate-900">Money Received</h3>
                <Badge variant="secondary">{summary.matchCount}</Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                Page size:
                <Select value={String(pagination.limit)} onValueChange={v => setPagination(p => ({ ...p, page: 1, limit: parseInt(v) }))}>
                  <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[25, 50, 100, 200].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                <ArrowDownToLine className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                <p>No money-received entries match the current filters</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Txn Date</TableHead>
                    <TableHead>Entry Created</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Party</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Remark</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap text-slate-700">{fmtDate(t.txnDate)}</TableCell>
                      <TableCell className="whitespace-nowrap text-slate-500 text-xs">{fmtDateTime(t.createdAt)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{labelFor(t.sourceType)}</Badge>
                        {t.societyName && t.societyName !== 'Company' && (
                          <div className="text-[10px] text-slate-500 mt-0.5">{t.societyName}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-800">{t.partyName || '—'}</TableCell>
                      <TableCell className="text-slate-600 text-sm">{t.accountName || '—'}</TableCell>
                      <TableCell><Badge variant="outline">{t.paymentMode || '—'}</Badge></TableCell>
                      <TableCell className="text-right">
                        <span className="text-emerald-700 font-semibold">↓ ₹{fmt(t.amount)}</span>
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate text-slate-600" title={t.remark}>{t.remark || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50/40">
                <p className="text-xs text-slate-500">
                  Page {pagination.page} of {pagination.totalPages} · {pagination.totalCount} total
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => setPagination(p => ({ ...p, page: Math.max(1, p.page - 1) }))}>Prev</Button>
                  <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination(p => ({ ...p, page: Math.min(pagination.totalPages, p.page + 1) }))}>Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
