---
phase: quick-438
plan: 01
subsystem: navigation
tags: [cleanup, nav, dead-links, sidebar, search, quick-actions]
dependency_graph:
  requires: []
  provides: [carrier-sidebar-no-financials, search-no-financials, quick-actions-no-financials]
  affects: [apps/web/src/components/Sidebar/index.tsx, apps/web/src/components/search/searchProviders.ts, apps/web/src/components/quick-actions/quickActions.config.ts]
tech_stack:
  added: []
  patterns: []
key_files:
  modified:
    - apps/web/src/components/Sidebar/index.tsx
    - apps/web/src/components/search/searchProviders.ts
    - apps/web/src/components/quick-actions/quickActions.config.ts
decisions:
  - Removed dead Financials entries rather than creating the route — out of scope for this task
metrics:
  duration: 8m
  completed: 2026-06-15T17:10:10Z
  tasks_completed: 2
  files_modified: 3
---

# Phase quick-438 Plan 01: Remove Dead Financials Nav Item Summary

**One-liner:** Removed dead `/carrier/financials` nav item, search entry, and quick-action links from carrier sidebar, command palette, and quick-actions config — plus cleaned up orphaned TrendingUp and Receipt icon imports.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Remove Financials nav item from carrier sidebar | 98f78d62 | Sidebar/index.tsx |
| 2 | Remove dead /carrier/financials links from search palette and quick actions | 9a2ba056 | searchProviders.ts, quickActions.config.ts |

## Changes Made

### Task 1 — Sidebar/index.tsx
- Removed the `// Financials — hub for revenue/performance visibility` block and the conditional `intelligenceItems.push({ label: "Financials", href: "/carrier/financials", icon: TrendingUp })` call
- Updated INTELLIGENCE section comment from "Max 3 items: Live Map, Dashboard, Financials" to "Max 2 items: Live Map, Dashboard"
- Removed unused `TrendingUp` import from lucide-react block

### Task 2 — searchProviders.ts
- Removed `nav-financials` navigation item object from `navigationItems` array
- Removed `"nav-financials": "/carrier/financials"` entry from `hrefMap`
- Removed `create-expense` quick-create item (`href: "/carrier/financials"`)
- Removed unused `TrendingUp` and `Receipt` imports

### Task 2 — quickActions.config.ts
- Removed `create-expense` quick-create item (`href: "/carrier/financials"`, shortcut `C E`)
- Removed `action-log-expense` quick-action item (`href: "/carrier/financials"`, shortcut `⌘⇧E`)
- Removed unused `Receipt` import

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `grep -rn "/carrier/financials" apps/web/src` returns zero matches
- `npx tsc --noEmit` passes with no new errors (npm warn only, no TypeScript errors)
- Carrier sidebar Intelligence section still shows Live Map and Carrier Dashboard unchanged
- Command palette no longer surfaces a "Financials" navigation result

## Self-Check: PASSED

Files exist:
- FOUND: apps/web/src/components/Sidebar/index.tsx
- FOUND: apps/web/src/components/search/searchProviders.ts
- FOUND: apps/web/src/components/quick-actions/quickActions.config.ts

Commits exist:
- FOUND: 98f78d62
- FOUND: 9a2ba056
