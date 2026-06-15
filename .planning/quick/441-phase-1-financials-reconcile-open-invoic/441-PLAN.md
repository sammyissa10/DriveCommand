# Quick Task 441 — Phase 1 Financials: Reconcile Open Invoices KPI to Invoice Model

## Goal
Replace the `openInvoices` computation in the KPI route from a `CarrierLoad.count` (status='invoiced') to an `Invoice.groupBy` (SENT + OVERDUE), matching the scoping convention and data model used by `invoices/page.tsx`.

## Scope
- **Only file touched:** `apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts`
- No schema changes, no migration, no other files.

## Tasks

### Task 1: Replace openInvoices query in kpi/route.ts

**Current (line 46–51):**
```typescript
tenantPrisma.carrierLoad.count({
  where: {
    orgId,
    isSample: false,
    status: 'invoiced',
  },
}),
```

**New:**
1. Rename the 3rd destructured variable from `openInvoices` to `openInvoiceGroups`.
2. Replace the `carrierLoad.count` with:
```typescript
tenantPrisma.invoice.groupBy({
  by: ['status'],
  where: { archivedAt: null },
  _count: true,
}),
```
3. After the `Promise.all`, add:
```typescript
// Invoice/InvoiceItem are RLS-scoped via getTenantPrisma() GUC — no explicit orgId filter needed.
// CarrierLoad/CarrierExpense/DriverPayRecord use explicit orgId filters (those models have an orgId column).
// "open" = SENT + OVERDUE per spec §5.8 outstanding-AR semantics.
const openInvoices = openInvoiceGroups
  .filter(g => g.status === 'SENT' || g.status === 'OVERDUE')
  .reduce((sum, g) => sum + g._count, 0);
```
4. Update the JSDoc comment at the top of the route (line 12) to reflect the new behavior.
5. Return shape is unchanged: `{ loadsThisWeek, pendingPayApprovals, openInvoices, revenueThisWeek }`.

## Verification
1. `next build` clean (no new TypeScript errors).
2. `git diff --name-only` shows only `kpi/route.ts`.
3. Vercel deploy green.
