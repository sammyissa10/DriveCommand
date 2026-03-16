---
phase: quick-77
plan: "01"
subsystem: owner-portal-lists
tags: [mobile, responsive, cards, trucks, drivers, loads, routes, invoices, payroll]
dependency_graph:
  requires: []
  provides: [mobile-card-views-all-entity-lists]
  affects: [truck-list, driver-list, load-list, route-list, invoice-list, payroll-list]
tech_stack:
  added: []
  patterns: [responsive-table-card-toggle, md-hidden, hidden-md-block, ChevronRight-tap-affordance]
key_files:
  created: []
  modified:
    - src/components/trucks/truck-list.tsx
    - src/components/drivers/driver-list.tsx
    - src/components/loads/load-list.tsx
    - src/components/routes/route-list.tsx
    - src/components/invoices/invoice-list.tsx
    - src/components/payroll/payroll-list.tsx
decisions:
  - "Use table.getRowModel().rows for card iteration on table-backed lists (trucks, drivers, routes) so sorting and filtering propagate to mobile cards"
  - "Use filtered array directly for load cards since LoadList does not use a TanStack table instance"
  - "Use records/invoices arrays directly for payroll and invoice cards since they have no table instance"
  - "Route status color logic extracted as helper function getRouteStatusClasses to share between table cell renderer and mobile card"
metrics:
  duration: "220s"
  completed: "2026-03-15"
  tasks: 2
  files_modified: 6
---

# Phase quick-77 Plan 01: Mobile Card Views for All Owner-Portal Lists Summary

Mobile-first stacked card layouts added to all 6 owner-portal list pages (trucks, drivers, loads, routes, invoices, payroll) using a `hidden md:block` / `md:hidden` responsive toggle pattern — tables hidden on mobile, cards shown; cards hidden on desktop, tables shown.

## What Was Built

Six list components updated with identical responsive structure: the existing desktop table wrapped in `hidden md:block`, and a new sibling `md:hidden` card container using `divide-y divide-border rounded-xl border border-border bg-card overflow-hidden`. Each card row uses `flex items-center gap-3 px-4 py-3.5 active:bg-muted/50 cursor-pointer` with a `ChevronRight` icon for tap affordance.

### Card Content Per Entity

| Entity | Line 1 | Line 2 | Line 3 | Navigation |
|--------|--------|--------|--------|------------|
| Trucks | License plate badge + status badge | Year/make/model + odometer | — | `/trucks/:id` |
| Drivers | Full name + active/deactivated badge | License number + email | — | `/drivers/:id` |
| Loads | Load number + LoadStatusBadge | Customer name + rate | Pickup date | `/loads/:id` |
| Routes | Route name + status badge | Origin → destination | Scheduled date | `/routes/:id` |
| Invoices | Invoice number + status badge | Total amount + due date | — | `/invoices/:id` |
| Payroll | Driver name + status badge | Pay period range | Net pay (bold) | `/payroll/:id` |

## Decisions Made

1. **Table-backed lists use `table.getRowModel().rows` for cards** — trucks, drivers, and routes use TanStack Table. Card iteration uses `table.getRowModel().rows` so search filtering and sorting state flows through to mobile cards automatically.

2. **Array-direct iteration for loads, invoices, payroll** — LoadList already computes a `filtered` array from tab state; InvoiceList and PayrollList have no table instance. Cards iterate the source array directly, consistent with existing filter logic.

3. **Route status helper extracted** — `getRouteStatusClasses(status)` helper function defined at module level so both the column cell renderer and the mobile card share the same color-mapping logic without duplication.

4. **No deactivate/reactivate buttons on driver cards** — Plan explicitly specified cards navigate only; AlertDialog modals remain intact for the desktop table actions.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

All 6 modified files confirmed on disk. Both task commits confirmed in git log (bdd6cf9, 36bbc38).
