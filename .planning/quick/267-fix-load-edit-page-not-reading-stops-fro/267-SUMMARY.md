---
phase: quick-267
plan: "01"
subsystem: web/carrier/loads
tags: [bug-fix, loads, stops, pendingStopsJson]
dependency_graph:
  requires: []
  provides: [pendingStopsJson fallback in load edit page]
  affects: [apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx]
tech_stack:
  added: []
  patterns: [branch-on-nullable, tenant-isolated-lookup]
key_files:
  modified:
    - apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
decisions:
  - Restructured stop-mapping into if/else branches (A/B vs C) instead of mutating a shared variable, for clarity
metrics:
  duration: "5 minutes"
  completed: "2026-04-21"
  tasks_completed: 1
  files_modified: 1
---

# Quick-267: Fix Load Edit Page Not Reading Stops from pendingStopsJson

Added pendingStopsJson fallback to the load edit page so dispatch-less loads pre-populate the StopBuilder correctly.

## What Was Built

Loads created without a dispatch store their stops in `pendingStopsJson` (a JSON string on `CarrierLoad`). The edit page previously only read from `CarrierStop` records, which require a dispatch to exist. As a result, editing a dispatch-less load showed zero stops even though stops had been saved at creation.

The fix adds a third branch (Branch C) in `page.tsx`:

- **Branch A/B (existing):** Load has `CarrierStop` records via `loadId` or `dispatchId` → map as before.
- **Branch C (new):** No `CarrierStop` records + no `dispatchId` + `pendingStopsJson` is present → parse JSON, batch-fetch facility details with `orgId` tenant isolation, map to `StopBuilderStop[]`.
- **Branch D (implicit):** None of the above → `mappedStops = []`.

## Tasks

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Add pendingStopsJson fallback in load detail page | e17b282 |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passed with zero errors
- Branch A/B (dispatch-based stop loading) unchanged
- Branch C handles dispatch-less loads with stops in pendingStopsJson
- Facility lookup uses `orgId` for tenant isolation

## Self-Check: PASSED

- `apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx` — modified, commit e17b282 exists
