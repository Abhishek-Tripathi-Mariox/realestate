'use client'

import { useEffect } from 'react'

// Global session-expiry handler. We monkey-patch window.fetch so every
// existing per-page apiCall (none of which check 401 themselves) gets a
// consistent "token died → wipe creds + bounce to login" behaviour without
// having to refactor every page-level helper.
//
// Scope is intentionally narrow: only /api responses get inspected; non-API
// fetches (images, third-party calls) flow through untouched.
export default function AuthGuard() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    // Guard against double-wrapping in dev (StrictMode mounts effects twice
    // and HMR re-runs them) — without this, the wrappers stack and a single
    // 401 fires the redirect logic N times.
    if (window.__authGuardInstalled) return
    window.__authGuardInstalled = true

    const originalFetch = window.fetch.bind(window)

    const isApiUrl = (input) => {
      try {
        const url = typeof input === 'string'
          ? input
          : (input?.url || String(input))
        return url.startsWith('/api/') || url.includes('/api/')
      } catch {
        return false
      }
    }

    const handleUnauthorized = () => {
      // Login itself returns 401 on bad credentials — let the login page
      // surface that in its own form rather than triggering a redirect loop.
      if (window.location.pathname === '/' || window.location.pathname === '') return
      try {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      } catch {
        // localStorage can throw in private mode — best-effort cleanup.
      }
      window.location.replace('/')
    }

    window.fetch = async (...args) => {
      const response = await originalFetch(...args)
      if (response.status === 401 && isApiUrl(args[0])) {
        handleUnauthorized()
      }
      return response
    }

    return () => {
      window.fetch = originalFetch
      window.__authGuardInstalled = false
    }
  }, [])

  return null
}
