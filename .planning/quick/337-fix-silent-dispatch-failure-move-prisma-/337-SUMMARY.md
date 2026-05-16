---
phase: quick-337
plan: "01"
subsystem: notifications
tags: [bugfix, notifications, waitUntil, async-local-storage, prisma, server-actions]
dependency_graph:
  requires: [quick-336]
  provides: [reliable-dispatch-notifications]
  affects: [load-driver-assignments, loads, dispatchNotification]
tech_stack:
  added: []
  patterns: [prefetch-outside-waitUntil, as-const-tuple-fallback]
key_files:
  modified:
    - apps/web/src/app/(owner)/actions/load-driver-assignments.ts
    - apps/web/src/app/(owner)/actions/loads.ts
decisions:
  - "Hoist all request-scoped Prisma reads before waitUntil in every Type A site; only dispatchNotification runs inside the background promise"
  - "Use Promise.all([...]).catch(() => [null, null] as const) for tuple narrowing and safe fallback"
metrics:
  duration: "~20 minutes"
  completed: "2026-05-15"
  tasks_completed: 2
  tasks_total: 3
  files_modified: 2
---

# Quick-337: Fix Silent Dispatch Failure — Move Prisma Prefetch Outside waitUntil

## One-Liner

Hoisted all request-scoped Prisma reads before `waitUntil` in three dispatch sites so AsyncLocalStorage context is alive during the reads and only `dispatchNotification` runs in the background promise.

## Problem Statement

quick-336 wrapped `dispatchNotification` calls in `@vercel/functions` `waitUntil` to keep Vercel lambdas alive past the Server Action return. However, the IIFE placed inside `waitUntil` started with Prisma reads. `getTenantPrisma()` builds a tenant-scoped client by reading `x-tenant-id` from request headers via Next.js `headers()`. After the Server Action returns, the request's AsyncLocalStorage context is torn down, so any `prisma.*` call inside `waitUntil` runs outside that context — causing silent failures or hangs before `dispatchNotification` ever fires.

## Task 1 Reasoning

**AsyncLocalStorage scoping:** `getTenantPrisma()` calls `headers()` from `next/headers`, which is bound to the current request's ALS context via the Next.js runtime. After the Server Action return, that context is gone. Any Prisma call using the tenant-scoped client inside a post-return promise silently fails because the RLS extension can no longer read `app.current_tenant_id`.

**Which prisma client:** The same request-scoped `prisma` variable captured by `getTenantPrisma()` at the top of each action. Because the prefetch is hoisted to run BEFORE the action returns, the ALS context is still alive and the RLS extension works correctly.

**Why prefetch before waitUntil is safer than retrying inside:** The request-scoped ALS context is guaranteed alive before `return` — it is gone immediately after. There is no way to re-enter that context inside a background promise without re-authenticating, so prefetching is the only correct option.

**Dispatch site classification in loads.ts:**

| Site | Function | Classification | Reason |
|------|----------|---------------|--------|
| `load.created` (line 222) | `createLoad` | Type B — leave alone | Already `waitUntil(dispatchNotification(...).catch(...))` with all data captured in outer-scope vars before the call |
| `load.assigned` + `load.dispatched` (~line 440) | `dispatchLoad` | Type A — refactor | `prisma.user.findUnique` inside the IIFE |
| `load.picked_up/in_transit/delivered/invoiced/cancelled` (~line 620) | `updateLoadStatus` | Type A — refactor | `prisma.load.findUnique` + `prisma.invoice.findFirst` inside the IIFE |

## Task 2 Changes

### load-driver-assignments.ts — createAssignment

**Before (lines 238-270):** IIFE containing `Promise.all([prisma.load.findUnique, prisma.carrierDriver.findUnique])` followed by `dispatchNotification`, all inside `waitUntil(async () => { ... })`.

**After:** 
- `Promise.all([prisma.load.findUnique, prisma.carrierDriver.findUnique]).catch(() => [null, null] as const)` runs synchronously in request scope before `waitUntil`
- `if (load && driver)` guard skips dispatch if prefetch failed
- `waitUntil(dispatchNotification('load.assigned', {...}).catch(...))` — only the dispatch call inside the background promise

### loads.ts — dispatchLoad (Type A)

**Before:** IIFE containing `prisma.user.findUnique` for driver name, then two `dispatchNotification` calls inside `waitUntil`.

**After:**
- `Promise.all([prisma.user.findUnique(...)]).catch(() => [null] as const)` runs in request scope
- `if (dispatchDriver !== null)` guard
- `waitUntil(Promise.all([dispatchNotification('load.assigned',...), dispatchNotification('load.dispatched',...)]))` — both dispatches inside one background promise, no Prisma inside

### loads.ts — updateLoadStatus (Type A)

**Before:** IIFE containing `prisma.load.findUnique` (with driver relation) + conditional `prisma.invoice.findFirst`, then a switch over `newStatus` with 5 `dispatchNotification` calls.

**After:**
- `Promise.all([prisma.load.findUnique(...), newStatus === 'INVOICED' ? prisma.invoice.findFirst(...) : Promise.resolve(null)]).catch(() => [null, null] as const)` runs in request scope
- `if (loadDetail)` guard
- Switch statement builds a single `notifPromise` from the appropriate `dispatchNotification` call
- `waitUntil(notifPromise)` — only the dispatch call in background

### loads.ts — createLoad (Type B — left untouched)

`waitUntil(dispatchNotification('load.created', {...}).catch(...))` — all data already in outer-scope variables, no Prisma inside the wrap. Left exactly as-is.

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` (apps/web) | PASSED — zero errors |
| `npx vitest run src/lib/notifications/__tests__/ src/app/(owner)/actions/__tests__/load-driver-assignments.test.ts` | PASSED — 26 tests (19 notification + 7 assignment) |
| `waitUntil(` in load-driver-assignments.ts wraps only `dispatchNotification` | CONFIRMED |
| `waitUntil(` in loads.ts — all 3 sites wrap only dispatch calls | CONFIRMED |
| All `[notifications]` console.error messages preserved verbatim | CONFIRMED |
| No changes to dispatchNotification signature | CONFIRMED |
| No changes to tenant-context.ts or prisma.ts | CONFIRMED |

## Task 3: Production Smoke Test

Per constraints, Task 3 is a `checkpoint:human-verify`. This requires manual production smoke testing after deploying with `vercel --prod`. Steps:

1. Run `vercel --prod` from repo root
2. Log in as owner in production
3. Assign a driver to a load via the UI
4. Verify `load.assigned` notification arrives within ~30s
5. Check Vercel logs for absence of `[notifications] * failed` entries

**Status: Requires manual verification by user.**

## Commit

- `e828f29` — fix(quick-task-337): move Prisma prefetch outside waitUntil to fix AsyncLocalStorage context loss

## Underlying Lesson

When using `@vercel/functions` `waitUntil` in Next.js Server Actions: **never put request-scoped reads inside the background promise.** The Next.js ALS context (headers, cookies, tenant-id) is torn down the moment the action returns. Any call to `headers()`, `getTenantPrisma()`, or any RLS-scoped Prisma client inside `waitUntil` will silently fail. The pattern is: read everything you need while still in request scope, then pass plain values into the background promise for I/O-only work (email, push notifications, webhook dispatch).

## Self-Check

- [x] `apps/web/src/app/(owner)/actions/load-driver-assignments.ts` — modified and committed
- [x] `apps/web/src/app/(owner)/actions/loads.ts` — modified and committed
- [x] Commit `e828f29` exists in git log

## Self-Check: PASSED
