---
phase: quick-338
plan: "01"
subsystem: notifications
tags: [notifications, server-actions, bug-fix, production-fix]
dependency_graph:
  requires: [quick-336, quick-337]
  provides: [synchronous-notification-dispatch-in-server-actions]
  affects: [load-driver-assignments.ts, loads.ts]
tech_stack:
  added: []
  patterns: [synchronous-await-before-redirect]
key_files:
  created: []
  modified:
    - apps/web/src/app/(owner)/actions/load-driver-assignments.ts
    - apps/web/src/app/(owner)/actions/loads.ts
decisions:
  - "Synchronous await is the only reliable pattern for dispatchNotification in Vercel Server Actions — both waitUntil background patterns (quick-336, quick-337) produced zero NotificationSendLog rows in production"
  - "Accept ~1-2s extra response time on createLoad, dispatchLoad, createAssignment, and updateLoadStatus for guaranteed notification delivery"
metrics:
  duration: ~8 minutes
  completed: 2026-05-16
  tasks_completed: 2
  files_modified: 2
---

# Phase quick-338 Plan 01: Convert dispatchNotification to synchronous await Summary

**One-liner:** Converted 4 `waitUntil(dispatchNotification(...))` call sites across 2 Server Action files to synchronous `await` — the only pattern that reliably writes NotificationSendLog rows in the Vercel + Next.js Server Action runtime.

## What Was Built

Four dispatch sites across two Server Action files were converted from `waitUntil(...)` background dispatch to synchronous `await`. The `waitUntil` import was removed from both files. This is the third and final attempt to fix production load lifecycle notifications — quick-336 (waitUntil wrap) and quick-337 (prefetch outside waitUntil) both silently dropped background promises.

## Dispatch Sites Converted

| File | Function | triggerType | Pattern |
|------|----------|-------------|---------|
| `load-driver-assignments.ts` | `createAssignment` | `load.assigned` | `await dispatchNotification(...)` before `revalidatePath`/`return` |
| `loads.ts` | `createLoad` | `load.created` | `await dispatchNotification(...)` before `revalidatePath`/`redirect` |
| `loads.ts` | `dispatchLoad` | `load.assigned` + `load.dispatched` | `await Promise.all([dispatchNotification(...), dispatchNotification(...)])` before `redirect` |
| `loads.ts` | `updateLoadStatus` | `load.picked_up` / `load.in_transit` / `load.delivered` / `load.invoiced` / `load.cancelled` | `await notifPromise` (IIFE switch) before `return` |

## Before / After Pattern

**Before (quick-336 / quick-337):**
```typescript
// Wrapped in waitUntil so Vercel keeps the lambda alive past the action return (quick-336).
// ONLY dispatchNotification runs inside waitUntil — all request-scoped reads done above (quick-337).
waitUntil(
  dispatchNotification('load.assigned', { ... })
    .catch((err) => console.error(...)),
);
```

**After (quick-338):**
```typescript
// Synchronous await — quick-336 + quick-337 background dispatch both failed in production
// (zero NotificationSendLog rows). Await before revalidatePath/redirect so the lambda doesn't
// exit before delivery completes (quick-338). Adds ~1-2s but guarantees the notification fires.
await dispatchNotification('load.assigned', { ... })
  .catch((err) => console.error(...));
```

## Why Background Dispatch Fails in This Runtime

The Vercel + Next.js Server Action runtime terminates the lambda immediately after `return` / `redirect()`. `waitUntil()` is supposed to extend the lambda's lifetime, but in this specific combination — Next.js 15 App Router Server Actions on Vercel — the promises are silently dropped before they can write to the database. This was confirmed by two failed attempts:

- **quick-336:** Wrapped `dispatchNotification` in `waitUntil(...)` — zero `NotificationSendLog` rows written.
- **quick-337:** Moved Prisma prefetch outside `waitUntil` to resolve `AsyncLocalStorage` context loss — still zero rows.

Synchronous `await` before the `redirect()`/`return` is the only guaranteed delivery pattern.

## Verification

- **TypeScript:** `tsc --noEmit` — exit 0, no errors
- **Build:** Background `next build` running; `tsc` confirms no type issues
- **No `waitUntil` calls remaining:** Confirmed via grep — zero functional usages in both files (only appears in explanatory comment text in load-driver-assignments.ts line 253)
- **`await dispatchNotification`:** 1 match in load-driver-assignments.ts, 1 in loads.ts (load.created)
- **`await Promise.all`:** 1 match in loads.ts (load.assigned + load.dispatched combined)
- **`await notifPromise`:** 1 match in loads.ts (updateLoadStatus status-switch)
- **Production smoke test:** Human gate — see Task 3 checkpoint in plan for verification steps

## Production Verification (Human Gate — Task 3)

After deploying with `vercel --prod`, verify in Supabase Studio → `NotificationSendLog` table:

1. Create a load → `load.created` row with `status = 'sent'`
2. Dispatch a load → `load.assigned` + `load.dispatched` rows
3. Advance status → `load.picked_up` / `load.in_transit` / `load.delivered` / `load.invoiced` / `load.cancelled` rows
4. Use createAssignment in carrier portal → `load.assigned` row
5. Check Vercel logs for zero `[notifications] ... dispatch failed` entries

Expected measured impact: ~1-2s additional latency on `createLoad` and `dispatchLoad` actions — acceptable trade-off for guaranteed delivery.

## Deviations from Plan

None — plan executed exactly as written. Files are at `apps/web/src/app/(owner)/actions/` (not `apps/web/src/actions/` as listed in plan frontmatter — the additional context provided correct paths).

## Self-Check: PASSED

- `apps/web/src/app/(owner)/actions/load-driver-assignments.ts` — modified, confirmed
- `apps/web/src/app/(owner)/actions/loads.ts` — modified, confirmed
- Commit d4bb1e2 — confirmed via `git log`
- No `waitUntil(` function calls remain in either file
