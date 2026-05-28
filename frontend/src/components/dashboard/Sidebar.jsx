'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  Building2,
  LayoutGrid,
  BookOpen,
  Receipt,
  CreditCard,
  Globe,
  LogOut,
  History,
  Layers,
  Trash2,
  KeyRound,
  HardHat,
  IndianRupee,
  Percent,
  Wallet,
  Briefcase,
  StickyNote,
  Landmark,
  ArrowDownToLine,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Brand mark — tries /images/logo.png first, falls back to a gradient
// Building2 icon if the image isn't there. Drop a 256x256 PNG in
// frontend/public/images/logo.png and it appears automatically.
function BrandMark({ className = '' }) {
  const [failed, setFailed] = useState(false)
  if (!failed) {
    return (
      <img
        src="/images/logo.png"
        alt="Logo"
        onError={() => setFailed(true)}
        className={cn('w-9 h-9 rounded-xl object-cover shadow-md', className)}
      />
    )
  }
  return (
    <div className="relative">
      <div className="absolute inset-0 gradient-bg blur-md opacity-40 rounded-xl" />
      <div className={cn('relative gradient-bg w-9 h-9 rounded-xl flex items-center justify-center shadow-md', className)}>
        <Building2 className="w-5 h-5 text-white" strokeWidth={2.25} />
      </div>
    </div>
  )
}

export function Sidebar({ user, onLogout, onChangePassword, mobileOpen = false, onMobileClose }) {
  const pathname = usePathname() || '/'

  const items = [
    { label: 'Dashboard', href: '/', icon: LayoutGrid },
    { label: 'Societies', href: '/societies', icon: Layers },
    { label: 'Daybook', href: '/daybook', icon: BookOpen },
    { label: 'Expenses', href: '/expenses', icon: Receipt },
    { label: 'Vendor Ledger', href: '/vendor-ledger', icon: HardHat },
    { label: 'Commission Ledger', href: '/commission-ledger', icon: Percent },
    { label: 'Margin Ledger', href: '/margin-ledger', icon: IndianRupee },
    { label: 'Loans', href: '/borrow', icon: CreditCard },
    { label: 'Dasti Ledger', href: '/dasti-ledger', icon: Wallet },
    { label: 'Firm Ledger', href: '/firm-ledger', icon: Briefcase },
    { label: 'Bank', href: '/bank', icon: Landmark },
    { label: 'Money Received', href: '/money-received', icon: ArrowDownToLine },
    { label: 'Notes', href: '/notes', icon: StickyNote },
  ]

  if (user?.role === 'super_admin' || user?.role === 'admin') {
    items.push({ label: 'Global Inventory', href: '/global-inventory', icon: Globe })
  }
  if (user?.role === 'super_admin') {
    items.push({ label: 'Audit Logs', href: '/audit-logs', icon: History })
    items.push({ label: 'Trash', href: '/trash', icon: Trash2 })
  }

  const isActive = (href) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')

  const navContent = (
    <>
      <div className="px-6 py-5 flex items-center gap-2.5">
        <BrandMark />
        <span className="font-bold text-lg tracking-tight text-slate-900">Estate</span>
      </div>
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {items.map((it) => {
          const active = isActive(it.href)
          const Icon = it.icon
          return (
            <Link
              key={it.href}
              href={it.href}
              onClick={() => onMobileClose && onMobileClose()}
              className={cn(
                'group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                active
                  ? 'gradient-bg text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              )}
            >
              <Icon className={cn('w-4 h-4 shrink-0', active ? 'text-white' : 'text-slate-500')} />
              <span className="truncate">{it.label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="p-3 border-t border-slate-200/70 space-y-1">
        {onChangePassword && (
          <button
            onClick={() => {
              onChangePassword()
              onMobileClose && onMobileClose()
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <KeyRound className="w-4 h-4 text-slate-500 shrink-0" />
            <span>Change Password</span>
          </button>
        )}
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
        >
          <LogOut className="w-4 h-4 text-slate-500 shrink-0" />
          <span>Logout</span>
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop: static sidebar */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 sticky top-0 h-screen bg-white border-r border-slate-200/70">
        {navContent}
      </aside>

      {/* Mobile: drawer */}
      <div
        className={cn(
          'fixed inset-0 z-50 lg:hidden transition-opacity',
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        aria-hidden={!mobileOpen}
      >
        <div
          className="absolute inset-0 bg-black/40"
          onClick={onMobileClose}
        />
        <aside
          className={cn(
            'absolute left-0 top-0 h-full w-64 max-w-[80vw] bg-white border-r border-slate-200/70 flex flex-col shadow-xl transition-transform',
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          {navContent}
        </aside>
      </div>
    </>
  )
}
