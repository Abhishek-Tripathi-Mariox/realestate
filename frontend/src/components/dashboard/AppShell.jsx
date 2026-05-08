'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppShell({
  user,
  onLogout,
  onChangePassword,
  search,
  onSearchChange,
  searchPlaceholder,
  children,
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex min-h-screen estate-pattern">
      <Sidebar
        user={user}
        onLogout={onLogout}
        onChangePassword={onChangePassword}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0 estate-pattern-soft">
        <Topbar
          user={user}
          search={search}
          onSearchChange={onSearchChange}
          searchPlaceholder={searchPlaceholder}
          onMenuClick={() => setMobileNavOpen(true)}
        />
        <main className="flex-1 p-3 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
