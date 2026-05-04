'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Toaster } from '@/components/ui/toaster'
import {
  Building2, Plus, Pencil, Trash2, MapPin, Calendar, RefreshCw, Search,
  ArrowRight, Package, TrendingUp, TrendingDown, IndianRupee, X,
} from 'lucide-react'
import { AppShell } from '@/components/dashboard/AppShell'
import { getDeleteOtp, refreshDeleteOtp } from '@/lib/deleteOtp'

const fmt = (value) => {
  const n = Math.round((Number(value) || 0) * 100) / 100
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const STATUS_BADGE = {
  Active: { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  Completed: { dot: 'bg-sky-500', text: 'text-sky-700', bg: 'bg-sky-50' },
  Inactive: { dot: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-100' },
  'On Hold': { dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
}

const apiFetch = async (endpoint, method = 'GET', body = null) => {
  const token = localStorage.getItem('token')

  const buildOptions = (otp) => {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Request failed')
  }
  return res.json()
}

export default function SocietiesPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [user, setUser] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [societies, setSocieties] = useState([])
  const [summaries, setSummaries] = useState({})
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [showCreate, setShowCreate] = useState(false)
  const [editingSociety, setEditingSociety] = useState(null)

  // Auth gate
  useEffect(() => {
    if (typeof window === 'undefined') return
    const t = localStorage.getItem('token')
    const u = localStorage.getItem('user')
    if (!t || !u) {
      router.push('/')
      return
    }
    setUser(JSON.parse(u))
    setIsAuthenticated(true)
  }, [router])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/')
  }

  const loadSocieties = useCallback(async () => {
    if (!isAuthenticated) return
    setLoading(true)
    try {
      const list = await apiFetch('/societies')
      setSocieties(list)

      // Fetch summary stats for each society in parallel — empty {} is fine
      // when summary call fails for an individual society (e.g. legacy data).
      const summaryEntries = await Promise.all(
        list.map(async (s) => {
          try {
            const summary = await apiFetch(`/societies/${s.id}/summary`)
            return [s.id, summary]
          } catch {
            return [s.id, null]
          }
        })
      )
      const map = {}
      summaryEntries.forEach(([id, summary]) => { map[id] = summary })
      setSummaries(map)
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, toast])

  useEffect(() => {
    if (isAuthenticated) loadSocieties()
  }, [isAuthenticated, loadSocieties])

  const handleOpenSociety = (society) => {
    // Persist selection so dashboard auto-loads it
    try {
      sessionStorage.setItem('selectedSociety', society.id)
    } catch {}
    router.push('/')
  }

  const handleCreate = async (formData) => {
    try {
      await apiFetch('/societies', 'POST', formData)
      setShowCreate(false)
      toast({ title: 'Society created' })
      loadSocieties()
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }

  const handleUpdate = async (formData) => {
    try {
      await apiFetch(`/societies/${editingSociety.id}`, 'PUT', formData)
      setEditingSociety(null)
      toast({ title: 'Society updated' })
      loadSocieties()
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }

  const handleDelete = async (id) => {
    try {
      await apiFetch(`/societies/${id}`, 'DELETE')
      toast({ title: 'Society deleted' })
      loadSocieties()
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }

  const filteredSocieties = societies.filter((s) => {
    if (statusFilter !== 'all' && (s.status || 'Active') !== statusFilter) return false
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      (s.name || '').toLowerCase().includes(q) ||
      (s.location || '').toLowerCase().includes(q)
    )
  })

  // Aggregate stats across all societies
  const totalStats = Object.values(summaries).reduce(
    (acc, s) => {
      if (!s) return acc
      acc.totalInventory += s.totalInventory || 0
      acc.soldInventory += s.soldInventory || 0
      acc.availableInventory += s.availableInventory || 0
      acc.totalSaleAmount += s.totalSaleAmount || 0
      acc.totalPurchaseAmount += s.totalPurchaseAmount || 0
      acc.totalExpenses += s.totalExpenses || 0
      return acc
    },
    { totalInventory: 0, soldInventory: 0, availableInventory: 0, totalSaleAmount: 0, totalPurchaseAmount: 0, totalExpenses: 0 }
  )

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Loading...</p>
      </div>
    )
  }

  const isSuperAdmin = user?.role === 'super_admin'

  return (
    <AppShell user={user} onLogout={handleLogout} searchPlaceholder="Search societies, locations...">
      <Toaster />

      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Societies</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage all your real estate societies in one place
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadSocieties} className="h-9">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          {isSuperAdmin && (
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <Button className="h-9 gradient-bg text-white shadow-md hover:opacity-95">
                  <Plus className="w-4 h-4 mr-2" /> New Society
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Society</DialogTitle>
                </DialogHeader>
                <SocietyForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Aggregate stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="border-slate-200/70">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Societies</p>
            <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{societies.length}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200/70">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Inventory</p>
              <Package className="w-4 h-4 text-slate-400" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{totalStats.totalInventory}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {totalStats.soldInventory} sold · {totalStats.availableInventory} available
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200/70">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Sales</p>
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="mt-2 text-2xl font-bold text-emerald-700 tabular-nums">₹{fmt(totalStats.totalSaleAmount)}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200/70">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Expenses</p>
              <TrendingDown className="w-4 h-4 text-rose-500" />
            </div>
            <p className="mt-2 text-2xl font-bold text-rose-700 tabular-nums">₹{fmt(totalStats.totalExpenses)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6 border-slate-200/70">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by name or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
                <SelectItem value="On Hold">On Hold</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            {(searchQuery || statusFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearchQuery(''); setStatusFilter('all') }}
                className="h-9 text-xs"
              >
                <X className="w-3.5 h-3.5 mr-1" /> Clear
              </Button>
            )}
            <p className="ml-auto text-xs text-slate-500">
              Showing <span className="font-semibold text-slate-700">{filteredSocieties.length}</span> of {societies.length}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Society cards */}
      {loading && societies.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="border-slate-200/70 animate-pulse">
              <CardContent className="p-5 space-y-3">
                <div className="h-5 w-2/3 bg-slate-200 rounded" />
                <div className="h-4 w-1/2 bg-slate-100 rounded" />
                <div className="h-16 bg-slate-100 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredSocieties.length === 0 ? (
        <Card className="border-slate-200/70">
          <CardContent className="p-12 text-center text-slate-400">
            <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-sm">
              {societies.length === 0 ? 'No societies created yet' : 'No societies match the current filters'}
            </p>
            {societies.length === 0 && isSuperAdmin && (
              <Button onClick={() => setShowCreate(true)} className="mt-4 gradient-bg text-white">
                <Plus className="w-4 h-4 mr-2" /> Create First Society
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSocieties.map(society => {
            const summary = summaries[society.id]
            const status = society.status || 'Active'
            const palette = STATUS_BADGE[status] || STATUS_BADGE.Active
            const sold = summary?.soldInventory || 0
            const total = summary?.totalInventory || 0
            const soldPct = total > 0 ? Math.round((sold / total) * 100) : 0

            return (
              <Card
                key={society.id}
                className="border-slate-200/70 card-hover cursor-pointer group"
                onClick={() => handleOpenSociety(society)}
              >
                <CardContent className="p-5">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-slate-900 truncate">{society.name}</h3>
                      {society.location && (
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{society.location}</span>
                        </p>
                      )}
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${palette.bg} ${palette.text}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${palette.dot}`} />
                      {status}
                    </span>
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
                    {society.totalArea && (
                      <span>
                        <span className="font-medium text-slate-700">{society.totalArea}</span> sqft
                      </span>
                    )}
                    {society.startDate && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(society.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>

                  {/* Stats grid */}
                  {summary ? (
                    <div className="grid grid-cols-3 gap-2 py-3 border-t border-slate-100">
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Inventory</p>
                        <p className="text-sm font-semibold text-slate-900">{sold}/{total}</p>
                        {total > 0 && (
                          <div className="mt-1 h-1 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 transition-all"
                              style={{ width: `${soldPct}%` }}
                            />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Sales</p>
                        <p className="text-sm font-semibold text-emerald-700 tabular-nums truncate" title={`₹${fmt(summary.totalSaleAmount)}`}>
                          ₹{fmt(summary.totalSaleAmount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Expenses</p>
                        <p className="text-sm font-semibold text-rose-700 tabular-nums truncate" title={`₹${fmt(summary.totalExpenses)}`}>
                          ₹{fmt(summary.totalExpenses)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="py-3 border-t border-slate-100">
                      <p className="text-xs text-slate-400 italic">No summary available</p>
                    </div>
                  )}

                  {/* Notes */}
                  {society.notes && (
                    <p className="text-xs text-slate-500 italic line-clamp-2 mb-3" title={society.notes}>
                      {society.notes}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                    <Button
                      size="sm"
                      className="h-8 flex-1 gradient-bg text-white"
                      onClick={(e) => { e.stopPropagation(); handleOpenSociety(society) }}
                    >
                      Open Dashboard
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                    {isSuperAdmin && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={(e) => { e.stopPropagation(); setEditingSociety(society) }}
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50 hover:border-rose-300"
                              onClick={(e) => e.stopPropagation()}
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this society?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This permanently deletes <span className="font-semibold">{society.name}</span> and all its sales, purchases, expenses, vendors, inventory, partners and daybook transactions. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-rose-600 hover:bg-rose-700"
                                onClick={() => handleDelete(society.id)}
                              >
                                Yes, delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editingSociety} onOpenChange={(open) => !open && setEditingSociety(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Society</DialogTitle>
          </DialogHeader>
          {editingSociety && (
            <SocietyForm
              initial={editingSociety}
              onSubmit={handleUpdate}
              onCancel={() => setEditingSociety(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

// ----- Society form -----
function SocietyForm({ initial, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    name: initial?.name || '',
    location: initial?.location || '',
    totalArea: initial?.totalArea ?? '',
    startDate: initial?.startDate?.split?.('T')[0] || initial?.startDate || '',
    status: initial?.status || 'Active',
    notes: initial?.notes || '',
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({
      ...formData,
      totalArea: formData.totalArea === '' ? null : Number(formData.totalArea),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Society Name *</Label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
          placeholder="Greenwood Heights Phase 2"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Location</Label>
          <Input
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            placeholder="Sector 62, Noida"
          />
        </div>
        <div>
          <Label>Total Area (sqft)</Label>
          <Input
            type="number"
            value={formData.totalArea}
            onChange={(e) => setFormData({ ...formData, totalArea: e.target.value })}
            min="0"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Start Date</Label>
          <Input
            type="date"
            value={formData.startDate}
            onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
          />
        </div>
        <div>
          <Label>Status</Label>
          <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="On Hold">On Hold</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={3}
          placeholder="Any internal notes about this society..."
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit">{initial ? 'Update Society' : 'Create Society'}</Button>
      </DialogFooter>
    </form>
  )
}
