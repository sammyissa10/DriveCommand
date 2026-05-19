---
phase: quick-381
plan: "01"
subsystem: api
tags: [build, prisma, import, vercel]
dependency_graph:
  requires: []
  provides: [passing-vercel-build]
  affects: [apps/web/src/app/api/user/grid-views]
tech_stack:
  added: []
  patterns: [named-prisma-import]
key_files:
  created: []
  modified:
    - apps/web/src/app/api/user/grid-views/[gridId]/route.ts
    - apps/web/src/app/api/user/grid-views/[gridId]/[viewId]/route.ts
decisions:
  - "Used named import { prisma } — the only export pattern in prisma.ts (used by 100+ other files)"
metrics:
  duration: "< 5 minutes"
  completed: 2026-05-19
---

# Phase quick-381 Plan 01: Fix Vercel Build Failure — Incorrect Default Prisma Import Summary

Changed two grid-views API routes from a default import (`import prisma from ...`) to the correct named import (`import { prisma } from ...`), eliminating the Turbopack "Export default doesn't exist in target module" build failure.

## What Was Done

### Task 1: Fix default prisma imports in both grid-views route files

Both files had:
```ts
import prisma from '@/lib/db/prisma';
```

Changed to:
```ts
import { prisma } from '@/lib/db/prisma';
```

Files modified:
- `apps/web/src/app/api/user/grid-views/[gridId]/route.ts` — line 9
- `apps/web/src/app/api/user/grid-views/[gridId]/[viewId]/route.ts` — line 9

No other lines, logic, or files were modified.

## Verification

**grep for remaining default imports:**
```
grep -rn "import prisma from '@/lib/db/prisma'" apps/web/src
```
Result: 0 matches.

**grep for named import in target files:**
```
apps/web/src/app/api/user/grid-views/[gridId]/[viewId]/route.ts:9:import { prisma } from '@/lib/db/prisma';
apps/web/src/app/api/user/grid-views/[gridId]/route.ts:9:import { prisma } from '@/lib/db/prisma';
```

**tsc --noEmit result:**
- No errors related to `prisma` symbol or grid-views import change introduced.
- Pre-existing errors (framer-motion, zustand, nuqs, papaparse, topojson-client missing type declarations; Prisma JSON type coercion on `state` field) were present before this change and are out of scope.
- The two TS2322 errors in grid-views files (Prisma JSON type for `state` field) are pre-existing — confirmed by git diff showing only the import line changed.

**prisma.ts unchanged:**
`apps/web/src/lib/db/prisma.ts` was not modified. It retains `export const prisma = ...` (named export only, no default export) — the correct pattern used by 100+ other files in the codebase.

## Commit

- `9fcb5022` — `fix(build): use named import for prisma in grid-views API routes`

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `apps/web/src/app/api/user/grid-views/[gridId]/route.ts` — named import confirmed on line 9
- `apps/web/src/app/api/user/grid-views/[gridId]/[viewId]/route.ts` — named import confirmed on line 9
- Commit `9fcb5022` exists in git log
- Zero default-import matches in `apps/web/src`
