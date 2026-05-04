'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Toaster } from '@/components/ui/toaster'
import {
  Building2, Package, Search, ArrowLeft, ChevronLeft, ChevronRight,
  ExternalLink, Filter, Home, Users, LogOut, Globe, RefreshCw
} from 'lucide-react'
import { AppShell } from '@/components/dashboard/AppShell'
import { getDeleteOtp, refreshDeleteOtp } from '@/lib/deleteOtp'

const fmt = (value) => {
  const n = Math.round((Number(value) || 0) * 100) / 100
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const statusColors = {
  'Available': 'bg-green-100 text-green-800',
  'Sold': 'bg-red-100 text-red-800',
  'Booked': 'bg-yellow-100 text-yellow-800',
  'Blocked': 'bg-gray-100 text-gray-800'
}

// API helper
const api = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token')
  const method = (options.method || 'GET').toUpperCase()

  const buildHeaders = (otp) => ({
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
    ...(otp ? { 'X-Delete-Otp': otp } : {}),
    ...options.headers,
  })

  let otp = null
  if (method === 'DELETE') {
    otp = getDeleteOtp()
    if (!otp) throw new Error('Delete cancelled — OTP required')
  }

  let res = await fetch(`/api${endpoint}`, { ...options, headers: buildHeaders(otp) })
  if (res.status === 403 && method === 'DELETE') {
    const errBody = await res.clone().json().catch(() => ({}))
    if (errBody?.code === 'DELETE_OTP_REQUIRED') {
      const fresh = refreshDeleteOtp()
      if (!fresh) throw new Error('Delete cancelled — OTP required')
      res = await fetch(`/api${endpoint}`, { ...options, headers: buildHeaders(fresh) })
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'API error' }))
    throw new Error(err.error || 'API error')
  }
  return res.json()
}

export default function GlobalInventoryPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  
  // Data state
  const [societies, setSocieties] = useState([])
  const [inventory, setInventory] = useState([])
  const [summary, setSummary] = useState({ total: 0, available: 0, sold: 0, booked: 0, blocked: 0 })
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 0 })
  const [filterOptions, setFilterOptions] = useState({ types: [], statuses: ['Available', 'Sold', 'Booked', 'Blocked'] })
  
  // Filter state
  const [filters, setFilters] = useState({
    societyId: 'all',
    status: 'all',
    type: 'all',
    q: '',
    page: 1,
    limit: 25,
    sort: 'createdAt',
    order: 'desc'
  })
  
  const [searchInput, setSearchInput] = useState('')

  // Auth check
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('token')
      const storedUser = localStorage.getItem('user')
      
      if (storedToken && storedUser) {
        const userData = JSON.parse(storedUser)
        setUser(userData)
        
        // Check if user is admin
        if (userData.role !== 'super_admin' && userData.role !== 'admin') {
          toast({ title: 'Access Denied', description: 'Admin access required', variant: 'destructive' })
          router.push('/')
          return
        }
        
        setIsAuthenticated(true)
        setLoading(false)
        return
      }
      
      router.push('/')
      return
      
      setLoading(false)
    }
    
    initAuth()
  }, [router, toast])

  // Load societies for filter
  useEffect(() => {
    if (isAuthenticated) {
      loadSocieties()
    }
  }, [isAuthenticated])

  // Load inventory when filters change
  useEffect(() => {
    if (isAuthenticated) {
      loadGlobalInventory()
    }
  }, [isAuthenticated, filters])

  const loadSocieties = async () => {
    try {
      const data = await api('/societies')
      setSocieties(data)
    } catch (error) {
      console.error('Error loading societies:', error)
    }
  }

  const loadGlobalInventory = async () => {
    setDataLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.societyId && filters.societyId !== 'all') params.append('societyId', filters.societyId)
      if (filters.status && filters.status !== 'all') params.append('status', filters.status)
      if (filters.type && filters.type !== 'all') params.append('type', filters.type)
      if (filters.q) params.append('q', filters.q)
      if (filters.page) params.append('page', filters.page)
      if (filters.limit) params.append('limit', filters.limit)
      if (filters.sort) params.append('sort', filters.sort)
      if (filters.order) params.append('order', filters.order)
      
      const data = await api(`/inventory/global?${params.toString()}`)
      setInventory(data.inventory || [])
      setSummary(data.summary || { total: 0, available: 0, sold: 0, booked: 0, blocked: 0 })
      setPagination(data.pagination || { page: 1, limit: 25, total: 0, pages: 0 })
      if (data.filters) {
        setFilterOptions(data.filters)
      }
    } catch (error) {
      console.error('Error loading global inventory:', error)
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setDataLoading(false)
    }
  }

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }))
  }

  const handleSearch = () => {
    setFilters(prev => ({ ...prev, q: searchInput, page: 1 }))
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.pages) {
      setFilters(prev => ({ ...prev, page: newPage }))
    }
  }

  const handleOpenUnit = (item) => {
    // Navigate to main dashboard with the society selected and inventory tab active
    router.push(`/?societyId=${item.societyId}&tab=inventory&inventoryId=${item.id}`)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/')
  }

  const handleRefresh = () => {
    loadGlobalInventory()
    toast({ title: 'Refreshed', description: 'Inventory data updated' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center">
          <Globe className="w-16 h-16 mx-auto mb-4 text-blue-600 animate-pulse" />
          <p className="text-lg text-gray-600">Loading Global Inventory...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <AppShell user={user} onLogout={handleLogout} searchPlaceholder="Search inventory across societies...">
      <Toaster />

      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Global Inventory</h1>
          <p className="text-sm text-slate-500 mt-0.5">All societies combined view</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} className="h-9">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div>
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-100">Total Units</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{fmt(summary.total)}</div>
            </CardContent>
          </Card>
          
          <Card className="border-green-200 bg-green-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-700">Available</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-700">{fmt(summary.available)}</div>
            </CardContent>
          </Card>
          
          <Card className="border-red-200 bg-red-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-700">Sold</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-700">{fmt(summary.sold)}</div>
            </CardContent>
          </Card>
          
          <Card className="border-yellow-200 bg-yellow-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-yellow-700">Booked</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-700">{fmt(summary.booked)}</div>
            </CardContent>
          </Card>
          
          <Card className="border-gray-200 bg-gray-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-700">Blocked</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-700">{fmt(summary.blocked)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader className="pb-4">
            <div className="flex items-center space-x-2">
              <Filter className="w-5 h-5 text-gray-500" />
              <CardTitle className="text-lg">Filters</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Society Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Society</Label>
                <Select value={filters.societyId} onValueChange={(v) => handleFilterChange('societyId', v)}>
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

              {/* Status Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Status</Label>
                <Select value={filters.status} onValueChange={(v) => handleFilterChange('status', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {filterOptions.statuses.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Type Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Type</Label>
                <Select value={filters.type} onValueChange={(v) => handleFilterChange('type', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {filterOptions.types.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Search */}
              <div className="space-y-2 lg:col-span-2">
                <Label className="text-sm font-medium">Search</Label>
                <div className="flex space-x-2">
                  <Input
                    placeholder="Unit no, tower, society, owner..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1"
                  />
                  <Button onClick={handleSearch} variant="secondary">
                    <Search className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Inventory Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Inventory List</CardTitle>
                <CardDescription>
                  Showing {inventory.length} of {pagination.total} units
                </CardDescription>
              </div>
              {/* Items per page */}
              <div className="flex items-center space-x-2">
                <Label className="text-sm text-gray-500">Show:</Label>
                <Select value={String(filters.limit)} onValueChange={(v) => handleFilterChange('limit', parseInt(v))}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {dataLoading ? (
              <div className="flex items-center justify-center py-12">
                <Package className="w-8 h-8 text-gray-400 animate-pulse" />
                <span className="ml-2 text-gray-500">Loading inventory...</span>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[120px]">Unit No</TableHead>
                        <TableHead>Society</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Area</TableHead>
                        <TableHead>Floor</TableHead>
                        <TableHead>Base Price</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventory.map(item => (
                        <TableRow key={item.id} className="hover:bg-gray-50">
                          <TableCell className="font-medium">{item.inventoryNumber}</TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              <Building2 className="w-4 h-4 text-gray-400" />
                              <div>
                                <div className="font-medium text-sm">{item.societyName || '-'}</div>
                                {item.societyLocation && (
                                  <div className="text-xs text-gray-500">{item.societyLocation}</div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{item.type || '-'}</TableCell>
                          <TableCell>{item.area ? `${item.area} sq.ft` : '-'}</TableCell>
                          <TableCell>{item.floor || '-'}</TableCell>
                          <TableCell>₹{fmt(item.basePrice)}</TableCell>
                          <TableCell>
                            <Badge className={statusColors[item.status] || 'bg-gray-100 text-gray-800'}>
                              {item.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[150px] truncate">{item.currentOwner || '-'}</TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleOpenUnit(item)}
                              className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                            >
                              <ExternalLink className="w-4 h-4 mr-1" />
                              Open
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {inventory.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12">
                            <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                            <p className="text-gray-500 mb-2">No inventory found</p>
                            <p className="text-sm text-gray-400">Try adjusting your filters</p>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {pagination.pages > 1 && (
                  <div className="flex items-center justify-between mt-6 pt-4 border-t">
                    <div className="text-sm text-gray-500">
                      Page {pagination.page} of {pagination.pages} ({pagination.total} total units)
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(pagination.page - 1)}
                        disabled={pagination.page <= 1}
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Previous
                      </Button>
                      
                      {/* Page numbers */}
                      <div className="flex items-center space-x-1">
                        {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                          let pageNum
                          if (pagination.pages <= 5) {
                            pageNum = i + 1
                          } else if (pagination.page <= 3) {
                            pageNum = i + 1
                          } else if (pagination.page >= pagination.pages - 2) {
                            pageNum = pagination.pages - 4 + i
                          } else {
                            pageNum = pagination.page - 2 + i
                          }
                          return (
                            <Button
                              key={pageNum}
                              variant={pagination.page === pageNum ? 'default' : 'outline'}
                              size="sm"
                              className="w-8 h-8 p-0"
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
                        disabled={pagination.page >= pagination.pages}
                      >
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
