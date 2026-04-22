---
phase: quick-279
plan: "01"
subsystem: carrier-loads
tags: [dispatch, loads, modal, owner-portal]
dependency_graph:
  requires: [/api/v1/carrier/dispatches, /api/v1/carrier/loads/[id]]
  provides: [DispatchLoadModal, LoadDetailActions]
  affects: [apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx]
tech_stack:
  added: []
  patterns: [server-component-with-client-island, dialog-modal, router.refresh]
key_files:
  created:
    - apps/web/src/components/carrier/loads/DispatchLoadModal.tsx
    - apps/web/src/components/carrier/loads/LoadDetailActions.tsx
  modified:
    - apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
decisions:
  - Dispatch number extracted from DISPATCH_NUMBER tag in POST response notes field — avoids extra GET request
  - LoadDetailActions as separate client island keeps server page async without converting whole page to client
  - router.refresh() used instead of optimistic update to ensure server-side badge shows fresh dispatch data
metrics:
  duration: ~15 minutes
  completed: 2026-04-22
  tasks_completed: 2
  files_changed: 3
---

# Quick-279: Add Dispatch This Load Button to Load Detail Page Summary

One-liner: Dispatch button on pending load detail opens modal to create dispatch + attach load, then shows dispatch badge with link.

## What Was Built

### DispatchLoadModal (`apps/web/src/components/carrier/loads/DispatchLoadModal.tsx`)

Client component modal with 7 fields: route template (optional, auto-fills miles/driver/truck from template), primary driver (required), truck (required), scheduled departure (required, defaults to tomorrow 08:00), co-driver (optional, filtered to exclude primary), planned miles (optional), and notes (optional).

On submit:
1. POST `/api/v1/carrier/dispatches` to create the dispatch
2. Parses dispatch number from `[DISPATCH_NUMBER=DC-YYYY-NNNNN]` tag in the response `notes` field
3. PATCH `/api/v1/carrier/loads/{loadId}` with `{ dispatchId }` to attach the load (triggers existing pendingStopsJson migration in `updateLoad`)
4. Calls `onSuccess(dispatchId, dispatchNumber)` and shows success toast

### LoadDetailActions (`apps/web/src/components/carrier/loads/LoadDetailActions.tsx`)

Client island component that receives `loadStatus`, `dispatchId`, `dispatchNumber`, `drivers`, `trucks` as props:
- `status === 'pending' && !dispatchId` → shows "Dispatch This Load" primary button with Truck icon, opens DispatchLoadModal
- `dispatchId` present → shows blue badge/pill linking to `/carrier/dispatches/{dispatchId}` with dispatch number or fallback "View Dispatch"
- All other cases → renders null

After successful dispatch, calls `router.refresh()` to reload server data and swap button for badge.

### Load Detail Page (`apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx`)

Extended `Promise.all` to also fetch active drivers (`carrierDriver`) and active trucks (`carrierTruck`) for the modal. Parses dispatch number from `load.dispatch.notes` regex. Header section restructured to flex row with title+description on left and `LoadDetailActions` on right, collapsing to column on mobile.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files created/modified:
- `apps/web/src/components/carrier/loads/DispatchLoadModal.tsx` — FOUND
- `apps/web/src/components/carrier/loads/LoadDetailActions.tsx` — FOUND
- `apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx` — FOUND (modified)

### Commits:
- `eaa2f66` — feat(quick-279): create DispatchLoadModal component
- `c54223c` — feat(quick-279): add dispatch button and badge to load detail page

### TypeScript: PASSED (0 errors)

## Self-Check: PASSED
