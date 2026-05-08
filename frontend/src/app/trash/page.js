'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Toaster } from '@/components/ui/toaster'
import { Trash2, RefreshCw, RotateCcw, X, AlertTriangle } from 'lucide-react'
import { AppShell } from '@/components/dashboard/AppShell'

const formatDate = (value) => {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return String(value)
  }
}

// Pick the most useful human-readable label for a deleted record. Different
// collections expose different naming fields, so fall back through a list.
const recordLabel = (rec) => (
  rec.name
  || rec.inventoryNumber
  || rec.title
  || rec.referenceNo
  || rec.partnerName
  || rec.customerName
  || rec.vendorName
  || rec.description
  || rec.id
  || '(unnamed)'
)

export default function TrashPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)

  const [data, setData] = useState({ records: [], summary: {}, total: 0, types: [] })
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const t = localStorage.getItem('token')
    const u = localStorage.getItem('user')
    if (!t || !u) {
      router.push('/')
      return
    }
    const parsed = JSON.parse(u)
    if (parsed.role !== 'super_admin') {
      toast({ title: 'Access Denied', description: 'Super Admin access required', variant: 'destructive' })
      router.push('/')
      return
    }
    setToken(t)
    setUser(parsed)
    setIsAuthenticated(true)
  }, [router])

  const apiCall = useCallback(async (endpoint, options = {}) => {
    const authToken = token || localStorage.getItem('token')
    const res = await fetch(`/api${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(options.headers || {}),
      },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }))
      throw new Error(err.error || 'Request failed')
    }
    return res.json()
  }, [token])

  const load = useCallback(async () => {
    if (!isAuthenticated) return
    setLoading(true)
    try {
      const qs = typeFilter && typeFilter !== 'all' ? `?type=${typeFilter}` : ''
      const result = await apiCall(`/trash${qs}`)
      setData(result)
    } catch (err) {
      toast({ title: 'Failed to load trash', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [apiCall, isAuthenticated, typeFilter, toast])

  useEffect(() => { if (isAuthenticated) load() }, [isAuthenticated, load])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/')
  }

  const restore = async (rec) => {
    if (!confirm(`Restore this ${rec._collectionLabel}?`)) return
    setBusyId(rec.id)
    try {
      await apiCall(`/trash/${rec._collectionName}/${rec.id}/restore`, { method: 'POST' })
      toast({ title: 'Restored', description: `${rec._collectionLabel} restored successfully` })
      load()
    } catch (err) {
      toast({ title: 'Restore failed', description: err.message, variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  const purge = async (rec) => {
    if (!confirm(`Permanently delete this ${rec._collectionLabel}? This cannot be undone.`)) return
    setBusyId(rec.id)
    try {
      await apiCall(`/trash/${rec._collectionName}/${rec.id}`, { method: 'DELETE' })
      toast({ title: 'Deleted', description: `${rec._collectionLabel} permanently deleted` })
      load()
    } catch (err) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  const emptyTrash = async () => {
    const scope = typeFilter && typeFilter !== 'all' ? `all ${typeFilter}` : 'EVERY deleted record'
    if (!confirm(`Permanently delete ${scope}? This cannot be undone.`)) return
    try {
      const qs = typeFilter && typeFilter !== 'all' ? `?type=${typeFilter}` : ''
      const result = await apiCall(`/trash${qs}`, { method: 'DELETE' })
      toast({ title: 'Trash emptied', description: result.message })
      load()
    } catch (err) {
      toast({ title: 'Empty trash failed', description: err.message, variant: 'destructive' })
    }
  }

  const summaryEntries = useMemo(() => Object.entries(data.summary || {}), [data.summary])

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Loading...</p>
      </div>
    )
  }

  return (
    <AppShell user={user} onLogout={handleLogout} searchPlaceholder="Search trash...">
      <Toaster />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Trash2 className="w-6 h-6 text-slate-700" /> Trash
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Restore deleted records or permanently remove them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} className="h-9">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button variant="destructive" size="sm" onClick={emptyTrash} disabled={data.records.length === 0} className="h-9">
            <X className="w-4 h-4 mr-2" /> {typeFilter === 'all' ? 'Empty trash' : 'Empty filtered'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="border-slate-200/70">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Items</p>
            <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{(data.total || 0).toLocaleString('en-IN')}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200/70">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Categories</p>
            <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{summaryEntries.length}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200/70 col-span-2">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Breakdown</p>
            {summaryEntries.length === 0 ? (
              <p className="text-sm text-slate-400">No deleted records.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {summaryEntries.map(([label, count]) => (
                  <Badge key={label} variant="secondary" className="text-xs">
                    {label}: {count}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6 border-slate-200/70">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <Label className="text-xs text-slate-500">Filter by type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {(data.types || []).map((t) => (
                    <SelectItem key={t.slug} value={t.slug}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/70">
        <CardContent className="p-0">
          {data.records.length === 0 ? (
            <div className="p-16 text-center text-slate-400">
              <Trash2 className="w-12 h-12 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">Trash is empty</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Type</TableHead>
                    <TableHead>Record</TableHead>
                    <TableHead className="w-44">Deleted at</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="w-44 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.records.map((rec) => (
                    <TableRow key={`${rec._collectionName}-${rec.id}`}>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{rec._collectionLabel}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-900 truncate max-w-[28rem]">{recordLabel(rec)}</div>
                        <div className="text-xs text-slate-400 font-mono truncate max-w-[28rem]">{rec.id}</div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600 tabular-nums">{formatDate(rec.deletedAt)}</TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {rec.deletedReason || <span className="text-slate-400">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busyId === rec.id}
                            onClick={() => restore(rec)}
                            className="h-8"
                          >
                            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Restore
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={busyId === rec.id}
                            onClick={() => purge(rec)}
                            className="h-8"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  )
}
