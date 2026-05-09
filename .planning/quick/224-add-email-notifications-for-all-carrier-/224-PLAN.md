---
phase: quick-224
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/emails/carrier/dispatch-assigned.tsx
  - apps/web/src/emails/carrier/load-delivered.tsx
  - apps/web/src/emails/carrier/pay-record-ready.tsx
  - apps/web/src/emails/carrier/invoice-generated.tsx
  - apps/web/src/emails/carrier/compliance-alert.tsx
  - apps/web/src/lib/carrier/notifications.ts
  - apps/web/src/lib/carrier/dispatches.ts
  - apps/web/src/lib/carrier/loads.ts
  - apps/web/src/lib/carrier/stop-completion.ts
  - apps/web/src/lib/carrier/pay-calculator.ts
  - apps/web/src/app/api/cron/carrier-compliance-alerts/route.ts
  - apps/web/vercel.json
autonomous: true
must_haves:
  truths:
    - "Dispatch assignment triggers email to assigned driver"
    - "Load delivered triggers email to tenant owner"
    - "Pay record creation triggers email to tenant owner"
    - "Load invoiced triggers email to client ap_contact_email"
    - "Daily compliance cron sends expiry alerts to tenant owner"
    - "All notifications are idempotent via NotificationLog"
    - "Failed emails never throw or block the triggering action"
  artifacts:
    - path: "apps/web/src/emails/carrier/dispatch-assigned.tsx"
      provides: "Dispatch assigned email template"
    - path: "apps/web/src/emails/carrier/load-delivered.tsx"
      provides: "Load delivered email template"
    - path: "apps/web/src/emails/carrier/pay-record-ready.tsx"
      provides: "Pay record ready email template"
    - path: "apps/web/src/emails/carrier/invoice-generated.tsx"
      provides: "Invoice generated email template"
    - path: "apps/web/src/emails/carrier/compliance-alert.tsx"
      provides: "Compliance alert email template"
    - path: "apps/web/src/lib/carrier/notifications.ts"
      provides: "Notification helper functions for all 5 event types"
  key_links:
    - from: "apps/web/src/lib/carrier/dispatches.ts"
      to: "apps/web/src/lib/carrier/notifications.ts"
      via: "sendDispatchAssignedNotification call in createDispatch"
      pattern: "sendDispatchAssignedNotification"
    - from: "apps/web/src/lib/carrier/stop-completion.ts"
      to: "apps/web/src/lib/carrier/notifications.ts"
      via: "sendLoadDeliveredNotification call after load status -> delivered"
      pattern: "sendLoadDeliveredNotification"
    - from: "apps/web/src/lib/carrier/pay-calculator.ts"
      to: "apps/web/src/lib/carrier/notifications.ts"
      via: "sendPayRecordReadyNotification call after records created"
      pattern: "sendPayRecordReadyNotification"
    - from: "apps/web/src/lib/carrier/notifications.ts"
      to: "apps/web/src/lib/notifications/notification-deduplication.ts"
      via: "wasNotificationAlreadySent + recordNotification + markNotificationSent"
      pattern: "wasNotificationAlreadySent"
---

<objective>
Add 5 automated email notifications to the Carrier Ops module: dispatch assigned, load delivered, pay record ready, invoice generated, and daily compliance alerts cron with email delivery.

Purpose: Keep drivers, owners, and clients informed of key carrier operations events without manual follow-up.
Output: 5 React Email templates, 1 notification helper module, trigger hooks in 4 existing files, enhanced compliance cron with email delivery.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/email/gmail-client.ts (sendEmail helper — Gmail SMTP, accepts react: ReactElement)
@apps/web/src/lib/notifications/notification-deduplication.ts (wasNotificationAlreadySent, recordNotification, markNotificationSent, markNotificationFailed)
@apps/web/src/emails/driver-invitation.tsx (template style reference — header/body/CTA/footer pattern with inline styles)
@apps/web/src/lib/carrier/dispatches.ts (createDispatch at line 151, updateDispatch at line 224)
@apps/web/src/lib/carrier/stop-completion.ts (completeStop — load delivered cascade at line 155, dispatch completed cascade at line 181)
@apps/web/src/lib/carrier/pay-calculator.ts (generateDriverPayRecords — creates pay records with status pending)
@apps/web/src/lib/carrier/loads.ts (updateLoad — generic field update including status)
@apps/web/src/lib/carrier/compliance.ts (getComplianceAlerts — returns typed alerts for CDL/registration/insurance/license/contract expiry)
@apps/web/src/app/api/cron/carrier-compliance-alerts/route.ts (existing cron — logs alerts to carrier_compliance_alert_log, needs email sending added)
@apps/web/vercel.json (cron schedule config — compliance-alerts already registered at 0 6 * * *)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create 5 React Email templates and the notification helper module</name>
  <files>
    apps/web/src/emails/carrier/dispatch-assigned.tsx
    apps/web/src/emails/carrier/load-delivered.tsx
    apps/web/src/emails/carrier/pay-record-ready.tsx
    apps/web/src/emails/carrier/invoice-generated.tsx
    apps/web/src/emails/carrier/compliance-alert.tsx
    apps/web/src/lib/carrier/notifications.ts
  </files>
  <action>
    **Create 5 email templates** in `apps/web/src/emails/carrier/` following the exact style pattern from `apps/web/src/emails/driver-invitation.tsx` (Html, Head, Body, Container, Section with header/content/footer, inline styles object, blue #1e40af brand header, white content area, CTA button).

    Each template must include:
    - Tenant company name in the header text (e.g., "DriveCommand - {companyName}")
    - Clear CTA button linking to the relevant page
    - Mobile responsive (max-width 600px container)
    - Props interface exported alongside the component

    1. **DispatchAssignedEmail** — props: dispatchNumber, scheduledDeparture, stopCount, truckUnitNumber, driverPortalUrl, companyName. Body shows dispatch details and "View Dispatch" CTA.

    2. **LoadDeliveredEmail** — props: loadNumber, clientName, originStop, destinationStop, deliveredAt, loadDetailUrl, companyName. Body shows delivery summary and "View Load" CTA.

    3. **PayRecordReadyEmail** — props: driverName, dispatchNumber, payPeriod, netPayAmount, payRecordsUrl, companyName. Body shows pay summary (no detailed financial breakdown) and "View Pay Records" CTA. Format netPayAmount as currency.

    4. **InvoiceGeneratedEmail** — props: loadNumber, contractName, invoiceTotal, dueDate, clientPortalUrl (optional — only shown if portal_access is true), companyName. Body shows invoice summary and optional "View in Portal" CTA.

    5. **ComplianceAlertEmail** — props: companyName, alerts (array of {type, message, severity, link}), dashboardUrl. Body shows a list of compliance alerts with severity indicators (red for critical, amber for warning) and "View Compliance Dashboard" CTA.

    **Create notification helper module** at `apps/web/src/lib/carrier/notifications.ts`:

    Import: `sendEmail` from `@/lib/email/gmail-client`, `prisma` from `@/lib/db/prisma`, `logger` from `@/lib/logger`, `wasNotificationAlreadySent`, `recordNotification`, `markNotificationSent`, `markNotificationFailed` from `@/lib/notifications/notification-deduplication`, `getAppBaseUrl` from `@/lib/app-url`, React, and all 5 email templates.

    Each function follows this pattern:
    ```
    1. Build idempotency key
    2. Check wasNotificationAlreadySent — if true, return early
    3. Query recipient email (driver email via User join, or owner email, or client ap_contact_email)
    4. If no email found, log warning and return
    5. recordNotification (PENDING)
    6. Build template props and call sendEmail
    7. markNotificationSent with returned id
    8. On error: markNotificationFailed, log error, do NOT throw
    ```

    Functions to create:

    a) `sendDispatchAssignedNotification(orgId: string, dispatchId: string, driverId: string)`:
       - Idempotency key: `carrier-dispatch-assigned-${dispatchId}-${driverId}`
       - Query: carrierDispatch (dispatchNumber from notes tag, scheduledDeparture, stops count, truck unitNumber), carrierDriver -> User email
       - Extract dispatch number from notes via regex: `/\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/`
       - Subject: `New Dispatch Assigned - ${dispatchNumber}`

    b) `sendLoadDeliveredNotification(orgId: string, loadId: string)`:
       - Idempotency key: `carrier-load-delivered-${loadId}`
       - Query: carrierLoad (referenceNumber, client name, stops for origin/destination), User where tenantId matches org and role=OWNER
       - Find tenant via: `prisma.tenant.findFirst({ where: { id: orgId } })` to get tenantId, then find owner User
       - Subject: `Load Delivered - ${referenceNumber}`
       - Origin = first stop with stopType='pickup', Destination = last stop with stopType='delivery'

    c) `sendPayRecordReadyNotification(orgId: string, payRecordId: string, driverName: string, dispatchNumber: string, netPay: number)`:
       - Idempotency key: `carrier-pay-record-pending-${payRecordId}`
       - Query: owner User for this org
       - Subject: `Driver Pay Record Ready for Review - ${driverName}`
       - payPeriod: current month/year string

    d) `sendInvoiceGeneratedNotification(orgId: string, loadId: string)`:
       - Idempotency key: `carrier-invoice-generated-${loadId}`
       - Query: carrierLoad with client (ap_contact_email, portal_access, payment_terms_days) and contract (payment_terms_override)
       - If client.apContactEmail is null, log and return early
       - Compute dueDate: today + (contract.paymentTermsOverride ?? client.paymentTermsDays ?? 30) days
       - Subject: `Invoice Ready - ${referenceNumber} - ${contractName}`

    e) `sendComplianceAlertNotifications(orgId: string, alerts: ComplianceAlert[])`:
       - For each alert, idempotency key: `carrier-compliance-${alert.type}-${alert.entityId}-${daysThreshold}`
         where daysThreshold is derived from alert type (60 for cdl, 30 for others)
       - But instead of one email per alert, batch all alerts for an org into ONE email
       - Check if ALL alerts for this org were already sent (wasNotificationAlreadySent for each)
       - Filter to only unsent alerts
       - If no unsent alerts, return
       - Use a single idempotency key for the batch: `carrier-compliance-batch-${orgId}-${dateStr}` (one batch email per org per day)
       - Query owner User for this org
       - Subject: `${alerts.length} Compliance Alert(s) Require Attention`

    Helper: `getOwnerEmail(orgId: string)` — query `prisma.user.findFirst({ where: { tenantId: orgId, role: 'OWNER', isActive: true }, select: { email: true, firstName: true, lastName: true } })`. Note: for Carrier Ops, the orgId from carrier tables IS the tenantId (they are the same thing).

    Helper: `getDriverEmail(driverId: string)` — query `prisma.carrierDriver.findFirst({ where: { id: driverId }, select: { userId: true, user: { select: { email: true } } } })`. The carrierDriver has a userId FK to User.

    IMPORTANT: Every function must be wrapped in try/catch at the top level. On any error, log with `logger.error` including notification type and entity ID, but NEVER throw. Return void.
  </action>
  <verify>
    Run `cd apps/web && npx tsc --noEmit` — no type errors in the new files. Verify all 5 templates exist in `apps/web/src/emails/carrier/` and `notifications.ts` exports all 5 send functions.
  </verify>
  <done>
    5 React Email templates exist in apps/web/src/emails/carrier/ matching the existing DriveCommand email style. notifications.ts exports sendDispatchAssignedNotification, sendLoadDeliveredNotification, sendPayRecordReadyNotification, sendInvoiceGeneratedNotification, and sendComplianceAlertNotifications — all with full idempotency via NotificationLog and silent error handling.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire notification triggers into existing carrier lib functions and enhance compliance cron</name>
  <files>
    apps/web/src/lib/carrier/dispatches.ts
    apps/web/src/lib/carrier/stop-completion.ts
    apps/web/src/lib/carrier/pay-calculator.ts
    apps/web/src/lib/carrier/loads.ts
    apps/web/src/app/api/cron/carrier-compliance-alerts/route.ts
    apps/web/vercel.json
  </files>
  <action>
    **1. dispatches.ts — Dispatch assigned notification:**
    - Import `sendDispatchAssignedNotification` from `@/lib/carrier/notifications`
    - In `createDispatch()` (around line 220, after the dispatch is created and logged), add:
      ```
      // Fire-and-forget: notify assigned driver
      sendDispatchAssignedNotification(orgId, dispatch.id, data.primaryDriverId).catch(() => {});
      ```
    - In `updateDispatch()`, after the update completes (around line 253), check if `data.primaryDriverId` was provided AND differs from `existing.primaryDriverId`. If so, fire the same notification for the new driver:
      ```
      if (data.primaryDriverId && data.primaryDriverId !== existing.primaryDriverId) {
        sendDispatchAssignedNotification(orgId, id, data.primaryDriverId).catch(() => {});
      }
      ```

    **2. stop-completion.ts — Load delivered notification:**
    - Import `sendLoadDeliveredNotification` from `@/lib/carrier/notifications`
    - In `completeStop()`, after the load is marked as delivered (inside the `if (pendingDeliveries === 0)` block, around line 167 after the logger.info), add:
      ```
      sendLoadDeliveredNotification(orgId, stop.loadId).catch(() => {});
      ```

    **3. loads.ts — Invoice generated notification:**
    - Import `sendInvoiceGeneratedNotification` from `@/lib/carrier/notifications`
    - In `updateLoad()`, after the update is applied (after line 244 `const updated = await prisma.carrierLoad.update(...)`), detect status change to 'invoiced':
      ```
      // Notify client when load is marked as invoiced
      if (data.status === 'invoiced' && existing.status !== 'invoiced') {
        sendInvoiceGeneratedNotification(orgId, id).catch(() => {});
      }
      ```
    - WAIT: `updateLoad` currently does NOT accept a `status` field — the `LoadUpdateInput` type and the update spread do not include status. This means status changes to 'invoiced' must happen somewhere else, or we need to add status to the update function.
    - Check the PATCH route — it uses `LoadUpdateSchema` which also lacks status.
    - SOLUTION: Add `status` to `LoadUpdateInput` (as optional string) and to the `updateLoad` function's data spread. Add status to the `LoadUpdateSchema` in the `[id]/route.ts` as `z.enum(['pending', 'in_transit', 'delivered', 'cancelled', 'invoiced']).optional()`. Then add the notification trigger.
    - In `loads.ts`:
      - Add to `LoadUpdateInput`: `status?: string;`
      - Add to the update data spread in `updateLoad`: `...(data.status !== undefined ? { status: data.status } : {}),`
      - After the update, before the revenue recalc check:
        ```
        if (data.status === 'invoiced' && existing.status !== 'invoiced') {
          sendInvoiceGeneratedNotification(orgId, id).catch(() => {});
        }
        ```
    - In `apps/web/src/app/api/v1/carrier/loads/[id]/route.ts`:
      - Add `status: z.enum(['pending', 'in_transit', 'delivered', 'cancelled', 'invoiced']).optional(),` to `LoadUpdateSchema`

    **4. pay-calculator.ts — Pay record ready notification:**
    - Import `sendPayRecordReadyNotification` from `@/lib/carrier/notifications`
    - At the end of `generateDriverPayRecords()`, after all records are created (around line 290, before the return), for each created record, fire the notification. The simplest approach: after the loop that creates records, query the just-created records:
      ```
      // Notify owner about each new pay record
      const newRecords = await prisma.carrierDriverPayRecord.findMany({
        where: { dispatchId, orgId },
        select: { id: true, netPay: true, driver: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        take: recordsCreated,
      });
      for (const rec of newRecords) {
        const driverName = `${rec.driver.firstName} ${rec.driver.lastName}`.trim();
        sendPayRecordReadyNotification(
          orgId,
          rec.id,
          driverName,
          dispatchId, // pass dispatchId so helper can extract dispatch number
          Number(rec.netPay ?? 0)
        ).catch(() => {});
      }
      ```
    - NOTE: The pay-calculator creates records via `prisma.carrierDriverPayRecord.create`. The `netPay` is stored as Decimal. The driver relation should be available via the `driver` select.
    - Update `sendPayRecordReadyNotification` signature if needed — accept dispatchId instead of dispatchNumber, and let the helper extract the dispatch number from the dispatch notes.

    **5. carrier-compliance-alerts cron — Add email delivery:**
    - Import `sendComplianceAlertNotifications` from `@/lib/carrier/notifications`
    - After the alerts are logged to `carrier_compliance_alert_log` (around line 93), add email sending:
      ```
      // Send email notification with all alerts for this org
      if (alerts.length > 0) {
        try {
          await sendComplianceAlertNotifications(tenant.id, alerts);
        } catch (err) {
          logger.error('[CRON] carrier-compliance-alerts: email notification failed', { tenantId: tenant.id, error: err });
        }
      }
      ```
    - The cron schedule in vercel.json is already correct (0 6 * * * — daily at 06:00 UTC). The task description says 07:00 UTC but the existing cron is at 06:00 — keep the existing schedule to avoid disruption.
    - No changes needed to vercel.json.

    **Tenant isolation rules for all triggers:**
    - Every query in notifications.ts must scope by orgId
    - The owner email lookup uses tenantId = orgId (same field in this schema)
    - Never cross-tenant: driver email comes from the driver's own User record
    - Client email comes from the client record that belongs to the same org as the load
  </action>
  <verify>
    Run `cd apps/web && npx tsc --noEmit` — no type errors across all modified files. Grep for all 5 notification function imports to confirm they are wired:
    - `grep -r "sendDispatchAssignedNotification" apps/web/src/lib/carrier/dispatches.ts`
    - `grep -r "sendLoadDeliveredNotification" apps/web/src/lib/carrier/stop-completion.ts`
    - `grep -r "sendPayRecordReadyNotification" apps/web/src/lib/carrier/pay-calculator.ts`
    - `grep -r "sendInvoiceGeneratedNotification" apps/web/src/lib/carrier/loads.ts`
    - `grep -r "sendComplianceAlertNotifications" apps/web/src/app/api/cron/carrier-compliance-alerts/route.ts`
  </verify>
  <done>
    All 5 notification types are wired into their trigger points: createDispatch fires dispatch-assigned, completeStop fires load-delivered when cascade marks load delivered, updateLoad fires invoice-generated when status changes to invoiced, generateDriverPayRecords fires pay-record-ready for each created record, and the compliance cron sends batched alert emails per org. All triggers are fire-and-forget with .catch(() => {}) to never block the calling action. Status field is now accepted in load updates to support the invoiced transition.
  </done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` passes with zero errors
2. All 5 email templates exist in `apps/web/src/emails/carrier/`
3. `apps/web/src/lib/carrier/notifications.ts` exports all 5 send functions
4. Each trigger point has the notification call wired with `.catch(() => {})`
5. All notification functions use NotificationLog for idempotency
6. No existing tests broken
</verification>

<success_criteria>
- 5 React Email templates created matching DriveCommand style (header, body, CTA, footer)
- Notification helper module with idempotency for all 5 event types
- Dispatch creation/reassignment triggers driver email
- Load delivered cascade triggers owner email
- Pay record creation triggers owner email
- Load status change to invoiced triggers client email (only if ap_contact_email exists)
- Compliance cron sends batched alert email to owner (one per org per day)
- Zero type errors, zero blocking of parent actions on email failure
</success_criteria>

<output>
After completion, create `.planning/quick/224-add-email-notifications-for-all-carrier-/224-SUMMARY.md`
</output>
