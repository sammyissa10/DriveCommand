---
phase: quick-170
plan: 01
subsystem: carrier-ops
tags: [carrier-ops, dispatch, stops, expenses, pay-records, loads, server-page]
dependency_graph:
  requires:
    - quick-160 (carrier dispatches API routes)
    - quick-161 (carrier stops API routes)
    - quick-159 (carrier facilities API)
  provides:
    - /carrier/dispatches/[id] detail page (dispatcher control center)
  affects:
    - apps/web/src/app/(owner)/carrier/dispatches/
    - apps/web/src/components/carrier/dispatches/
tech_stack:
  added: []
  patterns:
    - Server page with full data assembly (facilities, doc counts, route template stops) before passing serialized data to client components
    - useTransition for async API calls with router.refresh() for revalidation
    - Custom popover dropdown without external dependency (no @radix-ui/react-dropdown-menu)
    - Decimal serialization pattern: Number() conversion + .toISOString() for all Date fields before passing to client
key_files:
  created:
    - apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
    - apps/web/src/components/carrier/dispatches/DispatchHeader.tsx
    - apps/web/src/components/carrier/dispatches/StopTimeline.tsx
    - apps/web/src/components/carrier/dispatches/StopTimelineCard.tsx
    - apps/web/src/components/carrier/dispatches/DispatchLoadsPanel.tsx
    - apps/web/src/components/carrier/dispatches/DispatchExpensesPanel.tsx
    - apps/web/src/components/carrier/dispatches/DispatchPayRecordsPanel.tsx
  modified: []
decisions:
  - Used custom popover dropdown in DispatchHeader instead of @radix-ui/react-dropdown-menu (not installed)
  - Serialized all Prisma Decimal and Date fields server-side before passing to client components to avoid "plain objects" error
  - completeStop API requires stop to be in 'arrived' status — Complete Stop button only shows when status is pending or arrived (API handles 'arrived' requirement)
metrics:
  duration: 35min
  completed: "2026-04-05"
  tasks: 2
  files_created: 7
  files_modified: 0
---

# Phase quick-170 Plan 01: Carrier Ops Dispatch Detail Page Summary

Dispatcher control center at `/carrier/dispatches/[id]` with stop timeline, doc compliance indicators, and action panels for loads, expenses, and pay records.

## What Was Built

### Task 1: Server Page + Core Components

**`/carrier/dispatches/[id]/page.tsx`** — Server component that:
- Fetches dispatch via `getDispatch()` (includes stops, carrierLoads, expenses, driverPayRecords)
- Queries facilities for all stop facilityIds and builds a `facilityMap`
- Fetches `routeTemplateStop` records for BOL/POD requirements mapped by sequenceOrder
- Uses Prisma `groupBy` to count BOL and POD documents per stop
- Serializes all Decimal and Date fields before passing to client components
- Conditionally renders DispatchPayRecordsPanel only when `status === 'completed'`

**`DispatchHeader.tsx`** — Client component with:
- Dispatch number extracted via regex from notes field
- Status badge using STATUS_BADGE/STATUS_LABEL color maps (copied from DispatchCard)
- Driver chip, co-driver chip (conditional), truck chip
- Odometer Start/End number inputs that PATCH `/api/v1/carrier/dispatches/${id}` on blur
- "Start Trip" button (blue, planned status only) → PATCH status to `in_progress`
- "Complete Dispatch" button (green, in_progress status) — disabled unless `allStopsDone`
- Cancel/TONU dropdown (custom popover, no external dep) — planned status only
- Edit link disabled when status is in_progress or terminal

**`StopTimeline.tsx`** — Thin wrapper rendering stops in received order (sequenceOrder ASC from server) with a left border timeline decoration.

**`StopTimelineCard.tsx`** — Per-stop card with:
- Colored sequence circle (green check=completed, blue=arrived, yellow=skipped, gray=pending)
- Stop type badge (pickup=indigo, delivery=teal, fuel=orange, rest=purple)
- Status badge
- Facility name and address from facilityMap
- Appointment window formatted as "Mon, Apr 5, 2:00 PM — 4:00 PM"
- Arrived/Departed timestamps (read-only with serialized ISO strings)
- Dwell time computed from arrivedAt/departedAt
- Skip reason display when status=skipped
- BOL/POD doc compliance section (pickup: BOL, delivery: POD) with icons + "Upload" stub
- "Complete Stop" button: shows when pending/arrived + dispatch in_progress, disabled when required docs missing
- "Skip Stop" button: owner role only, opens AlertDialog with required skip_reason textarea

### Task 2: Bottom Panels

**`DispatchLoadsPanel.tsx`** — Attached loads list with:
- Per-load card: reference #, client name, status badge, total revenue
- "Attach Load" button (planned/in_progress only) opens searchable dropdown
- Fetches `/api/v1/carrier/loads?status=pending&pageSize=50`, filters client-side by no dispatchId
- Attaches via PATCH `/api/v1/carrier/loads/${loadId}` with `{ dispatchId }`

**`DispatchExpensesPanel.tsx`** — Expense management with:
- Per-expense row: type (capitalize), paid-by, driver name lookup, approved/pending badge, amount
- Collapsible "Add Expense" form: type select, dollar-prefixed amount input, paid-by select, driver select (optional), notes
- POSTs to `/api/v1/carrier/expenses` with dispatchId, resets form on success

**`DispatchPayRecordsPanel.tsx`** — Driver pay records (completed dispatches only):
- Per-record card: driver name, pay model badge, 2-row breakdown (basePay/bonuses/reimbursements/deductions), net pay
- Per-record "Approve" button for pending records → PATCH `/api/v1/carrier/pay-records/${id}/approve`
- "Approve All" button (shown when 2+ pending records) iterates sequentially

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] No `@radix-ui/react-dropdown-menu` installed**
- **Found during:** Task 1 (DispatchHeader.tsx)
- **Issue:** Plan called for shadcn DropdownMenu but the package is not installed and the ui component doesn't exist
- **Fix:** Built custom popover dropdown (`StatusActionsMenu`) using `useState` + `useRef` + click-outside handler
- **Files modified:** `DispatchHeader.tsx`
- **Commit:** a87e8a8

**2. [Rule 1 - Bug] Prisma Date fields not serialized in expenses spread**
- **Found during:** Task 1 TypeScript check
- **Issue:** `...e` spread in expenses map preserved `approvedAt: Date | null` instead of `string | null` causing TS2322
- **Fix:** Explicitly serialized `approvedAt` and `submittedAt` for each expense
- **Files modified:** `page.tsx`
- **Commit:** a87e8a8

## Self-Check: PASSED

All 7 files exist and TypeScript compilation passes with zero errors.

## Commits

| Hash | Message |
|------|---------|
| a87e8a8 | feat(quick-170): add dispatch detail page, header, stop timeline, and stop timeline card |
| 9fcbc41 | feat(quick-170): add DispatchLoadsPanel, DispatchExpensesPanel, and DispatchPayRecordsPanel |
