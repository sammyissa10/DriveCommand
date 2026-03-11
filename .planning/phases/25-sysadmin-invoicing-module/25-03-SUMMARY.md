---
phase: 25-sysadmin-invoicing-module
plan: 03
subsystem: email, infra
tags: [react-email, nodemailer, gmail, prisma, cron, vercel, decimal.js]

# Dependency graph
requires:
  - phase: 25-01
    provides: SysAdminInvoice Prisma schema, invoice number generation
  - phase: 25-02
    provides: InvoiceActions client component with Send Invoice placeholder, billing detail page
provides:
  - SysAdminInvoiceEmail React Email template (DriveCommand-branded, line items table)
  - sendSysAdminInvoice(invoiceId) email helper
  - sendInvoiceAction server action (DRAFT -> SENT with email)
  - Nightly cron /api/cron/mark-overdue-invoices (SENT -> OVERDUE when past due date)
  - vercel.json cron registration at 0 3 * * *
affects:
  - Phase 26 QA test scripts (invoice send/overdue lifecycle to test)
  - Phase 27 Playwright tests (cron route auth testing)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Email-on-status-change: DB update committed before email attempt; email failure returns emailWarning not failure"
    - "Cron auth: Bearer CRON_SECRET header check, 401 on mismatch"
    - "React Email: inline style objects with as const assertions, no Tailwind"

key-files:
  created:
    - src/emails/sysadmin-invoice.tsx
    - src/lib/email/send-sysadmin-invoice.ts
    - src/app/api/cron/mark-overdue-invoices/route.ts
  modified:
    - src/app/(admin)/actions/sysadmin-invoices.ts
    - src/app/(admin)/billing/[id]/invoice-actions.tsx
    - vercel.json

key-decisions:
  - "DB status updated to SENT before email attempt — ensures invoice is always marked sent even if email service is down"
  - "Email failure is non-fatal: returns emailWarning in success response, shown as yellow banner in UI"
  - "Cron uses base prisma client (no bypass_rls) — SysAdminInvoice RLS only blocks when app.current_tenant_id is set; cron runs without tenant context"
  - "4th cron registered at 0 3 * * * (3am UTC) — 1 hour after auto-close-tickets at 0 2"

patterns-established:
  - "Email helper pattern: sendX(id) fetches full data, formats, calls sendEmail, returns {sent, warning?}"
  - "Server action email pattern: update DB first, try email in try/catch, surface warning not error on email failure"

# Metrics
duration: 3min
completed: 2026-03-11
---

# Phase 25 Plan 03: Email Delivery + Overdue Cron Summary

**DriveCommand-branded React Email invoice template wired to sendInvoiceAction (DRAFT->SENT) with nightly CRON_SECRET-authenticated cron flipping SENT->OVERDUE on due date**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-11T00:37:25Z
- **Completed:** 2026-03-11T00:40:04Z
- **Tasks:** 2 (+ 1 checkpoint)
- **Files modified:** 6

## Accomplishments

- React Email template with dark DriveCommand header, two-column bill-to/invoice-meta layout, line items table with subtotal/total, optional notes, and footer
- sendInvoiceAction commits DB status to SENT before email attempt; email failure surfaces as yellow warning banner (never blocks the status update)
- Nightly cron at /api/cron/mark-overdue-invoices authenticated by CRON_SECRET bearer token; updateMany transitions all SENT invoices past dueDate to OVERDUE

## Task Commits

Each task was committed atomically:

1. **Task 1: React Email template, send helper, and sendInvoiceAction** - `75c5b46` (feat)
2. **Task 2: Overdue cron route and vercel.json registration** - `2bb286b` (feat)

## Files Created/Modified

- `src/emails/sysadmin-invoice.tsx` - React Email template for tenant-facing invoice emails (SysAdminInvoiceEmail)
- `src/lib/email/send-sysadmin-invoice.ts` - sendSysAdminInvoice(invoiceId) helper: fetches data, formats decimals, sends via gmail-client
- `src/app/(admin)/actions/sysadmin-invoices.ts` - Added sendInvoiceAction server action and sendSysAdminInvoice import
- `src/app/(admin)/billing/[id]/invoice-actions.tsx` - Replaced disabled placeholder with functional Send Invoice button (isLoading state, emailWarning banner)
- `src/app/api/cron/mark-overdue-invoices/route.ts` - GET handler authenticated by CRON_SECRET; updateMany SENT->OVERDUE
- `vercel.json` - Added 4th cron entry: /api/cron/mark-overdue-invoices at "0 3 * * *"

## Decisions Made

- DB status committed to SENT before email attempt — ensures consistent state if email service is unavailable
- Email failures surface as `emailWarning` in success response (yellow banner in UI) rather than reverting the status update
- Cron uses base prisma client with no bypass_rls transaction — SysAdminInvoice RLS only restricts rows when `app.current_tenant_id` is set; cron runs without tenant context so direct queries are allowed
- Cron registered at 0 3 * * * (3am UTC), 1 hour after the auto-close-tickets cron at 0 2

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required. Uses existing GMAIL_USER/GMAIL_APP_PASSWORD and CRON_SECRET environment variables established in prior phases.

## Next Phase Readiness

Full invoice lifecycle is complete: DRAFT -> SENT (email) -> OVERDUE (nightly cron) -> PAID (manual).
Ready for Phase 26 QA test scripts to cover invoice creation, send, overdue detection, and payment flows.
Awaiting human verification checkpoint (Task 3) to confirm email delivery and cron behavior in the running app.

---
*Phase: 25-sysadmin-invoicing-module*
*Completed: 2026-03-11*
