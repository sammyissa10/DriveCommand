---
phase: quick-76
plan: 01
subsystem: ui/tables
tags: [mobile, ux, overflow, tables, responsive]
dependency_graph:
  requires: []
  provides: [mobile-horizontal-scroll-for-all-table-pages]
  affects: [trucks-page, drivers-page, routes-page, maintenance-page, subscription-page]
tech_stack:
  added: []
  patterns: [overflow-x-auto inner wrapper pattern, min-w table sizing]
key_files:
  created: []
  modified:
    - src/components/trucks/truck-list.tsx
    - src/components/drivers/driver-list.tsx
    - src/components/maintenance/maintenance-event-list.tsx
    - src/components/maintenance/scheduled-service-list.tsx
    - src/app/(owner)/subscription/page.tsx
    - src/components/routes/route-list.tsx
decisions:
  - "Keep outer overflow-hidden for border-radius clipping; add inner overflow-x-auto div for independent table scroll"
  - "Remove table-fixed from route-list — table-fixed forces columns into container width defeating horizontal scroll"
  - "min-w values sized to column count: 900px for 8-col tables, 700px for 6-col drivers, 600px for 6-col maintenance/subscription"
metrics:
  duration: ~4 minutes
  completed: "2026-03-15T23:36:08Z"
  tasks_completed: 2
  files_modified: 6
---

# Quick 76: TKT-0028 Fix Mobile UX — Tables and Pages Summary

**One-liner:** Added overflow-x-auto inner wrappers and min-width constraints to all 6 owner-portal table components that were clipping or crushing columns on 375px mobile viewports.

## What Was Done

Six table components in the owner portal had broken mobile horizontal scrolling. Users on phones could not see all columns — content was either clipped or the entire page body scrolled horizontally.

### Root Causes Found

**5 components missing overflow-x-auto entirely:**
- `truck-list.tsx` — outer div had `overflow-hidden` but no inner scroll wrapper
- `driver-list.tsx` — same pattern
- `maintenance-event-list.tsx` — same pattern
- `scheduled-service-list.tsx` — same pattern
- `subscription/page.tsx` — table in CardContent with no overflow wrapper at all

**1 component with overflow-x-auto defeated by table-fixed:**
- `route-list.tsx` — had `overflow-x-auto` but `table-fixed` forced all columns to fit in container width, defeating scroll entirely. Also had inline `style={{ width: header.column.getSize() }}` on `<th>` and `overflow-hidden` on both `<th>` and `<td>` that were only relevant for fixed-layout tables.

### Fix Applied

**Pattern (from existing working tables like load-list.tsx):**
```
<div className="... overflow-hidden">    ← clips border-radius
  <div className="overflow-x-auto">      ← allows table to scroll independently
    <table className="w-full min-w-[Npx]">  ← ensures columns don't crush
```

**Per file:**
| File | Change | min-w | Columns |
|------|--------|-------|---------|
| truck-list.tsx | Added overflow-x-auto wrapper | 900px | 8 |
| driver-list.tsx | Added overflow-x-auto wrapper | 700px | 6 |
| maintenance-event-list.tsx | Added overflow-x-auto wrapper | 600px | 6 |
| scheduled-service-list.tsx | Added overflow-x-auto wrapper | 900px | 8 |
| subscription/page.tsx | Added overflow-x-auto wrapper | 600px | 6 |
| route-list.tsx | Removed table-fixed, removed inline width style, removed overflow-hidden from th/td | 900px | 8 |

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 57eddf9 | fix(quick-76): add overflow-x-auto wrappers to 5 table components missing horizontal scroll |
| Task 2 | d84eab2 | fix(quick-76): fix route-list horizontal scroll — remove table-fixed, add min-w-[900px] |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files verified present:
- src/components/trucks/truck-list.tsx — FOUND, contains overflow-x-auto
- src/components/drivers/driver-list.tsx — FOUND, contains overflow-x-auto
- src/components/maintenance/maintenance-event-list.tsx — FOUND, contains overflow-x-auto
- src/components/maintenance/scheduled-service-list.tsx — FOUND, contains overflow-x-auto
- src/app/(owner)/subscription/page.tsx — FOUND, contains overflow-x-auto
- src/components/routes/route-list.tsx — FOUND, contains overflow-x-auto, no table-fixed

Commits verified:
- 57eddf9 — FOUND
- d84eab2 — FOUND

TypeScript: Clean (0 errors)
