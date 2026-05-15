---
phase: quick-325
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/actions/loads.ts
  - apps/web/src/app/(owner)/actions/load-driver-assignments.ts
  - apps/web/src/app/(owner)/actions/load-documents.ts
  - apps/web/src/app/api/mobile/driver/loads/[id]/status/route.ts
  - apps/web/prisma/seeds/notification-template-data/user.ts
  - apps/web/prisma/seeds/notification-template-data/route.ts
autonomous: false

must_haves:
  truths:
    - "createLoad fires dispatchNotification('load.created', { tenantId, payload, relatedEntity: { type:'Load', id } }) AFTER the load row commits and BEFORE redirect"
    - "createAssignment fires dispatchNotification('load.assigned', ...) after the assignment row commits"
    - "dispatchLoad fires BOTH 'load.assigned' (for the newly assigned driver) AND 'load.dispatched' (for the owner) after the status update commits"
    - "updateLoadStatus fires the matching load.* trigger for each terminal status branch (PICKED_UP / IN_TRANSIT / DELIVERED / INVOICED / CANCELLED)"
    - "Mobile status route fires load.in_transit (when driver moves DISPATCHED→IN_TRANSIT) and load.delivered (when driver moves IN_TRANSIT→DELIVERED) AFTER the bypass_rls transaction commits"
    - "uploadLoadDocument fires load.bol_uploaded ONLY when documentType=='BOL', load.pod_uploaded ONLY when documentType=='POD', and nothing for RATE_CONFIRMATION or any other type"
    - "Every dispatchNotification call passes tenantId, a fully-typed payload matching NotificationPayload[K], and relatedEntity { type:'Load', id: loadId }"
    - "Every dispatchNotification call uses fire-and-forget .catch() — never awaited — so notifications cannot slow down or fail the parent server action"
    - "The pre-existing customer.tracking_link_sent and customer.delivered_notification calls inside sendNotificationAndLogInteraction remain untouched and continue firing alongside the new internal load.* triggers"
    - "NotificationTemplate rows for triggerKey IN ('user.welcome', 'user.password_reset', 'route.delayed') have isActive=false in production"
    - "Re-running npm run seed:notifications does NOT flip those three rows back to isActive=true (seed runner's UPDATE branch already excludes isActive — verified at line 112 of seed-notifications.ts)"
    - "Each of the three deactivated seed entries has a code comment explaining WHY it's deactivated"
    - "tsc --noEmit clean and npm run build local pass"
  artifacts:
    - path: "apps/web/src/app/(owner)/actions/loads.ts"
      provides: "5 new dispatchNotification call sites: createLoad → load.created; dispatchLoad → load.assigned + load.dispatched; updateLoadStatus → load.picked_up / load.in_transit / load.delivered / load.invoiced / load.cancelled"
      contains: "dispatchNotification('load."
    - path: "apps/web/src/app/(owner)/actions/load-driver-assignments.ts"
      provides: "1 new dispatchNotification call inside createAssignment for load.assigned"
      contains: "dispatchNotification('load.assigned'"
    - path: "apps/web/src/app/(owner)/actions/load-documents.ts"
      provides: "Type-conditional dispatch in uploadLoadDocument: load.bol_uploaded for BOL, load.pod_uploaded for POD, nothing otherwise"
      contains: "dispatchNotification('load.bol_uploaded'"
    - path: "apps/web/src/app/api/mobile/driver/loads/[id]/status/route.ts"
      provides: "Mobile dispatch for load.in_transit and load.delivered after the bypass_rls transaction commits"
      contains: "dispatchNotification('load.in_transit'"
    - path: "apps/web/prisma/seeds/notification-template-data/user.ts"
      provides: "isActive: false on user.welcome and user.password_reset entries with explanatory comments"
      contains: "Supabase Auth sends these natively"
    - path: "apps/web/prisma/seeds/notification-template-data/route.ts"
      provides: "isActive: false on route.delayed entry with explanatory comment"
      contains: "No automated delay detection"
  key_links:
    - from: "apps/web/src/app/(owner)/actions/loads.ts (createLoad)"
      to: "apps/web/src/lib/notifications/dispatcher.ts"
      via: "dispatchNotification('load.created', { tenantId, payload, relatedEntity: { type:'Load', id: createdId } }).catch(...)"
      pattern: "dispatchNotification\\('load\\.created'"
    - from: "apps/web/src/app/(owner)/actions/loads.ts (dispatchLoad)"
      to: "apps/web/src/lib/notifications/dispatcher.ts"
      via: "Two dispatchNotification calls — load.assigned (driver) and load.dispatched (owner)"
      pattern: "dispatchNotification\\('load\\.(assigned|dispatched)'"
    - from: "apps/web/src/app/(owner)/actions/loads.ts (updateLoadStatus)"
      to: "apps/web/src/lib/notifications/dispatcher.ts"
      via: "Switch on newStatus — one dispatchNotification per terminal branch"
      pattern: "dispatchNotification\\('load\\.(picked_up|in_transit|delivered|invoiced|cancelled)'"
    - from: "apps/web/src/app/api/mobile/driver/loads/[id]/status/route.ts"
      to: "apps/web/src/lib/notifications/dispatcher.ts"
      via: "After tx commits, switch on newDbStatus → dispatchNotification with auth.tenantId"
      pattern: "dispatchNotification\\('load\\.(in_transit|delivered)'"
    - from: "apps/web/src/app/(owner)/actions/load-documents.ts (uploadLoadDocument)"
      to: "apps/web/src/lib/notifications/dispatcher.ts"
      via: "if/else on documentType — BOL → load.bol_uploaded, POD → load.pod_uploaded"
      pattern: "dispatchNotification\\('load\\.(bol|pod)_uploaded'"
    - from: "Three NotificationTemplate rows in production"
      to: "isActive=false state"
      via: "UPDATE SQL via Supabase MCP"
      pattern: "UPDATE \"NotificationTemplate\" SET \"isActive\" = false"
---

<objective>
Phase 41 audit (quick-322's audit table) confirmed 23 of 36 trigger templates are dead-letter — the NotificationTemplate row exists but no server action or cron calls dispatchNotification for it. A customer subscribed to load.created, created a load, and received nothing. This batch wires the 10 LOAD-category triggers AND deactivates 3 triggers that duplicate Supabase Auth's native emails (user.welcome, user.password_reset) or have no detection mechanism (route.delayed).

After this PR, every load lifecycle event in the codebase produces SendLog audit rows and respects tenant subscriptions configured in /settings/notifications. The three deactivated triggers stop appearing as live in the audit table without losing their seed entries (re-activation is a one-line isActive=true flip when their detection/wiring story is built in Phase 42).

Purpose: Restore the customer-visible promise of /settings/notifications for the entire load lifecycle. Eliminate the three "sent" status SendLog rows we'd otherwise produce for triggers Supabase already sends (which would arrive as duplicate emails to end users).

Output: 10 new dispatchNotification call sites across 4 files, 3 isActive=false flips applied via SQL + matching seed updates with explanatory comments, all wrapped in fire-and-forget .catch() pattern with relatedEntity scoped to Load, tsc clean, build clean, production verification of one sample SendLog row per wired trigger.

Non-goals: Do NOT touch dispatcher.ts. Do NOT touch BlockEditor. Do NOT touch prisma/schema.prisma. Do NOT touch the existing customer.tracking_link_sent / customer.delivered_notification calls inside sendNotificationAndLogInteraction — those serve customer recipients and are DIFFERENT triggers from the new internal load.* triggers; both must coexist after this PR. Do NOT wire any other category — Batch 2 + Batch 3 cover those.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/322-phase-41-cleanup-wire-send-geofence-aler/322-SUMMARY.md
@.planning/quick/320-phase-41-hotfix-remove-optional-tenantid/320-SUMMARY.md
@apps/web/src/lib/notifications/dispatcher.ts
@apps/web/src/lib/notifications/types.ts
@apps/web/prisma/seeds/notification-template-data/load.ts
@apps/web/prisma/seeds/notification-template-data/user.ts
@apps/web/prisma/seeds/notification-template-data/route.ts
@apps/web/prisma/seeds/seed-notifications.ts
@apps/web/src/app/(owner)/actions/loads.ts
@apps/web/src/app/(owner)/actions/load-driver-assignments.ts
@apps/web/src/app/(owner)/actions/load-documents.ts
@apps/web/src/app/api/mobile/driver/loads/[id]/status/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wire owner-side load lifecycle triggers (loads.ts + load-driver-assignments.ts)</name>
  <files>
    apps/web/src/app/(owner)/actions/loads.ts
    apps/web/src/app/(owner)/actions/load-driver-assignments.ts
  </files>
  <action>
    PRE-FLIGHT — Confirm payload shapes match NotificationPayload exactly. The TriggerKey union and NotificationPayload mapped type are already defined for all 10 load triggers in apps/web/src/lib/notifications/types.ts (lines 11–20 and 59–68). Reference shapes (do NOT modify types.ts in this task — use as-is):

    | Trigger | Required payload fields |
    |---|---|
    | load.created | loadId, loadNumber, originCity, destCity |
    | load.assigned | loadId, loadNumber, driverId, driverName, originCity, destCity |
    | load.dispatched | loadId, loadNumber, driverName |
    | load.picked_up | loadId, loadNumber, driverName, pickupTime |
    | load.in_transit | loadId, loadNumber, driverName |
    | load.delivered | loadId, loadNumber, driverName, deliveryTime |
    | load.invoiced | loadId, loadNumber, invoiceNumber, amount |
    | load.cancelled | loadId, loadNumber, reason |

    All values are strings. originCity/destCity are derived from Load.origin / Load.destination (the full address strings — match the existing customer-notification pattern in loads.ts lines 49-65 which uses load.origin and load.destination directly; do not over-engineer city extraction).

    -------------------------------------------------------------------------
    STEP A — Add the dispatchNotification import to apps/web/src/app/(owner)/actions/loads.ts (top of file, alongside the existing notification imports around line 13):

    ```typescript
    import { dispatchNotification } from '@/lib/notifications/dispatcher';
    ```

    -------------------------------------------------------------------------
    STEP B — createLoad (around line 127). The current flow:
      1. Parse formData
      2. Inside try{}: requireRole, requireTenantId, getTenantPrisma, $transaction creates the load
      3. createdId = load.id
      4. catch returns error
      5. revalidatePath + redirect (UNREACHABLE on error)

    Add the dispatchNotification call BEFORE the revalidatePath/redirect (line 210), AFTER the try/catch block — only fires when create succeeded. Pull loadNumber from inside the transaction (it's already computed at line 161 — hoist it via let-declared `createdLoadNumber` set inside the try block alongside `createdId`).

    Modified shape:
    ```typescript
    let createdId: string;
    let createdLoadNumber: string;
    let createdOrigin: string;
    let createdDestination: string;

    try {
      // ... existing requireRole / requireTenantId / generateLoadNumber / $transaction ...
      createdId = load.id;
      createdLoadNumber = loadNumber;
      createdOrigin = result.data.origin;
      createdDestination = result.data.destination;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      return { error: msg || 'Failed to create load. Please try again.' };
    }

    // Fire-and-forget — never block redirect
    const notifTenantId = await requireTenantId();
    dispatchNotification('load.created', {
      tenantId: notifTenantId,
      payload: {
        loadId: createdId,
        loadNumber: createdLoadNumber,
        originCity: createdOrigin,
        destCity: createdDestination,
      },
      relatedEntity: { type: 'Load', id: createdId },
    }).catch((err) => console.error('[notifications] load.created dispatch failed', err));

    revalidatePath('/loads');
    redirect(`/loads/${createdId}`);
    ```

    NOTE: requireTenantId() is already called inside the try block at line 157 — but it's scoped there. The simplest fix is to capture it into the outer scope (`let notifTenantId: string;` declared next to createdId, assigned inside try). DO NOT call requireTenantId() twice — wasteful. Use the captured value.

    -------------------------------------------------------------------------
    STEP C — dispatchLoad (around line 369). Current flow:
      1. Parse, requireRole, getTenantPrisma
      2. Find load by id (selects status, loadNumber, origin, destination)
      3. Update load.status='DISPATCHED', set driverId/truckId/routeId/trackingToken
      4. Calls existing sendNotificationAndLogInteraction (customer.* triggers — DO NOT TOUCH)
      5. Fires sendPushToUser to driver (existing — DO NOT TOUCH)
      6. catch returns error
      7. revalidatePath + redirect

    BEFORE the existing sendNotificationAndLogInteraction call at line 410, add TWO dispatchNotification calls. The tenantId is already captured at line 409 (`tId`). To get driverName, fetch it via prisma after update (one extra round-trip is acceptable — keep the action simple). NOTE: tenantPrisma is RLS-scoped to current owner's tenant which is correct here.

    Add right after line 410 (`sendNotificationAndLogInteraction(prisma, tId, id, 'DISPATCHED');`) and BEFORE the `void sendPushToUser(...)` at line 413:

    ```typescript
    // Fire-and-forget internal notifications (Phase 41 wire-up). Independent of the
    // customer.* trigger fired by sendNotificationAndLogInteraction above.
    void (async () => {
      try {
        const driver = await prisma.driver.findUnique({
          where: { id: result.data.driverId },
          select: { firstName: true, lastName: true },
        });
        const driverName = driver ? `${driver.firstName} ${driver.lastName}` : 'Driver';

        // Notify the assigned driver
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
        }).catch((err) => console.error('[notifications] load.assigned dispatch failed', err));

        // Notify the owner of dispatch
        dispatchNotification('load.dispatched', {
          tenantId: tId,
          payload: {
            loadId: id,
            loadNumber: load.loadNumber,
            driverName,
          },
          relatedEntity: { type: 'Load', id },
        }).catch((err) => console.error('[notifications] load.dispatched dispatch failed', err));
      } catch (err) {
        console.error('[notifications] dispatchLoad notif prep failed', err);
      }
    })();
    ```

    -------------------------------------------------------------------------
    STEP D — updateLoadStatus (around line 495). Current flow allows transitions:
      DISPATCHED → PICKED_UP | CANCELLED
      PICKED_UP → IN_TRANSIT | CANCELLED
      IN_TRANSIT → DELIVERED | CANCELLED
      DELIVERED → INVOICED | CANCELLED

    The existing customer-facing sendNotificationAndLogInteraction is called at line 547 ONLY for PICKED_UP / IN_TRANSIT / DELIVERED. Leave that block exactly as-is.

    Right after line 548 (the existing customer notification gate), add an internal notification dispatch covering ALL 5 terminal branches. Fetch the load's loadNumber + driverName/customerName up-front (one round-trip):

    ```typescript
    // Fire-and-forget INTERNAL notifications (Phase 41 wire-up). Distinct from the
    // customer.* trigger fired above — both can fire for the same status change.
    void (async () => {
      try {
        const loadDetail = await prisma.load.findUnique({
          where: { id },
          select: {
            loadNumber: true,
            driver: { select: { firstName: true, lastName: true } },
          },
        });
        if (!loadDetail) return;
        const driverName = loadDetail.driver
          ? `${loadDetail.driver.firstName} ${loadDetail.driver.lastName}`
          : 'Unassigned';
        const nowFormatted = new Date().toLocaleString('en-US', {
          dateStyle: 'short',
          timeStyle: 'short',
        });

        switch (newStatus) {
          case 'PICKED_UP':
            dispatchNotification('load.picked_up', {
              tenantId,
              payload: {
                loadId: id,
                loadNumber: loadDetail.loadNumber,
                driverName,
                pickupTime: nowFormatted,
              },
              relatedEntity: { type: 'Load', id },
            }).catch((err) => console.error('[notifications] load.picked_up dispatch failed', err));
            break;
          case 'IN_TRANSIT':
            dispatchNotification('load.in_transit', {
              tenantId,
              payload: {
                loadId: id,
                loadNumber: loadDetail.loadNumber,
                driverName,
              },
              relatedEntity: { type: 'Load', id },
            }).catch((err) => console.error('[notifications] load.in_transit dispatch failed', err));
            break;
          case 'DELIVERED':
            dispatchNotification('load.delivered', {
              tenantId,
              payload: {
                loadId: id,
                loadNumber: loadDetail.loadNumber,
                driverName,
                deliveryTime: nowFormatted,
              },
              relatedEntity: { type: 'Load', id },
            }).catch((err) => console.error('[notifications] load.delivered dispatch failed', err));
            break;
          case 'INVOICED': {
            // Pull invoice info — there must be at least one because of the guard above
            const invoice = await prisma.invoice.findFirst({
              where: { loadId: id, status: { not: 'CANCELLED' } },
              select: { invoiceNumber: true, total: true },
              orderBy: { createdAt: 'desc' },
            });
            dispatchNotification('load.invoiced', {
              tenantId,
              payload: {
                loadId: id,
                loadNumber: loadDetail.loadNumber,
                invoiceNumber: invoice?.invoiceNumber ?? 'N/A',
                amount: invoice ? `$${Number(invoice.total).toFixed(2)}` : 'N/A',
              },
              relatedEntity: { type: 'Load', id },
            }).catch((err) => console.error('[notifications] load.invoiced dispatch failed', err));
            break;
          }
          case 'CANCELLED':
            dispatchNotification('load.cancelled', {
              tenantId,
              payload: {
                loadId: id,
                loadNumber: loadDetail.loadNumber,
                reason: 'Cancelled by dispatcher', // No reason field in the API today; placeholder string
              },
              relatedEntity: { type: 'Load', id },
            }).catch((err) => console.error('[notifications] load.cancelled dispatch failed', err));
            break;
        }
      } catch (err) {
        console.error('[notifications] updateLoadStatus notif prep failed', err);
      }
    })();
    ```

    Place this block AFTER line 548 (after the existing customer-facing branch) and BEFORE the `if (newStatus === 'INVOICED' && load.customerId)` customer-stats block at line 551 — order does not matter functionally but keeps notification code grouped.

    Verify the actual Invoice schema field for the total field is `total`. If the field name differs (e.g., `totalAmount`), adjust the select clause accordingly. Run a quick grep before writing: `grep -n "total" apps/web/prisma/schema.prisma | head -10` — match what's there.

    -------------------------------------------------------------------------
    STEP E — load-driver-assignments.ts → createAssignment (line 167–238).

    Add the import at top:
    ```typescript
    import { dispatchNotification } from '@/lib/notifications/dispatcher';
    ```

    After the assignment is created (line 234, after the `prisma.loadDriverAssignment.create({...})` call) and BEFORE `revalidatePath` at line 236, fetch driverName + load info for the payload, then dispatch:

    ```typescript
    // Fire-and-forget — Phase 41 wire-up
    void (async () => {
      try {
        const [load, driver] = await Promise.all([
          prisma.load.findUnique({
            where: { id: loadId },
            select: { loadNumber: true, origin: true, destination: true },
          }),
          prisma.carrierDriver.findUnique({
            where: { id: cd.id },
            select: { firstName: true, lastName: true },
          }),
        ]);
        if (!load || !driver) return;
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
        }).catch((err) => console.error('[notifications] load.assigned (createAssignment) dispatch failed', err));
      } catch (err) {
        console.error('[notifications] createAssignment notif prep failed', err);
      }
    })();
    ```

    NOTE on duplicate dispatches: createAssignment fires load.assigned independently of dispatchLoad's load.assigned call. This is intentional — the two flows produce the assignment via different code paths (assignment-record-only vs. dispatch-with-status-change). Idempotency in dispatcher.ts handles dedup if both fire for the same logical event. Confirm this with the team on PR review; if dedup is undesired, we'll consolidate in Batch 2.

    -------------------------------------------------------------------------
    STEP F — Local verify before committing:
    ```
    cd apps/web && npx tsc --noEmit
    ```
    Must exit 0. Fix any type errors before proceeding to Task 2.
  </action>
  <verify>
    1. `cd apps/web && npx tsc --noEmit` exits 0 with no new errors.
    2. `grep -n "dispatchNotification('load\." apps/web/src/app/(owner)/actions/loads.ts` returns at least 7 lines (load.created x1, load.assigned x1, load.dispatched x1, load.picked_up x1, load.in_transit x1, load.delivered x1, load.invoiced x1, load.cancelled x1 — total 8 in this file).
    3. `grep -n "dispatchNotification('load\.assigned'" apps/web/src/app/(owner)/actions/load-driver-assignments.ts` returns exactly 1 line.
    4. Every dispatchNotification call uses `.catch((err) => console.error(...))` (no awaits on the outer promise).
    5. Every call passes `tenantId` (NOT optional, NOT undefined — same lesson as quick-320).
    6. Every call passes `relatedEntity: { type: 'Load', id: ... }`.
    7. The pre-existing `sendNotificationAndLogInteraction(prisma, ..., 'DISPATCHED')` and the `if (['PICKED_UP', 'IN_TRANSIT', 'DELIVERED'].includes(newStatus))` block are UNCHANGED — confirm via diff inspection.
  </verify>
  <done>
    - 8 new dispatchNotification calls in loads.ts (createLoad, dispatchLoad x2, updateLoadStatus x5)
    - 1 new dispatchNotification call in load-driver-assignments.ts (createAssignment)
    - All calls use tenantId, typed payload, relatedEntity, .catch() — no awaits
    - Existing customer notification flow untouched
    - tsc clean
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire mobile + load-documents triggers + deactivate three duplicate triggers</name>
  <files>
    apps/web/src/app/api/mobile/driver/loads/[id]/status/route.ts
    apps/web/src/app/(owner)/actions/load-documents.ts
    apps/web/prisma/seeds/notification-template-data/user.ts
    apps/web/prisma/seeds/notification-template-data/route.ts
  </files>
  <action>
    -------------------------------------------------------------------------
    STEP A — Mobile status route: apps/web/src/app/api/mobile/driver/loads/[id]/status/route.ts

    The route currently handles a transaction that updates load.status to DISPATCHED / IN_TRANSIT / DELIVERED based on the driver's mobile action. The transaction commits at line 132. Right after `if ('error' in result && result.error) { return NextResponse.json(...) }` (around line 134-136) and BEFORE the success NextResponse.json at line 138, add a fire-and-forget internal notification.

    Add at the top of the file alongside the existing imports:
    ```typescript
    import { dispatchNotification } from '@/lib/notifications/dispatcher';
    ```

    The result.load is fully populated (already includes customer + truck via the include at line 125). We need driverName — but the existing include does not fetch driver. Add `driver: { select: { firstName: true, lastName: true } }` to the include block on line 125 so we have it in result.load without a second round-trip.

    Then between the error check and the final return, insert:

    ```typescript
    // Fire-and-forget INTERNAL notification (Phase 41 wire-up).
    // Mobile transitions: ACCEPTED skips notif (handled by owner dispatch flow);
    // EN_ROUTE → load.in_transit; DELIVERED → load.delivered.
    if (result.load && (newDriverStatus === 'EN_ROUTE' || newDriverStatus === 'DELIVERED')) {
      const load = result.load;
      const driverName = load.driver
        ? `${load.driver.firstName} ${load.driver.lastName}`
        : 'Driver';
      const nowFormatted = new Date().toLocaleString('en-US', {
        dateStyle: 'short',
        timeStyle: 'short',
      });

      if (newDriverStatus === 'EN_ROUTE') {
        dispatchNotification('load.in_transit', {
          tenantId,
          payload: {
            loadId: load.id,
            loadNumber: load.loadNumber,
            driverName,
          },
          relatedEntity: { type: 'Load', id: load.id },
        }).catch((err) => logger.error('[notifications] load.in_transit (mobile) dispatch failed', err));
      } else if (newDriverStatus === 'DELIVERED') {
        dispatchNotification('load.delivered', {
          tenantId,
          payload: {
            loadId: load.id,
            loadNumber: load.loadNumber,
            driverName,
            deliveryTime: nowFormatted,
          },
          relatedEntity: { type: 'Load', id: load.id },
        }).catch((err) => logger.error('[notifications] load.delivered (mobile) dispatch failed', err));
      }
    }
    ```

    Use `logger.error` (already imported at line 6) instead of console.error to match the file's existing convention. tenantId comes from `auth.tenantId` (already destructured at line 66 — `const { driverId, tenantId } = auth;`).

    Verify the include now selects loadNumber explicitly (it is auto-included as a top-level Load field, but confirm the type narrowing works in tsc).

    -------------------------------------------------------------------------
    STEP B — Load documents: apps/web/src/app/(owner)/actions/load-documents.ts

    The current uploadLoadDocument function HARDCODES documentType to 'RATE_CONFIRMATION' (line 94). Per the task spec, BOL/POD must be detected from the upload. The current code does not accept documentType from formData — it always sets RATE_CONFIRMATION.

    DECISION: This file currently only handles rate confirmations (the comment at line 87 confirms it). BOL and POD uploads happen via a DIFFERENT flow (likely the driver mobile route that creates Documents with documentType='BOL'/'POD'). Before assuming this file is the BOL/POD entry point, run:

    ```
    grep -rn "documentType.*BOL\|documentType.*POD\|'BOL'\|'POD'" apps/web/src apps/web/prisma | head -30
    ```

    Report what file(s) actually create Document rows with documentType=BOL or POD. Three possibilities:

    **Possibility 1**: A separate document upload action exists (e.g. apps/web/src/app/(driver)/actions/load-documents.ts or a mobile route under apps/web/src/app/api/mobile/driver/loads/[id]/documents/route.ts). Wire the dispatch THERE, not in load-documents.ts. Update the files_modified list in this plan if so.

    **Possibility 2**: uploadLoadDocument actually accepts a documentType param via formData but currently ignores it — extend it to accept and route on type. Then add the dispatch.

    **Possibility 3**: BOL/POD uploads go through the generic DocumentRepository.create() called from somewhere else. Find that call site and wire there.

    Pick the right path based on what grep finds, then add the wiring. Pattern (apply at whichever site actually creates BOL/POD Document rows):

    ```typescript
    // After document.create() succeeds, before the function returns success
    if (result.data.documentType === 'BOL' || result.data.documentType === 'POD') {
      const triggerKey = result.data.documentType === 'BOL' ? 'load.bol_uploaded' : 'load.pod_uploaded';
      const load = await prisma.load.findUnique({
        where: { id: loadId },
        select: { loadNumber: true },
      });
      if (load) {
        dispatchNotification(triggerKey, {
          tenantId,
          payload: {
            loadId,
            loadNumber: load.loadNumber,
            uploadedBy: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email || 'Unknown',
          },
          relatedEntity: { type: 'Load', id: loadId },
        }).catch((err) => console.error(`[notifications] ${triggerKey} dispatch failed`, err));
      }
    }
    ```

    If no actual BOL/POD upload code path exists in the codebase yet (i.e., the document model supports those enum values but no UI/API path creates them), DOCUMENT THIS FINDING in the SUMMARY and skip the BOL/POD wiring — these two triggers remain dead-letter until a user-facing upload flow is built. Do NOT invent a code path.

    -------------------------------------------------------------------------
    STEP C — Deactivate seed entries with explanatory comments.

    File 1: apps/web/prisma/seeds/notification-template-data/user.ts

    Change `isActive: true` to `isActive: false` on the user.welcome entry (currently line 26) and on the user.password_reset entry (currently line 73). Add a comment ABOVE each entry's `isActive` line:

    For user.welcome:
    ```typescript
        // Deactivated (quick-325, Phase 41 wire-up batch 1):
        // Supabase Auth sends the welcome email natively. Wiring this trigger
        // would cause duplicate emails to land in the user's inbox.
        // Re-activate ONLY if Supabase Auth's native welcome email is disabled.
        isActive: false,
    ```

    For user.password_reset:
    ```typescript
        // Deactivated (quick-325, Phase 41 wire-up batch 1):
        // Supabase Auth sends password reset emails natively via auth.resetPasswordForEmail().
        // Wiring this trigger would cause duplicate emails. Re-activate ONLY if
        // Supabase Auth's native password reset email is disabled.
        isActive: false,
    ```

    File 2: apps/web/prisma/seeds/notification-template-data/route.ts

    Change `isActive: true` to `isActive: false` on the route.delayed entry (around line 53). Add the comment:
    ```typescript
        // Deactivated (quick-325, Phase 41 wire-up batch 1):
        // No automated delay-detection mechanism exists. There is no cron, server
        // action, or background job that compares ETA vs. actual progress and fires
        // this trigger. Re-activate when Phase 42 builds route monitoring.
        isActive: false,
    ```

    DO NOT change isActive on user.invited (that's used by accept-invitation flow), user.role_changed, or any other route trigger. Only the three named keys.

    -------------------------------------------------------------------------
    STEP D — Verify seed runner does NOT overwrite isActive on update.

    Open apps/web/prisma/seeds/seed-notifications.ts and confirm lines 102–113 (the `existing` UPDATE branch) do NOT include `isActive` in the data block. The current comment at line 112 reads `// intentionally NOT updating isActive or inAppEnabled — SysAdmin owns those at runtime` — which is exactly what we need.

    No changes required to seed-notifications.ts. If the comment OR behavior differs from the above, STOP and fix the seed runner first (the seed must NOT flip isActive back to true on re-seed, otherwise the SQL update from STEP E gets reverted on the next deploy that runs the seed).

    -------------------------------------------------------------------------
    STEP E — Apply the production isActive=false flip via Supabase MCP.

    Run via Supabase MCP `apply_migration` (or `execute_sql` if the change is purely data, not schema):

    ```sql
    UPDATE "NotificationTemplate"
    SET "isActive" = false, "updatedAt" = NOW()
    WHERE "triggerKey" IN ('user.welcome', 'user.password_reset', 'route.delayed');
    ```

    Then verify:
    ```sql
    SELECT "triggerKey", "isActive", "updatedAt"
    FROM "NotificationTemplate"
    WHERE "triggerKey" IN ('user.welcome', 'user.password_reset', 'route.delayed')
    ORDER BY "triggerKey";
    ```

    All three rows must show `isActive = false`. Capture the result for the SUMMARY.

    -------------------------------------------------------------------------
    STEP F — Local verify:
    ```
    cd apps/web && npx tsc --noEmit
    cd apps/web && npm run build
    ```
    Both must pass.

    Optionally run the seed locally to confirm it does NOT re-flip isActive:
    ```
    cd apps/web && npm run seed:notifications
    ```
    Then re-run the verify SELECT — the three rows should still be isActive=false. If the seed flips them back to true, STOP and fix the seed runner.
  </action>
  <verify>
    1. `cd apps/web && npx tsc --noEmit` exits 0.
    2. `cd apps/web && npm run build` succeeds.
    3. `grep -n "dispatchNotification('load\.\(in_transit\|delivered\)'" apps/web/src/app/api/mobile/driver/loads/[id]/status/route.ts` returns exactly 2 matches.
    4. `grep -n "isActive: false" apps/web/prisma/seeds/notification-template-data/user.ts` returns at least 2 matches (one for welcome, one for password_reset).
    5. `grep -n "isActive: false" apps/web/prisma/seeds/notification-template-data/route.ts` returns at least 1 match (route.delayed).
    6. Each `isActive: false` line has a preceding comment explaining WHY (grep -B 4 will show the comment block).
    7. SQL verify query returns 3 rows all with isActive=false.
    8. If load-documents BOL/POD wiring was applied: `grep -n "dispatchNotification('load\.\(bol\|pod\)_uploaded'" apps/web/src` returns 2 matches.
    9. If load-documents BOL/POD wiring was SKIPPED (no upload path exists): the SUMMARY documents this finding.
  </verify>
  <done>
    - Mobile status route fires load.in_transit and load.delivered AFTER tx commits, using auth.tenantId
    - Document upload flow either fires BOL/POD triggers conditionally OR documents that no such path exists
    - Three NotificationTemplate rows flipped to isActive=false in production via SQL
    - Three seed entries updated to match (isActive: false + explanatory comment)
    - Seed runner confirmed to NOT overwrite isActive on update
    - tsc clean, build clean
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Deploy + production verification — one SendLog row per wired trigger</name>
  <what-built>
    Tasks 1–2 wired 10 internal load lifecycle triggers across 4 files (or 9 if BOL/POD upload path doesn't exist) and deactivated 3 duplicate-of-Supabase triggers via SQL + seed update. All dispatches use the fire-and-forget .catch() pattern, pass tenantId, and scope relatedEntity to Load. The pre-existing customer.* notification flow inside sendNotificationAndLogInteraction is untouched and continues to fire alongside the new internal triggers.

    Pre-flight (Claude does these BEFORE pausing for human):

    1. Push the branch and deploy to production: `vercel --prod` from repo root. Wait for deploy to succeed.

    2. Verify the deploy logs include no notification-related crashes during the boot phase.

    3. Pause for human verification (this checkpoint).
  </what-built>
  <how-to-verify>
    For each wired trigger, perform the action that should fire it, then check SendLog. Use a test tenant where you (the human verifier) are subscribed to all load.* triggers via /settings/notifications.

    A) load.created — Owner portal → Loads → New Load → fill minimum fields → Save.
    B) load.assigned + load.dispatched — Owner portal → existing PENDING load → Dispatch → assign driver + truck → Save.
    C) load.picked_up / load.in_transit / load.delivered / load.invoiced / load.cancelled — Owner portal → load detail → Status update buttons (one transition at a time, separate loads ideally so each test is isolated).
    D) load.in_transit + load.delivered (mobile) — Mobile app → driver login → load detail → Mark EN_ROUTE, then later Mark DELIVERED.
    E) load.bol_uploaded / load.pod_uploaded — IF a BOL/POD upload path exists per Task 2 STEP B finding: upload one BOL and one POD document. IF NO PATH EXISTS: skip this verify step and confirm the SUMMARY documents the finding.

    After each action, run via Supabase MCP within ~1 minute:

    ```sql
    SELECT "triggerKey", "channel", "status", "recipientEmail", "recipientUserId",
           "relatedEntityId", "errorMessage", "createdAt"
    FROM "NotificationSendLog"
    WHERE "createdAt" > NOW() - INTERVAL '2 minutes'
      AND "triggerKey" LIKE 'load.%'
    ORDER BY "createdAt" DESC;
    ```

    Expected per trigger:
    - At least one EMAIL row with status='SENT' for each subscribed recipient
    - At least one IN_APP row with status='SENT' for each subscribed recipient (or SKIPPED_USER_PREF if a user disabled in-app)
    - relatedEntityId matches the load you just acted on
    - NO status='FAILED' rows
    - NO empty rendered placeholders in the email body (open the email — variables should be substituted)

    Failure signals that block approval:
    - Zero rows for a given trigger → the dispatch call did not fire; check the action code path matches what you executed
    - status='SKIPPED_DISABLED' for trigger='load.X' → that template's NotificationTemplate.isActive is false; investigate
    - status='FAILED' → check errorMessage column; common cause is a payload variable that's undefined (template renders `{{driverName}}` literally)
    - Email arrives with literal `{{driverName}}` text → payload field name mismatch with availableVariables
    - DUPLICATE emails arriving for user.welcome / user.password_reset / route.delayed → the deactivation didn't take; re-run the verify SQL

    Also verify the existing customer flow still works (regression check):
    - During the load.delivered test above, check the customer email arrived (sendNotificationAndLogInteraction → sendLoadStatusEmail). The internal load.delivered SendLog row and the customer email should BOTH exist for the same load — they are independent flows.

    Final SQL — confirm the three deactivated triggers fire NOTHING:
    ```sql
    SELECT COUNT(*) FROM "NotificationSendLog"
    WHERE "triggerKey" IN ('user.welcome', 'user.password_reset', 'route.delayed')
      AND "createdAt" > NOW() - INTERVAL '1 hour';
    ```
    Expected: 0 (no rows fired since deploy).

    If all checks pass: collect the SendLog row counts per trigger and paste them into the SUMMARY.
  </how-to-verify>
  <resume-signal>Type "approved" to mark this batch complete, or describe the issue (e.g., "load.invoiced row is FAILED with errorMessage: invoiceNumber not in payload") so I can fix.</resume-signal>
</task>

</tasks>

<verification>
- 10 dispatchNotification calls added across 4 files (or 9 if BOL/POD upload path absent — documented in SUMMARY)
- Every call: tenantId required, payload typed against NotificationPayload, relatedEntity { type:'Load', id }, fire-and-forget .catch()
- Three seed entries flipped to isActive: false with explanatory comments
- Three NotificationTemplate production rows flipped to isActive=false via SQL
- Re-running seed:notifications does NOT revert the isActive=false flip (verified locally)
- Pre-existing customer.tracking_link_sent / customer.delivered_notification calls UNCHANGED
- tsc --noEmit clean, npm run build clean
- Production: per-trigger SendLog smoke test produces SENT rows, no FAILED rows, no duplicate emails for the three deactivated triggers
</verification>

<success_criteria>
- All 13 must-have truths from frontmatter verified true (or documented as N/A in the SUMMARY for the BOL/POD case if no upload path exists)
- 10 wired triggers each produce SendLog audit rows when fired in production (one row per recipient per channel)
- Three deactivated triggers produce ZERO SendLog rows after deploy
- /settings/notifications now governs the full load lifecycle: subscribers receive emails + in-app notifications when subscribed; SysAdmin can customize templates per tenant
- No regressions to the customer-facing email flow or push notification flow that already existed before this PR
</success_criteria>

<output>
After completion, create `.planning/quick/325-phase-41-wire-up-batch-1-load-lifecycle-/325-SUMMARY.md` with:

1. **Audit findings** — exact file paths and line numbers for each dispatchNotification call added (10 sites total, or 9 if BOL/POD path absent)
2. **BOL/POD finding** — table showing what grep returned for documentType='BOL'/'POD' usage. State explicitly whether wiring was applied or skipped, and where (file + function + line) if applied.
3. **Seed change diff** — show the before/after for the three isActive: false flips in user.ts and route.ts
4. **Production SQL** — the UPDATE statement applied via Supabase MCP, the post-state SELECT result showing all 3 rows isActive=false
5. **Per-trigger smoke test results** — table of trigger | recipient count | status | SendLog row count (one row per wired trigger from the human verification step)
6. **Regression check** — confirmation that the existing customer email flow still fires (one customer email arrived during the load.delivered test)
7. **Deactivation check** — count of SendLog rows for the 3 deactivated triggers since deploy (must be 0)
8. **Followups** — anything that surfaced during execution that should go into Batch 2 or Batch 3 (e.g., load.cancelled needs a real `reason` field surfaced from a UI prompt; consolidate dispatchLoad's load.assigned with createAssignment's load.assigned)
</output>
