---
phase: quick-280
plan: "01"
subsystem: carrier/loads
tags: [dispatch, loads, create-form, one-step-workflow]
dependency_graph:
  requires: [carrier/dispatches API, carrier/route-templates API, carrier/loads PATCH API]
  provides: [dispatch-toggle in load create form, dual-path submit logic]
  affects: [LoadForm.tsx, NewLoadPage]
tech_stack:
  added: []
  patterns: [dual-path form submit, toggle-gated section, template auto-populate]
key_files:
  created: []
  modified:
    - apps/web/src/app/(owner)/carrier/loads/new/page.tsx
    - apps/web/src/components/carrier/loads/LoadForm.tsx
decisions:
  - Used optional props (drivers?, trucks?) on LoadFormProps so edit mode is fully unaffected
  - Cached template fetch (templatesFetched flag) to avoid re-fetch on toggle off/on
  - Kept dispatchPlannedMiles as string state separate from existing plannedMiles (load rate calculation field)
  - Named dispatch truck state dispatchTruckId to avoid collision with any future load-level truckId field
metrics:
  duration: "~4 minutes"
  completed: "2026-04-22"
  tasks_completed: 2
  files_modified: 2
---

# Quick-280: Add Dispatch Option to Load Create Form Summary

**One-liner:** Added "Dispatch immediately" toggle to load create form that creates a load + dispatch in one step, redirecting to the dispatch detail page with a DC-XXXX success toast.

## What Was Built

The load create form (`/carrier/loads/new`) now has a collapsible "Dispatch" section with a toggle switch. When toggled OFF (default), the existing create flow is completely unchanged. When toggled ON, six dispatch fields appear and the submit button changes to "Create & Dispatch".

### New Dispatch Section Fields
1. Route Template (optional) — fetches from `/api/v1/carrier/route-templates/active`, auto-populates driver/truck/miles from template defaults
2. Primary Driver (required) — select from active drivers passed from server
3. Truck (required) — select from active trucks passed from server
4. Scheduled Departure (required) — datetime-local, defaults to tomorrow at 08:00
5. Co-Driver (optional) — filtered to exclude selected primary driver; co-driver = primary driver validation
6. Planned Miles (optional) — dispatch-level miles, separate from the load's per-mile rate field

### Submit Flow (toggle ON)
1. Create load via `POST /api/v1/carrier/loads`
2. Upload rate confirmation if present
3. Create dispatch via `POST /api/v1/carrier/dispatches`
4. Attach load to dispatch via `PATCH /api/v1/carrier/loads/{id}` with `{ dispatchId }`
5. Extract DC-XXXX number from dispatch notes tag
6. Toast: "Load created and dispatched as DC-XXXX"
7. Redirect to `/carrier/dispatches/{newDispatchId}`

### Submit Flow (toggle OFF)
Unchanged: create load → optional file upload → "Load created" toast → redirect to `/carrier/loads`.

## Key Implementation Details

- `NewLoadPage` now runs three parallel Prisma queries (clients, drivers, trucks) and passes them to `LoadForm`
- `LoadForm` accepts optional `drivers?` and `trucks?` props — when absent (edit mode), the dispatch section never renders
- Route templates are fetched lazily on first toggle-on and cached via `templatesFetched` flag
- All dispatch state variables are independent of existing load state to prevent cross-contamination

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- `apps/web/src/app/(owner)/carrier/loads/new/page.tsx` — exists, modified
- `apps/web/src/components/carrier/loads/LoadForm.tsx` — exists, modified
- Commit d392656 — Task 1 (NewLoadPage)
- Commit 0e33b09 — Task 2 (LoadForm dispatch toggle)
- `npx tsc --noEmit` — exit code 0, no TypeScript errors

## Self-Check: PASSED
