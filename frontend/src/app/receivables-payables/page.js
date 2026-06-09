'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Toaster } from '@/components/ui/toaster'
import {
  Scale, RefreshCw, ArrowDownCircle, ArrowUpCircle,
  Users, Receipt, HandCoins, Briefcase, Wallet, IndianRupee, Download,
} from 'lucide-react'
import { AppShell } from '@/components/dashboard/AppShell'

const fmt = (value) => {
  const n = Math.round((Number(value) || 0) * 100) / 100
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Per-section meta — icon + display label + optional href builder for "drill
// into the source ledger". Keeping this in one place makes adding a new
// section (e.g., partner payouts) a one-line change.
const SECTIONS = {
  customers:     { label: 'Customers — pending sale balances',    Icon: Users,      hrefFor: () => null },
  loansGiven:    { label: 'Loans given',                          Icon: HandCoins,  hrefFor: () => '/borrow' },
  dastiReceiv:   { label: 'Dasti — person owes us',               Icon: Wallet,     hrefFor: (r) => `/dasti-ledger/${r.refId}` },
  vendors:       { label: 'Vendor bills',                         Icon: Receipt,    hrefFor: () => '/expenses' },
  commissions:   { label: 'Commission bills',                     Icon: Receipt,    hrefFor: () => '/commission-ledger' },
  margins:       { label: 'Margin bills',                         Icon: Receipt,    hrefFor: () => '/margin-ledger' },
  loansBorrowed: { label: 'Loans borrowed',                       Icon: HandCoins,  hrefFor: () => '/borrow' },
  dastiPayable:  { label: 'Dasti — we owe person',                Icon: Wallet,     hrefFor: (r) => `/dasti-ledger/${r.refId}` },
}

export default function ReceivablesPayablesPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [token, setToken] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const [societies, setSocieties] = useState([])
  const [societyId, setSocietyId] = useState('all')
  const [data, setData] = useState(null)

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

  const loadSocieties = async () => {
    try { setSocieties(await apiCall('/societies')) }
    catch (e) { /* non-fatal */ }
  }
  const loadData = async () => {
    try {
      setLoading(true)
      const qs = societyId && societyId !== 'all' ? `?societyId=${societyId}` : ''
      const result = await apiCall(`/receivables-payables${qs}`)
      setData(result)
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      loadSocieties()
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (isAuthenticated) loadData()
  }, [isAuthenticated, societyId])

  const exportCSV = () => {
    if (!data) return
    const rows = []
    rows.push(['Direction', 'Type', 'Name', 'Category', 'Date', 'Total', 'Paid', 'Balance'])
    const push = (direction, key, sectionData) => {
      ;(sectionData?.rows || []).forEach(r => {
        rows.push([
          direction,
          SECTIONS[key]?.label || key,
          r.name || '',
          r.category || '',
          r.date || '',
          r.total ?? '',
          r.paid ?? '',
          r.balance ?? 0,
        ])
      })
    }
    push('RECEIVABLE', 'customers',     data.receivables?.customers)
    push('RECEIVABLE', 'loansGiven',    data.receivables?.loansGiven)
    push('RECEIVABLE', 'dastiReceiv',   data.receivables?.dasti)
    push('PAYABLE',    'vendors',       data.payables?.vendors)
    push('PAYABLE',    'commissions',   data.payables?.commissions)
    push('PAYABLE',    'margins',       data.payables?.margins)
    push('PAYABLE',    'loansBorrowed', data.payables?.loansBorrowed)
    push('PAYABLE',    'dastiPayable',  data.payables?.dasti)
    if (rows.length === 1) {
      toast({ title: 'Nothing to export', description: 'No outstanding entries' })
      return
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `receivables_payables_${todayISO()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const receivables = data?.receivables
  const payables = data?.payables
  const net = data?.net ?? 0

  return (
    <AppShell user={user} onLogout={handleLogout} searchPlaceholder="Search receivables / payables...">
      <Toaster />

      <div className="space-y-4">
        {/* Hero */}
        <div className="rounded-2xl p-5 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 text-white shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Receivables &amp; Payables</h2>
                <p className="text-sm text-white/90">
                  Who owes us money, and to whom we owe money — filtered by society.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={societyId} onValueChange={setSocietyId}>
                <SelectTrigger className="h-9 w-[220px] bg-white/90 text-slate-900">
                  <SelectValue placeholder="Select Society" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Societies</SelectItem>
                  {societies.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="secondary" size="sm" onClick={exportCSV} disabled={!data}>
                <Download className="w-4 h-4 mr-2" /> Excel
              </Button>
              <Button variant="secondary" size="sm" onClick={loadData}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Net summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="bg-emerald-50/60">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Total Receivables</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">₹{fmt(receivables?.grandTotal || 0)}</p>
              <p className="text-xs text-slate-500 mt-1">Money owed to us</p>
            </CardContent>
          </Card>
          <Card className="bg-rose-50/60">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-rose-700">Total Payables</p>
              <p className="text-2xl font-bold text-rose-700 mt-1">₹{fmt(payables?.grandTotal || 0)}</p>
              <p className="text-xs text-slate-500 mt-1">Money we owe</p>
            </CardContent>
          </Card>
          <Card className={net >= 0 ? 'bg-blue-50/60' : 'bg-amber-50/60'}>
            <CardContent className="p-4">
              <p className={`text-xs uppercase tracking-wide ${net >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>Net Position</p>
              <p className={`text-2xl font-bold mt-1 ${net >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>
                ₹{fmt(Math.abs(net))}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {net >= 0 ? 'Receivables exceed Payables (Net positive)' : 'Payables exceed Receivables (Net negative)'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Two columns: Lena | Dena */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* RECEIVABLES */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-2">
                  <ArrowDownCircle className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-semibold text-slate-900">Receivables</h3>
                </div>
                <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  ₹{fmt(receivables?.grandTotal || 0)}
                </Badge>
              </div>

              <Section
                title={SECTIONS.customers.label}
                Icon={SECTIONS.customers.Icon}
                sectionData={receivables?.customers}
                hrefFor={SECTIONS.customers.hrefFor}
                color="emerald"
              />
              <Section
                title={SECTIONS.loansGiven.label}
                Icon={SECTIONS.loansGiven.Icon}
                sectionData={receivables?.loansGiven}
                hrefFor={SECTIONS.loansGiven.hrefFor}
                color="emerald"
              />
              <Section
                title={SECTIONS.dastiReceiv.label}
                Icon={SECTIONS.dastiReceiv.Icon}
                sectionData={receivables?.dasti}
                hrefFor={SECTIONS.dastiReceiv.hrefFor}
                color="emerald"
                note={societyId !== 'all' ? 'Dasti is company-wide — shown only when filter is "All Societies".' : null}
              />
            </CardContent>
          </Card>

          {/* PAYABLES */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-2">
                  <ArrowUpCircle className="w-5 h-5 text-rose-600" />
                  <h3 className="font-semibold text-slate-900">Payables</h3>
                </div>
                <Badge className="bg-rose-600 hover:bg-rose-700 text-white">
                  ₹{fmt(payables?.grandTotal || 0)}
                </Badge>
              </div>

              <Section
                title={SECTIONS.vendors.label}
                Icon={SECTIONS.vendors.Icon}
                sectionData={payables?.vendors}
                hrefFor={SECTIONS.vendors.hrefFor}
                color="rose"
              />
              <Section
                title={SECTIONS.commissions.label}
                Icon={SECTIONS.commissions.Icon}
                sectionData={payables?.commissions}
                hrefFor={SECTIONS.commissions.hrefFor}
                color="rose"
              />
              <Section
                title={SECTIONS.margins.label}
                Icon={SECTIONS.margins.Icon}
                sectionData={payables?.margins}
                hrefFor={SECTIONS.margins.hrefFor}
                color="rose"
              />
              <Section
                title={SECTIONS.loansBorrowed.label}
                Icon={SECTIONS.loansBorrowed.Icon}
                sectionData={payables?.loansBorrowed}
                hrefFor={SECTIONS.loansBorrowed.hrefFor}
                color="rose"
              />
              <Section
                title={SECTIONS.dastiPayable.label}
                Icon={SECTIONS.dastiPayable.Icon}
                sectionData={payables?.dasti}
                hrefFor={SECTIONS.dastiPayable.hrefFor}
                color="rose"
                note={societyId !== 'all' ? 'Dasti is company-wide — shown only when filter is "All Societies".' : null}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}

// Section renderer — one collapsible-ish block per category. Always shows
// the subtotal so a zero subtotal is informative ("no pending here") rather
// than hidden behind an expand toggle.
function Section({ title, Icon, sectionData, hrefFor, color, note }) {
  const rows = sectionData?.rows || []
  const total = sectionData?.total || 0
  const accent = color === 'emerald' ? 'text-emerald-700' : 'text-rose-700'

  return (
    <div className="rounded-lg border bg-slate-50/40">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-white/60 rounded-t-lg">
        <div className="flex items-center gap-2">
          {Icon && <Icon className={`w-4 h-4 ${accent}`} />}
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <Badge variant="secondary" className="text-[10px]">{rows.length}</Badge>
        </div>
        <p className={`text-sm font-bold ${accent}`}>₹{fmt(total)}</p>
      </div>
      {note && (
        <p className="px-3 py-2 text-[11px] text-amber-700 bg-amber-50/60 border-b">{note}</p>
      )}
      {rows.length === 0 ? (
        <div className="px-3 py-3 text-center text-xs text-slate-400">
          No pending entries
        </div>
      ) : (
        <div className="divide-y">
          {rows.map(r => {
            const href = hrefFor ? hrefFor(r) : null
            const content = (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate" title={r.name}>
                    {r.name}
                    {r.category && <span className="text-slate-400 font-normal"> · {r.category}</span>}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {r.date && <span>{r.date}</span>}
                    {r.total > 0 && (
                      <span className="ml-2">
                        Total ₹{fmt(r.total)} · Paid ₹{fmt(r.paid)}
                      </span>
                    )}
                  </p>
                </div>
                <p className={`text-sm font-semibold whitespace-nowrap ${accent}`}>
                  ₹{fmt(r.balance)}
                </p>
              </div>
            )
            return href ? (
              <Link
                key={`${r.type}-${r.refId}`}
                href={href}
                className="block px-3 py-2 hover:bg-white"
              >
                {content}
              </Link>
            ) : (
              <div key={`${r.type}-${r.refId}`} className="px-3 py-2">
                {content}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
