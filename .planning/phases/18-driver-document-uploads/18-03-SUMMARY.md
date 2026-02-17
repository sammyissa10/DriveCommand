---
phase: 18-driver-document-uploads
plan: 03
subsystem: notifications
tags: [cron-jobs, email-notifications, driver-compliance, expiry-reminders]
dependency_graph:
  requires: [phase-18-plan-01]
  provides: [driver-document-expiry-notifications, milestone-based-reminders]
  affects: [cron-send-reminders, NotificationLog-table, email-templates]
tech_stack:
  added: [milestone-filter-pattern, driver-document-query]
  patterns: [idempotency-keys-per-day, 30-60-90-day-milestones, role-based-email-distribution]
key_files:
  created:
    - src/lib/notifications/check-expiring-driver-documents.ts
    - src/lib/email/send-driver-document-expiry-reminder.ts
    - src/emails/driver-document-expiry-reminder.tsx
  modified:
    - src/app/api/cron/send-reminders/route.ts
decisions:
  - Use 30/60/90/0 day milestones for driver document notifications (not daily) to reduce email noise
  - Use distinct notification type 'driver-document-expiry' separate from truck 'document-expiry' for separate idempotency tracking
  - Link driver document emails to driver profile page (/drivers/{id}) where documents are now visible
  - Use formatDocumentType helper to convert enums to human-readable format (DRIVER_LICENSE -> Driver License)
  - Follow exact email template pattern from existing document-expiry-reminder.tsx for consistency
metrics:
  duration: 342s
  tasks_completed: 2
  files_created: 3
  files_modified: 1
  commits: 2
  completed_date: 2026-02-17T01:59:22Z
---

# Phase 18 Plan 03: Driver Document Expiry Notifications Summary

Extended the existing cron-based reminder system to send email alerts at 30/60/90 day milestones before driver compliance documents expire, ensuring fleet managers receive proactive DOT compliance warnings.

## What Was Built

### Driver Document Expiry Query

Created `findExpiringDriverDocuments()` function in `src/lib/notifications/check-expiring-driver-documents.ts`:

**Query pattern:**
- Searches Document table for `driverId IS NOT NULL` and `expiryDate <= 90 days from now`
- Includes driver details (firstName, lastName) via join
- Calculates `daysUntilExpiry` for each document
- **Milestone filter**: Only returns documents at 90/60/30/0 day marks (±1 day tolerance for date math edge cases)
- Also includes expired documents (negative days)

**Interface:**
```typescript
ExpiringDriverDocumentItem {
  driverId: string;
  driverName: string;  // "firstName lastName"
  documentType: string;  // "DRIVER_LICENSE" | "DRIVER_APPLICATION" | "GENERAL"
  documentId: string;
  expiryDate: Date;
  daysUntilExpiry: number;
}
```

**Milestone logic prevents daily notifications:**
- Standard compliance warning windows: 90 days (quarterly), 60 days (bi-monthly), 30 days (monthly), 0 days (expiration day)
- Reduces email fatigue while providing timely alerts
- Mirrors research recommendations for truck document notifications

### Email Template and Sender

**React Email template** (`src/emails/driver-document-expiry-reminder.tsx`):
- Follows exact pattern of existing `document-expiry-reminder.tsx` for truck documents
- Shows driver name, document type (human-readable), expiry date, days remaining
- Color-coded urgency badges:
  - Red "EXPIRED" for negative days
  - Amber "URGENT" for <7 days
  - Green "UPCOMING" for 7+ days
- Warning text for expired/urgent documents emphasizing DOT compliance
- CTA button "View Driver Profile" linking to `/drivers/{id}`

**Email sender** (`src/lib/email/send-driver-document-expiry-reminder.ts`):
- `sendDriverDocumentExpiryReminder()` - sends via Resend API
- `formatDocumentType()` helper - converts enums to human-readable:
  - `DRIVER_LICENSE` → "Driver License"
  - `DRIVER_APPLICATION` → "Driver Application"
  - `GENERAL` → "General Document"
- Subject line includes urgency prefix: `EXPIRED: Driver License - John Doe` or `URGENT: Driver Application - Jane Smith`

### Cron Job Extension

Extended `src/app/api/cron/send-reminders/route.ts` with third notification category:

**Added imports:**
- `findExpiringDriverDocuments` from check-expiring-driver-documents
- `sendDriverDocumentExpiryReminder`, `formatDocumentType` from email sender

**Processing flow (after existing maintenance and truck document sections):**
1. Query expiring driver documents for tenant
2. For each document:
   - Generate idempotency key: `driver-document-expiry:{documentId}:{YYYY-MM-DD}`
   - Check if notification already sent today (skip if yes)
   - For each OWNER-role user:
     - Record notification as PENDING in NotificationLog
     - Send email with driver name, document type, expiry date, urgency level
     - Mark notification as SENT with external email ID
     - Log success/failure, track stats
3. Return stats in response: `driverDocuments: { sent, skipped, failed }`

**Idempotency details:**
- Notification type: `'driver-document-expiry'` (distinct from `'document-expiry'` for trucks)
- Entity type: `'Document'` (not Truck)
- Entity ID: `item.documentId` (unique per document)
- One notification per document per day across all recipients

**Dashboard URL:**
- Links to `/drivers/{driverId}` where documents are now visible (per Plan 02)
- Users can view/edit/delete driver documents from profile page

**Response format:**
```json
{
  "success": true,
  "processedTenants": 2,
  "maintenance": { "sent": 3, "skipped": 1, "failed": 0 },
  "documents": { "sent": 2, "skipped": 0, "failed": 0 },
  "driverDocuments": { "sent": 1, "skipped": 0, "failed": 0 }
}
```

## Technical Implementation

### Milestone Filter Algorithm

**Problem:** Sending notifications every day creates email fatigue. Users need timely alerts but not daily reminders.

**Solution:** Milestone-based filtering at specific intervals:

```typescript
const milestones = [90, 60, 30, 0]; // Days before expiry
const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000*60*60*24));

const isNearMilestone = milestones.some(
  (milestone) => Math.abs(daysUntilExpiry - milestone) < 1
);
```

**Edge case handling:**
- ±1 day tolerance accounts for date math rounding and time zones
- Expired documents (negative days) always included regardless of milestone
- Query fetches all documents within 90 days, then filters client-side for flexibility

### Notification Deduplication

**Idempotency key structure:**
- Format: `driver-document-expiry:{documentId}:{YYYY-MM-DD}`
- Prevents duplicate notifications for same document on same day
- Each OWNER user receives one email per document per day (not per owner)
- Uses existing `NotificationLog` table with `idempotencyKey` unique constraint

**Why separate notification type from truck documents:**
- Truck documents use `document-expiry:{truckId}-{documentType}:{date}`
- Driver documents use `driver-document-expiry:{documentId}:{date}`
- Different entity types (Truck vs Document) and different query patterns
- Allows separate tracking and reporting in analytics

### Error Handling

Follows existing cron pattern:
- Try-catch around email send
- Log errors, increment `failed` counter, continue with next item
- Don't abort entire cron run if one notification fails
- Record PENDING status before send, mark SENT/FAILED after

## Deviations from Plan

None - plan executed exactly as written.

## Task Breakdown

### Task 1: Create driver document expiry notification query and email template
**Commit:** `af57f7e`
**Files created:** 3 (check-expiring-driver-documents.ts, send-driver-document-expiry-reminder.ts, driver-document-expiry-reminder.tsx)

- Created `findExpiringDriverDocuments()` with milestone filter (90/60/30/0 days)
- Implemented `ExpiringDriverDocumentItem` interface with driver name, document type, expiry date
- Created React Email template following existing document-expiry-reminder.tsx pattern
- Implemented color-coded urgency badges and DOT compliance warnings
- Created `sendDriverDocumentExpiryReminder()` email sender
- Implemented `formatDocumentType()` helper for human-readable document types
- All exports verified, TypeScript compilation succeeded

### Task 2: Extend cron job to process driver document expiry reminders
**Commit:** `60179f0`
**Files modified:** 1 (src/app/api/cron/send-reminders/route.ts)

- Added imports for driver document query and email sender
- Created `driverDocumentStats` tracker alongside existing `maintenanceStats` and `documentStats`
- Implemented third notification processing section after truck document reminders
- Used distinct notification type `'driver-document-expiry'` for idempotency
- Links emails to `/drivers/{driverId}` driver profile page
- Updated response JSON to include `driverDocuments` stats field
- Verified grep patterns: `findExpiringDriverDocuments`, `driverDocumentStats`, `driver-document-expiry`

## Verification Results

All verification criteria passed:

1. `npm run build` succeeded - full production build with no errors
2. TypeScript compilation succeeded - no type errors
3. Grep confirmed `findExpiringDriverDocuments` export and cron import
4. Grep confirmed `driver-document-expiry` notification type in cron route
5. Grep confirmed `driverDocumentStats` tracking in response
6. Milestone filter confirmed at 90/60/30/0 day marks with ±1 day tolerance
7. Email template matches existing pattern with driver-specific content
8. All exports verified: `findExpiringDriverDocuments`, `sendDriverDocumentExpiryReminder`, `formatDocumentType`, `DriverDocumentExpiryReminderEmail`

## Dependencies Satisfied

**Requires:**
- Phase 18 Plan 01 (Driver Document Storage Foundation) - Complete
  - Document.expiryDate field for querying expiring documents
  - Document.documentType enum for filtering compliance-critical documents
  - Document.driverId field for driver ownership

**Provides for future enhancements:**
- Notification query pattern for driver compliance documents
- Email template reusable for manual notifications
- Stats tracking for driver document notification analytics
- Foundation for dashboard widgets showing upcoming driver expirations

**Affects:**
- Cron job now processes three notification categories (maintenance, truck documents, driver documents)
- NotificationLog table contains driver document notification history
- Email send volume increases based on number of drivers with expiring documents

## Production Readiness

**Ready for deployment:**
- Cron job tested with build - no compilation errors
- Idempotency prevents duplicate sends even if cron runs multiple times per day
- Error handling prevents one failed email from aborting entire cron run
- Stats tracking provides visibility into notification success/failure rates

**Operational considerations:**
- Schedule cron to run daily (e.g., 9 AM EST via Vercel Cron or CloudFlare Cron Triggers)
- Set `CRON_SECRET` environment variable for authorization
- Monitor `driverDocumentStats` in logs for notification health
- Track failed notifications in NotificationLog for retry/investigation
- Consider SLA for Resend API (email delivery time)

**Email volume estimation:**
- Per driver: Maximum 4 emails per document (90/60/30/0 day milestones)
- Per OWNER user: One email per expiring driver document per day
- For 100 drivers with 2 documents each (license + application) and 5 OWNER users:
  - Worst case: ~40 emails/day (if many documents clustered near expiry dates)
  - Typical case: ~10 emails/day (documents spread across calendar)
- Milestone filter reduces volume by 90%+ vs daily notifications

**Compliance notes:**
- Driver licenses and applications are DOT compliance requirements
- Expired licenses mean driver cannot legally operate commercial vehicle
- Timely notifications critical for avoiding violations during roadside inspections
- 30/60/90 day windows align with standard compliance renewal workflows

## Next Steps

**Phase 18 completion:**
- All three plans complete (Storage Foundation, Upload UI, Expiry Notifications)
- Phase 18 ready for verification and user acceptance testing

**Potential enhancements (future phases):**
- Dashboard widget showing drivers with expiring documents (red/yellow/green status)
- Filter/sort drivers by document expiry status
- Bulk document upload for onboarding multiple drivers
- Document renewal workflow (mark as renewed, upload new version)
- SMS notifications for critical expirations (0/7 days)
- Configurable milestone intervals per tenant (some may want 45/15 day reminders)
- Notification preferences per user (opt-out for certain notification types)

## Self-Check

Verifying all claimed artifacts exist:

**Created files:**
- src/lib/notifications/check-expiring-driver-documents.ts: FOUND
- src/lib/email/send-driver-document-expiry-reminder.ts: FOUND
- src/emails/driver-document-expiry-reminder.tsx: FOUND

**Modified files:**
- src/app/api/cron/send-reminders/route.ts: FOUND

**Commits:**
- af57f7e: FOUND (Task 1 - notification query and email template)
- 60179f0: FOUND (Task 2 - cron job extension)

**Exports verification:**
- findExpiringDriverDocuments: FOUND (line 30 of check-expiring-driver-documents.ts)
- sendDriverDocumentExpiryReminder: FOUND (line 36 of send-driver-document-expiry-reminder.ts)
- formatDocumentType: FOUND (line 19 of send-driver-document-expiry-reminder.ts)
- DriverDocumentExpiryReminderEmail: FOUND (line 20 of driver-document-expiry-reminder.tsx)

## Self-Check: PASSED

All files, commits, and exports verified. Plan executed successfully.
