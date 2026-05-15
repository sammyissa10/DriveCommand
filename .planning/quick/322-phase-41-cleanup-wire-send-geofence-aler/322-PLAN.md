---
phase: quick-322
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/seeds/notification-template-data/route.ts
  - apps/web/src/lib/notifications/types.ts
  - apps/web/src/lib/email/send-geofence-alert.ts
  - apps/web/src/lib/geofencing/geofence-check.ts
autonomous: false
gap_closure: true

must_haves:
  truths:
    - "A 'geofence.alert' template exists in NotificationTemplate (category=ROUTE) and is loaded by the seed script"
    - "TriggerKey union and NotificationPayload mapped type both include 'geofence.alert' so dispatchNotification compiles for the wrapper"
    - "sendGeofenceAlert requires tenantId, calls dispatchNotification first, falls back to legacy Gmail sender only if dispatch throws"
    - "Every existing call site of sendGeofenceAlert passes tenantId (already true — both call sites already pass tenantId)"
    - "Existing tenants have a TenantNotificationSettings row for 'geofence.alert' after backfill"
    - "A geofence trip in production produces exactly one SendLog row per recipient with status=SENT for trigger 'geofence.alert'"
  artifacts:
    - path: "apps/web/prisma/seeds/notification-template-data/route.ts"
      provides: "geofence.alert seed template (4th entry in routeTemplates array)"
      contains: "triggerKey: 'geofence.alert'"
    - path: "apps/web/src/lib/notifications/types.ts"
      provides: "geofence.alert in TriggerKey union and NotificationPayload"
      contains: "'geofence.alert'"
    - path: "apps/web/src/lib/email/send-geofence-alert.ts"
      provides: "Wrapper that dispatches via dispatchNotification with legacy fallback"
      contains: "dispatchNotification"
    - path: "apps/web/src/lib/geofencing/geofence-check.ts"
      provides: "Both call sites already pass tenantId (verified — no change needed unless audit reveals new call site)"
      contains: "sendGeofenceAlert"
  key_links:
    - from: "apps/web/src/lib/email/send-geofence-alert.ts"
      to: "apps/web/src/lib/notifications/dispatcher.ts"
      via: "dispatchNotification('geofence.alert', { tenantId, payload, relatedEntity })"
      pattern: "dispatchNotification\\('geofence\\.alert'"
    - from: "apps/web/prisma/seeds/notification-template-data/route.ts"
      to: "NotificationTemplate table"
      via: "npm run seed:notifications"
      pattern: "triggerKey: 'geofence\\.alert'"
    - from: "Existing tenants"
      to: "TenantNotificationSettings rows for geofence.alert"
      via: "One-time backfill SQL via Supabase MCP"
      pattern: "INSERT INTO \"TenantNotificationSettings\""
---

<objective>
Wire send-geofence-alert.ts through the dispatcher (parity with the other 8 wrapped senders). Phase 41 Plan 05 skipped this file because no `geofence.alert` trigger key existed in the seed catalog. This cleanup adds the trigger to the seed, extends the TriggerKey/NotificationPayload types, converts the sender to a dispatcher wrapper with legacy fallback, and backfills TenantNotificationSettings rows for existing tenants so they can customize the template from /settings/notifications.

Purpose: Restore tenant template customization for geofence alerts and produce a SendLog audit row per send (currently bypasses dispatcher → no audit, no customization).

Output: One new template row in production, types extended, sender refactored as wrapper, all call sites pass tenantId (audit confirms), backfill SQL applied to all existing tenants.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/321-fix-dispatcher-recipient-resolver-uuid-c/321-SUMMARY.md
@apps/web/prisma/seeds/notification-template-data/route.ts
@apps/web/src/lib/notifications/types.ts
@apps/web/src/lib/email/send-geofence-alert.ts
@apps/web/src/lib/email/send-driver-invitation.ts
@apps/web/src/lib/geofencing/geofence-check.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add geofence.alert to seed catalog and types union</name>
  <files>
    apps/web/prisma/seeds/notification-template-data/route.ts
    apps/web/src/lib/notifications/types.ts
  </files>
  <action>
    Step 1 — Extend types.ts:

    a) Add `'geofence.alert'` to the TriggerKey union under the `// Route` section. Update the inline comment from `// Route (3)` to `// Route (4)`.

    b) Add a typed payload entry to NotificationPayload mapped type (group with the other route triggers):
    ```typescript
    'geofence.alert': {
      loadId: string;
      loadNumber: string;
      stopType: string;        // 'pickup' | 'delivery' (string for template var substitution)
      stopAddress: string;
      driverName: string;
      licensePlate: string;
    };
    ```

    Step 2 — Add seed entry to route.ts (append as 4th entry in `routeTemplates` array, after `route.delayed`). Match the existing pattern in this file EXACTLY (same field order, same buildDefaultTemplate usage, same role-based recipient style):

    ```typescript
    {
      triggerKey: 'geofence.alert',
      category: NotificationCategory.ROUTE,
      displayName: 'Geofence Alert',
      description: 'Sent to dispatchers (owners + managers) when a truck enters the geofence radius of a load pickup or delivery address.',
      defaultSubject: 'Truck arrived at {{stopType}} — Load {{loadNumber}}',
      defaultBlockJson: buildDefaultTemplate({
        headerText: 'Truck arrived at {{stopType}}',
        paragraphTextWithVars:
          '{{driverName}} (truck {{licensePlate}}) arrived at the {{stopType}} location for load {{loadNumber}}. Address: {{stopAddress}}.',
        ctaLabel: 'View Load',
        ctaUrl: 'https://app.drivecommand.com/loads/{{loadId}}',
      }),
      availableVariables: [
        { name: 'loadId', description: 'Internal load ID', sampleValue: 'load_abc123' },
        { name: 'loadNumber', description: 'Load number shown to users', sampleValue: 'L-1042' },
        { name: 'stopType', description: 'Either "pickup" or "delivery"', sampleValue: 'pickup' },
        { name: 'stopAddress', description: 'Full address of the geofenced stop', sampleValue: '123 Warehouse Rd, Phoenix, AZ' },
        { name: 'driverName', description: 'Driver full name', sampleValue: 'Maria Garcia' },
        { name: 'licensePlate', description: 'Truck license plate', sampleValue: 'AZ-72918' },
      ],
      // Recipients: dispatchers = OWNER + MANAGER (matches legacy sendGeofenceAlert behavior at line 36 of send-geofence-alert.ts).
      // Use TWO `role` rules — one for OWNER, one for MANAGER — because DefaultRecipientRule.role is a single literal.
      // Both are User rows in the tenant, so `role` (not external_email) is correct.
      defaultRecipients: [
        { type: 'role', role: 'OWNER' },
        { type: 'role', role: 'MANAGER' },
      ],
      isActive: true,
      inAppEnabled: true,
    },
    ```

    Step 3 — Run the seed locally to confirm it INSERTS (not updates):
    ```
    cd apps/web && npm run seed:notifications
    ```
    Expected output should show `Inserted: 1, Updated: 35` (or similar — at least 1 inserted row). If it shows `Inserted: 0`, the trigger key already exists somewhere — investigate before proceeding.

    Step 4 — Run `tsc --noEmit` from `apps/web` to confirm the new TriggerKey + payload entry compile cleanly across the codebase.
  </action>
  <verify>
    1. `cd apps/web && npm run seed:notifications` reports at least 1 inserted row.
    2. `cd apps/web && npx tsc --noEmit` exits 0.
    3. Quick SQL via Supabase MCP: `SELECT "triggerKey", "displayName", "defaultRecipients" FROM "NotificationTemplate" WHERE "triggerKey" = 'geofence.alert';` returns one row with the OWNER + MANAGER recipient rules.
  </verify>
  <done>
    - `geofence.alert` exists in TriggerKey union AND in NotificationPayload mapped type (matches existing 35 trigger pattern)
    - 4th entry added to routeTemplates array in route.ts
    - `npm run seed:notifications` inserted the new row in the production NotificationTemplate table
    - `tsc --noEmit` passes with no new errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Refactor sendGeofenceAlert as dispatcher wrapper + audit call sites</name>
  <files>
    apps/web/src/lib/email/send-geofence-alert.ts
    apps/web/src/lib/geofencing/geofence-check.ts
  </files>
  <action>
    Step 1 — Audit all call sites of sendGeofenceAlert. Run a grep to confirm ONLY these two call sites exist (matches what was found at planning time):
    ```
    apps/web/src/lib/geofencing/geofence-check.ts:108  (pickup arrival)
    apps/web/src/lib/geofencing/geofence-check.ts:163  (delivery arrival)
    ```
    Both already pass `tenantId` in the data object. If grep finds any NEW call site that does not pass tenantId, add it before proceeding.

    Build the audit table as part of execution output:

    | File | Line | tenantId source variable | Status |
    |------|------|--------------------------|--------|
    | apps/web/src/lib/geofencing/geofence-check.ts | 108 | `tenantId` (function param) | already passes |
    | apps/web/src/lib/geofencing/geofence-check.ts | 163 | `tenantId` (function param) | already passes |

    Step 2 — Rewrite `apps/web/src/lib/email/send-geofence-alert.ts` to follow the EXACT wrapper pattern from `send-driver-invitation.ts`:

    ```typescript
    /**
     * WRAPPER (Phase 41 Cleanup quick-322): This file now routes through dispatchNotification.
     * The original implementation is preserved below as `legacy*` and serves as the
     * fallback path inside the try/catch. Do NOT delete — slated for cleanup after
     * two weeks of stable production operation.
     */

    import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
    import { sendEmail } from './gmail-client';
    import { GeofenceArrivalAlert } from '@/emails/geofence-arrival-alert';
    import { dispatchNotification } from '@/lib/notifications/dispatcher';

    export interface GeofenceAlertData {
      tenantId: string;        // already required — keep required
      loadId: string;
      loadNumber: string;
      stopType: 'pickup' | 'delivery';
      stopAddress: string;
      driverName: string;
      licensePlate: string;
    }

    /**
     * Send geofence arrival alert to dispatchers.
     * Routes through dispatchNotification (tenant-aware). Falls back to legacy Gmail SMTP only when
     * the dispatcher itself throws.
     */
    export async function sendGeofenceAlert(data: GeofenceAlertData): Promise<void> {
      try {
        await dispatchNotification('geofence.alert', {
          tenantId: data.tenantId,
          payload: {
            loadId: data.loadId,
            loadNumber: data.loadNumber,
            stopType: data.stopType,
            stopAddress: data.stopAddress,
            driverName: data.driverName,
            licensePlate: data.licensePlate,
          },
          relatedEntity: { type: 'Load', id: data.loadId },
        });
      } catch (err) {
        console.warn('[notifications] dispatcher failed, falling back to legacy geofence sender', err);
        await legacySendGeofenceAlert(data);
      }
    }

    /** Legacy implementation — preserved as fallback. Original Phase-20 code. */
    async function legacySendGeofenceAlert(data: GeofenceAlertData): Promise<void> {
      // Find dispatcher email addresses (bypass RLS — called from non-session context)
      const dispatchers = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.user.findMany({
          where: {
            tenantId: data.tenantId,
            role: { in: ['OWNER', 'MANAGER'] },
            isActive: true,
          },
          select: { email: true },
        });
      }, TX_OPTIONS);

      if (!dispatchers.length) return;

      const loadUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.drivecommand.com'}/loads/${data.loadId}`;
      const stopLabel = data.stopType === 'pickup' ? 'Pickup' : 'Delivery';
      const subject = `Truck arrived at ${stopLabel} — Load ${data.loadNumber}`;

      const emails = dispatchers.map((d) => d.email);

      await sendEmail({
        to: emails,
        subject,
        react: GeofenceArrivalAlert({
          loadNumber: data.loadNumber,
          stopType: data.stopType,
          stopAddress: data.stopAddress,
          driverName: data.driverName,
          licensePlate: data.licensePlate,
          loadUrl,
        }),
      });
    }
    ```

    KEY POINTS:
    - tenantId stays REQUIRED (already required, do not make optional — same lesson as quick-320)
    - Legacy body preserved EXACTLY as-is, just renamed to `legacySendGeofenceAlert`
    - Function signature unchanged externally (still takes one `GeofenceAlertData` arg, still returns `Promise<void>`)
    - relatedEntity uses `{ type: 'Load', id: data.loadId }` so SendLog rows are queryable per load

    Step 3 — geofence-check.ts requires NO changes (audit already confirmed both call sites pass tenantId). Do not edit unless the audit reveals a problem.

    Step 4 — Local verify:
    ```
    cd apps/web && npx tsc --noEmit
    cd apps/web && npm run build
    ```
    Both must pass.
  </action>
  <verify>
    1. `cd apps/web && npx tsc --noEmit` exits 0.
    2. `cd apps/web && npm run build` succeeds.
    3. `grep -rn "sendGeofenceAlert(" apps/web/src` returns exactly the original 2 call sites in geofence-check.ts plus the export in send-geofence-alert.ts. No new untyped call sites.
    4. The wrapper file imports `dispatchNotification` from `@/lib/notifications/dispatcher`.
  </verify>
  <done>
    - sendGeofenceAlert is a wrapper: dispatcher primary, legacy fallback inside try/catch
    - Legacy implementation body fully preserved (no behavior loss if dispatcher throws)
    - tenantId remains required
    - tsc + build pass locally
    - No call site changes needed (audit confirmed both pass tenantId already)
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Backfill existing tenants + deploy + production verification</name>
  <what-built>
    Tasks 1-2 added the geofence.alert template to the seed (and the production NotificationTemplate row), wired sendGeofenceAlert through the dispatcher, and verified locally. This checkpoint covers the production rollout: backfill existing tenants' settings, deploy to Vercel, and confirm a real geofence trigger writes a SENT SendLog row.

    Pre-flight (Claude does these BEFORE pausing for human):

    1. Backfill SQL via Supabase MCP — insert a TenantNotificationSettings row for every existing tenant for the new trigger. The auto-populate trigger only fires for NEW tenants, so existing tenants need manual backfill:

       ```sql
       INSERT INTO "TenantNotificationSettings" (
         "id", "tenantId", "triggerKey", "isActive",
         "emailEnabled", "smsEnabled", "inAppEnabled",
         "createdAt", "updatedAt"
       )
       SELECT
         gen_random_uuid(),
         t."id",
         'geofence.alert',
         true,
         true,
         false,
         true,
         NOW(),
         NOW()
       FROM "Tenant" t
       WHERE NOT EXISTS (
         SELECT 1 FROM "TenantNotificationSettings" s
         WHERE s."tenantId" = t."id" AND s."triggerKey" = 'geofence.alert'
       );
       ```

       NOTE: Verify the column names against the actual TenantNotificationSettings schema before running. If smsEnabled/inAppEnabled defaults differ, match the schema defaults. Confirm the row count inserted equals the count of existing tenants minus any that already have a row.

       Verification SQL (must show every tenant has a row):
       ```sql
       SELECT
         (SELECT COUNT(*) FROM "Tenant") AS total_tenants,
         (SELECT COUNT(*) FROM "TenantNotificationSettings" WHERE "triggerKey" = 'geofence.alert') AS settings_rows;
       ```
       The two counts should match.

    2. Deploy to production: `vercel --prod` from repo root. Wait for deploy to succeed.

    3. Pause for human verification (this checkpoint).
  </what-built>
  <how-to-verify>
    Trigger a real geofence alert in production (or invoke the sender via a server-action test if no easy UI path).

    Option A — Real geofence trip (preferred if testing infra allows):
    1. Use a test load with a known pickup/delivery address.
    2. Have a driver (or simulated GPS ping) cross the geofence radius.
    3. Within 2 minutes run via Supabase MCP:
       ```sql
       SELECT "id", "triggerKey", "recipientEmail", "recipientUserId",
              "channel", "status", "errorMessage", "createdAt"
       FROM "NotificationSendLog"
       WHERE "triggerKey" = 'geofence.alert'
         AND "createdAt" > NOW() - INTERVAL '2 minutes'
       ORDER BY "createdAt" DESC;
       ```

    Option B — Manual sender invocation (if no easy real-trigger path):
    1. From a Vercel preview or production server-action test, call `sendGeofenceAlert({ tenantId: <test-tenant>, loadId, loadNumber, stopType: 'pickup', stopAddress, driverName, licensePlate })`.
    2. Run the same SQL above.

    Expected:
    - One EMAIL channel SendLog row per OWNER + MANAGER in the tenant, status = 'SENT'
    - One IN_APP channel SendLog row per OWNER + MANAGER, status = 'SENT' (or SKIPPED_USER_PREF if any user disabled in-app)
    - NO rows with status='FAILED'
    - The dispatcher email arrives in the recipient inbox (subject: "Truck arrived at pickup — Load ...")
    - NO `[notifications] dispatcher failed, falling back to legacy geofence sender` warning in Vercel logs (legacy fallback should NOT fire)

    Failure signals that block approval:
    - SendLog row count is 0 → dispatcher silently no-op'd; check tenantSettings row exists for this tenant
    - Status='FAILED' → check errorMessage column, likely a payload validation or recipient resolver issue
    - Legacy fallback warning in logs → dispatcher threw; investigate before approving
    - Email never arrives → check resend/gmail-client error logs

    If all checks pass: confirm the tenant settings backfill query shows total_tenants == settings_rows.
  </how-to-verify>
  <resume-signal>Type "approved" to mark this cleanup complete, or describe the issue (e.g., "FAILED rows in SendLog with errorMessage X") so I can fix.</resume-signal>
</task>

</tasks>

<verification>
- npm run seed:notifications inserted the geofence.alert row in production NotificationTemplate
- TenantNotificationSettings backfill: total_tenants count == count of rows where triggerKey='geofence.alert'
- tsc --noEmit and npm run build pass locally
- Vercel production deploy succeeds
- Real (or manually invoked) geofence event produces SENT SendLog rows for OWNER + MANAGER recipients, no FAILED rows, no legacy fallback warnings
</verification>

<success_criteria>
- All 6 must-have truths from frontmatter verified true in production
- One template row inserted, all tenants backfilled with settings, sender refactored as wrapper, every call site (audit confirms 2) passes tenantId
- Legacy fallback path still exists inside try/catch — preserved per the Phase 41 wrapper pattern
- Geofence alerts now produce SendLog audit trail and are customizable per tenant from /settings/notifications
</success_criteria>

<output>
After completion, create `.planning/quick/322-phase-41-cleanup-wire-send-geofence-aler/322-SUMMARY.md` with:
- Audit table of sendGeofenceAlert call sites (with line numbers + tenantId source variable)
- Diff summary of route.ts, types.ts, send-geofence-alert.ts changes
- Seed run output (Inserted/Updated counts)
- Backfill SQL applied + post-state verification query result (total_tenants vs settings_rows counts)
- Production verification: SendLog query result showing SENT rows for the test geofence trigger
- Confirmation that no legacy fallback warning appeared in Vercel logs
</output>
