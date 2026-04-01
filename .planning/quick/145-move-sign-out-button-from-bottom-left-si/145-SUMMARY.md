---
phase: quick-145
plan: "01"
subsystem: navigation
tags: [owner-portal, header, user-menu, sign-out, ux-consistency]
dependency_graph:
  requires: []
  provides: [owner-portal-header-user-menu]
  affects: [apps/web/src/components/navigation/owner-shell.tsx, apps/web/src/components/navigation/sidebar.tsx]
tech_stack:
  added: []
  patterns: [ml-auto for header right alignment]
key_files:
  created: []
  modified:
    - apps/web/src/components/navigation/owner-shell.tsx
    - apps/web/src/components/navigation/sidebar.tsx
decisions:
  - "No compactOnMobile on owner portal UserMenu — sidebar collapses on mobile, unlike driver portal"
metrics:
  duration: "5 minutes"
  completed: "2026-03-31"
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 145: Move Sign-Out Button to Top-Right Header Summary

**One-liner:** Moved UserMenu from owner sidebar footer to header top-right, making sign-out consistent across all three portals.

## What Was Done

The owner portal was the only portal with the sign-out button buried in the bottom-left sidebar footer. The driver and admin portals already had `UserMenu` in their top-right headers. This task unified the UX by removing the sidebar footer user menu and adding it to the owner portal header.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Remove UserMenu from sidebar footer | 01f9750 | sidebar.tsx |
| 2 | Add UserMenu to owner portal header | fbb1f18 | owner-shell.tsx |

## Changes Made

### sidebar.tsx
- Removed `SidebarFooter` import from `@/components/ui/sidebar`
- Removed `UserMenu` import from `@/components/navigation/user-menu`
- Removed the entire `<SidebarFooter>` section (was lines 474-481)

### owner-shell.tsx
- Added `UserMenu` import from `@/components/navigation/user-menu`
- Added `<div className="ml-auto"><UserMenu /></div>` inside the `<header>` element to push it to the far right

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passed with no errors
- UserMenu fully removed from sidebar.tsx (no imports, no usage)
- Owner portal header now renders UserMenu on the right side via `ml-auto`
- Driver and admin portals unaffected

## Self-Check: PASSED

Files exist:
- FOUND: apps/web/src/components/navigation/owner-shell.tsx
- FOUND: apps/web/src/components/navigation/sidebar.tsx

Commits exist:
- FOUND: 01f9750 (remove UserMenu from sidebar footer)
- FOUND: fbb1f18 (add UserMenu to owner portal header)
