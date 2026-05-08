// Master OTP gating for DELETE requests.
//
// The backend rejects every DELETE without a valid X-Delete-Otp header
// (see backend/src/middleware/deleteOtp.js). The OTP is prompted fresh
// for every delete — no caching across actions or platforms.

const STORAGE_KEY = 'delete_master_otp'

// Legacy stored value cleanup. Earlier versions cached the OTP in
// sessionStorage, which caused Safari/Mac to skip the prompt on subsequent
// deletes. We now prompt every time and proactively clear any stale cache.
function purgeLegacyCache() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore quota/private-mode errors
  }
}

export function getCachedDeleteOtp() {
  return null
}

export function setCachedDeleteOtp() {
  purgeLegacyCache()
}

export function clearDeleteOtp() {
  purgeLegacyCache()
}

// Prompts the user for the OTP every time. Returns null if the user cancels.
export function getDeleteOtp({ message } = {}) {
  if (typeof window === 'undefined') return null
  purgeLegacyCache()
  const promptMsg =
    message ||
    'Enter the master delete OTP to confirm this delete.\nYou can find it in the server .env (DELETE_MASTER_OTP).'
  const value = window.prompt(promptMsg)
  if (!value) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  return trimmed
}

export function withDeleteOtpHeader(headers = {}, otp) {
  if (!otp) return headers
  return { ...headers, 'X-Delete-Otp': otp }
}

// Helper: called after a fetch returns 403 with code DELETE_OTP_REQUIRED.
// Re-prompts the user. Returns the new OTP, or null if cancelled.
export function refreshDeleteOtp(message) {
  return getDeleteOtp({ message: message || 'OTP was incorrect. Re-enter the master delete OTP.' })
}
