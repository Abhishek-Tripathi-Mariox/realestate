'use client'

import { useState } from 'react'
import { Bell, Search } from 'lucide-react'

export function Topbar({ user, search, onSearchChange, searchPlaceholder = 'Search...' }) {
  const [internal, setInternal] = useState('')
  const controlled = onSearchChange !== undefined
  const value = controlled ? (search ?? '') : internal
  const handleChange = (v) => {
    if (controlled) onSearchChange(v)
    else setInternal(v)
  }

  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/80 border-b border-slate-200/70">
      <div className="px-6 py-3 flex items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full h-10 pl-11 pr-4 rounded-full bg-slate-100/70 border border-transparent placeholder:text-slate-400 text-sm text-slate-700 outline-none transition-all focus:bg-white focus:border-slate-200 focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="ml-auto flex items-center gap-3">
          {/* Notification bell */}
          <button
            type="button"
            className="relative w-10 h-10 rounded-full bg-slate-100/70 hover:bg-slate-200/70 flex items-center justify-center transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4 text-slate-600" />
            <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />
          </button>

          {/* User pill */}
          <div className="flex items-center gap-3 pl-1 pr-3 py-1 rounded-full bg-white border border-slate-200/70">
            <div className="w-8 h-8 rounded-full gradient-bg flex items-center justify-center text-white text-xs font-semibold uppercase">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <div className="hidden sm:block text-left pr-1">
              <p className="text-xs font-semibold text-slate-900 leading-tight">{user?.name || 'User'}</p>
              <p className="text-[11px] text-slate-500 leading-tight">
                {user?.role === 'super_admin' ? 'Super Admin' : user?.role === 'admin' ? 'Admin' : 'Accountant'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
