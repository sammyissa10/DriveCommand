---
phase: quick-73
plan: "01"
subsystem: trucks
tags: [routes, history, truck-detail, server-action, client-component]
dependency_graph:
  requires: [prisma/schema.prisma Route.truckId]
  provides: [listTruckRoutes, TruckRoutesHistory]
  affects: [src/app/(owner)/trucks/[id]/page.tsx]
tech_stack:
  added: []
  patterns: [non-blocking fetch, card section pattern, status badge pattern]
key_files:
  created:
    - src/app/(owner)/trucks/[id]/truck-routes-history.tsx
  modified:
    - src/app/(owner)/actions/trucks.ts
    - src/app/(owner)/trucks/[id]/page.tsx
decisions:
  - "Included archived routes (no archivedAt filter) — this is a history view for audit/utilization tracking"
  - "Non-blocking fetch pattern (try/catch) matches existing listDocuments pattern on same page"
  - "Status badge style matches driver-route-assignments-section.tsx pattern (more complete than route-detail.tsx)"
metrics:
  duration: "~4 minutes"
  completed: "2026-03-15"
  tasks: 2
  files_affected: 3
---

# Phase quick-73 Plan 01: TKT-0026 Routes History on Truck Detail Summary

**One-liner:** Added Routes History section to truck detail page — server action queries all routes (including archived) for a truck via truckId FK, client component renders them with status badges, formatted dates, and links to route detail pages.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add listTruckRoutes server action and TruckRoutesHistory component | 0962d66 | trucks.ts, truck-routes-history.tsx |
| 2 | Integrate Routes History into truck detail page | 1d07847 | trucks/[id]/page.tsx |

## What Was Built

- **`listTruckRoutes(truckId)`** — new server action in trucks.ts. Authenticates with OWNER/MANAGER/DRIVER roles, queries `route.findMany({ where: { truckId } })` with no `archivedAt` filter (history view), ordered by `scheduledDate desc`, limited to 50. Selects: id, name, origin, destination, status, scheduledDate, archivedAt.

- **`TruckRoutesHistory`** — new client component at `trucks/[id]/truck-routes-history.tsx`. Renders each route as a card row with: route name (or origin → destination fallback), status badge (PLANNED/IN_PROGRESS/COMPLETED with appropriate colors), scheduled date (MMM d, yyyy), clickable route name linking to `/routes/[id]` with ExternalLink icon, and an "(Archived)" label for soft-deleted routes. Shows empty state when no routes exist.

- **Truck detail page** — imports both new exports, fetches routes non-blocking (matching the documents fetch pattern), renders "Routes History" card section between Files and Record History sections.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: src/app/(owner)/actions/trucks.ts
- FOUND: src/app/(owner)/trucks/[id]/truck-routes-history.tsx
- FOUND: src/app/(owner)/trucks/[id]/page.tsx
- FOUND commit 0962d66: feat(quick-73): add listTruckRoutes server action and TruckRoutesHistory component
- FOUND commit 1d07847: feat(quick-73): integrate Routes History section into truck detail page
