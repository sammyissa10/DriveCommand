---
task: "223"
type: quick
title: "Add hard delete and resend invitation to carrier driver management"
status: completed
completed_date: "2026-04-14"
duration_minutes: 20
tasks_completed: 3
files_created: 5
files_modified: 3
key_decisions:
  - "Moved notFound() guard before invitationStatus fetch to avoid null-access; removed duplicate guard"
  - "getLatestInvitationStatus exported as standalone helper rather than inlining query in page"
  - "DriverDetailActions client island pattern keeps page as server component"
---

# Quick Task 223: Add Hard Delete and Resend Invitation to Carrier Driver Management Summary

Hard delete with typed-name confirmation + resend invitation for carrier driver management — safety-guarded deletion cascading via Prisma transaction, and invitation re-send that cancels old PENDING/EXPIRED invitations before creating fresh 30-day ones.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Backend lib functions (deleteCarrierDriver, resendCarrierDriverInvitation, getLatestInvitationStatus) | f18a951 | fleet-drivers.ts |
| 2 | API routes (DELETE handler + resend-invitation POST endpoint) | f18a951 | [id]/route.ts, [id]/resend-invitation/route.ts |
| 3 | Frontend — DeleteDriverDialog, ResendInvitationButton, DriverDetailActions, page update | 508fa4f | 3 new components + page.tsx |

## What Was Built

**Backend (fleet-drivers.ts):**
- `deleteCarrierDriver(orgId, driverId)` — tenant-isolated hard delete with two safety checks: active dispatches (`status: 'in_progress'`) and approved/paid pay records. Cascades deletion of pay records, expenses, invitations, and optionally the linked User record (if no other tenant associations), all inside a `prisma.$transaction`.
- `resendCarrierDriverInvitation(orgId, driverId)` — cancels all PENDING/EXPIRED invitations for that email+org, creates new 30-day PENDING invitation, fetches tenant name, builds acceptUrl, calls `sendDriverInvitation`. Email failures return `{ sent: true, warning }` (never throw).
- `getLatestInvitationStatus(orgId, email)` — returns the status string of the most recent invitation or null.

**API routes:**
- `DELETE /api/v1/carrier/fleet/drivers/[id]` — returns 200 `{deleted: true}`, 400 with error message, 404, or 500.
- `POST /api/v1/carrier/fleet/drivers/[id]/resend-invitation` — returns 200 `{sent, email, warning?}`, 400, 404, or 500.

**Frontend components:**
- `DeleteDriverDialog` — Dialog with typed-name confirmation input. Delete button disabled until `typedName === driverName`. 400 errors shown inline inside dialog (not toast) so user can correct. On success: toast + redirect to drivers list.
- `ResendInvitationButton` — Hidden when `invitationStatus === 'ACCEPTED'` or after "already accepted" 400 response. Success shows email in toast; warning uses `toast.warning`.
- `DriverDetailActions` — Client island managing `deleteDialogOpen` state; renders both action buttons in a flex row.
- Driver detail page — fetches invitationStatus after driver load, renders `DriverDetailActions` right-aligned in header next to driver name.

## Deviations from Plan

None — plan executed exactly as written. One minor cleanup: removed the duplicate `if (!driver) notFound()` call (the page originally had it after the Promise.all; the edit structure created a second one which was immediately removed).

## Self-Check: PASSED

Files confirmed created:
- `apps/web/src/lib/carrier/fleet-drivers.ts` — modified with 3 new exports
- `apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/route.ts` — DELETE handler added
- `apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/resend-invitation/route.ts` — new file
- `apps/web/src/components/carrier/fleet/DeleteDriverDialog.tsx` — new file
- `apps/web/src/components/carrier/fleet/ResendInvitationButton.tsx` — new file
- `apps/web/src/components/carrier/fleet/DriverDetailActions.tsx` — new file
- `apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/page.tsx` — updated

Commits confirmed: f18a951, 508fa4f

TypeScript: zero new errors (`npx tsc --noEmit` shows only 3 pre-existing E2E test errors unrelated to this task).
