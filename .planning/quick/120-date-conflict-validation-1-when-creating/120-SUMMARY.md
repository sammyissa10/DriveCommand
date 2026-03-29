---
phase: quick-120
plan: "01"
subsystem: routes, loads, load-form
tags: [validation, date-conflict, driver-scheduling, ux-warning]
dependency_graph:
  requires: []
  provides:
    - driver-date-conflict-validation-routes
    - route-load-date-mismatch-warning
  affects:
    - apps/web/src/app/(owner)/actions/routes.ts
    - apps/web/src/components/loads/load-form.tsx
    - apps/web/src/app/(owner)/loads/new/page.tsx
    - apps/web/src/app/(owner)/loads/[id]/edit/page.tsx
tech_stack:
  added: []
  patterns:
    - Server-side conflict check via prisma.route.findFirst with date range query
    - Controlled inputs with useState for reactive client-side warning
key_files:
  created: []
  modified:
    - apps/web/src/app/(owner)/actions/routes.ts
    - apps/web/src/components/loads/load-form.tsx
    - apps/web/src/app/(owner)/loads/new/page.tsx
    - apps/web/src/app/(owner)/loads/[id]/edit/page.tsx
decisions:
  - Use UTC midnight window (gte scheduledDay, lt nextDay) for date comparison to handle timezone-safe same-day detection
  - Return field error on driverId (not a generic error) so the form highlights the right field
  - Warning-only (not blocking) for load-route date mismatch per plan spec
  - Controlled inputs for routeId/pickupDate/deliveryDate in LoadForm to enable reactive warning without useEffect
metrics:
  duration: "2 minutes"
  completed: "2026-03-29"
  tasks_completed: 2
  files_modified: 4
---

# Quick-120: Date Conflict Validation — When Creating Summary

**One-liner:** Driver double-booking on routes blocked server-side with field error; load-route date mismatch surfaced as non-blocking amber warning in load form.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Driver date conflict validation in createRoute/updateRoute | e79446a | routes.ts |
| 2 | Route-load date mismatch warning (client + server pages) | 3249478 | load-form.tsx, new/page.tsx, edit/page.tsx |

## What Was Built

### Task 1: Route conflict validation (routes.ts)

In `createRoute`: After driver role check, queries for an existing non-COMPLETED, non-archived route for the same driver on the same calendar day (UTC midnight window). Returns a `driverId` field error with the conflicting route's name or "origin -> destination" label.

In `updateRoute`: Fetches `existingRoute` at start of try block to resolve effective driverId and scheduledDate. Runs conflict check only when `driverId` or `scheduledDate` is being changed, and excludes the current route via `id: { not: id }` to prevent false self-conflict errors.

### Task 2: Load form warning (load-form.tsx + pages)

`LoadForm` now tracks `selectedRouteId`, `pickupDateVal`, and `deliveryDateVal` in React state with controlled `<select>` and `<input type="date">` elements. On every render, it computes `dateWarning` by comparing the selected route's `scheduledDate` (first 10 chars: YYYY-MM-DD) against pickup and delivery dates. If mismatched, an amber banner renders below the route dropdown. Warning is informational — form still submits.

Both load pages (`new/page.tsx`, `edit/page.tsx`) updated to include `scheduledDate: r.scheduledDate.toISOString()` in the mapped routes array, and the `routes` type annotation updated to match.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check

### Files exist
- `apps/web/src/app/(owner)/actions/routes.ts` — modified
- `apps/web/src/components/loads/load-form.tsx` — modified
- `apps/web/src/app/(owner)/loads/new/page.tsx` — modified
- `apps/web/src/app/(owner)/loads/[id]/edit/page.tsx` — modified

### Commits exist
- e79446a — Task 1 commit
- 3249478 — Task 2 commit

### TypeScript
`npx tsc --noEmit` passed with zero errors after both tasks.

## Self-Check: PASSED
