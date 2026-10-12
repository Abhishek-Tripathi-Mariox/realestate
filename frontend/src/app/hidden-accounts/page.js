'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { Toaster } from '@/components/ui/toaster'
import {
  EyeOff, Eye, RefreshCw, Wallet, Landmark, Users,
} from 'lucide-react'
import { AppShell } from '@/components/dashboard/AppShell'

const fmt = (n) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function HiddenPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [token, setToken] = useState(null)
  const [user, setUser] = useState(null)

  const [accounts, setAccounts] = useState([])
  const [dastiPersons, setDastiPersons] = useState([])
  const [loading, setLoading] = useState(true)

  // Lightweight apiCall — same shape as sibling pages. Delete OTP is not
  // needed here (only PUTs are issued), so skip that guard.
  const apiCall = async (endpoint, method = 'GET', body = null) => {
    const authToken = token || localStorage.getItem('token')
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
    }
    if (body) opts.body = JSON.stringify(body)
    const response = await fetch(`/api${endpoint}`, opts)
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
    try {
      setLoading(true)
      const [accs, persons] = await Promise.all([
        apiCall('/accounts?includeHidden=true'),
        apiCall('/dasti/persons?includeHidden=true'),
      ])
      setAccounts((accs || []).filter((a) => a.isHidden))
      setDastiPersons((persons || []).filter((p) => p.isHidden))
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAuthenticated) return
    loadAll()
  }, [isAuthenticated])

  const handleUnhideAccount = async (account) => {
    try {
      await apiCall(`/accounts/${account.id}`, 'PUT', { isHidden: false })
      toast({ title: 'Unhidden', description: `${account.name} is active again` })
      await loadAll()
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }

  const handleUnhideDasti = async (person) => {
    try {
      await apiCall(`/dasti/persons/${person.id}`, 'PUT', { isHidden: false })
      toast({ title: 'Unhidden', description: `${person.name} is active again` })
      await loadAll()
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }

  if (!isAuthenticated) return null

  const totalHidden = accounts.length + dastiPersons.length

  return (
    <AppShell user={user} onLogout={handleLogout}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <EyeOff className="w-5 h-5 text-slate-500" /> Hidden
            </h2>
            <p className="text-sm text-slate-500">
              Bank accounts and Dasti accounts you've hidden. Old transactions keep
              working — these just don't appear in dropdowns or ledgers anymore. Unhide
              anytime to bring them back.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-12 text-center text-slate-500">Loading…</CardContent>
          </Card>
        ) : totalHidden === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-slate-500">
              <EyeOff className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Nothing hidden</p>
              <p className="text-xs mt-1">
                Hide a bank from the Daybook or a Dasti account from the Dasti Ledger
                and it will show up here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Hidden bank / cash accounts */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Landmark className="w-4 h-4" /> Hidden Bank Accounts
                <Badge variant="secondary" className="ml-1">{accounts.length}</Badge>
              </h3>
              {accounts.length === 0 ? (
                <Card>
                  <CardContent className="py-6 text-center text-xs text-slate-500">
                    No hidden bank accounts.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {accounts.map((account) => (
                    <Card
                      key={account.id}
                      className={`${account.type === 'CASH' ? 'bg-green-50/50' : 'bg-blue-50/50'} border-dashed`}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {account.type === 'CASH'
                              ? <Wallet className="w-5 h-5 text-green-600" />
                              : <Landmark className="w-5 h-5 text-blue-600" />}
                            <CardTitle className="text-base">{account.name}</CardTitle>
                          </div>
                          <Badge className="bg-slate-200 text-slate-700 text-[10px]">HIDDEN</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <p className="text-xs text-slate-500">Current Balance</p>
                          <p className={`text-xl font-bold ${(account.currentBalance ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ₹{fmt(account.currentBalance)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">{account.type}</Badge>
                          <Badge variant="outline" className="text-xs">
                            {(account.scope || 'GLOBAL') === 'GLOBAL' ? 'Global' : 'Society'}
                          </Badge>
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700">
                              <Eye className="w-4 h-4 mr-1" /> Unhide
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Unhide {account.name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This account will start appearing in Account dropdowns and
                                the Daybook balances again. You can hide it later from the
                                Daybook edit dialog.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleUnhideAccount(account)}>
                                Unhide
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {/* Hidden dasti persons */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Users className="w-4 h-4" /> Hidden Dasti Accounts
                <Badge variant="secondary" className="ml-1">{dastiPersons.length}</Badge>
              </h3>
              {dastiPersons.length === 0 ? (
                <Card>
                  <CardContent className="py-6 text-center text-xs text-slate-500">
                    No hidden dasti accounts.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {dastiPersons.map((person) => (
                    <Card key={person.id} className="bg-purple-50/50 border-dashed">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Users className="w-5 h-5 text-purple-600" />
                            <CardTitle className="text-base">{person.name}</CardTitle>
                          </div>
                          <Badge className="bg-slate-200 text-slate-700 text-[10px]">HIDDEN</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <p className="text-xs text-slate-500">Net Balance</p>
                          <p className={`text-xl font-bold ${(person.balance ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ₹{fmt(person.balance)}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            IN ₹{fmt(person.totalIn)} · OUT ₹{fmt(person.totalOut)} · {person.txnCount || 0} txn
                          </p>
                        </div>
                        {person.mobile && (
                          <p className="text-xs text-slate-500">📞 {person.mobile}</p>
                        )}
                        {person.remark && (
                          <p className="text-xs text-slate-500 italic">{person.remark}</p>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700">
                              <Eye className="w-4 h-4 mr-1" /> Unhide
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Unhide {person.name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This person will show up on the Dasti Ledger again. You
                                can hide them later from the Dasti Ledger edit dialog.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleUnhideDasti(person)}>
                                Unhide
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
      <Toaster />
    </AppShell>
  )
}
