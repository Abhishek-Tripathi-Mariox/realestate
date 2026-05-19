'use client'

import { App } from '../page'

export default function CommissionLedgerPage() {
  return <App initialTab="expenses" singleTabMode vendorLedgerScope="commission" />
}
