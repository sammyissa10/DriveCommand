---
phase: quick-179
plan: "01"
subsystem: web-navigation
tags: [carrier-ops, sidebar, navigation, breadcrumb, role-guard]
dependency_graph:
  requires: [quick-153, quick-154, quick-155, quick-156, quick-157, quick-159, quick-160, quick-161]
  provides: [carrier-ops-navigation, dispatch-badge, carrier-breadcrumb, carrier-role-guard]
  affects: [apps/web/src/components/navigation/sidebar.tsx, apps/web/src/app/(owner)/carrier/layout.tsx]
tech_stack:
  added: []
  patterns: [polling-badge, sub-menu-groups, server-layout-role-guard, pathname-breadcrumb]
key_files:
  created:
    - apps/web/src/components/navigation/dispatch-badge.tsx
    - apps/web/src/components/carrier/CarrierBreadcrumb.tsx
    - apps/web/src/app/(owner)/carrier/layout.tsx
  modified:
    - apps/web/src/components/navigation/sidebar.tsx
decisions:
  - "Used SidebarMenuSub/SubItem/SubButton (already exported from ui/sidebar) for Fleet and Reports nested groups — no collapsible toggle needed"
  - "DispatchBadge polls total field from listDispatches response rather than counting .data array length"
  - "CarrierBreadcrumb renders null when only one breadcrumb item (root carrier page), avoiding orphan breadcrumb"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-05T16:21:49Z"
  tasks_completed: 2
  files_changed: 4
---

# Quick-179: Carrier Ops Sidebar Navigation Wiring and Breadcrumb Summary

Carrier ops sidebar restructured with sub-groups, polling dispatch badge, server layout role guard, and pathname-based breadcrumb.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Restructure Carrier Ops sidebar with sub-groups and dispatch badge | a1664dd | sidebar.tsx, dispatch-badge.tsx |
| 2 | Create carrier layout with role guard and breadcrumb | 4f3eaf4 | carrier/layout.tsx, CarrierBreadcrumb.tsx |

## What Was Built

### dispatch-badge.tsx
Client component that polls `GET /api/v1/carrier/dispatches?needs_assignment=true&status=planned` every 60 seconds. Shows a red rounded badge with count (capped at "9+"). Returns null when count is 0 or on fetch error. Identical styling to SupportBadge.

### sidebar.tsx — Carrier Ops section
Replaced flat 8-item list with ordered, grouped structure:
- Dashboard, Clients, Contracts, Templates, Dispatches (with DispatchBadge), Loads as top-level items
- Fleet sub-group: Drivers, Trucks, Facilities (SidebarMenuSub)
- Reports sub-group: Revenue, Driver Pay, AR Aging, Performance (SidebarMenuSub)
- Imported SidebarMenuSub/SubItem/SubButton from ui/sidebar
- Fleet parent isActive when pathname starts with /carrier/fleet or /carrier/facilities

### CarrierBreadcrumb.tsx
Client component using usePathname. Parses segments after `/carrier/`, maps known slugs to display names, UUIDs to "Detail", "new" to "New". Renders chevron-separated nav with non-terminal segments as Links and terminal segment as plain bold span. Returns null when fewer than 2 items (e.g., on /carrier/ root).

### carrier/layout.tsx
Server component with `force-dynamic`. Reads role via `getRole()`. Redirects DRIVER to `/my-load`, non-OWNER/MANAGER to `/unauthorized`. Renders CarrierBreadcrumb above children. Wraps all /carrier/* pages.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- dispatch-badge.tsx: FOUND
- CarrierBreadcrumb.tsx: FOUND
- carrier/layout.tsx: FOUND
- Commit a1664dd: FOUND
- Commit 4f3eaf4: FOUND
