---
phase: quick-191
plan: "01"
subsystem: carrier/dispatch-generator
tags: [bug-fix, dispatch, carrier]
dependency_graph:
  requires: []
  provides: [working-dispatch-number-display]
  affects: [DispatchCard, DispatchHeader]
tech_stack:
  added: []
  patterns: [prisma-count-over-raw-sql]
key_files:
  modified:
    - apps/web/src/lib/carrier/dispatch-generator.ts
decisions:
  - "Use prisma.carrierDispatch.count over all org dispatches (not just auto-generated) to prevent number collisions with manually created dispatches"
  - "Notes format updated to [DISPATCH_NUMBER=DC-YYYY-NNNNN] bracket syntax matching UI extraction regex"
metrics:
  duration: "5 minutes"
  completed: "2026-04-06"
  tasks_completed: 1
  files_modified: 1
---

# Quick-191: Fix Dispatch Numbers Not Generating or Displaying

**One-liner:** Fixed two bugs in dispatch-generator.ts — bracket format mismatch between the generator and the UI regex, and counter collision from only counting auto-generated dispatches instead of all org dispatches.

## What Was Done

### Task 1: Fix dispatch number notes format and counter logic

Two bugs fixed in `apps/web/src/lib/carrier/dispatch-generator.ts`:

**Bug 1 — Notes format mismatch:**
The generator was writing `dispatch_number=DC-YYYY-NNNNN` in the notes field, but `DispatchCard.tsx` and `DispatchHeader.tsx` extract dispatch numbers using the regex `/\[DISPATCH_NUMBER=([^\]]+)\]/`. This mismatch meant the UI always showed "—" instead of the actual dispatch number.

Fixed by changing the format to `[DISPATCH_NUMBER=DC-YYYY-NNNNN]` bracket notation.

**Bug 2 — Counter collision:**
The old counter used a raw SQL query counting only dispatches with `notes LIKE '[AUTO-GENERATED]%'`. This meant auto-generated dispatch numbers could collide with manually created dispatch numbers (which the counter didn't account for).

Fixed by replacing `$queryRaw` with `prisma.carrierDispatch.count({ where: { orgId } })` which counts ALL dispatches for the org, ensuring uniqueness regardless of how the dispatch was created.

**Commit:** `15731cf`

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `apps/web/src/lib/carrier/dispatch-generator.ts` exists and contains fixes
- [x] Commit `15731cf` exists
- [x] `npx tsc --noEmit` passed with zero errors
- [x] `grep -n "DISPATCH_NUMBER="` shows bracket format at lines 179, 300, 301
- [x] `grep -n "carrierDispatch.count"` shows new counter at line 235
- [x] `grep -n "queryRaw"` returns no matches (old counter removed)

## Self-Check: PASSED
