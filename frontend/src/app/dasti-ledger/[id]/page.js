'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
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
import { ArrowLeft, Wallet, ArrowDownCircle, ArrowUpCircle, Download, Edit, Trash2, Scale } from 'lucide-react'
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
const PERSON_GRADIENTS = [
  'from-purple-500 to-indigo-500',
  'from-rose-500 to-pink-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-sky-500 to-blue-500',
  'from-fuchsia-500 to-purple-500',
]
const pickGradient = (key = '') => {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return PERSON_GRADIENTS[h % PERSON_GRADIENTS.length]
}
const initials = (name = '') => {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map(p => p[0]?.toUpperCase() || '').join('') || '?'
}

export default function DastiPersonDetailPage() {
  const router = useRouter()
  const params = useParams()
  const personId = params.id
  const { toast } = useToast()

  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [token, setToken] = useState(null)
  const [user, setUser] = useState(null)

  const [person, setPerson] = useState(null)
  const [persons, setPersons] = useState([])
  const [firms, setFirms] = useState([])
  const [accounts, setAccounts] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  const [showAddTxn, setShowAddTxn] = useState(false)
  const [txnFormType, setTxnFormType] = useState('IN')
  const [editingTxn, setEditingTxn] = useState(null)
  const [txnForm, setTxnForm] = useState({
    type: 'IN', amount: '', personId: '', firmId: '', accountId: '', paymentMode: 'Cash', txnDate: todayISO(), note: '',
  })

  // ---------- API helper (mirrors the main page; kept inline so per-page
  // logic can evolve independently without a shared module).
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

  const loadAll = async () => {
    if (!personId) return
    setLoading(true)
    try {
      const [p, allPersons, f, a, t] = await Promise.all([
        apiCall(`/dasti/persons/${personId}`),
        apiCall('/dasti/persons'),
        apiCall('/firms'),
        apiCall('/accounts'),
        apiCall(`/dasti/transactions?personId=${personId}`),
      ])
      setPerson(p)
      setPersons(allPersons)
      setFirms(f)
      setAccounts(a)
      setTransactions(t)
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (isAuthenticated) loadAll() }, [isAuthenticated, personId])

  const totalIn = transactions.filter(t => t.type === 'IN').reduce((s, t) => s + (t.amount || 0), 0)
  const totalOut = transactions.filter(t => t.type === 'OUT').reduce((s, t) => s + (t.amount || 0), 0)
  const balance = totalIn - totalOut  // +ve = firm owes person; -ve = person owes firm

  const openAddTxn = (type) => {
    setEditingTxn(null)
    setTxnFormType(type)
    setTxnForm({ type, amount: '', personId, firmId: '', accountId: '', paymentMode: 'Cash', txnDate: todayISO(), note: '' })
    setShowAddTxn(true)
  }
  const openEditTxn = (t) => {
    setEditingTxn(t)
    setTxnFormType(t.type)
    setTxnForm({
      type: t.type,
      amount: String(t.amount || ''),
      personId: t.personId || personId,
      firmId: t.firmId || '',
      accountId: t.accountId || '',
      paymentMode: t.paymentMode || 'Cash',
      txnDate: (t.txnDate || '').slice(0, 10),
      note: t.note || '',
    })
    setShowAddTxn(true)
  }
  const handleSaveTxn = async () => {
    const amount = parseFloat(txnForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) { toast({ variant: 'destructive', title: 'Error', description: 'Amount must be greater than 0' }); return }
    if (!txnForm.personId) { toast({ variant: 'destructive', title: 'Error', description: 'Pick a dasti account' }); return }
    if (!txnForm.accountId) { toast({ variant: 'destructive', title: 'Error', description: 'Pick an account' }); return }
    if (!txnForm.txnDate) { toast({ variant: 'destructive', title: 'Error', description: 'Transaction date is required' }); return }
    try {
      // `personId` comes straight from the form so the user can reassign the
      // entry to a different dasti person from the edit dialog. If they do,
      // the row drops out of this person's view on reload — that's expected.
      const payload = { ...txnForm, amount }
      if (!payload.firmId) payload.firmId = null
      if (editingTxn) {
        await apiCall(`/dasti/transactions/${editingTxn.id}`, 'PUT', payload)
        toast({ title: 'Saved', description: 'Entry updated' })
      } else {
        await apiCall('/dasti/transactions', 'POST', payload)
        toast({ title: 'Saved', description: `${txnForm.type} entry added` })
      }
      setShowAddTxn(false)
      await loadAll()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message })
    }
  }
  const handleDeleteTxn = async (t) => {
    if (!confirm('Delete this entry?')) return
    try {
      await apiCall(`/dasti/transactions/${t.id}`, 'DELETE')
      toast({ title: 'Deleted', description: 'Entry removed' })
      await loadAll()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message })
    }
  }

  const exportCSV = () => {
    if (!transactions.length) { toast({ title: 'Nothing to export' }); return }
    const headers = ['Date', 'Type', 'Firm', 'IN', 'OUT', 'Mode', 'Account', 'Note']
    const rows = transactions.map(t => [
      (t.txnDate || '').slice(0, 10),
      t.type,
      firms.find(f => f.id === t.firmId)?.name || '',
      t.type === 'IN' ? t.amount : 0,
      t.type === 'OUT' ? t.amount : 0,
      t.paymentMode || '',
      accounts.find(a => a.id === t.accountId)?.name || '',
      (t.note || '').replace(/"/g, '""'),
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dasti_${(person?.name || personId).replace(/\s+/g, '_')}_${todayISO()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!isAuthenticated) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
  }

  return (
    <AppShell user={user} onLogout={handleLogout} searchPlaceholder="Search...">
      <Toaster />

      <div className="space-y-4">
        {/* Hero header */}
        <div className="rounded-2xl p-5 bg-gradient-to-r from-orange-500 via-orange-400 to-amber-400 text-white shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link href="/dasti-ledger">
                <Button variant="ghost" size="sm" className="text-white hover:bg-white/20">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              {person ? (
                <>
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${pickGradient(person.id)} text-white font-bold flex items-center justify-center`}>
                    {initials(person.name)}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{person.name}</h2>
                    <p className="text-sm text-white/90">{person.mobile || 'Dasti account'}</p>
                  </div>
                </>
              ) : (
                <h2 className="text-xl font-bold">{loading ? 'Loading…' : 'Person not found'}</h2>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={exportCSV}>
                <Download className="w-4 h-4 mr-2" /> Excel
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="bg-emerald-50/60">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Total Received From Person</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">₹{fmt(totalIn)}</p>
              <p className="text-xs text-slate-500 mt-1">{person?.name || 'Person'} → Firm</p>
            </CardContent>
          </Card>
          <Card className="bg-rose-50/60">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-rose-700">Total Returned To Person</p>
              <p className="text-2xl font-bold text-rose-700 mt-1">₹{fmt(totalOut)}</p>
              <p className="text-xs text-slate-500 mt-1">Firm → {person?.name || 'Person'}</p>
            </CardContent>
          </Card>
          <Card className={balance === 0 ? 'bg-slate-50/60' : balance > 0 ? 'bg-amber-50/60' : 'bg-purple-50/60'}>
            <CardContent className="p-4">
              <p className={`text-xs uppercase tracking-wide ${balance === 0 ? 'text-slate-700' : balance > 0 ? 'text-amber-700' : 'text-purple-700'}`}>
                {balance === 0 ? 'Settled' : balance > 0 ? 'Firm Owes' : 'Person Owes'}
              </p>
              <p className={`text-2xl font-bold mt-1 ${balance === 0 ? 'text-slate-900' : balance > 0 ? 'text-amber-700' : 'text-purple-700'}`}>
                ₹{fmt(Math.abs(balance))}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {balance === 0 ? 'All cleared' : balance > 0 ? 'Pay back to person' : 'Person should pay'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Transactions table */}
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b flex items-center gap-2">
              <Wallet className="w-4 h-4 text-orange-600" />
              <h3 className="font-semibold text-slate-900">Transaction History</h3>
              <Badge variant="secondary">{transactions.length}</Badge>
            </div>
            {transactions.length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                <Wallet className="w-12 h-12 mx-auto text-slate-300 mb-2" />
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
                    <TableHead>Type</TableHead>
                    <TableHead>Firm</TableHead>
                    <TableHead className="text-right">IN</TableHead>
                    <TableHead className="text-right">OUT</TableHead>
                    <TableHead className="text-right">Running Balance</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    // Build a running balance oldest-first, then render newest-first
                    // so the rows still match the page's reverse-chrono order.
                    const oldestFirst = [...transactions].reverse()
                    let running = 0
                    const withBalance = oldestFirst.map(t => {
                      running += t.type === 'IN' ? (t.amount || 0) : -(t.amount || 0)
                      return { ...t, _balance: running }
                    })
                    return [...withBalance].reverse().map(t => {
                      const firm = firms.find(f => f.id === t.firmId)
                      const account = accounts.find(a => a.id === t.accountId)
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="whitespace-nowrap text-slate-600">{(t.txnDate || '').slice(0, 10)}</TableCell>
                          <TableCell>
                            {t.type === 'IN'
                              ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">IN</Badge>
                              : <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100">OUT</Badge>}
                          </TableCell>
                          <TableCell className="text-slate-600 text-sm">{firm?.name || '-'}</TableCell>
                          <TableCell className="text-right">
                            {t.type === 'IN' ? <span className="text-emerald-700 font-semibold">↓ ₹{fmt(t.amount)}</span> : <span className="text-slate-300">—</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            {t.type === 'OUT' ? <span className="text-rose-700 font-semibold">↑ ₹{fmt(t.amount)}</span> : <span className="text-slate-300">—</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={t._balance === 0 ? 'text-slate-500' : t._balance > 0 ? 'text-amber-700 font-medium' : 'text-purple-700 font-medium'}>
                              ₹{fmt(Math.abs(t._balance))}
                              {t._balance !== 0 && (
                                <span className="text-[10px] block">{t._balance > 0 ? 'firm owes' : 'owes firm'}</span>
                              )}
                            </span>
                          </TableCell>
                          <TableCell><Badge variant="outline">{t.paymentMode}</Badge></TableCell>
                          <TableCell className="text-slate-600 text-sm">{account?.name || '-'}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-slate-600" title={t.note}>{t.note || '—'}</TableCell>
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
                    })
                  })()}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Entry modal (person prefilled, no person picker) */}
      <Dialog open={showAddTxn} onOpenChange={setShowAddTxn}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className={`-mx-6 -mt-6 px-6 py-4 rounded-t-lg ${txnFormType === 'IN' ? 'bg-emerald-500' : 'bg-rose-500'} text-white`}>
              <DialogTitle className="flex items-center gap-2 text-white">
                {txnFormType === 'IN' ? <ArrowDownCircle className="w-5 h-5" /> : <ArrowUpCircle className="w-5 h-5" />}
                {editingTxn ? `Edit Entry — ${person?.name || ''}` : `Add ${txnFormType} Entry — ${person?.name || ''}`}
              </DialogTitle>
              <DialogDescription className="text-white/90">
                {txnFormType === 'IN' ? 'Money received by firm from this person' : 'Money given by firm to this person'}
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
                  <SelectItem value="OUT">OUT — Money given</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (₹) *</Label>
              <Input type="number" min="0" step="0.01" placeholder="0" value={txnForm.amount} onChange={e => setTxnForm({ ...txnForm, amount: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Dasti Account (Person) *</Label>
              <Select value={txnForm.personId} onValueChange={v => setTxnForm({ ...txnForm, personId: v })}>
                <SelectTrigger><SelectValue placeholder="Pick person" /></SelectTrigger>
                <SelectContent>
                  {persons.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {editingTxn && txnForm.personId !== personId && (
                <p className="text-xs text-amber-600 mt-1">
                  Note: changing the person moves this entry out of {person?.name || 'this view'}.
                </p>
              )}
            </div>
            <div>
              <Label>Firm</Label>
              <Select value={txnForm.firmId || 'none'} onValueChange={v => setTxnForm({ ...txnForm, firmId: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="— None —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {firms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
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
              <Textarea rows={3} placeholder="e.g., Temporary cash for cement payment" value={txnForm.note} onChange={e => setTxnForm({ ...txnForm, note: e.target.value })} />
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
    </AppShell>
  )
}
