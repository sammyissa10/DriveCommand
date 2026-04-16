---
phase: quick-224
plan: 01
subsystem: carrier-ops
tags: [email, notifications, carrier, idempotency, cron]
dependency_graph:
  requires:
    - apps/web/src/lib/email/gmail-client.ts
    - apps/web/src/lib/notifications/notification-deduplication.ts
    - apps/web/src/lib/carrier/compliance.ts
  provides:
    - 5 React Email templates for carrier events
    - Notification helper module with full idempotency
    - Email triggers on 5 carrier lifecycle events
  affects:
    - apps/web/src/lib/carrier/dispatches.ts
    - apps/web/src/lib/carrier/stop-completion.ts
    - apps/web/src/lib/carrier/pay-calculator.ts
    - apps/web/src/lib/carrier/loads.ts
    - apps/web/src/app/api/cron/carrier-compliance-alerts/route.ts
tech_stack:
  added: []
  patterns:
    - React Email templates with inline styles
    - Fire-and-forget notifications (.catch(() => {}))
    - NotificationLog idempotency via idempotency keys
    - Batch email per org per day for compliance alerts
key_files:
  created:
    - apps/web/src/emails/carrier/dispatch-assigned.tsx
    - apps/web/src/emails/carrier/load-delivered.tsx
    - apps/web/src/emails/carrier/pay-record-ready.tsx
    - apps/web/src/emails/carrier/invoice-generated.tsx
    - apps/web/src/emails/carrier/compliance-alert.tsx
    - apps/web/src/lib/carrier/notifications.ts
  modified:
    - apps/web/src/lib/carrier/dispatches.ts
    - apps/web/src/lib/carrier/stop-completion.ts
    - apps/web/src/lib/carrier/pay-calculator.ts
    - apps/web/src/lib/carrier/loads.ts
    - apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
    - apps/web/src/app/api/cron/carrier-compliance-alerts/route.ts
decisions:
  - "Used CarrierClient.email (not ap_contact_email) for invoice notifications — schema has email field only"
  - "CarrierDriver email uses user.email via join with direct email as fallback — both fields exist on the model"
  - "paymentTermsOverride is stored as string in schema — parseInt() applied before date math"
  - "Kept vercel.json unchanged — existing 06:00 UTC cron schedule preserved as designed"
metrics:
  duration: ~20 minutes
  completed: "2026-04-16T05:21:49Z"
  tasks_completed: 2
  files_created: 6
  files_modified: 6
---

# Phase quick-224: Add Email Notifications for All Carrier Events Summary

**One-liner:** 5 Gmail SMTP email notifications wired into carrier dispatch, load, pay, invoice, and compliance lifecycle events using React Email templates and NotificationLog idempotency.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create 5 React Email templates and notification helper | b1d6e82 | 6 new files in emails/carrier/ + notifications.ts |
| 2 | Wire notification triggers into existing carrier lib functions | ff1c122 | 6 files modified |

## What Was Built

### Email Templates (apps/web/src/emails/carrier/)

All 5 templates follow the DriveCommand email style: blue #1e40af header, white content area, details box, CTA button, footer.

1. **DispatchAssignedEmail** — sent to driver on dispatch create/reassignment. Shows dispatch number, scheduled departure, stop count, truck unit.
2. **LoadDeliveredEmail** — sent to owner when load cascade marks delivered. Shows load number, client, origin/destination facilities, delivered timestamp.
3. **PayRecordReadyEmail** — sent to owner when driver pay records are generated. Shows driver name, dispatch number, pay period, net pay (formatted as currency).
4. **InvoiceGeneratedEmail** — sent to client email when load status transitions to invoiced. Shows load number, contract name, invoice total, computed due date. Includes portal CTA only if `portalAccess = true`.
5. **ComplianceAlertEmail** — batched daily email to owner. Lists critical alerts (red left border) and warnings (amber left border) grouped separately.

### Notification Helper (apps/web/src/lib/carrier/notifications.ts)

5 exported functions, all following this pattern:
1. Build idempotency key
2. Check `wasNotificationAlreadySent` — early return if true
3. Query recipient email (driver/owner/client)
4. Log warning and return if no email found
5. `recordNotification` (PENDING)
6. Build template props, call `sendEmail`
7. `markNotificationSent` with returned id
8. On error: log with `logger.error`, NEVER throw

Helper functions: `getOwnerEmail(orgId)`, `getDriverEmail(driverId)`

### Trigger Hooks

| File | Event | Trigger Point |
|------|-------|---------------|
| dispatches.ts | Dispatch assigned | After `createDispatch()` — fires for primary driver |
| dispatches.ts | Driver reassigned | In `updateDispatch()` — fires if primaryDriverId changes |
| stop-completion.ts | Load delivered | After `pendingDeliveries === 0` cascade in `completeStop()` |
| pay-calculator.ts | Pay record ready | After records created in `generateDriverPayRecords()` |
| loads.ts | Load invoiced | After `updateLoad()` when status changes to 'invoiced' |
| carrier-compliance-alerts/route.ts | Daily compliance | After per-tenant alert log insert in cron |

### Schema Adaptations

- `LoadUpdateInput` extended with `status?: string` — previously omitted status from updates
- `LoadUpdateSchema` in API route extended with `status` enum — enables invoiced status via PATCH
- `CarrierLoad.status` now included in the Prisma update spread in `updateLoad()`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Schema field name mismatches in plan spec**
- **Found during:** Task 1 (notifications.ts implementation)
- **Issue:** Plan referenced `client.ap_contact_email` and `client.paymentTermsDays` — actual schema fields are `client.email` and `client.paymentTerms`
- **Fix:** Used correct schema field names (`email`, `paymentTerms`) in `sendInvoiceGeneratedNotification`
- **Files modified:** apps/web/src/lib/carrier/notifications.ts
- **Commit:** b1d6e82

**2. [Rule 1 - Bug] paymentTermsOverride is string not number in schema**
- **Found during:** Task 1
- **Issue:** Plan treated `paymentTermsOverride` as a number for date math; schema stores it as `String?`
- **Fix:** Applied `parseInt(paymentTermsOverrideStr, 10) || fallback` before date arithmetic
- **Files modified:** apps/web/src/lib/carrier/notifications.ts
- **Commit:** b1d6e82

**3. [Rule 1 - Bug] Plan referenced `carrierDriverPayRecord` Prisma accessor**
- **Found during:** Task 2 (pay-calculator.ts wiring)
- **Issue:** Plan used `prisma.carrierDriverPayRecord.findMany` — actual accessor is `prisma.driverPayRecord`
- **Fix:** Used the correct `prisma.driverPayRecord.findMany` accessor
- **Files modified:** apps/web/src/lib/carrier/pay-calculator.ts
- **Commit:** ff1c122

## Self-Check: PASSED

All 6 created files exist. Both commits (b1d6e82, ff1c122) confirmed in git log. TypeScript check passes with zero new errors (3 pre-existing e2e errors unrelated to this task).
