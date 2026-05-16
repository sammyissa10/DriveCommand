---
phase: quick-340
plan: "01"
subsystem: notifications / load-driver-assignments
tags: [notifications, prisma, rls, server-action, quick-fix]
dependency_graph:
  requires:
    - apps/web/src/lib/db/prisma.ts (unscoped PrismaClient export)
    - apps/web/src/app/(owner)/actions/load-driver-assignments.ts
  provides:
    - createAssignment notification prefetch that returns non-null load and driver rows
  affects:
    - dispatchNotification('load.assigned') — now actually fires on valid assignments
tech_stack:
  added: []
  patterns:
    - defaultPrisma alias for unscoped reads inside already-authorized server actions
key_files:
  modified:
    - apps/web/src/app/(owner)/actions/load-driver-assignments.ts
decisions:
  - "Use defaultPrisma (unscoped) only for the two notification prefetch reads; all other operations remain tenant-scoped via getTenantPrisma()"
metrics:
  duration: "< 5 min"
  completed: "2026-05-15"
  tasks: 1
  files: 1
---

# Phase quick-340 Plan 01: defaultPrisma Notification Prefetch Fix Summary

Use unscoped `defaultPrisma` for the two notification prefetch reads in `createAssignment` so that `dispatchNotification('load.assigned')` actually fires instead of being silently blocked by RLS-filtered nulls.

## What Was Done

### Exact edits to `apps/web/src/app/(owner)/actions/load-driver-assignments.ts`

**Edit 1 — New import (line 7):**
```ts
import { prisma as defaultPrisma } from '@/lib/db/prisma';
```
Added directly after the existing `getTenantPrisma, requireTenantId` import. The `as defaultPrisma` alias ensures it does not shadow the tenant-scoped `prisma` symbol used elsewhere in the file.

**Edit 2 — Swap prefetch reads (lines 240, 244):**
- `prisma.load.findUnique(...)` → `defaultPrisma.load.findUnique(...)`
- `prisma.carrierDriver.findUnique(...)` → `defaultPrisma.carrierDriver.findUnique(...)`

Only these two calls inside the notification `Promise.all` block were changed. The `.catch` handler was left untouched. Every other `prisma.*` reference in the file (assignment create, duplicate-main-driver findFirst, updateAssignment, deleteAssignment) remains tenant-scoped.

**Edit 3 — Prefetch-result trace (line 253):**
```ts
console.log(`[notif-trace] caller:prefetch-result load=${load != null} driver=${driver != null} loadId=${loadId} driverId=${cd.id}`);
```
Inserted immediately after the closing `});` of the `.catch` block and immediately before the `if (load && driver) {` guard. This makes the previously-silent null failure visible in logs.

## Safety Justification for Bypassing RLS

The two unscoped reads are safe because:

1. **Auth already ran** — `requireRole(UserRole.OWNER)`, `requireAuth()`, and `requireTenantId()` all execute earlier in `createAssignment` before reaching the prefetch block.
2. **IDs are already validated within tenant boundary** — `loadId` came from the request body, and `cd.id` came from a prior tenant-scoped query (`prisma.carrierDriver.findFirst({ where: { id: driverId, orgId: tenantId } })`). Both are confirmed to belong to the caller's tenant before the prefetch runs.
3. **Fields are non-sensitive** — `loadNumber`, `origin`, `destination`, `firstName`, `lastName` are already exposed to the assigned driver via the load itself.
4. **Unscoped client used nowhere else** — `defaultPrisma` is imported only for these two reads. All create/update/delete operations and all other reads continue to enforce RLS through the tenant-scoped `prisma` handle.

## Root Cause (why this was broken)

The tenant-scoped `prisma` client applies RLS row filtering via a Prisma extension. On the `loads` and `carrier_drivers` tables, RLS silently returns `null` from `findUnique` when the session context is not set correctly for the notification prefetch path — it does not throw, so the `.catch()` handler never fired and the `if (load && driver)` guard silently closed with both values null. `dispatchNotification` was never called. No `NotificationSendLog` rows were created.

## TypeScript Verification

`npx tsc --noEmit` from `apps/web` exits 0 — no errors.

## Expected Next Observable Behavior in Production

After deploying this fix:
- Logs will emit `[notif-trace] caller:prefetch-result load=true driver=true loadId=<id> driverId=<id>` for every valid `createAssignment` call.
- `caller:before-dispatch` and `caller:after-dispatch` lines will follow immediately.
- A `NotificationSendLog` row will be created for each assignment.
- Drivers will receive push notifications when assigned to a load.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- File modified: `apps/web/src/app/(owner)/actions/load-driver-assignments.ts` — confirmed present.
- Commit `db25993` exists in git log.
- `npx tsc --noEmit` passed (exit 0).
- `grep defaultPrisma` returns exactly 3 lines (import + 2 findUnique calls).
- `grep caller:prefetch-result` returns exactly 1 line immediately before `if (load && driver) {`.
