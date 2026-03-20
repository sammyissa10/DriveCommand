---
phase: quick-83
plan: "01"
subsystem: loads
tags: [bug-fix, idempotency, server-action]
dependency_graph:
  requires: []
  provides: [idempotent-updateLoadStatus]
  affects: [driver-portal, owner-portal]
tech_stack:
  added: []
  patterns: [early-return idempotency guard]
key_files:
  created: []
  modified:
    - src/app/(owner)/actions/loads.ts
decisions:
  - "Guard placed after null check and before transition validation so same-status requests bypass all downstream logic including the INVOICED invoice guard and DB write"
metrics:
  duration: "~3 min"
  completed: "2026-03-19"
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 83: TKT-0034 — Make updateLoadStatus Idempotent

**One-liner:** Added same-status early-return in `updateLoadStatus` so duplicate status transitions from racing portals return success instead of a transition error.

## What Was Done

`updateLoadStatus` previously returned `{ error: "Cannot transition from X to X" }` when called with the current status. This caused poor UX when the driver portal and owner portal raced to set the same status simultaneously — the second request would always fail.

The fix adds a four-line idempotency guard immediately after the null check and before any transition or INVOICED validation:

```ts
// Idempotency: if already at target status, treat as success (TKT-0034)
if (load.status === newStatus) {
  return { success: true };
}
```

This short-circuits same-status requests without touching the DB, sending notifications, or triggering the INVOICED invoice guard.

## Commits

| Task | Description | Commit |
| ---- | ----------- | ------ |
| 1 | Add idempotency guard to updateLoadStatus | c90e044 |

## Verification

- `npx tsc --noEmit` passes with no errors
- Guard is positioned correctly: after `!load` null check, before `allowedTransitions` check
- All existing transition logic (valid, invalid, INVOICED guard, DB write, notifications) remains unchanged

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `src/app/(owner)/actions/loads.ts` modified and committed
- [x] Commit c90e044 exists and contains the idempotency guard
- [x] TypeScript compilation passes
