'use client'

// Reuse the full Vendor Ledger UX from the main App component — same
// drawers, dialogs, bill / payment flows — and switch it to company
// scope via the `companyScope` prop. That prop bypasses the society
// gate and points the vendor + bill loaders at `/vendors?scope=company`
// / `/expense-bills?scope=COMPANY` instead of the per-society URLs.
import { App } from '../page'

export default function CompanyVendorLedgerPage() {
  return <App initialTab="expenses" singleTabMode companyScope />
}
