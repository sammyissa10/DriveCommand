---
phase: 09-notifications-reminders
plan: 01
subsystem: notifications
tags:
  - notifications
  - email
  - cron
  - reminders
  - resend
  - react-email
dependency_graph:
  requires:
    - phase-08 (ScheduledService model for maintenance reminders)
    - phase-03 (Truck documentMetadata for document expiry)
    - phase-01 (Tenant model and RLS infrastructure)
  provides:
    - NotificationLog model with deduplication
    - Email notification infrastructure via Resend
    - Daily cron job for automated reminders
    - React Email templates for maintenance and document reminders
  affects:
    - Future phases can use notification infrastructure
    - Owner users receive automated email reminders
tech_stack:
  added:
    - resend: Transactional email delivery service
    - "@react-email/components": Email template components
  patterns:
    - Lazy-initialized Resend client (build without env vars)
    - Idempotency keys for deduplication (format: {type}:{entityId}:{date})
    - Multi-tenant cron processing with RLS isolation
    - NotificationLog without RLS (system-level table)
key_files:
  created:
    - prisma/schema.prisma: NotificationLog model and NotificationStatus enum
    - prisma/migrations/20260214000006_add_notification_log/migration.sql: Database migration
    - src/lib/validations/notification.schemas.ts: Zod validation for notifications
    - src/lib/email/resend-client.ts: Lazy-initialized Resend singleton
    - src/emails/maintenance-reminder.tsx: React Email template for maintenance reminders
    - src/emails/document-expiry-reminder.tsx: React Email template for document expiry
    - src/lib/notifications/notification-deduplication.ts: Idempotency key management
    - src/lib/notifications/check-upcoming-maintenance.ts: Query for services due in 7 days/500 miles
    - src/lib/notifications/check-expiring-documents.ts: Query for documents expiring in 14 days
    - src/lib/email/send-maintenance-reminder.ts: Email sender for maintenance reminders
    - src/lib/email/send-document-expiry-reminder.ts: Email sender for document expiry
    - src/app/api/cron/send-reminders/route.ts: Secured cron endpoint with CRON_SECRET
    - vercel.json: Cron schedule configuration (daily 14:00 UTC)
  modified:
    - package.json: Added resend and @react-email/components dependencies
decisions:
  - decision: "NotificationLog has no RLS policies"
    rationale: "Cron job operates as system-level process without request context; RLS would break the workflow"
    alternatives: "Session-based auth for cron (rejected - no session in cron context)"
  - decision: "Idempotency key format: {type}:{entityId}:{YYYY-MM-DD}"
    rationale: "One notification per entity per day prevents spam while allowing fresh reminders daily"
    alternatives: "Random suffix (rejected - would allow duplicate sends)"
  - decision: "Send to all OWNER-role users per tenant"
    rationale: "Research showed fleet owners need visibility; managers may not have notification authority"
    alternatives: "Configurable per-user notification preferences (deferred to future phase)"
  - decision: "Lazy-initialized Resend client via Proxy"
    rationale: "Allows build without RESEND_API_KEY, matches S3 client pattern from Phase 06"
    alternatives: "Hard require env vars at startup (rejected - breaks dev environment)"
  - decision: "7-day window for maintenance, 14-day window for documents"
    rationale: "Maintenance cycles are shorter (commercial trucks), documents have longer renewal processes"
    alternatives: "Configurable thresholds (deferred to future phase)"
  - decision: "Daily cron at 14:00 UTC (9 AM EST / 6 AM PST)"
    rationale: "Reasonable business hours in US time zones for email delivery"
    alternatives: "Multiple cron times per region (deferred - adds complexity)"
metrics:
  duration_seconds: 380
  completed_at: "2026-02-15T04:24:42Z"
  tasks_completed: 2
  files_created: 13
  files_modified: 2
---

# Phase 09 Plan 01: Notification Infrastructure Summary

**Built complete notification pipeline with NotificationLog model, Resend email client, React Email templates, tenant-isolated cron processing, and automated daily reminders for maintenance and document expiry.**

## What Was Built

### Task 1: NotificationLog Model, Resend Client, and React Email Templates
**Commit:** 8db552d

Built the foundational notification infrastructure:

1. **Prisma Schema Updates**
   - Added `NotificationStatus` enum (PENDING, SENT, FAILED)
   - Added `NotificationLog` model with idempotency key, status tracking, retry count
   - No RLS policies (system-level table for cron operations)
   - Migration SQL created at `prisma/migrations/20260214000006_add_notification_log/`

2. **Dependencies Installed**
   - `resend`: Transactional email service
   - `@react-email/components`: Email template components

3. **Email Infrastructure**
   - Lazy-initialized Resend client at `src/lib/email/resend-client.ts`
   - Follows S3 client Proxy pattern (build without env vars)
   - Default FROM_EMAIL: `DriveCommand <onboarding@resend.dev>`

4. **React Email Templates**
   - `MaintenanceReminderEmail`: Shows truck, service type, due date/mileage, CTA to dashboard
   - `DocumentExpiryReminderEmail`: Shows truck, document type, urgency badge (expired/urgent/upcoming), CTA to truck page
   - Inline styles for email client compatibility
   - Professional styling with DriveCommand branding

5. **Zod Validation**
   - `notification.schemas.ts`: Validation for notification creation with required fields

**Verification Passed:**
- `npx prisma validate`: Schema valid
- `npx prisma generate`: Client types generated
- `npm run build`: All files compile, no import errors

### Task 2: Notification Query Logic, Deduplication, Email Senders, and Cron Endpoint
**Commit:** 91d13f6

Built the complete notification processing pipeline:

1. **Deduplication Utilities** (`notification-deduplication.ts`)
   - `generateIdempotencyKey()`: Format `{type}:{entityId}:{YYYY-MM-DD}`
   - `wasNotificationAlreadySent()`: Check for existing SENT notifications
   - `recordNotification()`: Create PENDING log entry
   - `markNotificationSent()`: Update to SENT with external ID
   - `markNotificationFailed()`: Update to FAILED with error and retry count
   - Uses raw Prisma client (no RLS) since NotificationLog is system-level

2. **Notification Query Functions**
   - `findUpcomingMaintenance()`: Queries ScheduledServices due within 7 days OR 500 miles
   - `findExpiringDocuments()`: Parses truck documentMetadata JSONB for registrationExpiry and insuranceExpiry within 14 days
   - Both use tenant-scoped Prisma client via `getTenantPrismaForCron()` helper
   - Reuses `calculateNextDue()` logic from Phase 08

3. **Email Sender Functions**
   - `sendMaintenanceReminder()`: Sends maintenance reminder with React Email template
   - `sendDocumentExpiryReminder()`: Sends document expiry reminder with urgency indicators
   - Both throw on error for proper failure handling

4. **Cron API Route** (`/api/cron/send-reminders`)
   - `export const dynamic = 'force-dynamic'`: Prevents Next.js caching
   - CRON_SECRET verification via Bearer token (first operation)
   - Multi-tenant processing:
     1. Fetch all active tenants (bypass RLS in transaction)
     2. For each tenant:
        - Find OWNER-role users (notification recipients)
        - Query upcoming maintenance and expiring documents
        - Generate idempotency keys, check deduplication
        - Send emails via Resend
        - Log results to NotificationLog
     3. Continue processing if one tenant fails (try/catch per tenant)
   - Returns JSON summary: `{ maintenance: { sent, skipped, failed }, documents: { sent, skipped, failed } }`
   - Console logging with `[CRON]` prefix for monitoring

5. **Vercel Cron Configuration** (`vercel.json`)
   - Schedule: `0 14 * * *` (daily at 14:00 UTC)
   - Maps to 9 AM EST / 6 AM PST (reasonable business hours)

**Verification Passed:**
- `npm run build`: All files compile
- Cron route appears in build output: `/api/cron/send-reminders`
- `dynamic = 'force-dynamic'` present (prevents caching)
- CRON_SECRET check is first operation in handler
- Idempotency key format matches spec: `{type}:{entityId}:{date}`

## Deviations from Plan

None - plan executed exactly as written.

All files created match the plan specification. No architectural changes, bugs, or blocking issues encountered during implementation.

## Self-Check: PASSED

**Files Created (13):**
- ✓ prisma/migrations/20260214000006_add_notification_log/migration.sql
- ✓ src/lib/validations/notification.schemas.ts
- ✓ src/lib/email/resend-client.ts
- ✓ src/emails/maintenance-reminder.tsx
- ✓ src/emails/document-expiry-reminder.tsx
- ✓ src/lib/notifications/notification-deduplication.ts
- ✓ src/lib/notifications/check-upcoming-maintenance.ts
- ✓ src/lib/notifications/check-expiring-documents.ts
- ✓ src/lib/email/send-maintenance-reminder.ts
- ✓ src/lib/email/send-document-expiry-reminder.ts
- ✓ src/app/api/cron/send-reminders/route.ts
- ✓ vercel.json

**Files Modified (2):**
- ✓ prisma/schema.prisma (NotificationStatus enum, NotificationLog model)
- ✓ package.json (resend, @react-email/components dependencies)

**Commits (2):**
- ✓ 8db552d: feat(09-01): add NotificationLog model and email infrastructure
- ✓ 91d13f6: feat(09-01): add cron notification pipeline

All files exist, all commits verified, build passes.

## Technical Notes

### NotificationLog Design

NotificationLog is intentionally **without RLS policies** because:
- Cron jobs run as system-level operations without request context
- No `headers()` available in cron context
- RLS would block all queries since `app.current_tenant_id` would be NULL

The cron handler explicitly:
1. Uses raw `prisma` client for tenant listing and NotificationLog operations
2. Uses tenant-scoped `prisma.$extends(withTenantRLS(tenantId))` for truck/service/user queries
3. Maintains tenant isolation by iterating tenants and scoping queries per tenant

### Idempotency Strategy

Format: `{notificationType}:{entityId}:{YYYY-MM-DD}`

Example: `maintenance-reminder:abc123:2026-02-15`

This prevents:
- Duplicate sends on same day
- Multiple cron invocations from spamming users
- Failed sends from being retried infinitely (can manually retry by deleting log entry)

Allows:
- Fresh reminder each day
- Different notification types for same entity
- Audit trail of all send attempts

### Multi-Tenant Processing

The cron handler is tenant-aware:
1. Bypasses RLS to fetch all active tenants
2. For each tenant, creates a tenant-scoped client
3. Queries are isolated by tenant ID via RLS extension
4. NotificationLog records include tenantId for data organization
5. Failures in one tenant don't block others (try/catch per tenant)

### Email Template Design

Both templates follow email best practices:
- Inline styles (external CSS not supported in most email clients)
- Semantic HTML where possible
- Mobile-responsive (single column, large touch targets)
- Clear CTA buttons
- Professional branding
- Urgency indicators (color-coded)

### Environment Variables Required

**For email sending (production):**
- `RESEND_API_KEY`: API key from Resend dashboard
- `RESEND_FROM_EMAIL`: Sender address (default: testing address)
- `NEXT_PUBLIC_APP_URL`: Base URL for dashboard links

**For cron authentication:**
- `CRON_SECRET`: Random secret (e.g., `openssl rand -hex 32`)

**Development:** Build succeeds without these (lazy initialization). Email sending will fail at runtime if not configured.

### Testing the Cron Endpoint

**Local testing (with Vercel CLI):**
```bash
# Set environment variables
export CRON_SECRET="your-secret-here"
export RESEND_API_KEY="re_..."
export RESEND_FROM_EMAIL="DriveCommand <notifications@yourdomain.com>"

# Trigger cron manually
curl -X GET http://localhost:3000/api/cron/send-reminders \
  -H "Authorization: Bearer your-secret-here"
```

**Production:** Vercel automatically triggers daily at 14:00 UTC. Check Vercel Logs for cron execution results.

### Next Steps

**Required for production:**
1. Add RESEND_API_KEY to Vercel environment variables
2. Add CRON_SECRET to Vercel environment variables
3. (Optional) Verify custom domain in Resend for branded email sender
4. Deploy to Vercel (vercel.json will register cron schedule)
5. Monitor cron logs for send success/failure rates

**Future enhancements (Phase 09 Plan 02):**
- In-app notification center (bell icon in header)
- User notification preferences (email on/off, frequency)
- Notification history page
- Webhook delivery for integrations
- SMS reminders via Twilio

## Impact

### User Experience
- Fleet owners receive automated email reminders 7 days before maintenance due dates
- Document expiry alerts sent 14 days in advance (registration, insurance)
- No manual monitoring required - system proactively notifies users
- Professional email templates with clear CTAs to relevant dashboard pages

### System Architecture
- Notification infrastructure is reusable for future notification types
- Deduplication prevents spam and allows idempotent operations
- Multi-tenant isolation maintained throughout cron processing
- Audit trail via NotificationLog for debugging and compliance

### Business Value
- Reduces risk of missed maintenance (compliance, safety)
- Prevents expired documents (legal issues, fines)
- Increases user engagement with platform
- Demonstrates proactive platform capabilities

## Lessons Learned

1. **RLS in cron context:** Cron jobs need special handling since they lack request headers. Solution: bypass RLS for tenant listing, scope queries per tenant manually.

2. **Lazy initialization:** Following the S3 client pattern (Proxy for lazy init) allows development without external service credentials, improving DX.

3. **Idempotency is critical:** Without idempotency keys, multiple cron invocations or retries would spam users. Simple date-based keys prevent this elegantly.

4. **Email styling complexity:** Email clients are like IE6 - inline styles only, limited CSS support. React Email abstracts this but templates still require careful testing.

5. **Dual-trigger logic reuse:** Leveraging `calculateNextDue()` from Phase 08 avoided reimplementing complex date/mileage calculations, demonstrating value of well-designed utility functions.
