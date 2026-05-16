---
phase: quick-337
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/actions/load-driver-assignments.ts
  - apps/web/src/app/(owner)/actions/loads.ts
autonomous: false  # final task is checkpoint:human-verify for production smoke test

must_haves:
  truths:
    - "All request-scoped Prisma reads needed by dispatchNotification complete BEFORE waitUntil is invoked"
    - "createAssignment in load-driver-assignments.ts prefetches load + carrierDriver outside waitUntil"
    - "Only dispatchNotification(...).catch(...) runs inside waitUntil — no prisma reads inside the wrap"
    - "Prefetch failures are caught and skip dispatch, never throw out of the action"
    - "TypeScript strict mode passes (`tsc --noEmit`)"
    - "Existing notification vitest suite still passes (19 tests)"
    - "dispatchNotification signature and payload shape are unchanged"
  artifacts:
    - path: "apps/web/src/app/(owner)/actions/load-driver-assignments.ts"
      provides: "createAssignment with prefetch-outside-waitUntil pattern"
      contains: "waitUntil("
    - path: "apps/web/src/app/(owner)/actions/loads.ts"
      provides: "All dispatch sites audited; any IIFE with request-scoped prefetch refactored to same pattern"
      contains: "waitUntil("
  key_links:
    - from: "createAssignment in load-driver-assignments.ts"
      to: "@vercel/functions waitUntil"
      via: "wraps ONLY dispatchNotification call, not the prisma prefetch"
      pattern: "waitUntil\\(\\s*dispatchNotification"
    - from: "createAssignment prefetch block"
      to: "prisma.load.findUnique + prisma.carrierDriver.findUnique"
      via: "Promise.all([...]).catch(() => [null, null] as const) BEFORE waitUntil"
      pattern: "Promise\\.all\\(\\["
---

<objective>
Fix silent dispatch failure shipped in quick-336. Notifications still don't fire in production because the IIFE wrapped by waitUntil starts with prisma reads. The prisma client returned by getTenantPrisma is bound to request-scoped AsyncLocalStorage; after the Server Action returns, that context is gone and the reads silently fail (or hang) before dispatchNotification ever runs.

Purpose: Restructure createAssignment so all request-scoped Prisma reads happen BEFORE waitUntil. Only dispatchNotification — which does its own non-request-scoped work — runs inside the background promise. Audit loads.ts for the same anti-pattern and apply the same fix where applicable.

Output:
- apps/web/src/app/(owner)/actions/load-driver-assignments.ts with prefetch-outside-waitUntil pattern
- apps/web/src/app/(owner)/actions/loads.ts dispatch sites audited and refactored where needed
- All notifications fire after Server Action returns
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Prior quick task that introduced the bug being fixed
@.planning/quick/336-wrap-server-action-dispatchnotification-w/336-SUMMARY.md

# Files being modified
@apps/web/src/app/(owner)/actions/load-driver-assignments.ts
@apps/web/src/app/(owner)/actions/loads.ts

# Files to READ (not modify) for the reasoning step — confirm AsyncLocalStorage / RLS scoping
@apps/web/src/lib/context/tenant-context.ts
@apps/web/src/lib/db/prisma.ts

# Notification dispatcher (read-only — do not change signature)
@apps/web/src/lib/notifications/dispatch.ts

# Test suite that must still pass
@apps/web/__tests__/notifications
</context>

<tasks>

<task type="auto">
  <name>Task 1: Reasoning step — confirm AsyncLocalStorage scoping and choose the correct prisma client</name>
  <files>(read-only investigation — no writes)</files>
  <action>
    BEFORE writing any code, complete the reasoning step from the task brief.

    1. Read apps/web/src/lib/context/tenant-context.ts (or wherever `getTenantPrisma` is defined — grep for `export.*getTenantPrisma` if path differs). Confirm whether it uses AsyncLocalStorage, React `cache()`, or any per-request storage. Quote the 3-5 most relevant lines in a `// REASONING:` comment block at the top of load-driver-assignments.ts (temporary — REMOVE before commit).

    2. Read apps/web/src/lib/db/prisma.ts. Confirm whether there is a non-request-scoped Prisma export (e.g. a singleton without RLS) that the dispatcher already uses. Note its name.

    3. Read apps/web/src/app/(owner)/actions/load-driver-assignments.ts lines ~200-280 to see the current waitUntil block introduced in quick-336.

    4. Read apps/web/src/app/(owner)/actions/loads.ts and grep for `waitUntil(` to enumerate ALL three dispatch sites. For each, classify:
       - Type A: IIFE does prisma reads BEFORE dispatchNotification → needs refactor in Task 2
       - Type B: IIFE is just `waitUntil(dispatchNotification(...).catch(...))` → leave alone

    5. In 2-3 sentences (written into the chat output, not the code), state:
       - Which prisma client the prefetch should use (the same request-scoped `prisma` from `getTenantPrisma()` — because the prefetch runs WITHIN the request scope, before return)
       - Why prefetching before waitUntil is safer than retrying inside waitUntil (request-scoped ALS context is alive before return; gone after)

    Output of this task: a short reasoning summary in the chat AND a list (in chat) of which dispatch sites in loads.ts need refactor (Type A) vs leave alone (Type B).

    DO NOT modify any files in this task. Pure investigation + classification.
  </action>
  <verify>
    Reasoning summary printed to chat with:
    - Confirmation that getTenantPrisma uses request-scoped storage (AsyncLocalStorage or React cache)
    - List of all waitUntil( sites in loads.ts classified as Type A or Type B
    - Decision on which prisma client to use in the prefetch (expected: the same request-scoped one)
  </verify>
  <done>
    Investigator has full mental model of:
    1. Why the current quick-336 fix is silently failing (ALS context lost after action return)
    2. Which dispatch sites need refactor in Task 2
    3. Which prisma client to use in the prefetch
  </done>
</task>

<task type="auto">
  <name>Task 2: Refactor createAssignment + audit loads.ts dispatch sites — prefetch OUTSIDE waitUntil</name>
  <files>
    apps/web/src/app/(owner)/actions/load-driver-assignments.ts
    apps/web/src/app/(owner)/actions/loads.ts
  </files>
  <action>
    Apply the prefetch-outside-waitUntil pattern.

    **load-driver-assignments.ts — createAssignment (lines ~232-271):**

    Replace the current waitUntil(IIFE) block with this exact shape:

    ```typescript
    const created = await prisma.loadDriverAssignment.create({ ... });

    // Prefetch BEFORE waitUntil while request scope is still alive.
    // This avoids AsyncLocalStorage context loss inside the background promise (quick-337).
    const [load, driver] = await Promise.all([
      prisma.load.findUnique({
        where: { id: loadId },
        select: { loadNumber: true, origin: true, destination: true },
      }),
      prisma.carrierDriver.findUnique({
        where: { id: cd.id },
        select: { firstName: true, lastName: true },
      }),
    ]).catch((err) => {
      console.error('[notifications] createAssignment prefetch failed', err);
      return [null, null] as const;
    });

    if (load && driver) {
      // Wrapped in waitUntil so Vercel keeps the lambda alive past the action return (quick-336).
      // ONLY dispatchNotification runs inside waitUntil — all request-scoped reads done above (quick-337).
      waitUntil(
        dispatchNotification('load.assigned', {
          tenantId,
          payload: {
            loadId,
            loadNumber: load.loadNumber,
            driverId: cd.id,
            driverName: `${driver.firstName} ${driver.lastName}`,
            originCity: load.origin,
            destCity: load.destination,
          },
          relatedEntity: { type: 'Load', id: loadId },
        }).catch((err) => console.error('[notifications] load.assigned (createAssignment) dispatch failed', err)),
      );
    }

    revalidatePath(`/carrier/loads/${loadId}`);
    return { data: { id: created.id } };
    ```

    Notes:
    - Preserve the EXACT `console.error('[notifications] load.assigned (createAssignment) dispatch failed', err)` message — do not edit it.
    - The select shape (loadNumber/origin/destination on Load; firstName/lastName on carrierDriver) MUST match what the current IIFE reads — verify against the existing code before deletion.
    - The `as const` on the fallback tuple is required so TypeScript narrows `[load, driver]` to non-null inside the `if` block.
    - Do not replace the variable name `prisma` — use the same client captured at the top of createAssignment.

    **loads.ts — all 3 waitUntil sites:**

    For each Type A site identified in Task 1 (IIFE does prisma prefetch before dispatchNotification), apply the same prefetch-OUTSIDE pattern:
    1. Hoist the prisma reads to BEFORE the waitUntil call
    2. Wrap them in `.catch(() => [null, null, ...] as const)` (or whatever shape — number of reads dictates tuple width)
    3. Guard dispatch with a null check
    4. Wrap ONLY dispatchNotification(...).catch(...) inside waitUntil
    5. Preserve all existing console.error messages verbatim (including event name in the message, e.g. `'[notifications] load.created dispatch failed'`)

    For each Type B site (already just `waitUntil(dispatchNotification(...).catch(...))` with no prefetch inside the wrap) — LEAVE UNTOUCHED.

    **Constraints (re-read before finalizing):**
    - Do NOT change dispatchNotification's signature or payload shape
    - Do NOT modify tenant-context.ts or prisma.ts
    - Do NOT make prefetch failure fail the action — always .catch and skip dispatch
    - Do NOT change the `as const` pattern — TypeScript narrowing depends on it
    - Preserve all existing console.error messages verbatim

    After edits, remove any temporary `// REASONING:` comment block left from Task 1.
  </action>
  <verify>
    1. From C:/Users/sammy/Projects/DriveCommand/apps/web run: `npx tsc --noEmit` → passes with zero errors.
    2. From apps/web run: `npx vitest run __tests__/notifications/` → all 19 tests pass.
    3. Grep load-driver-assignments.ts for `waitUntil(` — confirm the call now wraps ONLY a dispatchNotification expression (no leading prisma reads inside the wrap).
    4. Grep loads.ts for `waitUntil(` — confirm each site either (a) wraps only dispatchNotification, or (b) was already Type B (untouched).
    5. Grep both files for `'[notifications]'` — confirm all original console.error messages survived verbatim.
    6. (Optional, only if structural changes warrant) `npm run build` from apps/web succeeds.
  </verify>
  <done>
    - createAssignment prefetches load + carrierDriver BEFORE waitUntil, with .catch fallback to [null, null] as const
    - dispatch only fires when both load and driver are non-null
    - waitUntil wraps ONLY the dispatchNotification(...).catch(...) call
    - All Type A sites in loads.ts refactored to same pattern; Type B sites unchanged
    - tsc --noEmit clean
    - notification vitest suite green
    - No changes to dispatchNotification signature, tenant-context.ts, or prisma.ts
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Manual production smoke test of load.assigned dispatch</name>
  <what-built>
    createAssignment in load-driver-assignments.ts (and any Type A sites in loads.ts) refactored to prefetch Prisma data BEFORE the waitUntil wrap. waitUntil now contains ONLY the dispatchNotification call. This should resolve the silent dispatch failure where notifications never fire in production despite quick-336 shipping the waitUntil wrap.
  </what-built>
  <how-to-verify>
    Deploy and smoke-test:

    1. From the repo root run: `vercel --prod` (per project deployment rule — never via GitHub push).
    2. Wait for the deploy to go live. Note the production URL.
    3. Log into the owner portal in production.
    4. Assign a driver to an existing load via the UI (this triggers createAssignment).
    5. Check the assigned driver's inbox / notification destination — the `load.assigned` notification should arrive within ~30 seconds.
    6. Open Vercel logs for the deployment and search for `[notifications]`:
       - Expect ZERO `[notifications] createAssignment prefetch failed` entries
       - Expect ZERO `[notifications] load.assigned (createAssignment) dispatch failed` entries
       - Expect to see dispatch success traces (whatever dispatchNotification logs internally)
    7. Repeat for any other event whose Type A site was refactored in Task 2 (e.g. load.created, status changes, etc. — only the ones you actually changed).

    Expected outcome: notifications fire reliably after the Server Action returns. The bug from quick-336 (silent failures) is gone.

    If notifications still don't fire — DO NOT mark approved. Capture the Vercel log lines, paste them back, and we'll diagnose further (likely a different ALS-bound import elsewhere in the call graph).
  </how-to-verify>
  <resume-signal>Type "approved" once a real load assignment in prod has triggered a delivered notification, or paste failure details from Vercel logs.</resume-signal>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` from apps/web passes
- `npx vitest run __tests__/notifications/` from apps/web passes (19 tests)
- Manual production smoke test: assigning a driver to a load delivers a notification within ~30s, with no `[notifications] *failed*` entries in Vercel logs
- Grep confirms waitUntil wraps ONLY dispatchNotification in load-driver-assignments.ts
- All original console.error messages preserved verbatim
- No changes to dispatchNotification, tenant-context.ts, or prisma.ts
</verification>

<success_criteria>
1. createAssignment refactored: prefetch outside waitUntil, dispatch inside, null-guarded
2. loads.ts Type A sites refactored to same pattern; Type B sites untouched
3. TypeScript compiles cleanly
4. Notification test suite still green
5. Production smoke test confirms notifications now fire on driver assignment
6. Zero regressions: no signature changes, no auth/RLS changes, no behavior changes for the happy path beyond the bug fix
</success_criteria>

<output>
After completion, create `.planning/quick/337-fix-silent-dispatch-failure-move-prisma-/337-SUMMARY.md` documenting:
- The reasoning summary from Task 1 (which functions are request-scoped, which prisma client was used)
- Exact lines changed in load-driver-assignments.ts (line ranges before/after)
- Which sites in loads.ts were Type A vs Type B, and which were refactored
- Verification results (tsc, vitest, manual smoke test outcome)
- A short note on the underlying lesson (AsyncLocalStorage + waitUntil interaction) for future reference
</output>
