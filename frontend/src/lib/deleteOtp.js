// Master OTP gating for DELETE requests.
//
// The backend rejects every DELETE without a valid X-Delete-Otp header
// (see backend/src/server.js delete guard). This module provides:
//
//  - getDeleteOtp({ force }): returns the cached OTP, or prompts the user
//    for one and caches it in sessionStorage. `force: true` discards the
//    cache (used after a 403/DELETE_OTP_REQUIRED response).
//  - clearDeleteOtp(): drops the cached value (called on bad OTP).
//  - withDeleteOtpHeader(headers, otp): merges the OTP header into a
//    fetch headers object.
//
// Usage in api wrappers:
//   if (method === 'DELETE') {
//     const otp = getDeleteOtp()
//     if (!otp) throw new Error('Delete cancelled')
//     headers['X-Delete-Otp'] = otp
//   }

const STORAGE_KEY = 'delete_master_otp'

export function getCachedDeleteOtp() {
  if (typeof window === 'undefined') return null
  try {
    return sessionStorage.getItem(STORAGE_KEY) || null
  } catch {
    return null
  }
}

export function setCachedDeleteOtp(otp) {
  if (typeof window === 'undefined') return
  try {
    if (otp) sessionStorage.setItem(STORAGE_KEY, otp)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore quota/private-mode errors
  }
}

export function clearDeleteOtp() {
  setCachedDeleteOtp(null)
}

// Prompts the user for the OTP if not cached. Returns null if the user cancels.
// `force` ignores any cached value and re-prompts.
export function getDeleteOtp({ force = false, message } = {}) {
  if (typeof window === 'undefined') return null
  if (!force) {
    const cached = getCachedDeleteOtp()
    if (cached) return cached
  }
  const promptMsg =
    message ||
    'Enter the master delete OTP to confirm this delete.\nYou can find it in the server .env (DELETE_MASTER_OTP).'
  const value = window.prompt(promptMsg)
  if (!value) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  setCachedDeleteOtp(trimmed)
  return trimmed
}

export function withDeleteOtpHeader(headers = {}, otp) {
  if (!otp) return headers
  return { ...headers, 'X-Delete-Otp': otp }
}

// Helper: should be called after a fetch returns 403 with code DELETE_OTP_REQUIRED.
// Clears cache and re-prompts. Returns the new OTP, or null if cancelled.
export function refreshDeleteOtp(message) {
  clearDeleteOtp()
  return getDeleteOtp({ force: true, message: message || 'OTP was incorrect. Re-enter the master delete OTP.' })
}
