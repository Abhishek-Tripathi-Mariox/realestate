const { notDeleted } = require('../../utils/notDeleted');
const {
  Sale, ExpenseBill, CommissionBill, MarginBill, Loan, Party,
  DastiTransaction, DastiPerson, Society, Vendor, Customer, Inventory,
} = require('../../models');

// Receivables & Payables = consolidated view of who owes us money
// (receivables) and to whom we owe money (payables), filterable by society.
//
// Each section lists actionable rows (sorted by balance desc) so the user
// can drill into the biggest outstanding amounts first.

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Society scoping helper. If a specific societyId is selected, every fetched
// collection is filtered down to that society. Dasti / company-level loans
// have no societyId — so when a specific society is chosen, those are
// excluded (matching the user's vendor-ledger style "scope to society"
// expectation).
const applySocietyFilter = (filter, societyId) => {
  if (societyId && societyId !== 'all') {
    return { ...filter, societyId };
  }
  return filter;
};

const summary = async (query) => {
  const societyId = query.societyId;
  const isSocietySpecific = societyId && societyId !== 'all';

  // ===== RECEIVABLES (Lena — money owed TO us) =====

  // 1. Customers: pending sale balances. Skip soft-deleted sales so cancelled
  //    deals don't keep haunting the list. Enrich with the Customer record's
  //    name + the Inventory unit number so a row reads as "Buyer — Unit 12"
  //    instead of just "—" when buyerName was never filled on the sale.
  const salesFilter = applySocietyFilter({ isDeleted: { $ne: true } }, societyId);
  const sales = await Sale.find(salesFilter, {
    id: 1, customerId: 1, buyerName: 1, finalAmount: 1, amountPaid: 1,
    societyId: 1, saleDate: 1, inventoryId: 1,
  }).lean();

  // Batch-resolve customer + inventory records used by the pending sales so
  // we don't fire N small queries per row.
  const pendingSales = sales.filter(s => Math.max(0, (s.finalAmount || 0) - (s.amountPaid || 0)) > 0);
  const customerIds = [...new Set(pendingSales.map(s => s.customerId).filter(Boolean))];
  const inventoryIds = [...new Set(pendingSales.map(s => s.inventoryId).filter(Boolean))];
  const [customerDocs, inventoryDocs] = await Promise.all([
    customerIds.length ? Customer.find({ id: { $in: customerIds } }).lean() : [],
    inventoryIds.length ? Inventory.find({ id: { $in: inventoryIds } }).lean() : [],
  ]);
  const customerById = Object.fromEntries(customerDocs.map(c => [c.id, c]));
  const inventoryById = Object.fromEntries(inventoryDocs.map(i => [i.id, i]));

  const customerRows = pendingSales
    .map(s => {
      const customer = customerById[s.customerId];
      const inv = inventoryById[s.inventoryId];
      const displayName = (s.buyerName || customer?.name || '').trim() || '—';
      const phone = customer?.phone || '';
      const unit = inv?.inventoryNumber ? `Unit ${inv.inventoryNumber}` : '';
      return {
        type: 'CUSTOMER',
        refId: s.id,
        customerId: s.customerId,
        name: displayName,
        // `category` mirrors the Payables/Vendor row pattern — used as a
        // secondary tag next to the primary name on the frontend.
        category: unit,
        phone,
        societyId: s.societyId || null,
        date: s.saleDate || null,
        total: round(s.finalAmount),
        paid: round(s.amountPaid),
        balance: round(Math.max(0, (s.finalAmount || 0) - (s.amountPaid || 0))),
      };
    })
    .sort((a, b) => b.balance - a.balance);

  // 2. Loans GIVEN: party still owes us until balancePrincipal hits 0. We pull
  //    party names in one batch to avoid an N+1 per loan row.
  const loanGivenFilter = applySocietyFilter(
    { direction: 'GIVEN', isDeleted: { $ne: true } },
    societyId,
  );
  const loansGiven = await Loan.find(loanGivenFilter).lean();
  const partyIds = [...new Set([
    ...loansGiven.map(l => l.partyId).filter(Boolean),
  ])];

  // 3. Loans BORROWED: we still owe lender until balancePrincipal hits 0.
  const loanBorrowedFilter = applySocietyFilter(
    { direction: 'BORROWED', isDeleted: { $ne: true } },
    societyId,
  );
  const loansBorrowed = await Loan.find(loanBorrowedFilter).lean();
  partyIds.push(...loansBorrowed.map(l => l.partyId).filter(Boolean));

  const uniquePartyIds = [...new Set(partyIds)];
  const parties = uniquePartyIds.length
    ? await Party.find({ id: { $in: uniquePartyIds } }).lean()
    : [];
  const partyById = Object.fromEntries(parties.map(p => [p.id, p]));

  const loanGivenRows = loansGiven
    .map(l => ({
      type: 'LOAN_GIVEN',
      refId: l.id,
      partyId: l.partyId,
      name: partyById[l.partyId]?.name || '—',
      category: l.purpose || '',
      societyId: l.societyId || null,
      date: l.loanDate || null,
      total: round(l.principalAmount),
      paid: round(l.totalRepaid),
      balance: round(l.balancePrincipal),
    }))
    .filter(r => r.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  // 4. Dasti: persons who owe us cash (balance = IN − OUT < 0 from firm POV
  //    means we gave them more than they gave back, so they owe us). Dasti
  //    is company-wide — only include when the user isn't drilled into a
  //    specific society.
  let dastiOwesUsRows = [];
  let weOweDastiRows = [];
  if (!isSocietySpecific) {
    const dastiTxns = await DastiTransaction
      .find({ isDeleted: { $ne: true } }, { personId: 1, type: 1, amount: 1 })
      .lean();
    // Roll up per-person totals in JS — collection is small enough that the
    // round-trip wouldn't be worth a separate aggregate pipeline.
    const perPerson = {};
    for (const t of dastiTxns) {
      const slot = perPerson[t.personId] || (perPerson[t.personId] = { in: 0, out: 0 });
      if (t.type === 'IN') slot.in += Number(t.amount) || 0;
      else slot.out += Number(t.amount) || 0;
    }

    const dastiPersonIds = Object.keys(perPerson);
    const dastiPersons = dastiPersonIds.length
      ? await DastiPerson.find({ id: { $in: dastiPersonIds } }).lean()
      : [];
    const personById = Object.fromEntries(dastiPersons.map(p => [p.id, p]));

    for (const [pid, totals] of Object.entries(perPerson)) {
      const person = personById[pid];
      if (!person || person.isDeleted) continue;
      const net = round(totals.in - totals.out);
      // net > 0 → firm received more than it gave back → firm OWES person
      // net < 0 → firm gave more than it received → person OWES firm
      if (net < 0) {
        dastiOwesUsRows.push({
          type: 'DASTI',
          refId: pid,
          name: person.name || '—',
          societyId: null,
          balance: round(-net),
        });
      } else if (net > 0) {
        weOweDastiRows.push({
          type: 'DASTI',
          refId: pid,
          name: person.name || '—',
          societyId: null,
          balance: round(net),
        });
      }
    }
    dastiOwesUsRows.sort((a, b) => b.balance - a.balance);
    weOweDastiRows.sort((a, b) => b.balance - a.balance);
  }

  // ===== PAYABLES (Dena — money WE owe) =====

  // 1. Vendor (expense) bills with outstanding balance.
  const expenseBillFilter = applySocietyFilter(notDeleted(), societyId);
  const expenseBills = await ExpenseBill.find(expenseBillFilter).lean();

  // ExpenseBill is reused by Commission flow — filter those out via vendor.type
  // and category fallback so they don't double-count under both sections.
  const expenseVendorIds = [...new Set(expenseBills.map(b => b.vendorId).filter(Boolean))];
  const vendorDocs = expenseVendorIds.length
    ? await Vendor.find({ id: { $in: expenseVendorIds } }).lean()
    : [];
  const vendorById = Object.fromEntries(vendorDocs.map(v => [v.id, v]));
  const commissionVendorIds = new Set(
    vendorDocs.filter(v => v.type === 'Commission').map(v => v.id),
  );

  const vendorBillRows = expenseBills
    .filter(b => {
      if (b.vendorId && commissionVendorIds.has(b.vendorId)) return false;
      if ((b.category || '').toLowerCase() === 'commission') return false;
      return true;
    })
    .map(b => ({
      type: 'VENDOR_BILL',
      refId: b.id,
      name: b.vendorName || '—',
      category: b.category || '',
      societyId: b.societyId || null,
      date: b.billDate || null,
      total: round(b.amount),
      paid: round(b.paidAmount),
      balance: round(Math.max(0, (b.amount || 0) - (b.paidAmount || 0))),
    }))
    .filter(r => r.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  // 2. Commission bills.
  const commissionFilter = applySocietyFilter(notDeleted(), societyId);
  const commissionBills = await CommissionBill.find(commissionFilter).lean();
  const commissionRows = commissionBills
    .map(b => ({
      type: 'COMMISSION_BILL',
      refId: b.id,
      name: b.brokerName || b.vendorName || '—',
      societyId: b.societyId || null,
      date: b.billDate || null,
      total: round(b.amount),
      paid: round(b.paidAmount),
      balance: round(Math.max(0, (b.amount || 0) - (b.paidAmount || 0))),
    }))
    .filter(r => r.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  // 3. Margin bills.
  const marginFilter = applySocietyFilter(notDeleted(), societyId);
  const marginBills = await MarginBill.find(marginFilter).lean();
  const marginRows = marginBills
    .map(b => ({
      type: 'MARGIN_BILL',
      refId: b.id,
      name: b.partnerName || b.brokerName || '—',
      societyId: b.societyId || null,
      date: b.billDate || null,
      total: round(b.amount),
      paid: round(b.paidAmount),
      balance: round(Math.max(0, (b.amount || 0) - (b.paidAmount || 0))),
    }))
    .filter(r => r.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  // 4. Loans borrowed.
  const loanBorrowedRows = loansBorrowed
    .map(l => ({
      type: 'LOAN_BORROWED',
      refId: l.id,
      partyId: l.partyId,
      name: partyById[l.partyId]?.name || '—',
      category: l.purpose || '',
      societyId: l.societyId || null,
      date: l.loanDate || null,
      total: round(l.principalAmount),
      paid: round(l.totalRepaid),
      balance: round(l.balancePrincipal),
    }))
    .filter(r => r.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  // ===== Totals =====
  const sumBalance = (rows) => round(rows.reduce((s, r) => s + r.balance, 0));

  const receivables = {
    customers: { rows: customerRows, total: sumBalance(customerRows) },
    loansGiven: { rows: loanGivenRows, total: sumBalance(loanGivenRows) },
    dasti: { rows: dastiOwesUsRows, total: sumBalance(dastiOwesUsRows) },
    grandTotal: round(
      sumBalance(customerRows) + sumBalance(loanGivenRows) + sumBalance(dastiOwesUsRows),
    ),
  };

  const payables = {
    vendors: { rows: vendorBillRows, total: sumBalance(vendorBillRows) },
    commissions: { rows: commissionRows, total: sumBalance(commissionRows) },
    margins: { rows: marginRows, total: sumBalance(marginRows) },
    loansBorrowed: { rows: loanBorrowedRows, total: sumBalance(loanBorrowedRows) },
    dasti: { rows: weOweDastiRows, total: sumBalance(weOweDastiRows) },
    grandTotal: round(
      sumBalance(vendorBillRows) + sumBalance(commissionRows) +
      sumBalance(marginRows) + sumBalance(loanBorrowedRows) + sumBalance(weOweDastiRows),
    ),
  };

  const society = isSocietySpecific
    ? await Society.findOne({ id: societyId }).lean().then(s => s ? { id: s.id, name: s.name } : null)
    : null;

  return {
    societyId: isSocietySpecific ? societyId : 'all',
    society,
    receivables,
    payables,
    net: round(receivables.grandTotal - payables.grandTotal),
  };
};

module.exports = { summary };
