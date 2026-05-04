'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { Toaster } from '@/components/ui/toaster'
import {
  History, RefreshCw, Filter, X, ChevronLeft, ChevronRight, Eye,
  FileText, Search,
} from 'lucide-react'
import { AppShell } from '@/components/dashboard/AppShell'

const ACTION_BADGE = {
  CREATE: 'default',
  UPDATE: 'secondary',
  DELETE: 'destructive',
  RESTORE: 'outline',
  REVERSAL: 'secondary',
  LOGIN: 'outline',
  LOGOUT: 'outline',
}

const ACTION_DOT_COLOR = {
  CREATE: 'bg-emerald-500',
  UPDATE: 'bg-amber-500',
  DELETE: 'bg-rose-500',
  RESTORE: 'bg-sky-500',
  REVERSAL: 'bg-purple-500',
}

export default function AuditLogsPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  const [logs, setLogs] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 })
  const [filterOptions, setFilterOptions] = useState({ entityTypes: [], actions: [] })
  const [filters, setFilters] = useState({
    entityType: 'all',
    action: 'all',
    startDate: '',
    endDate: '',
    q: '',
    page: 1,
    limit: 25,
  })
  const [searchInput, setSearchInput] = useState('')
  const [selectedLog, setSelectedLog] = useState(null)

  // Auth gate
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

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/')
  }

  const apiCall = useCallback(async (endpoint) => {
    const authToken = token || localStorage.getItem('token')
    const res = await fetch(`/api${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }))
      throw new Error(err.error || 'Request failed')
    }
    return res.json()
  }, [token])

  const loadLogs = useCallback(async () => {
    if (!isAuthenticated) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.entityType && filters.entityType !== 'all') params.append('entityType', filters.entityType)
      if (filters.action && filters.action !== 'all') params.append('action', filters.action)
      if (filters.startDate) params.append('startDate', filters.startDate)
      if (filters.endDate) params.append('endDate', filters.endDate)
      if (filters.q) params.append('q', filters.q)
      params.append('page', filters.page)
      params.append('limit', filters.limit)

      const data = await apiCall(`/admin/audit-logs?${params.toString()}`)
      setLogs(data.logs || [])
      setPagination(data.pagination || { page: 1, limit: 25, total: 0, totalPages: 0 })
      if (data.filters) setFilterOptions(data.filters)
    } catch (err) {
      toast({ title: 'Error loading audit logs', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [apiCall, filters, isAuthenticated, toast])

  useEffect(() => {
    if (isAuthenticated) loadLogs()
  }, [isAuthenticated, loadLogs])

  const updateFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }))
  }

  const clearFilters = () => {
    setFilters({ entityType: 'all', action: 'all', startDate: '', endDate: '', q: '', page: 1, limit: 25 })
    setSearchInput('')
  }

  const submitSearch = () => updateFilter('q', searchInput)

  const goToPage = (p) => {
    if (p >= 1 && p <= pagination.totalPages) {
      setFilters(prev => ({ ...prev, page: p }))
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Loading...</p>
      </div>
    )
  }

  return (
    <AppShell user={user} onLogout={handleLogout} searchPlaceholder="Search across audit logs...">
      <Toaster />

      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Audit Logs</h1>
          <p className="text-sm text-slate-500 mt-0.5">Every system activity recorded in chronological order</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadLogs} className="h-9">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="border-slate-200/70">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Logs</p>
            <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{pagination.total.toLocaleString('en-IN')}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200/70">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Page</p>
            <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
              {pagination.page} <span className="text-base font-medium text-slate-400">/ {pagination.totalPages || 1}</span>
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200/70">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Tracked Entities</p>
            <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{filterOptions.entityTypes.length}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200/70">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Action Types</p>
            <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{filterOptions.actions.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6 border-slate-200/70">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">Filters</span>
            <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto h-8 text-xs">
              <X className="w-3.5 h-3.5 mr-1" /> Clear all
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="lg:col-span-2">
              <Label className="text-xs text-slate-500">Search</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitSearch() }}
                  placeholder="Entity, ID, user, reason..."
                  className="pl-9 h-9"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Entity</Label>
              <Select value={filters.entityType} onValueChange={(v) => updateFilter('entityType', v)}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All entities</SelectItem>
                  {filterOptions.entityTypes.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Action</Label>
              <Select value={filters.action} onValueChange={(v) => updateFilter('action', v)}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {filterOptions.actions.map(a => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">From</Label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => updateFilter('startDate', e.target.value)}
                className="h-9 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">To</Label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => updateFilter('endDate', e.target.value)}
                className="h-9 mt-1"
              />
            </div>
          </div>
          {searchInput !== filters.q && (
            <div className="mt-3">
              <Button size="sm" onClick={submitSearch} className="h-8">Apply search</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Logs table */}
      <Card className="border-slate-200/70">
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="p-16 text-center text-slate-400">
              <History className="w-12 h-12 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">No audit logs match the current filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-44">Timestamp</TableHead>
                    <TableHead className="w-28">Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Reason / Notes</TableHead>
                    <TableHead className="w-16 text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id} className="align-top">
                      <TableCell className="whitespace-nowrap text-xs text-slate-600 tabular-nums">
                        {new Date(log.timestamp).toLocaleString('en-IN', {
                          dateStyle: 'medium',
                          timeStyle: 'medium',
                        })}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${ACTION_DOT_COLOR[log.action] || 'bg-slate-400'}`} />
                          <Badge variant={ACTION_BADGE[log.action] || 'outline'} className="text-[10px]">
                            {log.action}
                          </Badge>
                        </span>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-slate-900 text-sm">{log.entityType || '—'}</p>
                        {log.entityId && (
                          <p className="text-[11px] text-slate-400 font-mono truncate max-w-[180px]" title={log.entityId}>
                            {log.entityId}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-slate-800">{log.userName || 'System'}</p>
                        {log.userEmail && (
                          <p className="text-[11px] text-slate-400">{log.userEmail}</p>
                        )}
                      </TableCell>
                      <TableCell className="max-w-md">
                        <p className="text-sm text-slate-600 truncate" title={log.reason || ''}>
                          {log.reason || (log.action === 'UPDATE' ? 'Field changes' : '')}
                        </p>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedLog(log)}
                          className="h-8 w-8 p-0"
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <p className="text-xs text-slate-500">
                Showing <span className="font-semibold text-slate-700">{(pagination.page - 1) * pagination.limit + 1}</span>
                {' '}–{' '}
                <span className="font-semibold text-slate-700">
                  {Math.min(pagination.page * pagination.limit, pagination.total)}
                </span>
                {' '}of <span className="font-semibold text-slate-700">{pagination.total.toLocaleString('en-IN')}</span> logs
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => goToPage(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs text-slate-600 tabular-nums">
                  {pagination.page} / {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => goToPage(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-600" />
              Audit Log Detail
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500 uppercase tracking-wider">Timestamp</p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">
                    {new Date(selectedLog.timestamp).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500 uppercase tracking-wider">Action</p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">{selectedLog.action}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500 uppercase tracking-wider">Entity Type</p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">{selectedLog.entityType}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500 uppercase tracking-wider">Entity ID</p>
                  <p className="text-xs font-mono text-slate-700 mt-0.5 break-all">{selectedLog.entityId}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500 uppercase tracking-wider">User</p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">{selectedLog.userName || 'System'}</p>
                  {selectedLog.userEmail && (
                    <p className="text-[11px] text-slate-500">{selectedLog.userEmail}</p>
                  )}
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500 uppercase tracking-wider">Reason</p>
                  <p className="text-sm text-slate-900 mt-0.5">{selectedLog.reason || '—'}</p>
                </div>
              </div>

              {(selectedLog.before || selectedLog.after) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {selectedLog.before && (
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-1.5">Before</p>
                      <pre className="text-xs bg-rose-50 border border-rose-200 rounded-lg p-3 overflow-auto max-h-64 text-rose-900">
                        {JSON.stringify(selectedLog.before, null, 2)}
                      </pre>
                    </div>
                  )}
                  {selectedLog.after && (
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-1.5">After</p>
                      <pre className="text-xs bg-emerald-50 border border-emerald-200 rounded-lg p-3 overflow-auto max-h-64 text-emerald-900">
                        {JSON.stringify(selectedLog.after, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
