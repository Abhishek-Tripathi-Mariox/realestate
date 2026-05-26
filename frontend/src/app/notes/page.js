'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Toaster } from '@/components/ui/toaster'
import { StickyNote, Plus, Edit, Trash2, Search, X, RefreshCw, Building2 } from 'lucide-react'
import { AppShell } from '@/components/dashboard/AppShell'
import { getDeleteOtp, refreshDeleteOtp } from '@/lib/deleteOtp'

const NOTE_PALETTE = [
  { bg: 'bg-yellow-50',  border: 'border-yellow-200',  accent: 'text-yellow-700' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', accent: 'text-emerald-700' },
  { bg: 'bg-sky-50',     border: 'border-sky-200',     accent: 'text-sky-700' },
  { bg: 'bg-rose-50',    border: 'border-rose-200',    accent: 'text-rose-700' },
  { bg: 'bg-violet-50',  border: 'border-violet-200',  accent: 'text-violet-700' },
  { bg: 'bg-amber-50',   border: 'border-amber-200',   accent: 'text-amber-700' },
]
// Deterministic note color from id so the same note keeps the same tint across
// reloads — pure cosmetic, helps visually distinguish cards in the grid.
const pickPalette = (key = '') => {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return NOTE_PALETTE[h % NOTE_PALETTE.length]
}

const formatDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function NotesPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [token, setToken] = useState(null)
  const [user, setUser] = useState(null)

  const [notes, setNotes] = useState([])
  const [societies, setSocieties] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // Society filter values: 'all' | 'none' (general/company-wide) | <societyId>
  const [societyFilter, setSocietyFilter] = useState('all')

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  // Society on the form uses '' to mean "no society / general note" — backend
  // stores it as null. Easier to bind to a Select that way.
  const [form, setForm] = useState({ title: '', body: '', societyId: '' })

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

  const loadSocieties = async () => {
    try { setSocieties(await apiCall('/societies')) }
    catch (e) { /* non-blocking — notes still render without the society list */ }
  }

  const loadNotes = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (societyFilter && societyFilter !== 'all') params.append('societyId', societyFilter)
      const qs = params.toString()
      setNotes(await apiCall(`/notes${qs ? `?${qs}` : ''}`))
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (isAuthenticated) { loadNotes(); loadSocieties() } }, [isAuthenticated])
  // Debounce search a touch so we don't hammer the API on every keystroke.
  // Society filter is included so changing it re-fetches; no debounce needed
  // for the select since it changes one click at a time.
  useEffect(() => {
    if (!isAuthenticated) return
    const t = setTimeout(loadNotes, 250)
    return () => clearTimeout(t)
  }, [search, societyFilter])

  const openAdd = () => {
    setEditing(null)
    // Pre-fill with the currently-filtered society (if any specific one is
    // selected) so the new note lands where the user expects it to show.
    setForm({
      title: '',
      body: '',
      societyId: societyFilter !== 'all' && societyFilter !== 'none' ? societyFilter : '',
    })
    setShowForm(true)
  }
  const openEdit = (note) => {
    setEditing(note)
    setForm({ title: note.title || '', body: note.body || '', societyId: note.societyId || '' })
    setShowForm(true)
  }

  const handleSave = async () => {
    const title = form.title.trim()
    if (!title) { toast({ variant: 'destructive', title: 'Error', description: 'Title is required' }); return }
    try {
      const payload = { title, body: form.body, societyId: form.societyId || null }
      if (editing) {
        await apiCall(`/notes/${editing.id}`, 'PUT', payload)
        toast({ title: 'Saved', description: 'Note updated' })
      } else {
        await apiCall('/notes', 'POST', payload)
        toast({ title: 'Saved', description: 'Note added' })
      }
      setShowForm(false)
      setEditing(null)
      await loadNotes()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message })
    }
  }

  const handleDelete = async (note) => {
    if (!confirm(`Delete note "${note.title}"?`)) return
    try {
      await apiCall(`/notes/${note.id}`, 'DELETE')
      toast({ title: 'Deleted', description: 'Note removed' })
      await loadNotes()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message })
    }
  }

  if (!isAuthenticated) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
  }

  return (
    <AppShell user={user} onLogout={handleLogout} searchPlaceholder="Search notes...">
      <Toaster />

      <div className="space-y-4">
        {/* Hero header */}
        <div className="rounded-2xl p-5 bg-gradient-to-r from-amber-500 via-yellow-500 to-orange-500 text-white shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
                <StickyNote className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Notes</h2>
                <p className="text-sm text-white/90">Quick reminders, scratchpad and todo lists.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={loadNotes}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
              <Button size="sm" className="bg-white text-amber-700 hover:bg-amber-50" onClick={openAdd}>
                <Plus className="w-4 h-4 mr-2" /> Add Note
              </Button>
            </div>
          </div>
        </div>

        {/* Filters — search + society. Both feed into loadNotes via deps. */}
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search title or body..."
                  className="h-9 pl-9 pr-9"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                    onClick={() => setSearch('')}
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <Select value={societyFilter} onValueChange={setSocietyFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Societies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Societies</SelectItem>
                  <SelectItem value="none">General (no society)</SelectItem>
                  {societies.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(search || societyFilter !== 'all') && (
              <div className="flex items-center justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-slate-500"
                  onClick={() => { setSearch(''); setSocietyFilter('all') }}
                >
                  <X className="w-3 h-3 mr-1" /> Clear filters
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes grid */}
        {loading && notes.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
          </div>
        ) : notes.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <StickyNote className="w-12 h-12 mx-auto text-amber-300 mb-2" />
              <p className="text-slate-500">{search ? 'No notes match your search' : 'No notes yet'}</p>
              {!search && (
                <Button size="sm" className="mt-3 bg-amber-500 hover:bg-amber-600" onClick={openAdd}>
                  <Plus className="w-4 h-4 mr-1" /> Add your first note
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {notes.map(note => {
              const palette = pickPalette(note.id)
              return (
                <Card key={note.id} className={`${palette.bg} ${palette.border} hover:shadow-md transition-shadow flex flex-col`}>
                  <CardContent className="p-4 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className={`font-semibold ${palette.accent} break-words`}>{note.title}</h3>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(note)} title="Edit">
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:text-red-700" onClick={() => handleDelete(note)} title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    {note.body && (
                      <p className="text-sm text-slate-700 whitespace-pre-wrap break-words flex-1">
                        {note.body}
                      </p>
                    )}
                    {/* Society tag — surface where the note belongs so the
                        grid is scannable. "General" reserved for notes with
                        no society link (company-wide reminders). */}
                    {(() => {
                      const societyName = note.societyId
                        ? (societies.find(s => s.id === note.societyId)?.name || 'Unknown society')
                        : null
                      return (
                        <div className="mt-3">
                          {societyName ? (
                            <Badge variant="outline" className="bg-white/60 text-[10px] font-normal gap-1">
                              <Building2 className="w-3 h-3" /> {societyName}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-white/60 text-[10px] font-normal text-slate-500">
                              General
                            </Badge>
                          )}
                        </div>
                      )
                    })()}
                    <div className="text-[10px] text-slate-500 mt-3 pt-2 border-t border-black/5">
                      {note.updatedAt && note.updatedAt !== note.createdAt
                        ? `Updated ${formatDate(note.updatedAt)}`
                        : `Added ${formatDate(note.createdAt)}`}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) setEditing(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StickyNote className="w-5 h-5 text-amber-600" />
              {editing ? 'Edit Note' : 'Add Note'}
            </DialogTitle>
            <DialogDescription>
              {editing ? 'Update the title or body.' : 'Quick reminder or scratchpad entry.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Title *</Label>
              <Input
                placeholder="e.g., Bank reconciliation pending"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                maxLength={200}
                autoFocus
              />
            </div>
            <div>
              <Label>Body</Label>
              <Textarea
                rows={8}
                placeholder="Details, todo items, links, etc."
                value={form.body}
                onChange={e => setForm({ ...form, body: e.target.value })}
              />
            </div>
            <div>
              <Label>Society <span className="text-xs text-slate-400 font-normal">(optional)</span></Label>
              {/* Empty string = general / company-wide note. Backend stores
                  null. Radix Select doesn't accept an empty-string value so we
                  use the literal '__none__' sentinel and translate it. */}
              <Select
                value={form.societyId || '__none__'}
                onValueChange={v => setForm({ ...form, societyId: v === '__none__' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None (general note) —</SelectItem>
                  {societies.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-500 mt-1">Link to a specific society, or leave blank for a general note.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditing(null) }}>Cancel</Button>
            <Button className="bg-amber-500 hover:bg-amber-600" onClick={handleSave}>
              {editing ? 'Save Changes' : 'Add Note'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
