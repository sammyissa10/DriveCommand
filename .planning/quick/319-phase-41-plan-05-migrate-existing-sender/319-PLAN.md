---
phase: 319-phase-41-plan-05-migrate-existing-sender
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/email/send-driver-invitation.ts
  - apps/web/src/lib/email/send-owner-invitation.ts
  - apps/web/src/lib/email/send-maintenance-reminder.ts
  - apps/web/src/lib/email/send-document-expiry-reminder.ts
  - apps/web/src/lib/email/send-driver-document-expiry-reminder.ts
  - apps/web/src/lib/email/send-geofence-alert.ts
  - apps/web/src/lib/email/send-sysadmin-invoice.ts
  - apps/web/src/lib/email/send-fleet-message-notifications.ts
  - apps/web/src/lib/email/customer-notifications.ts
  - apps/web/src/app/api/cron/send-reminders/route.ts
  - apps/web/vercel.json
  - apps/web/src/app/(admin)/notifications/send-log-tab.tsx
  - apps/web/src/lib/notifications/digests/daily-driver-payload.ts
  - apps/web/src/lib/notifications/digests/weekly-owner-payload.ts
  - apps/web/src/lib/notifications/digests/compliance-30day-payload.ts
  - apps/web/src/app/api/cron/digest-daily-driver/route.ts
  - apps/web/src/app/api/cron/digest-weekly-owner/route.ts
  - apps/web/src/app/api/cron/digest-compliance-30day/route.ts
  - apps/web/src/app/(admin)/notifications/health-tile.tsx
  - docs/notifications.md
autonomous: true

must_haves:
  truths:
    - "Existing send* functions keep their exact public signatures unchanged"
    - "Internally each migrated sender calls dispatchNotification with a try/catch fallback to the legacy implementation"
    - "The existing send-reminders cron route routes maintenance and document expiry through dispatchNotification while returning the same JSON summary shape"
    - "Three new digest cron routes (daily_driver, weekly_owner, compliance_30day) are registered in vercel.json with documented EST equivalents"
    - "Each digest cron route enforces Bearer CRON_SECRET, iterates tenants via bypass_rls, and calls dispatchNotification when payload is non-null"
    - "Each digest payload builder returns null when the recipient has nothing to report"
    - "SysAdmin Send Log tab shows a health tile with last-24h sent/failed/failure rate plus top failing trigger when failure rate > 5%"
    - "A developer reference doc at docs/notifications.md covers architecture, how to add a trigger, local testing, and troubleshooting"
    - "send-support-notifications.ts is NOT migrated and is documented as excluded"
  artifacts:
    - path: "apps/web/src/lib/notifications/digests/daily-driver-payload.ts"
      provides: "Daily driver digest payload builder (returns null when nothing to report)"
    - path: "apps/web/src/lib/notifications/digests/weekly-owner-payload.ts"
      provides: "Weekly owner digest payload builder (returns null when nothing to report)"
    - path: "apps/web/src/lib/notifications/digests/compliance-30day-payload.ts"
      provides: "30-day compliance digest payload builder (returns null when nothing to report)"
    - path: "apps/web/src/app/api/cron/digest-daily-driver/route.ts"
      provides: "Daily driver digest cron route"
      exports: ["GET"]
    - path: "apps/web/src/app/api/cron/digest-weekly-owner/route.ts"
      provides: "Weekly owner digest cron route"
      exports: ["GET"]
    - path: "apps/web/src/app/api/cron/digest-compliance-30day/route.ts"
      provides: "30-day compliance digest cron route"
      exports: ["GET"]
    - path: "apps/web/src/app/(admin)/notifications/health-tile.tsx"
      provides: "SysAdmin notifications health dashboard tile"
    - path: "docs/notifications.md"
      provides: "Developer reference doc for the notifications system"
    - path: "apps/web/vercel.json"
      provides: "Vercel cron registration with 4 cron entries (1 existing + 3 new digests)"
      contains: "digest-daily-driver"
  key_links:
    - from: "apps/web/src/lib/email/send-driver-invitation.ts"
      to: "apps/web/src/lib/notifications/dispatcher.ts"
      via: "dispatchNotification('user.invited' or 'driver.invited', ...) with try/catch fallback"
      pattern: "dispatchNotification\\("
    - from: "apps/web/src/app/api/cron/send-reminders/route.ts"
      to: "apps/web/src/lib/notifications/dispatcher.ts"
      via: "dispatchNotification('truck.maintenance_due' / 'truck.document_expiring' / 'driver.license_expiring')"
      pattern: "dispatchNotification\\("
    - from: "apps/web/src/app/api/cron/digest-daily-driver/route.ts"
      to: "apps/web/src/lib/notifications/digests/daily-driver-payload.ts"
      via: "buildDailyDriverPayload(tenantPrisma, userId)"
      pattern: "buildDailyDriverPayload"
    - from: "apps/web/src/app/(admin)/notifications/send-log-tab.tsx"
      to: "apps/web/src/app/(admin)/notifications/health-tile.tsx"
      via: "render <HealthTile /> at top of Send Log tab"
      pattern: "HealthTile"
---

<objective>
Phase 41 Plan 05 - final plan of the Tenant-Configurable Notification System. Migrate scattered send* senders so they internally route through `dispatchNotification` (without changing call sites), wire three new scheduled digest cron routes, and add a SysAdmin health monitoring tile.

Purpose: Tenants who customize templates see their customizations applied to existing notifications immediately. Scheduled digests run on Vercel cron via the dispatcher. SysAdmin can see send health at a glance. Migration is zero-risk via try/catch fallback to legacy paths.

Output: 9 wrapped sender files, 1 updated existing cron route, 3 new digest cron routes + payload builders, 1 updated vercel.json, 1 SysAdmin health tile, 1 developer reference doc.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/specs/Notifications System Technical Documentation.md
@.planning/quick/315-phase-41-plan-01-notification-system-dat/315-SUMMARY.md
@.planning/quick/316-phase-41-plan-02-notification-dispatcher/316-SUMMARY.md
@apps/web/src/lib/notifications/dispatcher.ts
@apps/web/src/lib/notifications/types.ts
@apps/web/src/lib/security/cron-auth.ts
@apps/web/src/app/api/cron/send-reminders/route.ts
@apps/web/vercel.json
</context>

<preflight>
Before writing any code, confirm the seeded digest templates exist. If any digest trigger is missing, STOP and report.

```bash
grep -E "digest\.daily_driver|digest\.weekly_owner|digest\.compliance_30day" apps/web/prisma/seeds/notification-template-data/digest.ts
```

Expected: all 3 trigger keys present. If not, the cron routes cannot dispatch them — STOP and report before continuing.

Also locate the existing `getNotificationSendLogStats` (or equivalent) action exported from `apps/web/src/app/(admin)/actions/notifications.ts` — the health tile MUST reuse it; do not add a new stats endpoint.
</preflight>

<tasks>

<task type="auto">
  <name>Task 1: Wrap existing send* senders to route through dispatcher (with legacy fallback)</name>
  <files>
    apps/web/src/lib/email/send-driver-invitation.ts
    apps/web/src/lib/email/send-owner-invitation.ts
    apps/web/src/lib/email/send-maintenance-reminder.ts
    apps/web/src/lib/email/send-document-expiry-reminder.ts
    apps/web/src/lib/email/send-driver-document-expiry-reminder.ts
    apps/web/src/lib/email/send-geofence-alert.ts
    apps/web/src/lib/email/send-sysadmin-invoice.ts
    apps/web/src/lib/email/send-fleet-message-notifications.ts
    apps/web/src/lib/email/customer-notifications.ts
  </files>
  <action>
    For EACH file in the list above (NOT send-support-notifications.ts, NOT resend-client.ts, NOT gmail-client.ts):

    1. Keep the exported function name(s) and signature(s) EXACTLY as they are now. Callers MUST NOT need to change.
    2. Rename the existing body to a private `legacy<FunctionName>(...)` function (do NOT delete it — keep as fallback).
    3. Replace the exported function body with this pattern:

       ```ts
       export async function sendX(toEmail: string, data: XData): Promise<{ id: string }> {
         try {
           // Determine tenantId — accept it from `data` if present, otherwise look up via existing means.
           // If we genuinely cannot determine tenantId (e.g. sysadmin-internal email), fall through to legacy.
           if (!data.tenantId) {
             return await legacySendX(toEmail, data);
           }
           const result = await dispatchNotification('<trigger.key>', {
             tenantId: data.tenantId,
             payload: { /* map data fields → payload shape from NotificationPayload type */ },
             relatedEntity: { type: '<EntityType>', id: data.<entityId> },
           });
           // Dispatcher returns counts, not a Resend id. For backward compatibility return a synthetic id.
           return { id: `dispatch:${result.sent}:${result.skipped}:${result.failed}` };
         } catch (err) {
           console.warn('[notifications] dispatcher failed, falling back to legacy sender', err);
           return legacySendX(toEmail, data);
         }
       }
       ```

    4. Add a file-header comment marking the file as a wrapper:
       ```
       /**
        * WRAPPER (Phase 41 Plan 05): This file now routes through dispatchNotification.
        * The original implementation is preserved below as `legacy*` and serves as the
        * fallback path inside the try/catch. Do NOT delete — slated for cleanup after
        * two weeks of stable production operation.
        */
       ```

    5. Trigger key mapping (use these EXACT keys from `apps/web/src/lib/notifications/types.ts`):
       - send-driver-invitation.ts → `'driver.invited'`
       - send-owner-invitation.ts → `'user.invited'`
       - send-maintenance-reminder.ts → `'truck.maintenance_due'`
       - send-document-expiry-reminder.ts → `'truck.document_expiring'`
       - send-driver-document-expiry-reminder.ts → `'driver.license_expiring'`
       - send-geofence-alert.ts → no dedicated trigger; KEEP LEGACY ONLY (add header comment explaining it stays on the legacy path until a `truck.geofence` trigger is added in a future phase — do NOT invent a trigger key)
       - send-sysadmin-invoice.ts → `'invoice.created'` (note: sysadmin billing — the tenantId on the payload is the BILLED tenant, not the sender)
       - send-fleet-message-notifications.ts → `'message.received'` (or `'message.broadcast'` when isBroadcast=true; pick at call time inside the wrapper)
       - customer-notifications.ts (sendLoadStatusEmail) → `'customer.tracking_link_sent'` when status is in transit/dispatched, `'customer.delivered_notification'` when status='DELIVERED'

    6. tenantId resolution: If the existing `data` interface does NOT include `tenantId`, ADD an optional `tenantId?: string` field at the END of the interface so callers can pass it without breaking the existing positional/named usage. When tenantId is absent, fall through to legacy (do NOT throw).

    7. Map every payload field from `data` to the typed `NotificationPayload[K]` shape in `types.ts`. If `data` is missing a field the payload requires, use a sensible empty string or derived value (e.g. `loadNumber: data.loadNumber ?? ''`). NEVER throw inside the try block — let the dispatcher proceed and let any error escape to the legacy fallback.

    8. Imports: add `import { dispatchNotification } from '@/lib/notifications/dispatcher';` to each wrapped file.

    Do NOT modify send-support-notifications.ts. Do NOT modify resend-client.ts or gmail-client.ts. Do NOT change any existing call site in src/app/.
  </action>
  <verify>
    Run from `apps/web`:
    ```
    npx tsc --noEmit
    ```
    Then grep to confirm:
    ```
    grep -l "dispatchNotification" src/lib/email/*.ts
    ```
    Expected: 8 of 9 wrapped files appear (geofence stays legacy). Verify send-support-notifications.ts is NOT in the result.

    Verify no call sites changed:
    ```
    git diff --stat src/app/ src/actions/
    ```
    Expected: no files in src/app/ or src/actions/ touched by this task.
  </verify>
  <done>
    9 wrapped files have file-header WRAPPER comment, each exported function keeps its original signature, each (except geofence) imports and calls dispatchNotification with try/catch fallback to a renamed legacyX function. send-support-notifications.ts is untouched. tsc passes.
  </done>
</task>

<task type="auto">
  <name>Task 2: Migrate send-reminders cron to dispatcher (preserve JSON summary shape)</name>
  <files>apps/web/src/app/api/cron/send-reminders/route.ts</files>
  <action>
    Modify the existing send-reminders cron route:

    1. KEEP the existing CRON_SECRET auth check via `verifyCronSecret(request)` and `cronUnauthorizedResponse()` — do NOT touch the auth pattern.
    2. KEEP the tenant fetch via bypass_rls transaction — do NOT change.
    3. KEEP `findUpcomingMaintenance`, `findExpiringDocuments`, `findExpiringDriverDocuments` calls — these still provide the data.
    4. KEEP the same per-tenant owners lookup.
    5. REPLACE the inner per-item per-owner loop bodies:
       - Maintenance reminder: instead of calling `sendMaintenanceReminder(...)` directly, call `dispatchNotification('truck.maintenance_due', { tenantId: tenant.id, payload: { truckId: item.truckId, unitNumber: item.truckName, maintenanceType: item.serviceType, dueAt: item.nextDueDate?.toISOString() ?? '' }, relatedEntity: { type: 'Truck', id: item.truckId } })`. Accumulate result.sent/skipped/failed into the existing maintenanceStats counters.
       - Document expiry: dispatch `'truck.document_expiring'` with payload `{ truckId, unitNumber: item.truckName, documentType: item.documentType, expiresAt: item.expiryDate.toISOString() }` and relatedEntity Truck. Accumulate into documentStats.
       - Driver document expiry: dispatch `'driver.license_expiring'` with payload `{ driverId, driverName, licenseType: formatDocumentType(item.documentType), expiresAt: item.expiryDate.toISOString(), daysUntilExpiry: String(item.daysUntilExpiry) }` and relatedEntity Document. Accumulate into driverDocumentStats.
    6. REMOVE the per-owner inner loop AND the legacy `recordNotification` / `markNotificationSent` / `generateIdempotencyKey` calls — the dispatcher handles recipients (via default recipient rules) and idempotency. Delete the now-unused imports for `sendMaintenanceReminder`, `sendDocumentExpiryReminder`, `sendDriverDocumentExpiryReminder`, `generateIdempotencyKey`, `recordNotification`, `markNotificationSent`, and the `owners` fetch (the dispatcher resolves recipients from default rules).
    7. PRESERVE the return JSON summary shape EXACTLY (`{ success, processedTenants, maintenance, documents, driverDocuments }`) — callers may depend on this shape.
    8. Wrap each `dispatchNotification` call in try/catch — log failures via `logger.error` and increment failed count. Do NOT abort the tenant loop on a single failure.

    Keep all existing logger.info messages or update them to reflect the new flow.
  </action>
  <verify>
    ```
    cd apps/web && npx tsc --noEmit
    grep -c "dispatchNotification" src/app/api/cron/send-reminders/route.ts
    ```
    Expected: tsc passes, dispatchNotification appears at least 3 times in the route.

    Verify the return shape is preserved:
    ```
    grep -E "processedTenants|maintenance|documents|driverDocuments" src/app/api/cron/send-reminders/route.ts
    ```
    All four keys present in the summary object.
  </verify>
  <done>
    Cron route uses dispatchNotification for all three reminder types, preserves CRON_SECRET auth, preserves JSON summary shape, removes legacy per-owner loop and recordNotification/markNotificationSent calls.
  </done>
</task>

<task type="auto">
  <name>Task 3: Build 3 digest payload builders + 3 cron routes + register in vercel.json</name>
  <files>
    apps/web/src/lib/notifications/digests/daily-driver-payload.ts
    apps/web/src/lib/notifications/digests/weekly-owner-payload.ts
    apps/web/src/lib/notifications/digests/compliance-30day-payload.ts
    apps/web/src/app/api/cron/digest-daily-driver/route.ts
    apps/web/src/app/api/cron/digest-weekly-owner/route.ts
    apps/web/src/app/api/cron/digest-compliance-30day/route.ts
    apps/web/vercel.json
  </files>
  <action>
    PART A — Payload builders (3 files in apps/web/src/lib/notifications/digests/):

    Each builder exports a single function that takes a tenant-scoped prisma client + a recipient userId and returns `Promise<NotificationPayload[K] | null>`. Returning `null` short-circuits the dispatch.

    1. `daily-driver-payload.ts`
       - Function: `buildDailyDriverPayload(tx: PrismaClient, tenantId: string, driverUserId: string, date: Date): Promise<NotificationPayload['digest.daily_driver'] | null>`
       - Query loads/stops for this driver for `date` (today in UTC; use `gte` start-of-day, `lt` start-of-next-day).
       - If 0 loads AND 0 stops AND no HOS events → return null.
       - Otherwise return `{ driverName, date: date.toISOString().slice(0,10), loadCount: String(loads.length), summaryHtml: <small HTML snippet listing loads> }`.
       - The summaryHtml is plain `<ul><li>...</li></ul>` — keep simple, no external libs.

    2. `weekly-owner-payload.ts`
       - Function: `buildWeeklyOwnerPayload(tx, tenantId, ownerUserId, weekStart: Date): Promise<NotificationPayload['digest.weekly_owner'] | null>`
       - Aggregate loads (count + revenue) for the week (Mon–Sun preceding `weekStart`).
       - If 0 loads → return null.
       - Return `{ ownerName, weekRange: 'YYYY-MM-DD to YYYY-MM-DD', loadCount: String(n), revenue: formatted, summaryHtml }`.

    3. `compliance-30day-payload.ts`
       - Function: `buildCompliance30DayPayload(tx, tenantId, ownerUserId): Promise<NotificationPayload['digest.compliance_30day'] | null>`
       - Find truck documents + driver documents expiring within 30 days from now.
       - If 0 expiring docs → return null.
       - Return `{ ownerName, expiringDocCount: String(n), summaryHtml: <ul of items> }`.

    Use `withTenantRLS(tenantId)` extended prisma client (same pattern as send-reminders cron) inside the builder — or accept a pre-scoped client from the caller. Pick one and document with a JSDoc comment.

    PART B — Cron routes (3 files in apps/web/src/app/api/cron/):

    Each route is `app/api/cron/<name>/route.ts` and exports `GET(request: NextRequest)`. Pattern:

    ```ts
    import { NextRequest } from 'next/server';
    import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
    import { withTenantRLS } from '@/lib/db/extensions/tenant-rls';
    import { dispatchNotification } from '@/lib/notifications/dispatcher';
    import { verifyCronSecret, cronUnauthorizedResponse } from '@/lib/security/cron-auth';
    import { logger } from '@/lib/logger';
    import { buildXPayload } from '@/lib/notifications/digests/x-payload';

    export const dynamic = 'force-dynamic';

    export async function GET(request: NextRequest) {
      if (!verifyCronSecret(request)) return cronUnauthorizedResponse();

      // List all active tenants via bypass_rls (copy pattern from send-reminders/route.ts).
      const tenants = await prisma.$transaction(async (tx: any) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.tenant.findMany({ where: { isActive: true }, select: { id: true, name: true } });
      }, TX_OPTIONS);

      let sent = 0, skipped = 0, failed = 0;

      for (const tenant of tenants) {
        try {
          const tenantPrisma: any = prisma.$extends(withTenantRLS(tenant.id));
          // List eligible recipients for this digest:
          //   daily_driver → tenant DRIVERs (isActive)
          //   weekly_owner → tenant OWNERs (isActive)
          //   compliance_30day → tenant OWNERs (isActive)
          const recipients = await tenantPrisma.user.findMany({
            where: { role: '<DRIVER|OWNER>', isActive: true },
            select: { id: true, email: true, firstName: true },
          });

          for (const r of recipients) {
            const payload = await buildXPayload(tenantPrisma, tenant.id, r.id, /* date if applicable */);
            if (!payload) { skipped++; continue; }
            const result = await dispatchNotification('<digest.x>', {
              tenantId: tenant.id,
              payload,
              relatedEntity: { type: 'Digest', id: `${tenant.id}:${r.id}:${todayIso}` },
            }).catch(err => { logger.error('[CRON] digest dispatch failed', err); return { sent: 0, skipped: 0, failed: 1 }; });
            sent += result.sent; skipped += result.skipped; failed += result.failed;
          }
        } catch (e) {
          logger.error(`[CRON] tenant ${tenant.id} digest failed`, e);
          failed++;
        }
      }

      return Response.json({ success: true, processedTenants: tenants.length, sent, skipped, failed });
    }
    ```

    Route names + payload binding:
    - `apps/web/src/app/api/cron/digest-daily-driver/route.ts` → DRIVER role recipients, `buildDailyDriverPayload`, trigger `'digest.daily_driver'`
    - `apps/web/src/app/api/cron/digest-weekly-owner/route.ts` → OWNER role recipients, `buildWeeklyOwnerPayload`, trigger `'digest.weekly_owner'`
    - `apps/web/src/app/api/cron/digest-compliance-30day/route.ts` → OWNER role recipients, `buildCompliance30DayPayload`, trigger `'digest.compliance_30day'`

    PART C — vercel.json:

    Update `apps/web/vercel.json` `crons` array to add THREE new entries. Convert EST to UTC:
    - Daily driver digest: 5 PM EST = 22:00 UTC (10 PM UTC), every day → `"0 22 * * *"` // 5 PM EST daily
    - Weekly owner digest: Friday 5 PM EST = Friday 22:00 UTC → `"0 22 * * 5"` // Friday 5 PM EST
    - Compliance 30-day: Monday 9 AM EST = Monday 14:00 UTC → `"0 14 * * 1"` // Monday 9 AM EST

    Add the 3 new entries to the existing `crons` array (1 existing send-reminders + 8 other existing entries from the file — keep ALL of them). vercel.json is strict JSON so do NOT add JS-style comments. Instead, embed the EST equivalent into each schedule entry by appending a sibling `"comment"` field is NOT supported either — instead document EST mappings inside `docs/notifications.md` AND in a JSDoc comment at the top of each new route file.

    Final vercel.json `crons` array length must be: (existing entries that were there before) + 3.
  </action>
  <verify>
    ```
    cd apps/web && npx tsc --noEmit
    cat vercel.json | node -e "const j=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('crons:', j.crons.length); console.log(j.crons.map(c=>c.path).join('\n'));"
    ```
    Expected: tsc passes; vercel.json crons array contains 3 new paths (digest-daily-driver, digest-weekly-owner, digest-compliance-30day) ALONGSIDE the existing entries (no entries removed).

    Sanity check digest builders:
    ```
    grep -E "return null" src/lib/notifications/digests/*.ts
    ```
    All 3 builder files contain at least one `return null` (the empty-digest short circuit).

    Local cron test (manual, document in summary):
    ```
    curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/digest-daily-driver
    ```
    Should return 200 with `{ success: true, processedTenants: n, sent, skipped, failed }`.
  </verify>
  <done>
    3 payload builders return null on empty data and a typed payload otherwise; 3 cron routes exist, each enforcing Bearer CRON_SECRET via verifyCronSecret, iterating tenants via bypass_rls, looking up role-appropriate recipients, and dispatching the correct digest trigger. vercel.json has the 3 new cron entries with correct UTC schedules. tsc passes.
  </done>
</task>

<task type="auto">
  <name>Task 4: Add SysAdmin health tile + developer reference doc + final build verify</name>
  <files>
    apps/web/src/app/(admin)/notifications/health-tile.tsx
    apps/web/src/app/(admin)/notifications/send-log-tab.tsx
    docs/notifications.md
  </files>
  <action>
    PART A — Health tile component:

    Create `apps/web/src/app/(admin)/notifications/health-tile.tsx` as a client component:

    ```tsx
    'use client';
    import { useEffect, useState } from 'react';
    import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
    import { getNotificationSendLogStats, /* type SendLogStats */ } from '@/app/(admin)/actions/notifications';

    export function HealthTile() {
      // last-24h scope:
      //   - Reuse getNotificationSendLogStats (do NOT add a new stats endpoint).
      //   - If the existing action does not support a 24h scope flag, call it as-is and use its `today` totals
      //     (which already represent last-24h according to Plan 03). Document this in a JSDoc comment.
      const [stats, setStats] = useState<any>(null);
      useEffect(() => { getNotificationSendLogStats().then(setStats); }, []);
      if (!stats) return null;
      const sent24 = stats.sentToday ?? 0;
      const failed24 = stats.failedToday ?? 0;
      const total = sent24 + failed24;
      const rate = total > 0 ? (failed24 / total) * 100 : 0;
      return (
        <Card>
          <CardHeader><CardTitle>Notification Health (last 24h)</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div><div className="text-2xl font-semibold">{sent24}</div><div className="text-xs text-muted-foreground">Sent</div></div>
              <div><div className="text-2xl font-semibold">{failed24}</div><div className="text-xs text-muted-foreground">Failed</div></div>
              <div><div className="text-2xl font-semibold">{rate.toFixed(1)}%</div><div className="text-xs text-muted-foreground">Failure rate</div></div>
            </div>
            {rate > 5 && stats.topFailingTrigger && (
              <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                Top failing trigger: <code>{stats.topFailingTrigger}</code>
              </div>
            )}
          </CardContent>
        </Card>
      );
    }
    ```

    If `getNotificationSendLogStats` does NOT currently expose `topFailingTrigger`, add it to that action's return shape (still in apps/web/src/app/(admin)/actions/notifications.ts) — minimal additive change: compute by grouping NotificationSendLog where status='FAILED' AND createdAt >= now()-24h, return the triggerKey with the highest count. Reuse existing bypass_rls helpers. Do NOT create a new file just for this — extend the existing action.

    PART B — Embed in Send Log tab:

    Modify `apps/web/src/app/(admin)/notifications/send-log-tab.tsx` to render `<HealthTile />` at the TOP of the tab body, above the existing KPI cards.

    PART C — Developer reference doc:

    Create `docs/notifications.md` with these sections (use clean markdown, no emojis):

    1. `# Notifications System — Developer Reference`
    2. `## Architecture overview` — one paragraph: links to `docs/specs/Notifications System Technical Documentation.md` for the full design, and links to the dispatcher source at `apps/web/src/lib/notifications/dispatcher.ts` plus the dispatcher README (`apps/web/src/lib/notifications/README.md` if it exists from Plan 02). Mentions the wrap-don't-rewrite migration approach.
    3. `## How to add a new notification trigger` — numbered checklist:
       1. Add the new trigger key to the `TriggerKey` union and `NotificationPayload` mapped type in `apps/web/src/lib/notifications/types.ts`.
       2. Add a new entry to the appropriate category seed in `apps/web/prisma/seeds/notification-template-data/` (use `buildDefaultTemplate` helper).
       3. Run `npm run seed:notifications`.
       4. Add `dispatchNotification('your.trigger.key', { tenantId, payload, relatedEntity })` to the originating server action or cron job. Use `.catch(err => console.error(...))` — never await blocking.
       5. The trigger automatically appears in `/admin/notifications` and `/settings/notifications`.
       6. For existing tenants, run a one-time SQL migration to insert a `TenantNotificationSettings` row per existing tenant (the Postgres trigger only fires on NEW tenant inserts).
    4. `## How to test a notification locally` — steps for: seeding templates, creating a test tenant, firing the trigger from a server action OR hitting a cron route via curl with `Authorization: Bearer $CRON_SECRET`, inspecting `NotificationSendLog` for SENT/FAILED rows, checking Resend dashboard for outbound mail.
    5. `## Scheduled digests` — table mapping each digest cron route to its schedule (in both UTC and EST), what it dispatches, and who receives it:
       | Route | UTC schedule | EST equivalent | Trigger | Recipients |
       | `/api/cron/digest-daily-driver` | `0 22 * * *` | 5 PM EST daily | `digest.daily_driver` | tenant DRIVERs |
       | `/api/cron/digest-weekly-owner` | `0 22 * * 5` | Friday 5 PM EST | `digest.weekly_owner` | tenant OWNERs |
       | `/api/cron/digest-compliance-30day` | `0 14 * * 1` | Monday 9 AM EST | `digest.compliance_30day` | tenant OWNERs |
    6. `## Excluded from migration` — one paragraph documenting that `send-support-notifications.ts` is intentionally NOT migrated: support notifications target the DriveCommand support inbox (SysAdmin-internal) and are not tenant-configurable.
    7. `## Troubleshooting` — common errors with fixes:
       - "Template not found" → run `npm run seed:notifications` and verify the row exists in `NotificationTemplate`.
       - "Tenant disabled this trigger" → check `/settings/notifications` for that tenant.
       - "401 Unauthorized" on cron route → check `CRON_SECRET` env var is set and the `Authorization: Bearer ...` header matches.
       - Email sent but tenant didn't see it → check `NotificationSendLog` for `SENT` vs `SKIPPED_USER_PREF` vs `FAILED`.
       - Wrapper is falling back to legacy on every call → check the wrapper's tenantId resolution and the dispatcher logs.

    PART D — Build verification:

    Run from repo root:
    ```
    cd apps/web && npm run build
    ```
    Must pass cleanly. If any new shadcn or Radix peer dependency is missing, install it with `npm install --workspace=apps/web --legacy-peer-deps` and verify it's in `apps/web/package.json` before declaring done.
  </action>
  <verify>
    1. `cd apps/web && npx tsc --noEmit` passes.
    2. `cd apps/web && npm run build` passes locally with no errors.
    3. Health tile renders at top of SysAdmin Send Log tab:
       ```
       grep -E "HealthTile" src/app/(admin)/notifications/send-log-tab.tsx
       ```
       Returns at least one match.
    4. Developer doc exists and contains all 7 sections:
       ```
       grep -E "^## (Architecture overview|How to add a new notification trigger|How to test a notification locally|Scheduled digests|Excluded from migration|Troubleshooting)" docs/notifications.md
       ```
       6 matches (plus the H1 title at top).
    5. vercel.json has 4 cron entries among others — count digests + send-reminders:
       ```
       grep -E "digest-daily-driver|digest-weekly-owner|digest-compliance-30day|send-reminders" apps/web/vercel.json | wc -l
       ```
       Expected: 4.
  </verify>
  <done>
    HealthTile component exists and is rendered at the top of the SysAdmin Send Log tab; the existing `getNotificationSendLogStats` action is reused (or minimally extended for `topFailingTrigger`); docs/notifications.md exists with all 7 sections; `npm run build` passes in apps/web; any newly required peer dep is installed and present in package.json.
  </done>
</task>

</tasks>

<verification>
1. Run from apps/web:
   ```
   npx tsc --noEmit
   npm run build
   ```
   Both pass with no errors.

2. Confirm no existing call sites changed:
   ```
   git diff --stat src/app/ src/actions/ -- ":(exclude)src/app/(admin)/notifications" ":(exclude)src/app/api/cron"
   ```
   No files in src/app/ (outside the admin notifications dir and cron routes) or src/actions/ touched.

3. Wrapped senders count:
   ```
   grep -l "dispatchNotification" src/lib/email/*.ts | wc -l
   ```
   Expected: 8 (all senders except send-support-notifications.ts, send-geofence-alert.ts, resend-client.ts, gmail-client.ts).

4. vercel.json has the 3 new digest entries plus the existing send-reminders entry:
   ```
   node -e "const j=require('./apps/web/vercel.json'); const p=j.crons.map(c=>c.path); console.log(['send-reminders','digest-daily-driver','digest-weekly-owner','digest-compliance-30day'].every(n=>p.some(x=>x.includes(n))));"
   ```
   Expected: prints `true`.

5. Local cron route smoke test (any one of the 3 new routes):
   ```
   curl -i -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/digest-daily-driver
   ```
   Returns HTTP 200 with `{ success: true, processedTenants, sent, skipped, failed }`.

6. Confirm send-support-notifications.ts is untouched:
   ```
   git diff --stat src/lib/email/send-support-notifications.ts
   ```
   Empty output.

7. Confirm docs/notifications.md exists and has all required sections (see Task 4 verify).
</verification>

<success_criteria>
- Every existing send* function (except send-support-notifications.ts and send-geofence-alert.ts) routes through dispatchNotification with a try/catch fallback to its legacy body.
- Zero existing call sites of those send* functions had to change.
- The existing send-reminders cron route dispatches `truck.maintenance_due`, `truck.document_expiring`, and `driver.license_expiring` via the dispatcher while preserving its JSON summary shape and CRON_SECRET auth.
- Three new cron routes exist for `digest.daily_driver`, `digest.weekly_owner`, `digest.compliance_30day`, each enforcing Bearer CRON_SECRET, iterating tenants via bypass_rls, fetching role-appropriate recipients, calling a payload builder that returns null on empty data, and dispatching the digest only when payload is non-null.
- vercel.json is updated with the 3 new cron entries on the correct UTC schedules. EST equivalents are documented in docs/notifications.md.
- SysAdmin Send Log tab in `/admin/notifications` shows a health tile at the top: last-24h sent / failed / failure rate, plus the top failing trigger when failure rate > 5%. The tile reuses the existing `getNotificationSendLogStats` action (extended minimally for top failing trigger if needed).
- docs/notifications.md exists with: architecture overview, add-a-trigger checklist, local testing steps, scheduled digests table, excluded-from-migration note (send-support-notifications.ts), and troubleshooting section.
- `npm run build` passes in apps/web with no errors. Any added peer dependency is in apps/web/package.json.
- send-support-notifications.ts and prisma/schema.prisma are untouched. The dispatcher library (apps/web/src/lib/notifications/dispatcher.ts) is untouched. The BlockEditor and /settings/notifications page are untouched.
</success_criteria>

<output>
After completion, create `.planning/quick/319-phase-41-plan-05-migrate-existing-sender/319-SUMMARY.md` summarizing:
- Files wrapped (list of 8) and the trigger key each maps to.
- send-geofence-alert.ts status (kept on legacy path; trigger key TBD in a future phase).
- Cron route updates: send-reminders modified, 3 new digest routes added.
- vercel.json final cron count (existing + 3 new).
- HealthTile location and whether `getNotificationSendLogStats` was extended for `topFailingTrigger`.
- docs/notifications.md sections delivered.
- Any new peer dependencies installed.
- Any deviations from the plan + rationale.
</output>
