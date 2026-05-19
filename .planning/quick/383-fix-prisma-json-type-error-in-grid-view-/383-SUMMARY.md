---
phase: quick-383
plan: "01"
subsystem: api
tags: [prisma, typescript, grid-views, build-fix]
dependency_graph:
  requires: []
  provides: [grid-views-api-type-safe]
  affects: [vercel-build]
tech_stack:
  added: []
  patterns: ["Prisma.InputJsonValue double-assertion via unknown for structured-interface JSON columns"]
key_files:
  created: []
  modified:
    - apps/web/src/app/api/user/grid-views/[gridId]/[viewId]/route.ts
    - apps/web/src/app/api/user/grid-views/[gridId]/route.ts
decisions:
  - "Use `state as unknown as Prisma.InputJsonValue` (two-step via unknown) rather than single-step cast — required because GridViewState lacks a string index signature, making it non-overlapping with InputJsonObject per TypeScript's structural check"
metrics:
  duration: "5m"
  completed: "2026-05-19"
  tasks_completed: 1
  files_modified: 2
---

# Phase quick-383 Plan 01: Fix Prisma JSON Type Error in Grid-View Routes Summary

Fixed the Vercel build failure caused by incorrect Prisma JSON casts in two grid-view API routes — replaced `state as unknown as Record<string, unknown>` with `state as unknown as Prisma.InputJsonValue` and added `import type { Prisma }` to both files.

## What Was Done

### Task 1: Fix Prisma JSON cast in both grid-view route files

**File 1: `apps/web/src/app/api/user/grid-views/[gridId]/[viewId]/route.ts`**
- Added `import type { Prisma } from '@/generated/prisma';` below existing GridViewState import
- Replaced bad cast on line 91:
  - Before: `state: state as unknown as Record<string, unknown>`
  - After: `state: state as unknown as Prisma.InputJsonValue`

**File 2: `apps/web/src/app/api/user/grid-views/[gridId]/route.ts`**
- Added `import type { Prisma } from '@/generated/prisma';` below existing GridViewState import
- Replaced bad cast on line 129:
  - Before: `state: state as unknown as Record<string, unknown>`
  - After: `state: state as unknown as Prisma.InputJsonValue`

### Why two-step via `unknown`

The plan initially specified `state as Prisma.InputJsonValue` (single-step), but `GridViewState` is a structured interface without a string index signature. TypeScript's structural checking flags a direct cast to `InputJsonObject` as non-overlapping. The correct fix is the two-step `as unknown as Prisma.InputJsonValue` — TypeScript itself recommends this in the error message. This uses `unknown` (not `any`) as the intermediate widening type, satisfying the plan constraints exactly.

## tsc --noEmit Result

Run from `apps/web`: zero errors mentioning `grid-views`, `GridViewUpdateInput`, `GridViewCreateInput`, or `state`. Other pre-existing errors (framer-motion, nuqs, zustand missing types) are unrelated to this task and were not introduced by these changes.

## Constraints Verified

- No `any` introduced — confirmed via `git diff | grep` (no matches)
- No `@ts-ignore` or `@ts-expect-error` introduced — confirmed via `git diff | grep` (no matches)
- Only two target files modified — confirmed via `git status`
- Prisma schema unchanged — `apps/web/prisma/` untouched
- Validation boundary (`GridViewState`) unchanged — body parsing left intact
- No GET or DELETE handler changes

## Commits

| Hash | Message |
|------|---------|
| bc92fcd6 | fix(quick-383): fix Prisma JSON cast in grid-view API routes |

## Deviations from Plan

**1. [Rule 1 - Bug] Used two-step `unknown` widening instead of single-step cast**
- **Found during:** Task 1 verification (tsc run)
- **Issue:** `GridViewState` has no string index signature, so `state as Prisma.InputJsonValue` fails TypeScript's overlap check — TS2352 error
- **Fix:** Applied `state as unknown as Prisma.InputJsonValue` per TypeScript's own recommendation in the error message; satisfies plan constraints (no `any`, no `@ts-ignore`)
- **Files modified:** Both route files
- **Commit:** bc92fcd6

## Self-Check: PASSED

- `apps/web/src/app/api/user/grid-views/[gridId]/[viewId]/route.ts` — FOUND, contains `Prisma.InputJsonValue`
- `apps/web/src/app/api/user/grid-views/[gridId]/route.ts` — FOUND, contains `Prisma.InputJsonValue`
- Commit bc92fcd6 — FOUND in git log
