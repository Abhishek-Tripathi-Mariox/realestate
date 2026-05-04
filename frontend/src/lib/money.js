// Money utilities for Indian Rupee accounting.
//
// Rules of the road for this codebase:
//   - All monetary values are stored as JavaScript numbers (rupees with up to
//     2 decimal places for paise). The backend rounds writes to 2 decimals
//     to keep paise-level integrity.
//   - Display: always Indian locale, always 2 decimal places, with a leading ₹.
//     Use formatINR() everywhere a rupee amount is shown to the user.
//   - Math: use roundPaise() before storing or comparing computed amounts so
//     0.1 + 0.2 type drift never propagates into balances.

const PAISE_PER_RUPEE = 100

// Round a number to 2 decimal places using banker-safe paise math.
// Examples:
//   roundPaise(123.456) === 123.46
//   roundPaise(0.1 + 0.2) === 0.3
export function roundPaise(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  // Multiply by 100, round, divide. Use Math.round on +ve and -ve consistently.
  return Math.round(n * PAISE_PER_RUPEE) / PAISE_PER_RUPEE
}

export function toPaise(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * PAISE_PER_RUPEE)
}

export function fromPaise(paise) {
  const n = Number(paise)
  if (!Number.isFinite(n)) return 0
  return n / PAISE_PER_RUPEE
}

// Indian-locale rupee formatter — "1,23,456.78" with always 2 decimals.
export function formatINR(value, { withSymbol = true } = {}) {
  const n = roundPaise(value)
  const formatted = n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return withSymbol ? `₹${formatted}` : formatted
}

// Compact variant for tables where space is tight: shows decimals only when
// non-zero. Still uses Indian commas. Useful for dashboards summaries.
export function formatINRCompact(value, { withSymbol = true } = {}) {
  const n = roundPaise(value)
  const hasPaise = Math.round(n * PAISE_PER_RUPEE) % PAISE_PER_RUPEE !== 0
  const formatted = n.toLocaleString('en-IN', {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  })
  return withSymbol ? `₹${formatted}` : formatted
}

// Word breakdown — "Rupees one lakh twenty three thousand four hundred fifty six and seventy eight paise only"
// Useful for receipts. Kept simple — only single decimal point, only positive.
const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

function twoDigitsToWords(n) {
  if (n < 10) return ONES[n]
  if (n < 20) return TEENS[n - 10]
  const t = Math.floor(n / 10)
  const o = n % 10
  return o === 0 ? TENS[t] : `${TENS[t]} ${ONES[o]}`
}

function threeDigitsToWords(n) {
  const h = Math.floor(n / 100)
  const r = n % 100
  if (h === 0) return twoDigitsToWords(r)
  if (r === 0) return `${ONES[h]} hundred`
  return `${ONES[h]} hundred ${twoDigitsToWords(r)}`
}

export function rupeesInWords(value) {
  const n = roundPaise(Math.abs(value || 0))
  const rupees = Math.floor(n)
  const paise = Math.round((n - rupees) * PAISE_PER_RUPEE)

  if (rupees === 0 && paise === 0) return 'Rupees zero only'

  const parts = []
  let r = rupees
  const crore = Math.floor(r / 10000000); r %= 10000000
  const lakh = Math.floor(r / 100000); r %= 100000
  const thousand = Math.floor(r / 1000); r %= 1000
  const hundred = r

  if (crore > 0) parts.push(`${threeDigitsToWords(crore)} crore`)
  if (lakh > 0) parts.push(`${twoDigitsToWords(lakh)} lakh`)
  if (thousand > 0) parts.push(`${twoDigitsToWords(thousand)} thousand`)
  if (hundred > 0) parts.push(threeDigitsToWords(hundred))

  let result = `Rupees ${parts.join(' ')}`
  if (paise > 0) result += ` and ${twoDigitsToWords(paise)} paise`
  result += ' only'
  return result.replace(/\s+/g, ' ').trim()
}
