---
phase: quick-217
plan: "01"
subsystem: carrier
tags: [bug-fix, sequence-generation, concurrency, contracts, dispatches, loads]
dependency_graph:
  requires: []
  provides: [collision-safe contract numbers, collision-safe dispatch numbers, collision-safe load reference numbers]
  affects: [apps/web/src/lib/carrier/contracts.ts, apps/web/src/lib/carrier/dispatches.ts, apps/web/src/lib/carrier/loads.ts]
tech_stack:
  added: []
  patterns: [MAX-based sequence generation via findFirst + orderBy desc]
key_files:
  modified:
    - apps/web/src/lib/carrier/contracts.ts
    - apps/web/src/lib/carrier/dispatches.ts
    - apps/web/src/lib/carrier/loads.ts
decisions:
  - "Use findFirst + orderBy desc instead of count for sequence generation to handle deletions and concurrent inserts"
  - "Dispatch number extracted from notes field via regex since it has no unique column — no retry loop needed"
  - "Load referenceNumber has no @unique constraint so no retry loop needed"
metrics:
  duration: ~3min
  completed: 2026-04-14
  tasks: 2
  files: 3
---

# Quick 217: Fix Duplicate Contract/Dispatch/Load Number Generators Summary

**One-liner:** Replaced COUNT-based sequence generators with MAX-based findFirst+orderBy-desc queries in contracts, dispatches, and loads to eliminate duplicate numbers after deletions or concurrent inserts.

## What Was Done

### Task 1 — contracts.ts
- Removed `yearStart` and `yearEnd` date range variables (no longer needed)
- Replaced `prisma.carrierContract.count({ where: { orgId, createdAt: { gte: yearStart, lt: yearEnd } } })` with `prisma.carrierContract.findFirst({ where: { orgId, contractNumber: { startsWith: \`CN-${year}-\` } }, orderBy: { contractNumber: 'desc' }, select: { contractNumber: true } })`
- Derive `lastSeq` from the returned `contractNumber` string's last 5 chars
- Retry loop (up to 5 attempts) and P2002 catch block preserved — `contractNumber` has `@unique`

### Task 2 — dispatches.ts
- Replaced `prisma.carrierDispatch.count({ where: { orgId } })` with `findFirst` on the `notes` field containing the dispatch tag
- Regex `\[DISPATCH_NUMBER=DC-\d{4}-(\d{5})\]` extracts the last sequence number from the most recent dispatch's notes
- No retry loop — dispatch number is embedded in the `notes` text field, no unique constraint

### Task 3 — loads.ts
- Replaced `prisma.carrierLoad.count({ where: { orgId } })` with `findFirst` filtering `referenceNumber: { startsWith: \`LD-${year}-\` }` and ordering by `referenceNumber desc`
- `lastSeq` derived from the last 5 chars of the highest existing reference number
- No retry loop — `referenceNumber` has no `@unique` constraint in schema (confirmed via schema grep)

## Commits

| Hash | Message |
|------|---------|
| 542cebb | fix(quick-217): replace COUNT with MAX-based contract number generator |
| 6fe2a58 | fix(quick-217): replace COUNT with MAX-based dispatch and load number generators |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `apps/web/src/lib/carrier/contracts.ts` — modified, findFirst present, no yearStart/yearEnd
- `apps/web/src/lib/carrier/dispatches.ts` — modified, findFirst present
- `apps/web/src/lib/carrier/loads.ts` — modified, findFirst present
- Commits 542cebb and 6fe2a58 exist in git log
- TypeScript errors in `e2e/carrier/*.spec.ts` are pre-existing (Playwright Locator.not API), unrelated to this task
