---
phase: quick-70
plan: "01"
subsystem: trucks
tags: [bug-fix, status-logic, scheduled-services, ui]
dependency_graph:
  requires: []
  provides: [correct-truck-status-computation]
  affects: [trucks-list, truck-detail, scheduled-services]
tech_stack:
  added: []
  patterns: [overdue-threshold-check, status-legend]
key_files:
  created: []
  modified:
    - src/lib/trucks/compute-truck-status.ts
    - src/app/(owner)/actions/trucks.ts
    - src/components/trucks/truck-list.tsx
    - src/app/(owner)/trucks/[id]/page.tsx
decisions:
  - "Overdue is defined as: intervalDays set AND baselineDate+intervalDays <= now, OR intervalMiles set AND baselineOdometer+intervalMiles <= truck.odometer"
  - "Future scheduled services (neither date nor mileage threshold met) leave truck status as Ready to Use"
metrics:
  duration: 169s
  completed: 2026-03-15
  tasks: 2
  files: 4
---

# Phase quick-70 Plan 01: TKT-0023 Truck Status Logic Fix Summary

Fixed overdue-only In Maintenance logic in compute-truck-status.ts and added a status legend to the trucks list page.

## What Was Built

**Task 1 — Fix compute-truck-status logic and query includes**

The root bug: `isInMaintenance` was `scheduledServices.length > 0` — any incomplete service (including future ones) triggered "In Maintenance". The fix adds an `isServiceOverdue()` helper that checks both time-based and mileage-based thresholds. A truck now only enters "In Maintenance" when at least one incomplete service is actually past its due date or mileage threshold.

Both Prisma queries (`listTrucks` and `getTruck`) were updated to select `baselineDate`, `intervalDays`, `intervalMiles`, and `baselineOdometer` — the fields required by the new overdue check. The `TruckWithRelations` interface was updated to match.

**Task 2 — Status legend and tooltip**

Added a compact horizontal status legend row between the search input and table on the trucks list page. Shows all four statuses (In Use, In Maintenance, Expired Docs, Ready to Use) with brief descriptions using the existing `variantClasses` map for consistent badge styling.

Added a `statusDescriptions` record on the truck detail page and a `title` attribute on the status badge span so hovering shows the plain-English meaning of the current status.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx tsc --noEmit`: passed, no errors
- `npm run build`: succeeded, all truck routes compiled
- Logic review: future service (due in 30 days) → Ready to Use; overdue service (due date in past) → In Maintenance
- Status legend visible on trucks list page between search and table
- Status badge tooltip on truck detail page via `title` attribute

## Commits

| Hash | Message |
|------|---------|
| 19de53b | fix(quick-70): fix truck status — only overdue services trigger In Maintenance |
| 65809c0 | feat(quick-70): add status legend to trucks list and tooltip to detail page |
