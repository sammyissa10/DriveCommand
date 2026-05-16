---
phase: quick-336
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/package.json
  - apps/web/src/app/(owner)/actions/load-driver-assignments.ts
  - apps/web/src/app/(owner)/actions/loads.ts
autonomous: true

must_haves:
  truths:
    - "@vercel/functions package is installed in apps/web"
    - "Every Server Action dispatchNotification call site is wrapped in waitUntil"
    - "Vercel runtime keeps the lambda alive until each dispatchNotification promise resolves"
    - "Notifications fired from Server Actions are persisted to NotificationSendLog"
    - "TypeScript compiles with zero errors (strict mode, no any)"
    - "Existing notification dispatcher unit tests still pass unchanged"
  artifacts:
    - path: "apps/web/package.json"
      provides: "@vercel/functions dependency declaration"
      contains: "@vercel/functions"
    - path: "apps/web/src/app/(owner)/actions/load-driver-assignments.ts"
      provides: "load.assigned dispatch wrapped in waitUntil"
      contains: "waitUntil"
    - path: "apps/web/src/app/(owner)/actions/loads.ts"
      provides: "8 dispatchNotification sites wrapped in waitUntil (created/assigned/dispatched/picked_up/in_transit/delivered/invoiced/cancelled)"
      contains: "waitUntil"
  key_links:
    - from: "apps/web/src/app/(owner)/actions/loads.ts"
      to: "@vercel/functions"
      via: "named import { waitUntil }"
      pattern: "import.*waitUntil.*from ['\"]@vercel/functions['\"]"
    - from: "apps/web/src/app/(owner)/actions/load-driver-assignments.ts"
      to: "@vercel/functions"
      via: "named import { waitUntil }"
      pattern: "import.*waitUntil.*from ['\"]@vercel/functions['\"]"
    - from: "waitUntil wrapper"
      to: "dispatchNotification"
      via: "awaited inside async IIFE OR inline as the promise argument"
      pattern: "waitUntil\\("
---

<objective>
Wrap every Server Action `dispatchNotification` call site with `waitUntil` from `@vercel/functions` so Vercel keeps the lambda alive long enough for notification work to actually run after the action returns to the client.

Purpose: Today, on Vercel serverless, when a Server Action returns its response the lambda freezes immediately. The current `void (async () => { ... })()` and bare-promise `dispatchNotification(...).catch(...)` patterns are silently dropped — the dispatcher never runs and `NotificationSendLog` stays empty. `waitUntil` is the official Vercel primitive: "return the response now, but keep this lambda alive until this promise resolves."

Output: `@vercel/functions` installed, 9 Server Action dispatch sites wrapped in `waitUntil`, TypeScript clean, monorepo build green, existing dispatcher tests still passing.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/app/(owner)/actions/loads.ts
@apps/web/src/app/(owner)/actions/load-driver-assignments.ts
@apps/web/src/lib/notifications/dispatcher.ts
@apps/web/package.json
</context>

<scope_boundaries>
IN SCOPE (Server Action dispatch sites — 9 total):
- apps/web/src/app/(owner)/actions/load-driver-assignments.ts:251 — load.assigned (Category A: void IIFE)
- apps/web/src/app/(owner)/actions/loads.ts:220 — load.created (Category B: bare promise)
- apps/web/src/app/(owner)/actions/loads.ts:444 — load.assigned (Category A: shares IIFE with :458)
- apps/web/src/app/(owner)/actions/loads.ts:458 — load.dispatched (Category A: shares IIFE with :444)
- apps/web/src/app/(owner)/actions/loads.ts:632 — load.picked_up (Category A: switch case in shared IIFE wrapping :632–:694)
- apps/web/src/app/(owner)/actions/loads.ts:644 — load.in_transit (Category A: switch case in shared IIFE)
- apps/web/src/app/(owner)/actions/loads.ts:655 — load.delivered (Category A: switch case in shared IIFE)
- apps/web/src/app/(owner)/actions/loads.ts:673 — load.invoiced (Category A: switch case in shared IIFE)
- apps/web/src/app/(owner)/actions/loads.ts:686 — load.cancelled (Category A: switch case in shared IIFE)

NOTE: The 6 IIFE-wrapped switch sites in loads.ts (:444+:458 share one IIFE, :632–:694 share another) become 2 `waitUntil(...)` calls total — one per IIFE — not 6.

OUT OF SCOPE (do NOT touch):
- apps/web/src/app/api/cron/**  — long-lived cron handlers; request stays alive on its own
- apps/web/src/app/api/mobile/** — API route handlers; request stays alive on its own
- apps/web/src/lib/notifications/dispatcher.ts — the dispatcher itself
- apps/web/src/lib/email/** — these `await` dispatchNotification inline (Category C); already correct
- apps/web/src/lib/notifications/__tests__/** — test files unchanged
- Payload shapes, trigger keys, prefetch logic — preserved exactly

CONSTRAINTS:
- TypeScript strict mode, no `any`
- Do not add try/catch around `waitUntil` itself
- Keep `.catch()` error logging on the promises
- Keep outer try/catch for prefetch failures
</scope_boundaries>

<tasks>

<task type="auto">
  <name>Task 1: Install @vercel/functions in apps/web</name>
  <files>apps/web/package.json</files>
  <action>
    Add `@vercel/functions` as a runtime dependency of `apps/web` so `waitUntil` is importable from Server Action files.

    Run from the monorepo root:
    ```
    cd apps/web && npm install @vercel/functions
    ```

    This is a tiny, official Vercel package (~zero deps) that exposes `waitUntil`. Pinning is fine — accept whatever the latest stable version is.

    After install, verify:
    1. `apps/web/package.json` has `"@vercel/functions": "^x.y.z"` under `dependencies`
    2. `apps/web/node_modules/@vercel/functions` exists
    3. The named export `waitUntil` is available — quick check: `node -e "console.log(require('@vercel/functions').waitUntil)"` from `apps/web` prints a function

    Do NOT install at the monorepo root — it must be in `apps/web` so Next.js resolves it during the Vercel build.
  </action>
  <verify>
    From `apps/web/`:
    - `cat package.json | grep "@vercel/functions"` returns the dependency line
    - `node -e "const { waitUntil } = require('@vercel/functions'); console.log(typeof waitUntil)"` prints `function`
  </verify>
  <done>
    `@vercel/functions` is listed under `dependencies` in `apps/web/package.json` and resolves at runtime.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wrap loads.ts dispatch sites in waitUntil (8 sites across 3 IIFEs/promises)</name>
  <files>apps/web/src/app/(owner)/actions/loads.ts</files>
  <action>
    Add `import { waitUntil } from '@vercel/functions';` to the top of the file (after the other imports, near the existing `dispatchNotification` import on line 20).

    Then convert THREE distinct fire-and-forget regions:

    REGION 1 — line ~220, `createLoad` action (Category B: bare promise)
    Before:
    ```ts
    // Fire-and-forget — never block redirect (Phase 41 wire-up, quick-325)
    dispatchNotification('load.created', {
      tenantId: createdTenantId!,
      payload: { ... },
      relatedEntity: { type: 'Load', id: createdId! },
    }).catch((err) => console.error('[notifications] load.created dispatch failed', err));
    ```
    After:
    ```ts
    // Fire-and-forget — never block redirect (Phase 41 wire-up, quick-325)
    // Wrapped in waitUntil so Vercel keeps the lambda alive past the redirect (quick-336)
    waitUntil(
      dispatchNotification('load.created', {
        tenantId: createdTenantId!,
        payload: { ... },
        relatedEntity: { type: 'Load', id: createdId! },
      }).catch((err) => console.error('[notifications] load.created dispatch failed', err)),
    );
    ```

    REGION 2 — lines ~435–470, `dispatchLoad` action (Category A: void IIFE wrapping `load.assigned` AND `load.dispatched`)
    Before:
    ```ts
    void (async () => {
      try {
        const driver = await prisma.user.findUnique({ ... });
        const driverName = driver ? ... : 'Driver';
        // Notify the assigned driver
        dispatchNotification('load.assigned', { ... })
          .catch((err) => console.error('[notifications] load.assigned dispatch failed', err));
        // Notify the owner of dispatch
        dispatchNotification('load.dispatched', { ... })
          .catch((err) => console.error('[notifications] load.dispatched dispatch failed', err));
      } catch (err) {
        console.error('[notifications] dispatchLoad notif prep failed', err);
      }
    })();
    ```
    After:
    ```ts
    waitUntil(
      (async () => {
        try {
          const driver = await prisma.user.findUnique({ ... });
          const driverName = driver ? ... : 'Driver';
          // Notify the assigned driver
          await dispatchNotification('load.assigned', { ... })
            .catch((err) => console.error('[notifications] load.assigned dispatch failed', err));
          // Notify the owner of dispatch
          await dispatchNotification('load.dispatched', { ... })
            .catch((err) => console.error('[notifications] load.dispatched dispatch failed', err));
        } catch (err) {
          console.error('[notifications] dispatchLoad notif prep failed', err);
        }
      })(),
    );
    ```
    Key changes: `void (async ...` → `waitUntil((async ...`, add `await` before each `dispatchNotification`, close with `)(),)` to invoke the IIFE and pass it to `waitUntil`.

    REGION 3 — lines ~610–700, `updateLoadStatus` action (Category A: void IIFE wrapping the entire switch on `newStatus`)
    Before:
    ```ts
    void (async () => {
      try {
        const loadDetail = await prisma.load.findUnique({ ... });
        if (!loadDetail) return;
        const driverName = ...;
        const nowFormatted = ...;
        switch (newStatus) {
          case 'PICKED_UP':
            dispatchNotification('load.picked_up', { ... })
              .catch((err) => console.error('[notifications] load.picked_up dispatch failed', err));
            break;
          case 'IN_TRANSIT':
            dispatchNotification('load.in_transit', { ... })
              .catch((err) => console.error('[notifications] load.in_transit dispatch failed', err));
            break;
          case 'DELIVERED':
            dispatchNotification('load.delivered', { ... })
              .catch((err) => console.error('[notifications] load.delivered dispatch failed', err));
            break;
          case 'INVOICED': {
            const invoice = await prisma.invoice.findFirst({ ... });
            dispatchNotification('load.invoiced', { ... })
              .catch((err) => console.error('[notifications] load.invoiced dispatch failed', err));
            break;
          }
          case 'CANCELLED':
            dispatchNotification('load.cancelled', { ... })
              .catch((err) => console.error('[notifications] load.cancelled dispatch failed', err));
            break;
        }
      } catch (err) {
        console.error('[notifications] updateLoadStatus notif prep failed', err);
      }
    })();
    ```
    After: same transformation pattern as Region 2 — wrap in `waitUntil((async () => { ... })())` and add `await` before EACH of the 5 `dispatchNotification` calls inside the switch (PICKED_UP, IN_TRANSIT, DELIVERED, INVOICED, CANCELLED).

    PRESERVE EXACTLY:
    - All payload object shapes (do not edit any field)
    - Trigger keys ('load.created', 'load.assigned', 'load.dispatched', 'load.picked_up', 'load.in_transit', 'load.delivered', 'load.invoiced', 'load.cancelled')
    - All prefetch logic (`prisma.user.findUnique`, `prisma.load.findUnique`, `prisma.invoice.findFirst`)
    - All `.catch((err) => console.error(...))` error log strings
    - All outer try/catch blocks for prefetch failure logging
    - The unrelated `void sendPushToUser(...)` call near line 473 — leave it alone (different system)
    - The unrelated `sendNotificationAndLogInteraction(...)` calls — leave them alone (different system, customer.* triggers)

    DO NOT add `try/catch` around `waitUntil` itself.
  </action>
  <verify>
    From `apps/web/`:
    - `npx tsc --noEmit` returns zero errors
    - `grep -c "waitUntil(" src/app/\(owner\)/actions/loads.ts` returns at least 3 (one per region)
    - `grep -c "dispatchNotification(" src/app/\(owner\)/actions/loads.ts` returns 8 (unchanged count)
    - `grep "void (async" src/app/\(owner\)/actions/loads.ts` returns no notification-related matches (the two notification IIFEs are gone). The `void sendPushToUser(...)` line should still exist — that's a different fire-and-forget and stays untouched.
    - `grep "import.*waitUntil.*@vercel/functions" src/app/\(owner\)/actions/loads.ts` returns the import line
  </verify>
  <done>
    All 8 `dispatchNotification` sites in `loads.ts` execute under `waitUntil`. TypeScript compiles. Trigger keys, payload shapes, and prefetch logic are byte-identical to before.
  </done>
</task>

<task type="auto">
  <name>Task 3: Wrap load-driver-assignments.ts dispatch site + verify build & tests</name>
  <files>apps/web/src/app/(owner)/actions/load-driver-assignments.ts</files>
  <action>
    PART A — Wrap the single dispatch site in `load-driver-assignments.ts`:

    Add `import { waitUntil } from '@vercel/functions';` to the top of the file (next to the existing `dispatchNotification` import on line 13).

    Convert the void IIFE in `createAssignment` (lines ~237–266, Category A):

    Before:
    ```ts
    // Fire-and-forget — Phase 41 wire-up (quick-325)
    void (async () => {
      try {
        const [load, driver] = await Promise.all([ ... ]);
        if (!load || !driver) return;
        dispatchNotification('load.assigned', {
          tenantId,
          payload: { ... },
          relatedEntity: { type: 'Load', id: loadId },
        }).catch((err) => console.error('[notifications] load.assigned (createAssignment) dispatch failed', err));
      } catch (err) {
        console.error('[notifications] createAssignment notif prep failed', err);
      }
    })();
    ```

    After:
    ```ts
    // Fire-and-forget — Phase 41 wire-up (quick-325)
    // Wrapped in waitUntil so Vercel keeps the lambda alive past the action return (quick-336)
    waitUntil(
      (async () => {
        try {
          const [load, driver] = await Promise.all([ ... ]);
          if (!load || !driver) return;
          await dispatchNotification('load.assigned', {
            tenantId,
            payload: { ... },
            relatedEntity: { type: 'Load', id: loadId },
          }).catch((err) => console.error('[notifications] load.assigned (createAssignment) dispatch failed', err));
        } catch (err) {
          console.error('[notifications] createAssignment notif prep failed', err);
        }
      })(),
    );
    ```

    Key changes: `void (async ...` → `waitUntil((async ...`, `add `await` before `dispatchNotification`, close with `)(),)`.

    Preserve exactly: the `Promise.all` prefetch, the `if (!load || !driver) return;` guard, the payload, the trigger key, the `.catch()` error string, the outer try/catch.

    PART B — Final verification gate. Run all four checks and confirm zero errors:
    1. From `apps/web/`: `npx tsc --noEmit` → zero errors
    2. From `apps/web/`: `npm run build` → succeeds
    3. From monorepo root: `npm run build` → succeeds (turborepo)
    4. From `apps/web/`: `npx vitest run src/lib/notifications/` → all pass

    Note on test path: the original task description says `__tests__/notifications/` but the actual location is `apps/web/src/lib/notifications/__tests__/` (3 files: dispatcher.test.ts, recipient-resolver.test.ts, template-renderer.test.ts). Use the real path.

    If any check fails, fix the issue before declaring done. Common pitfalls:
    - Forgot to add `await` before `dispatchNotification` inside the new IIFEs → the wrapping promise resolves immediately, defeating the point of `waitUntil`
    - Wrong import path (`@vercel/functions` not `@vercel/node` or `next/server`)
    - Trailing comma issues in the new `waitUntil(...)` calls — TS will complain
  </action>
  <verify>
    From `apps/web/`:
    - `grep -c "waitUntil(" src/app/\(owner\)/actions/load-driver-assignments.ts` returns 1
    - `grep "import.*waitUntil.*@vercel/functions" src/app/\(owner\)/actions/load-driver-assignments.ts` returns the import line
    - `npx tsc --noEmit` → exit code 0
    - `npm run build` → exit code 0
    - `npx vitest run src/lib/notifications/` → all tests pass

    From monorepo root:
    - `npm run build` → exit code 0
  </verify>
  <done>
    All 9 Server Action `dispatchNotification` sites are now wrapped in `waitUntil`. TypeScript clean, apps/web builds, monorepo builds, dispatcher unit tests pass. The next time an owner creates/dispatches/updates a load on production Vercel, the dispatcher actually runs to completion and `NotificationSendLog` rows appear.
  </done>
</task>

</tasks>

<verification>
End-to-end checks (run from `apps/web/` unless noted):

1. Imports present:
   - `grep -l "waitUntil.*@vercel/functions" src/app/\(owner\)/actions/loads.ts src/app/\(owner\)/actions/load-driver-assignments.ts` lists both files

2. Total `waitUntil(` call count:
   - `grep -rc "waitUntil(" src/app/\(owner\)/actions/` shows: loads.ts ≥ 3, load-driver-assignments.ts ≥ 1

3. Total `dispatchNotification(` call count unchanged in Server Actions:
   - loads.ts: 8 calls
   - load-driver-assignments.ts: 1 call

4. No notification-related `void (async ...)()` IIFEs remain in either Server Action file. (`void sendPushToUser(...)` in loads.ts is allowed — different system.)

5. No files outside scope were touched:
   - `git status --short` should show only `apps/web/package.json`, `apps/web/package-lock.json` (or pnpm/yarn lockfile), `apps/web/src/app/(owner)/actions/loads.ts`, `apps/web/src/app/(owner)/actions/load-driver-assignments.ts` modified

6. TypeScript: `npx tsc --noEmit` exit 0
7. Web build: `npm run build` from `apps/web/` exit 0
8. Monorepo build: `npm run build` from repo root exit 0
9. Dispatcher tests: `npx vitest run src/lib/notifications/` all green
</verification>

<success_criteria>
- `@vercel/functions` is a dependency of `apps/web`
- 9 Server Action `dispatchNotification` call sites wrapped in `waitUntil` (1 in load-driver-assignments.ts, 8 in loads.ts across 3 wrappers)
- Inside every IIFE wrapped by `waitUntil`, each `dispatchNotification` is `await`ed (so the IIFE promise resolves only when the dispatcher finishes)
- Zero TypeScript errors
- `apps/web` and monorepo root both build successfully
- Existing notification dispatcher unit tests still pass
- Cron routes, mobile API routes, lib/email helpers, and dispatcher.ts are untouched
- Trigger keys, payload shapes, prefetch logic, and error log strings are byte-identical to before
</success_criteria>

<output>
After completion, create `.planning/quick/336-wrap-all-server-action-dispatchnotificat/336-SUMMARY.md` documenting:
- The 9 sites wrapped (file:line → trigger key)
- The 3 IIFE/promise regions converted in loads.ts and the 1 in load-driver-assignments.ts
- @vercel/functions version installed
- Verification command outputs (tsc, build x2, vitest)
- Note that NotificationSendLog should now populate on next production dispatch
</output>
