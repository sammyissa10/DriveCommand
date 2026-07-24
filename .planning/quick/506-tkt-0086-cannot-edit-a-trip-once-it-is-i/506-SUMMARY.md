---
phase: quick-506
plan: 506
subsystem: dispatch
tags: [nextjs, react, prisma, vitest, trips, dispatch]

# Dependency graph
requires:
  - phase: quick-503
    provides: "Pattern for pure src/lib/** helper + colocated Vitest (driver-readiness-label.ts)"
provides:
  - "dispatchFieldEditability(status) — single source of truth for status -> per-field edit permissions, used by server + both clients"
  - "Server-side 409 enforcement for completed/cancelled/tonu trip edits (previously completed-only)"
  - "Mid-trip (in_progress) editing of primary driver, co-driver, truck, schedule, odometer and notes on both desktop and mobile"
affects: [dispatch, trips, mobile-web-ds]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Status -> field editability expressed as one pure helper (no imports, no I/O) consumed identically by server mutation code and both UI clients, eliminating drift between client/client/server gates"

key-files:
  created:
    - apps/web/src/lib/dispatch/dispatch-field-editability.ts
    - apps/web/src/lib/dispatch/dispatch-field-editability.test.ts
  modified:
    - apps/web/src/lib/carrier/trips.ts
    - apps/web/src/components/carrier/dispatches/DispatchHeader.tsx
    - "apps/web/src/app/(owner)/carrier/trips/[id]/TripDetailMobile.tsx"

key-decisions:
  - "Unknown/unexpected status values are treated as fully editable (same as planned), matching today's pre-existing behavior, so a bad/future status value can never accidentally brick editing"
  - "routeTemplateId stays visible but disabled with a lockReason on in_progress trips (not hidden), on both desktop (title attr + helper text) and mobile (FieldGroup's existing editable/lockReason support)"
  - "Server now rejects cancelled and tonu edits with 409, not just completed — this tightens the API to match what the UI has always enforced"

patterns-established:
  - "dispatchFieldEditability(status): pure function, zero imports, returns per-field {editable, reason} + record-level canEdit/lockReason — reused unmodified by trips.ts (server), DispatchHeader.tsx (desktop) and TripDetailMobile.tsx (mobile)"

# Metrics
duration: 35min
completed: 2026-07-23
---

# Quick Task 506: TKT-0086 — Cannot edit a trip once it is in progress Summary

**Owners can now edit primary driver, co-driver, truck, schedule and odometer on an `in_progress` trip on both desktop and mobile — closed via one pure `dispatchFieldEditability(status)` helper shared by the server and both clients, which also fixed a silent-drop bug where the API accepted and discarded driver/truck changes mid-trip and fired a false "you've been assigned" notification.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-23T21:40:00Z
- **Completed:** 2026-07-23T21:52:00Z (automated portion)
- **Tasks:** 3/3
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- Single pure helper (`dispatchFieldEditability`) is now the one source of truth for the status -> per-field edit rule, unit-tested with 7 Vitest cases (planned / in_progress / completed / cancelled / tonu / unknown)
- Server (`updateTrip`) no longer silently strips `primaryDriverId`/`truckId` for `in_progress` trips — those changes now persist. `routeTemplateId` remains the one field stripped mid-trip (destructive: replaces all stops)
- Server now returns 409 for `cancelled` and `tonu` edits too, not just `completed` — closing a gap where the API was more permissive than either UI
- The driver-reassignment notification now compares the persisted `updateData`, not the raw request body, so it can never fire for a field that was silently dropped
- Desktop `DispatchHeader.tsx`: Edit is a real, clickable `Button` for `in_progress` trips; Route Template select is always rendered but disabled with a visible reason; assignment payload built per-field off the shared helper
- Mobile `TripDetailMobile.tsx`: the blanket "Driver, truck and route template are locked once a trip is running" card is gone; the Assignment `FieldGroup` always renders, with `routeTemplateId` expressed as a locked field (via `FieldGroup`'s existing `editable`/`lockReason` support) rather than the whole group being swapped out

## Task Commits

Each task was committed atomically:

1. **Task 1: Add pure dispatchFieldEditability helper + Vitest** - `d5f45b95` (feat)
2. **Task 2: Stop the server silently dropping mid-trip driver/truck edits** - `0dd070df` (fix)
3. **Task 3: Unlock and field-gate the Edit UI on desktop and mobile** - `45709338` (fix)

_No plan-metadata commit yet — will be added after this SUMMARY is committed._

## Files Created/Modified
- `apps/web/src/lib/dispatch/dispatch-field-editability.ts` - Pure `dispatchFieldEditability(status)` + `lockedDispatchUpdateFields(status)`, zero imports
- `apps/web/src/lib/dispatch/dispatch-field-editability.test.ts` - 7 Vitest cases covering all 6 status branches
- `apps/web/src/lib/carrier/trips.ts` - `updateTrip()` gating now driven by the helper: 409 for completed/cancelled/tonu, only `routeTemplateId` stripped for in_progress, notification reads `updateData` not raw `data`
- `apps/web/src/components/carrier/dispatches/DispatchHeader.tsx` - Edit button/dialog gated by `editability.canEdit`/`editability.fields.*` instead of hardcoded `dispatch.status === 'planned'` checks
- `apps/web/src/app/(owner)/carrier/trips/[id]/TripDetailMobile.tsx` - Same parity fix via the shared helper; Assignment `FieldGroup` always renders with `routeTemplateId` locked via its existing `editable`/`lockReason` field props

## Decisions Made
- Kept `isLocked`/`isPlanned`/`isInProgress` local booleans where they still drive non-edit UI (odometer `disabled`, status-transition buttons, `canAddStop`) — only the edit-gating logic was migrated to the shared helper, per the plan's explicit scope.
- Removed the now-unused `isInProgress` local in `DispatchHeader.tsx` (it existed solely to drive the old dead-`<span>` Edit gate, which is now `!editability.canEdit`).
- Wrapped the desktop assignment block in `{editability.canEdit && (...)}` per the plan, even though the Edit dialog can currently only be opened via a button that's itself gated on `editability.canEdit` — kept for defense-in-depth / single-source-of-truth consistency rather than relying on the button gate alone.

## Deviations from Plan

None — plan executed exactly as written. The only adjustment was mechanical: the plan's literal text-replacement instructions for `DispatchHeader.tsx`'s Route Template block left dangling/mismatched JSX closing tags when applied verbatim (the original code had the Route Template `<div>` and the Primary Driver/Co-Driver/Truck `<div>`s all inside one `{dispatch.status === 'planned' && (<>...</>)}` fragment); the block was rewritten in full to restore correct JSX nesting while preserving the exact same conditional structure and DOM output the plan specified (route template always rendered but `disabled`, driver/co-driver/truck reachable whenever `editability.canEdit`). `tsc --noEmit` (0 errors) confirms the JSX is well-formed.

## Side Effects of Mid-Trip Reassignment (investigated, no code required — TKT-0086 scope)

- **Driver notification.** `updateTrip` already calls `sendDispatchAssignedNotification` when `primaryDriverId` actually changes (now correctly gated on the persisted value). The **previous** driver is NOT notified that the trip was taken from them — this is a pre-existing gap, out of scope for this task.
- **Driver / truck status.** Both are derived live from the `Trip` row (`ACTIVE_DISPATCH_STATUSES = ['in_progress']` in `truck-status.ts`/`driver-status.ts`) — no denormalized column, so both boards self-correct automatically on reassignment. No action needed.
- **Driver pay.** `generateDriverPayRecords(orgId, dispatchId)` reads the trip's driver at completion time, so a mid-trip swap means the **final** driver is paid for the whole trip. This is accepted behavior for a correction, not a bug — flagged here for visibility.
- **Workflow engine.** `PlaybookInstance` for a dispatch is keyed by `entityType='DISPATCH' + entityId=<dispatch id>`, not by driver. A reassignment leaves any pre-trip checklist attached to the dispatch, partially completed by the old driver. This task intentionally does not touch `work_state`/`checklist_status`/any Playbook row — pure gating change only.
- No stored enum/status values were changed, so no `pg_constraint` audit was needed.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Verification Performed

**Automated (this session):**
- `npx vitest run src/lib/dispatch/dispatch-field-editability.test.ts` → **7/7 passed**
- `npx tsc --noEmit` (apps/web) → **0 errors** after every task (Task 1, 2, and 3), including in all 5 touched files
- `grep -n "delete updateData.primaryDriverId\|Cannot update completed dispatch" src/lib/carrier/trips.ts` → no matches (hardcoded gate fully removed)
- `grep -n "status === 'planned'"` on `DispatchHeader.tsx` and `TripDetailMobile.tsx` → only non-edit-gate matches remain (the "Start Trip" status-transition button and the `isPlanned` variable used by `canAddStop`/primary-action-button, both correctly out of scope)

**NOT performed in this session (no running dev server / authenticated session available in this environment) — recommended before considering TKT-0086 fully closed in production:**
1. On `/carrier/trips/8920928d-2e47-47cd-8d88-575b39ed30be` (or any `In Progress` trip), confirm Edit is a live button and opens the dialog.
2. Change Primary Driver AND Truck, Save → toast "Dispatch updated"; after refresh, header shows the NEW driver and NEW truck (previously this 200'd and silently discarded the change).
3. Confirm the Route Template select is visible but disabled, with the explanatory reason shown.
4. At mobile width, confirm the Assignment group shows driver/truck/co-driver editable with the template row locked and its `lockReason` visible.
5. On a completed or cancelled trip, confirm Edit is greyed with the status-specific title, and `curl -X PATCH .../dispatches/{id} -d '{"plannedMiles":5}'` returns 409.

## Next Phase Readiness
- No blockers. This is a self-contained bug fix; no other quick task depends on it.
- The shared `dispatchFieldEditability` helper is a reusable pattern for any future per-field edit-gating need on trips/dispatches.

---
*Phase: quick-506*
*Completed: 2026-07-23*

## Self-Check: PASSED

All 5 files-modified paths exist on disk (2 created, 3 modified) and all 3 task commit hashes (`d5f45b95`, `0dd070df`, `45709338`) resolve in `git log --oneline --all`.
