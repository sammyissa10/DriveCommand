---
phase: quick-225
plan: "01"
subsystem: carrier-drivers
tags: [bug-fix, userId-linking, tenant-isolation, carrier-ops]
dependency_graph:
  requires: []
  provides: [carrier_drivers.userId populated on creation and invitation acceptance]
  affects: [fleet-drivers.ts, accept-invitation/route.ts]
tech_stack:
  added: []
  patterns: [userId backfill after create, updateMany with null guard inside transaction]
key_files:
  created: []
  modified:
    - apps/web/src/lib/carrier/fleet-drivers.ts
    - apps/web/src/app/api/auth/accept-invitation/route.ts
decisions:
  - Use updateMany with userId:null guard to safely link without overwriting existing values
  - Wrap backfill in try/catch in fleet-drivers so driver creation never fails due to link error
  - Use orgId/tenantId scoping on all lookups for tenant isolation
metrics:
  duration: "~5 minutes"
  completed: "2026-04-15"
  tasks_completed: 1
  files_modified: 2
---

# Phase quick-225 Plan 01: Fix carrier_drivers.userId always null — Summary

**One-liner:** Backfill `carrier_drivers.userId` at driver creation (if User already exists) and at invitation acceptance (inside the existing transaction) to ensure email notifications and portal access work immediately.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Link userId at driver creation and invitation acceptance | c8a7ee9 | fleet-drivers.ts, accept-invitation/route.ts |

## What Was Built

Two userId linking paths were added:

**Path 1 — fleet-drivers.ts `createCarrierDriver`:** After `prisma.carrierDriver.create`, a lookup for `prisma.user.findFirst` by `email.toLowerCase().trim()` and `tenantId: orgId` fires if `data.email` is present and `userId` was not already provided. If a matching User exists, `prisma.carrierDriver.update` writes the `userId`. Wrapped in try/catch so any failure is logged and non-fatal.

**Path 2 — accept-invitation/route.ts POST:** Inside the existing `prisma.$transaction` block (which already has `app.bypass_rls` set), a `tx.carrierDriver.updateMany` call links all unlinked `carrier_drivers` records for the email+tenantId combination to the newly created user. The `userId: null` filter ensures existing non-null values are never overwritten.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `apps/web/src/lib/carrier/fleet-drivers.ts` modified — `prisma.user.findFirst` lookup after `prisma.carrierDriver.create`, guarded by `!userId && data.email`
- [x] `apps/web/src/app/api/auth/accept-invitation/route.ts` modified — `tx.carrierDriver.updateMany` with `userId: null` condition inside transaction
- [x] Commit c8a7ee9 exists
- [x] `npx tsc --noEmit` passes (zero errors in source files; 3 pre-existing e2e test file errors unrelated to this task)
- [x] No schema or migration file changes

## Self-Check: PASSED
