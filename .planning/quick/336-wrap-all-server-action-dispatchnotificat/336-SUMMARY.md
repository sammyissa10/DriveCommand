---
phase: quick-336
plan: "01"
subsystem: notifications
tags: [notifications, vercel, server-actions, waitUntil, fire-and-forget]
dependency_graph:
  requires: [dispatcher.ts, load-driver-assignments.ts, loads.ts]
  provides: [waitUntil-wrapped dispatchNotification call sites]
  affects: [NotificationSendLog persistence on Vercel serverless]
tech_stack:
  added: ["@vercel/functions ^3.6.0"]
  patterns: ["waitUntil(promise) — Vercel lambda keep-alive for fire-and-forget async work"]
key_files:
  modified:
    - apps/web/package.json
    - apps/web/src/app/(owner)/actions/loads.ts
    - apps/web/src/app/(owner)/actions/load-driver-assignments.ts
decisions:
  - "Use waitUntil from @vercel/functions (official Vercel primitive) rather than void IIFEs or bare .catch() promises, which are silently dropped when the lambda freezes on Server Action return"
  - "Added await inside every waitUntil IIFE so the IIFE promise resolves only when dispatchNotification finishes — ensuring the lambda stays alive long enough"
  - "Did not add try/catch around waitUntil itself per plan constraint — the outer try/catch inside each IIFE handles prefetch failures already"
metrics:
  duration: ~15min
  completed: 2026-05-15
  tasks: 3
  files_modified: 3
---

# Quick Task 336: Wrap Server Action dispatchNotification Sites with waitUntil

**One-liner:** Wrapped all 9 Server Action `dispatchNotification` call sites in `waitUntil` from `@vercel/functions` so Vercel keeps the lambda alive past Server Action return and `NotificationSendLog` rows actually persist in production.

---

## Reasoning Output

### Root Cause

On Vercel serverless, when a Next.js Server Action returns its response (or calls `redirect()`), the lambda freezes immediately. Any pending JavaScript microtasks and macrotasks — including `void (async () => { ... })()` IIFEs and bare `.catch()` promises — are silently dropped. The dispatcher never runs and `NotificationSendLog` stays empty.

`waitUntil(promise)` is the official Vercel primitive: "return the response now, but keep this lambda alive until this promise resolves." It is exposed by `@vercel/functions`.

### All 9 Call Sites Found

| # | File | Trigger key | Category | Line approx |
|---|------|-------------|----------|-------------|
| 1 | loads.ts | `load.created` | Category B: bare promise | ~220 |
| 2 | loads.ts | `load.assigned` | Category A: void IIFE (shares with #3) | ~444 |
| 3 | loads.ts | `load.dispatched` | Category A: void IIFE (shares with #2) | ~458 |
| 4 | loads.ts | `load.picked_up` | Category A: switch case in shared IIFE | ~632 |
| 5 | loads.ts | `load.in_transit` | Category A: switch case in shared IIFE | ~644 |
| 6 | loads.ts | `load.delivered` | Category A: switch case in shared IIFE | ~655 |
| 7 | loads.ts | `load.invoiced` | Category A: switch case in shared IIFE | ~673 |
| 8 | loads.ts | `load.cancelled` | Category A: switch case in shared IIFE | ~686 |
| 9 | load-driver-assignments.ts | `load.assigned` | Category A: void IIFE | ~237 |

**Category A (void IIFE):** 8 sites across 3 IIFEs — `void (async () => { ... })()` pattern. The 2 loads.ts IIFEs each contain multiple dispatch calls (2 and 5 respectively); the load-driver-assignments.ts IIFE contains 1.

**Category B (bare promise):** 1 site — a direct `dispatchNotification(...).catch(...)` with no IIFE wrapping.

**NOT touched (out of scope):**
- `void sendPushToUser(...)` in loads.ts — different system (push notification, not internal dispatcher)
- `sendNotificationAndLogInteraction(...)` calls — customer.* triggers, different system
- All cron routes, mobile API routes, lib/email helpers, dispatcher.ts itself

### Transformation Applied

**Category B (Region 1, loads.ts):**
```
Before: dispatchNotification('load.created', { ... }).catch(err => ...);
After:  waitUntil(dispatchNotification('load.created', { ... }).catch(err => ...));
```

**Category A (Regions 2 & 3 in loads.ts, load-driver-assignments.ts):**
```
Before: void (async () => { ...; dispatchNotification(...).catch(err => ...); })();
After:  waitUntil((async () => { ...; await dispatchNotification(...).catch(err => ...); })());
```

Key mechanical change: `void (async ...` → `waitUntil((async ...`, closing `)()` wrapped inside `waitUntil(...)`, and `await` added before each `dispatchNotification` call so the IIFE promise only resolves when the dispatch is done.

---

## Diff Summary

### apps/web/package.json
- Added: `"@vercel/functions": "^3.6.0"` under `dependencies`
- Lockfile (`package-lock.json` at monorepo root) updated accordingly

### apps/web/src/app/(owner)/actions/loads.ts
- Import added: `import { waitUntil } from '@vercel/functions';`
- **Region 1** (load.created, ~line 220): 1 bare promise → `waitUntil(promise)`
- **Region 2** (load.assigned + load.dispatched, ~lines 435-470): 1 `void (async ...` → `waitUntil((async ...`, `await` added before 2 `dispatchNotification` calls
- **Region 3** (load.picked_up/in_transit/delivered/invoiced/cancelled, ~lines 610-700): 1 `void (async ...` → `waitUntil((async ...`, `await` added before 5 `dispatchNotification` calls
- **Total: 3 `waitUntil` wrappers covering 8 `dispatchNotification` call sites**
- `void sendPushToUser(...)` left completely untouched

### apps/web/src/app/(owner)/actions/load-driver-assignments.ts
- Import added: `import { waitUntil } from '@vercel/functions';`
- **1 site** (load.assigned, ~line 237): `void (async ...` → `waitUntil((async ...`, `await` added before `dispatchNotification`

---

## Verification Results

| Check | Command | Result |
|-------|---------|--------|
| 1. TypeScript | `cd apps/web && npx tsc --noEmit` | PASS — zero errors |
| 2. apps/web build | `cd apps/web && npm run build` | PASS — compiled in 36.4s |
| 3. Monorepo build | `npm run build` (root) | PASS — 4 successful, FULL TURBO |
| 4. Notification unit tests | `cd apps/web && npx vitest run src/lib/notifications/` | PASS — 19/19 tests pass across 3 files (dispatcher.test.ts, recipient-resolver.test.ts, template-renderer.test.ts) |

All 4 gates green.

---

## Spec Amendment Recommendation

The notification spec's caller pattern (lines 141-150 of the spec doc) shows bare-promise `.catch()` which is incorrect for Vercel serverless. The assumption at line 133 that "DriveCommand runs always-on Vercel" is wrong — Server Actions run on serverless lambdas that freeze on return. The spec should be updated to show `waitUntil` as the canonical caller pattern:

```typescript
// CORRECT pattern for Server Actions on Vercel serverless
waitUntil(
  dispatchNotification('event.type', { ... }).catch(err => console.error(...))
);

// OR for async prefetch before dispatch:
waitUntil(
  (async () => {
    try {
      const data = await prefetch();
      await dispatchNotification('event.type', { payload: data, ... }).catch(err => console.error(...));
    } catch (err) {
      console.error('[notifications] prep failed', err);
    }
  })()
);
```

Future phases adding new Server Action dispatch sites should use `waitUntil` from day one, not `void (async ...)()`.

---

## Post-Deploy Smoke Test (Manual — Step 5)

After deploying to Vercel production, verify `NotificationSendLog` rows appear:

1. Create a new load in the owner portal — check `NotificationSendLog` for a `load.created` row
2. Dispatch a load to a driver — check for `load.assigned` + `load.dispatched` rows
3. Update a load status to PICKED_UP — check for `load.picked_up` row
4. Assign a driver via the Load Driver Assignments panel — check for `load.assigned` row (from load-driver-assignments.ts path)

Expected: rows appear within seconds of the Server Action completing. Prior to this fix, the log stayed empty because the lambda froze before the dispatcher ran.

---

## Deviations from Plan

None — plan executed exactly as written. The 9 sites, 3 IIFE wrappers, and 1 bare-promise wrap all matched the plan spec precisely.

---

## Commits

| Hash | Message |
|------|---------|
| 84bdeea | fix(quick-task-336): install @vercel/functions dependency |
| 55f5d4f | fix(quick-task-336): wrap loads.ts dispatchNotification IIFEs with waitUntil |
| 37e2963 | fix(quick-task-336): wrap load-driver-assignments.ts dispatchNotification IIFE with waitUntil + verification gate passes |

## Self-Check: PASSED

- `apps/web/package.json` modified: confirmed (`@vercel/functions ^3.6.0` present)
- `apps/web/src/app/(owner)/actions/loads.ts` modified: confirmed (3 waitUntil, 8 dispatchNotification)
- `apps/web/src/app/(owner)/actions/load-driver-assignments.ts` modified: confirmed (1 waitUntil, 1 dispatchNotification)
- All commits exist in git log: 84bdeea, 55f5d4f, 37e2963
