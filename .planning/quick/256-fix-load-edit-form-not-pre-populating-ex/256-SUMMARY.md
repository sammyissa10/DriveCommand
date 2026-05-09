---
phase: quick-256
plan: "01"
subsystem: carrier/loads
tags: [bug-fix, data-safety, stops, dispatch, load-edit]
dependency_graph:
  requires: []
  provides: [safe-stop-persistence, stop-pre-population-in-edit]
  affects: [carrier-load-edit, dispatch-stop-management]
tech_stack:
  added: []
  patterns: [safety-guard-empty-array, prisma-fallback-query]
key_files:
  created: []
  modified:
    - apps/web/src/lib/carrier/loads.ts
    - apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
decisions:
  - "Safety guard lives inside persistStops (not at call site) so it's the single source of truth for empty-array handling"
  - "Fallback dispatch query uses OR [loadId=load.id, loadId=null] to pick up both linked and unlinked dispatch stops"
metrics:
  duration: "10m"
  completed: "2026-04-19"
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 256: Fix load edit form not pre-populating existing stops

**One-liner:** Fixed two-part data loss bug — stops from dispatch templates now pre-populate in the load edit form, and a safety guard prevents empty form submissions from wiping existing stop data.

## What Was Built

### Problem
Carrier load edit form showed "No stops added yet" even when the load had stops, because:
1. Stops created via dispatch templates had `loadId = null` — the `getLoad()` query only joins on `loadId`, so they were invisible to the edit page
2. If the form was saved without explicitly touching the stops section, the empty stops array could (in theory) trigger deletion of all existing stops via `persistStops`

### Fix 1 — persistStops safety guard (loads.ts)
Added an early return at the top of `persistStops` that checks: if the submitted stops array is empty AND the load already has stops in the DB, skip the entire function. An empty submission means "no changes to stops", not "delete all stops."

Also changed `updateLoad` call site from `data.stops.length > 0` guard to `data.stops !== undefined` — so the safety guard inside `persistStops` is the single source of truth rather than duplicating the logic at the call site.

### Fix 2 — Dispatch stop fallback query (page.tsx)
In the load edit page, after the `getLoad()` call, if `load.stops` is empty but the load has a `dispatchId`, a fallback query fetches `CarrierStop` records for the dispatch where `loadId` is either the current load ID or `null`. This surfaces stops that were created from dispatch templates without a `loadId` assignment.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passes (pre-existing Playwright test type errors unrelated to these changes)
- Safety guard `stops.length === 0 && existingStopCount > 0` confirmed in loads.ts
- `updateLoad` condition updated to `data.stops !== undefined`
- Fallback dispatch query added to load edit page with proper `OR [loadId=load.id, loadId=null]` filter

## Self-Check: PASSED

Files confirmed present:
- apps/web/src/lib/carrier/loads.ts — modified (safety guard + condition update)
- apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx — modified (fallback dispatch query)

Commits confirmed:
- c652530: fix(quick-256): add persistStops safety guard against empty-array deletion
- c6f77f8: fix(quick-256): pre-populate stops in load edit form via dispatch fallback
