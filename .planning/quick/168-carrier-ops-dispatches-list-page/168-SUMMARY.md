---
phase: quick-168
plan: "01"
subsystem: carrier-ops
tags: [carrier, dispatches, list-page, filters, sheet-form]
dependency_graph:
  requires:
    - apps/web/src/app/api/v1/carrier/dispatches/route.ts
    - apps/web/src/lib/carrier/dispatches.ts
    - apps/web/src/app/api/v1/carrier/loads/route.ts
    - apps/web/src/components/ui/sheet.tsx
    - apps/web/src/components/ui/switch.tsx
  provides:
    - Carrier dispatches list page at /carrier/dispatches
    - DispatchCard component for dispatch display
    - DispatchList client component with full filter set
    - NewDispatchForm sheet for dispatch creation
  affects: []
tech_stack:
  added: []
  patterns:
    - Server page with Prisma lookup maps passed as props to client list
    - Client-side status filtering (fetch all, filter in JS to avoid N status params)
    - Parallel fetch pattern: dispatches + loads in one round trip, build clientNames map
key_files:
  created:
    - apps/web/src/app/(owner)/carrier/dispatches/page.tsx
    - apps/web/src/components/carrier/dispatches/DispatchCard.tsx
    - apps/web/src/components/carrier/dispatches/DispatchList.tsx
    - apps/web/src/components/carrier/dispatches/NewDispatchForm.tsx
  modified: []
decisions:
  - Client-side status filtering rather than multiple API requests per status value
  - Loads fetched in parallel with dispatches to build clientNames map without N+1
  - Dispatch number extracted from notes field via regex [DISPATCH_NUMBER=...] pattern
metrics:
  duration_minutes: 15
  completed_date: "2026-04-05"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 0
---

# Quick Task 168: Carrier Ops Dispatches List Page Summary

**One-liner:** Dispatcher daily view with date/status/assignment filters, DispatchCard with progress bars and needs-assignment alerts, and NewDispatchForm side sheet creating dispatches via POST.

## What Was Built

### Task 1: Server Page + DispatchCard (commit 454f9cc)

**`apps/web/src/app/(owner)/carrier/dispatches/page.tsx`** — Server component that fetches active driver and truck lookup maps from Prisma (parallel queries), builds `Record<string, string>` maps, and passes them as props to `<DispatchList>`. Auth redirect guard via `getSession()`.

**`apps/web/src/components/carrier/dispatches/DispatchCard.tsx`** — Client component rendering a single dispatch as a clickable `<Link>` card:
- Extracts dispatch_number from notes via `/\[DISPATCH_NUMBER=([^\]]+)\]/` regex
- Status badges with color mapping: planned=slate, in_progress=blue, completed=green, cancelled=red, tonu=amber
- Orange "Needs Assignment" badge with Bell icon when notes contain `needs_assignment=true`
- Driver chip (User icon) and truck chip (Truck icon) in muted pill style
- Progress bar: `completedStopsCount / _count.stops * 100%` width
- Bottom row: formatted departure time + client names (truncated)

### Task 2: DispatchList + NewDispatchForm (commit 65b7fe1)

**`apps/web/src/components/carrier/dispatches/DispatchList.tsx`** — Client component with full filter set:
- Default date range: today ISO + tomorrow ISO (applied as query params)
- Status multi-select: 5 toggle buttons (planned/in_progress/completed/cancelled/tonu) with color-coded active state; client-side filtering after fetch to avoid multiple API calls
- Needs Assignment switch via shadcn Switch
- Refresh button with RefreshCw icon + last-updated timestamp
- Parallel fetch: dispatches API + loads API in one `Promise.all`, builds `Record<dispatchId, clientNames>` map without N+1
- 4-card skeleton loading state, empty state with ClipboardList icon
- New Dispatch button opens Sheet containing NewDispatchForm
- On form success: close sheet + `router.push('/carrier/dispatches/${newId}')`

**`apps/web/src/components/carrier/dispatches/NewDispatchForm.tsx`** — Side sheet form:
- Required: Primary Driver select, Truck select, Scheduled Departure (datetime-local)
- Optional: Co-Driver select, Planned Miles number input, Notes textarea
- Info box with Info icon: "Add loads to this dispatch from the dispatch detail page"
- No client_id field
- POST to `/api/v1/carrier/dispatches` with ISO departure string, calls `onSuccess(id)` on 201
- Error handling via sonner toast + inline error message

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files Exist
- [x] `apps/web/src/app/(owner)/carrier/dispatches/page.tsx`
- [x] `apps/web/src/components/carrier/dispatches/DispatchCard.tsx`
- [x] `apps/web/src/components/carrier/dispatches/DispatchList.tsx`
- [x] `apps/web/src/components/carrier/dispatches/NewDispatchForm.tsx`

### TypeScript
- [x] `npx tsc --noEmit --project apps/web/tsconfig.json` — passes with 0 errors

### Commits
- [x] 454f9cc: feat(quick-168): create dispatches server page and DispatchCard component
- [x] 65b7fe1: feat(quick-168): create DispatchList with filters and NewDispatchForm sheet

## Self-Check: PASSED
