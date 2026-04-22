---
phase: quick-274
plan: "01"
subsystem: carrier-documents
tags: [documents, carrier, client-linkage, data-model]
dependency_graph:
  requires: []
  provides: [clientId-contractId-on-CarrierDocument]
  affects: [apps/web/src/lib/carrier/documents.ts]
tech_stack:
  added: []
  patterns: [try-catch-graceful-fallback, prisma-relation-select]
key_files:
  modified:
    - apps/web/src/lib/carrier/documents.ts
decisions:
  - Use `?? undefined` (not `?? null`) for contractId assignment to match `string | undefined` type from destructuring
  - Dispatch resolution uses findMany + length === 1 guard to avoid ambiguous multi-load assignment
  - Removed BOL/POD-specific clientId block in favor of universal resolution across all parent types
metrics:
  duration: "5m"
  completed: "2026-04-21"
  tasks_completed: 1
  files_modified: 1
---

# Phase quick-274: Propagate clientId and contractId to CarrierDocument Summary

**One-liner:** Universal clientId/contractId auto-resolution for all 4 document parent types (stop/load/dispatch/contract) with try/catch fallback so upload never fails.

## What Was Built

The `uploadDocument` function in `apps/web/src/lib/carrier/documents.ts` now automatically resolves and persists `clientId` and `contractId` on every `CarrierDocument` record at upload time, regardless of which parent entity the document is attached to.

### Resolution logic per parent type

| Parent Type | clientId source | contractId source |
|-------------|----------------|-------------------|
| `stop` | `stop.load.clientId` | `stop.load.contractId` |
| `load` | `load.clientId` | `load.contractId` (was already handled) |
| `dispatch` | single linked load's `clientId` (null if 0 or 2+ loads) | single linked load's `contractId` (null if ambiguous) |
| `contract` | `contract.clientId` | `parentId` (the contract itself) |

All resolution is wrapped in `try/catch` — on error, a `logger.warn` is emitted and the value remains `null`. The upload proceeds regardless.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript type mismatch on contractId assignment**
- **Found during:** Task 1 (tsc --noEmit)
- **Issue:** `contractId` is destructured as `string | undefined` but was being assigned `null` from Prisma's nullable return (`string | null`). TypeScript error TS2322 on lines 73 and 107.
- **Fix:** Changed `?? null` to `?? undefined` for `contractId` assignments in stop and dispatch branches, matching the declared type.
- **Files modified:** `apps/web/src/lib/carrier/documents.ts`
- **Commit:** 4916586

## Self-Check: PASSED

- FOUND: `apps/web/src/lib/carrier/documents.ts`
- FOUND: commit `4916586`
