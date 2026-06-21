# Quick Task 441 — SUMMARY

## Task
Phase 1 Financials: reconcile Open Invoices KPI to Invoice model.

## What Changed
**File:** `apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts`

**Before:** `openInvoices = CarrierLoad.count({ where: { orgId, isSample: false, status: 'invoiced' } })`
**After:** `openInvoices = Invoice.groupBy(status, { where: { archivedAt: null } }) → filter SENT|OVERDUE → sum _count`

The dashboard "Open Invoices" KPI now counts actual Invoice records instead of dispatch CarrierLoad rows. It matches the scoping convention in `invoices/page.tsx` (RLS-scoped via `getTenantPrisma()` GUC, no explicit `orgId` filter) and the spec's "outstanding AR" definition (§5.8: SENT + OVERDUE = open).

## Response shape
Unchanged: `{ loadsThisWeek, pendingPayApprovals, openInvoices, revenueThisWeek }`.
No dashboard card changes required.

## Build
`next build` ✓ — compiled successfully, no new TypeScript errors.

## Commit
`e40a444d` — `feat(quick-441): reconcile Open Invoices KPI to Invoice model`
