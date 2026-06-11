---
phase: quick-436
plan: 436
subsystem: routing
tags: [cleanup, dead-code, redirects, dispatches, trips]
dependency_graph:
  requires: [quick-429]
  provides: []
  affects: []
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified: []
  deleted:
    - apps/web/src/app/(owner)/carrier/dispatches/page.tsx
    - apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
    - apps/web/src/app/(owner)/carrier/dispatches/[id]/stops/page.tsx
decisions:
  - next.config.ts permanent redirects are the single source of truth for /carrier/dispatches/* → /carrier/trips/*; stub pages were dead code
metrics:
  duration: 5m
  completed: 2026-06-11T21:25:40Z
  tasks_completed: 1
  files_changed: 3
---

# Phase quick-436: Remove Redundant Dispatches Redirect Stubs Summary

**One-liner:** Deleted three dead-code stub page.tsx files that duplicated next.config.ts permanent redirects for /carrier/dispatches/*.

## What Was Built

After quick-429 renamed Dispatches to Trips, two redirect mechanisms existed for /carrier/dispatches/*:
1. Stub page.tsx files calling `redirect()` (render-time)
2. Permanent redirects in next.config.ts (routing-layer, fires first)

The next.config.ts redirects always win because they fire before any page renders, making the three stub pages unreachable dead code. This task removed the stubs, leaving next.config.ts as the single source of truth.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Verify next.config redirects, then delete dispatches stub pages | 14ea92e3 | 3 deleted |

## Verification

- `apps/web/src/app/(owner)/carrier/dispatches/` directory no longer exists
- next.config.ts lines 12-21 still contain both redirect rules, both `permanent: true`:
  - `/carrier/dispatches` → `/carrier/trips`
  - `/carrier/dispatches/:path*` → `/carrier/trips/:path*`
- `tsc --noEmit` passes with no errors (after clearing stale .next/types cache)
- No API routes, trips routes, components, or internal links were modified

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stale .next/types cache referenced deleted pages**
- **Found during:** Task 1 verification (tsc --noEmit)
- **Issue:** `.next/types/validator.ts` and `.next/dev/types/validator.ts` still referenced the deleted page.tsx files, causing TS2307 errors
- **Fix:** Deleted `.next/types/` and `.next/dev/types/` directories to clear the stale build cache; re-ran tsc which then passed cleanly
- **Files modified:** (cache directories, not source files — not committed)
- **Commit:** n/a (cache only)

## Self-Check: PASSED

- Deleted files confirmed gone: `ls dispatches/` returns "No such file or directory"
- next.config.ts redirects confirmed present at lines 12-21
- Commit 14ea92e3 confirmed in git log
- tsc --noEmit passes with no errors
