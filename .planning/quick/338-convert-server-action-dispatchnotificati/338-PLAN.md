---
phase: 338-convert-server-action-dispatchnotificati
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/actions/loads.ts
  - apps/web/src/actions/load-driver-assignments.ts
autonomous: true

must_haves:
  truths:
    - "load.created notification fires synchronously when a new load is created in /loads (NotificationSendLog row written before redirect)"
    - "load.assigned + load.dispatched notifications fire synchronously when dispatchLoad runs (both NotificationSendLog rows written before return)"
    - "load.assigned notification fires synchronously when createAssignment runs in load-driver-assignments.ts (NotificationSendLog row written before return)"
    - "load.picked_up / load.in_transit / load.delivered / load.invoiced / load.cancelled notifications fire synchronously on updateLoadStatus (NotificationSendLog row written before return)"
    - "Neither loads.ts nor load-driver-assignments.ts imports `waitUntil` from '@vercel/functions' after this change"
  artifacts:
    - path: "apps/web/src/actions/loads.ts"
      provides: "Server actions for load CRUD + status updates with synchronous notification dispatch"
      contains: "await dispatchNotification"
    - path: "apps/web/src/actions/load-driver-assignments.ts"
      provides: "Server action for driver assignment with synchronous notification dispatch"
      contains: "await dispatchNotification"
  key_links:
    - from: "apps/web/src/actions/loads.ts"
      to: "dispatchNotification"
      via: "direct await (no waitUntil wrapper)"
      pattern: "await dispatchNotification\\("
    - from: "apps/web/src/actions/load-driver-assignments.ts"
      to: "dispatchNotification"
      via: "direct await (no waitUntil wrapper)"
      pattern: "await dispatchNotification\\("
---

<objective>
Convert all Server Action `dispatchNotification` call sites from `waitUntil(...)` background dispatch to synchronous `await`. Both quick-336 (waitUntil wrap) and quick-337 (prefetch outside waitUntil to fix AsyncLocalStorage) failed in production — zero NotificationSendLog rows written despite successful DB writes. The Vercel + Next.js Server Action runtime silently drops these background promises. Accept the ~1-2s extra response time for guaranteed delivery.

Purpose: Fix the production bug where load lifecycle notifications never fire from Server Actions. Synchronous await is the only pattern proven to work in this runtime.

Output: Two Server Action files updated, `waitUntil` imports removed, all dispatch sites awaited inline before `revalidatePath` / `return` / `redirect`.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@apps/web/src/actions/loads.ts
@apps/web/src/actions/load-driver-assignments.ts
@.planning/quick/336-add-waituntil-wrapper-around-dispatchnoti/336-SUMMARY.md
@.planning/quick/337-fix-asynclocalstorage-context-loss-by-pr/337-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Convert load-driver-assignments.ts dispatch to await</name>
  <files>apps/web/src/actions/load-driver-assignments.ts</files>
  <action>
Convert the single `load.assigned` dispatch site in `createAssignment` (around lines 238-275) from `waitUntil(...)` to a synchronous `await`.

Concrete changes:

1. Remove the `waitUntil` import at line 14:
   ```typescript
   import { waitUntil } from '@vercel/functions';
   ```
   Delete this entire line. Verify no other `waitUntil(` usages remain in this file before deletion.

2. In the `if (load && driver) { ... }` block, replace:
   ```typescript
   // Wrapped in waitUntil so Vercel keeps the lambda alive past the action return (quick-336).
   // ONLY dispatchNotification runs inside waitUntil — all request-scoped reads done above (quick-337).
   waitUntil(
     dispatchNotification('load.assigned', {
       tenantId,
       payload: { ... },
       relatedEntity: { type: 'Load', id: loadId },
     }).catch((err) => console.error('[notifications] load.assigned (createAssignment) dispatch failed', err)),
   );
   ```
   with:
   ```typescript
   // Synchronous await — quick-336 (waitUntil wrap) and quick-337 (prefetch outside waitUntil) both
   // failed in production with zero NotificationSendLog rows. The Vercel + Next.js Server Action
   // runtime silently drops background promises here. Accept the ~1-2s extra latency for guaranteed
   // delivery (quick-338).
   await dispatchNotification('load.assigned', {
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
   }).catch((err) => console.error('[notifications] load.assigned (createAssignment) dispatch failed', err));
   ```

3. Confirm the prefetch `Promise.all([prisma.load.findUnique, prisma.carrierDriver.findUnique])` block stays exactly where it is — it's now redundant guarding (await would work inside request scope anyway) but keep it: it's still the cleanest way to fetch both records in parallel and the `.catch` returning `[null, null]` keeps the dispatch optional.

4. Verify the `await dispatchNotification(...)` call happens BEFORE `revalidatePath(\`/carrier/loads/${loadId}\`);` and BEFORE `return { data: { id: created.id } };`.

Do NOT touch any other functions or unrelated logic in this file.
  </action>
  <verify>
- `pnpm tsc --noEmit --project apps/web` passes with no new errors
- `grep -n "waitUntil" apps/web/src/actions/load-driver-assignments.ts` returns no matches
- `grep -n "await dispatchNotification" apps/web/src/actions/load-driver-assignments.ts` returns exactly one match in `createAssignment`
  </verify>
  <done>
- `waitUntil` import removed from load-driver-assignments.ts
- The single dispatch in `createAssignment` is `await`ed before `revalidatePath` and `return`
- TypeScript compiles
- Comment references quick-338 and explains synchronous-await rationale
  </done>
</task>

<task type="auto">
  <name>Task 2: Convert loads.ts dispatch sites to await (all 3 sites)</name>
  <files>apps/web/src/actions/loads.ts</files>
  <action>
Convert all three `waitUntil(...)` dispatch sites in loads.ts to synchronous `await`. Remove the `waitUntil` import.

Concrete changes:

1. Remove the import at line 21:
   ```typescript
   import { waitUntil } from '@vercel/functions';
   ```
   Verify no other `waitUntil(` usages remain in this file after the three replacements below.

2. **Site 1 — load.created (around lines 220-236)**. Replace:
   ```typescript
   // Fire-and-forget — never block redirect (Phase 41 wire-up, quick-325)
   // Wrapped in waitUntil so Vercel keeps the lambda alive past the redirect (quick-336)
   waitUntil(
     dispatchNotification('load.created', {
       tenantId: createdTenantId!,
       payload: { ... },
       relatedEntity: { type: 'Load', id: createdId! },
     }).catch((err) => console.error('[notifications] load.created dispatch failed', err)),
   );

   revalidatePath('/loads');
   redirect(`/loads/${createdId!}`);
   ```
   with:
   ```typescript
   // Synchronous await — quick-336 + quick-337 background dispatch both failed in production
   // (zero NotificationSendLog rows). Await before revalidatePath/redirect so the lambda doesn't
   // exit before delivery completes (quick-338). Adds ~1-2s but guarantees the notification fires.
   await dispatchNotification('load.created', {
     tenantId: createdTenantId!,
     payload: {
       loadId: createdId!,
       loadNumber: createdLoadNumber!,
       originCity: createdOrigin!,
       destCity: createdDestination!,
     },
     relatedEntity: { type: 'Load', id: createdId! },
   }).catch((err) => console.error('[notifications] load.created dispatch failed', err));

   revalidatePath('/loads');
   redirect(`/loads/${createdId!}`);
   ```
   CRITICAL: The `await` must execute BEFORE `redirect()` because `redirect()` throws and aborts the function. Place it as shown above.

3. **Site 2 — load.assigned + load.dispatched combined (around lines 437-484)**. Replace:
   ```typescript
   // Wrapped in waitUntil so Vercel keeps the lambda alive past the redirect (quick-336).
   // ONLY dispatchNotification runs inside waitUntil — all request-scoped reads done above (quick-337).
   waitUntil(
     Promise.all([
       dispatchNotification('load.assigned', { ... })
         .catch((err) => console.error('[notifications] load.assigned dispatch failed', err)),
       dispatchNotification('load.dispatched', { ... })
         .catch((err) => console.error('[notifications] load.dispatched dispatch failed', err)),
     ]),
   );
   ```
   with:
   ```typescript
   // Synchronous await — quick-336 + quick-337 background dispatch both failed in production
   // (zero NotificationSendLog rows). Await before return so the lambda doesn't exit before
   // delivery (quick-338). Promise.all runs both dispatches in parallel; ~1-2s total.
   await Promise.all([
     dispatchNotification('load.assigned', {
       tenantId: tId,
       payload: {
         loadId: id,
         loadNumber: load.loadNumber,
         driverId: result.data.driverId,
         driverName,
         originCity: load.origin,
         destCity: load.destination,
       },
       relatedEntity: { type: 'Load', id },
     }).catch((err) => console.error('[notifications] load.assigned dispatch failed', err)),

     dispatchNotification('load.dispatched', {
       tenantId: tId,
       payload: {
         loadId: id,
         loadNumber: load.loadNumber,
         driverName,
       },
       relatedEntity: { type: 'Load', id },
     }).catch((err) => console.error('[notifications] load.dispatched dispatch failed', err)),
   ]);
   ```
   Keep the prefetch of `dispatchDriver` and the `if (dispatchDriver !== null)` guard exactly as-is.

4. **Site 3 — updateLoadStatus IIFE with notifPromise (around lines 624-722)**. Find the line:
   ```typescript
   waitUntil(notifPromise);
   ```
   and replace with:
   ```typescript
   // Synchronous await — quick-336 + quick-337 background dispatch both failed in production
   // (zero NotificationSendLog rows). Await before return so the lambda doesn't exit before
   // delivery (quick-338). notifPromise is the resolved status-switch promise built above.
   await notifPromise;
   ```
   Keep the entire IIFE / switch-statement that BUILDS `notifPromise` (PICKED_UP → load.picked_up, IN_TRANSIT → load.in_transit, DELIVERED → load.delivered, INVOICED → load.invoiced, CANCELLED → load.cancelled) exactly as-is. Only the final `waitUntil(notifPromise)` line changes.

5. Verify each `await` is positioned BEFORE the subsequent `revalidatePath` / `return` / `redirect` in its enclosing function.

Do NOT alter `sendNotificationAndLogInteraction` calls or any customer.* triggers — those are already awaited synchronously and are out of scope for this task.
  </action>
  <verify>
- `pnpm tsc --noEmit --project apps/web` passes with no new errors
- `grep -n "waitUntil" apps/web/src/actions/loads.ts` returns no matches
- `grep -cn "await dispatchNotification" apps/web/src/actions/loads.ts` returns at least 3 (load.created + load.assigned + load.dispatched; the IIFE one uses `await notifPromise`)
- `grep -n "await notifPromise" apps/web/src/actions/loads.ts` returns exactly one match in updateLoadStatus
- `pnpm --filter web lint` passes (or whatever the project's lint command is)
  </verify>
  <done>
- `waitUntil` import removed from loads.ts
- All three sites converted to `await` placed before revalidatePath/return/redirect
- TypeScript compiles, lint clean
- Comments at each site reference quick-338 and explain why synchronous await is needed
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Verify notifications fire end-to-end in production</name>
  <what-built>
Converted 4 dispatch sites across 2 Server Action files from `waitUntil(...)` background dispatch to synchronous `await`:
- load-driver-assignments.ts → createAssignment → load.assigned
- loads.ts → createLoad → load.created
- loads.ts → dispatchLoad → load.assigned + load.dispatched
- loads.ts → updateLoadStatus → load.picked_up | in_transit | delivered | invoiced | cancelled
Removed the `waitUntil` import from both files.
  </what-built>
  <how-to-verify>
1. Deploy to production: `vercel --prod` (from project root). Wait for deploy to complete.
2. Open the production app in the browser, log in as an owner.
3. **Test load.created**:
   - Create a new load from /loads.
   - Wait 5 seconds.
   - Open Supabase Studio → NotificationSendLog table → filter `triggerType = 'load.created'`, sort by createdAt desc.
   - Expected: a fresh row exists with `status = 'sent'` or `status = 'queued'` matching the load you just created.
4. **Test load.assigned + load.dispatched**:
   - On the load you just created, click "Dispatch" / assign a driver and dispatch.
   - Wait 5 seconds.
   - Check NotificationSendLog for two new rows: one `triggerType = 'load.assigned'` and one `triggerType = 'load.dispatched'`, both referencing that load's id.
5. **Test status transitions**:
   - From the load detail page, advance the status (e.g., to PICKED_UP, then IN_TRANSIT, then DELIVERED).
   - After each status change, wait 5 seconds and confirm a new NotificationSendLog row exists with the corresponding triggerType (`load.picked_up`, `load.in_transit`, `load.delivered`).
6. **Test driver assignment via carrier portal** (if applicable):
   - Use the carrier portal createAssignment flow.
   - Confirm a `load.assigned` row appears in NotificationSendLog.
7. Open Vercel logs for the deploy and confirm there are NO `[notifications] ... dispatch failed` error lines.
8. Confirm response time is acceptable (load create/dispatch may take 1-2s longer than before — this is expected).

If any of steps 3-6 fail (no NotificationSendLog row), STOP and report the failing trigger. Otherwise approve.
  </how-to-verify>
  <resume-signal>Type "approved" if all notifications fire, or describe which trigger failed and any Vercel log errors.</resume-signal>
</task>

</tasks>

<verification>
- TypeScript: `pnpm tsc --noEmit --project apps/web` clean
- Lint: project lint command clean for both files
- `grep -rn "waitUntil" apps/web/src/actions/loads.ts apps/web/src/actions/load-driver-assignments.ts` returns no matches
- Production smoke test (Task 3): all 4+ notification triggerTypes write NotificationSendLog rows after the corresponding Server Action runs
</verification>

<success_criteria>
- Both files have `waitUntil` import removed
- All 4 dispatch sites use synchronous `await` placed before revalidatePath/return/redirect
- TypeScript and lint pass
- Production NotificationSendLog table records rows for load.created, load.assigned, load.dispatched, and the load.{status} family after their respective Server Actions run
- No `[notifications] ... dispatch failed` errors in Vercel logs
</success_criteria>

<output>
After completion, create `.planning/quick/338-convert-server-action-dispatchnotificati/338-SUMMARY.md` documenting:
- The 4 dispatch sites converted (file + function + triggerType)
- The exact lines changed (before/after pattern)
- Production verification result (which triggerTypes confirmed in NotificationSendLog)
- Measured response time delta (if observable) for createLoad and dispatchLoad
- Reference to the failed predecessors (quick-336, quick-337) and why background dispatch doesn't work in this runtime
</output>
