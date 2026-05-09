---
phase: quick-222
plan: "01"
subsystem: carrier
tags: [carrier, invitation, email, driver]
dependency_graph:
  requires: [DriverInvitation model, sendDriverInvitation helper, getAppBaseUrl]
  provides: [carrier driver invitation flow]
  affects: [apps/web/src/lib/carrier/fleet-drivers.ts, apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts]
tech_stack:
  added: []
  patterns: [graceful email failure, invitation lifecycle management]
key_files:
  modified:
    - apps/web/src/lib/carrier/fleet-drivers.ts
    - apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
decisions:
  - Wrap entire invitation block in try/catch so DB insert failure never blocks driver creation
  - Reuse existing fleet module invitation pattern (cancel PENDING, create new, send email)
  - orgId always sourced from session (passed as parameter), never from request body
metrics:
  duration: "~5 minutes"
  completed: "2026-04-14"
  tasks_completed: 1
  files_modified: 2
---

# Quick-222: Fix Carrier Driver Creation to Send Invitation

**One-liner:** Carrier driver creation now creates a DriverInvitation record and sends an invitation email using the same pattern as the existing fleet module, with graceful failure handling.

## What Was Done

Added a full invitation flow to `createCarrierDriver` in `apps/web/src/lib/carrier/fleet-drivers.ts`:

1. When `data.email` is provided:
   - Cancels any existing PENDING `DriverInvitation` records for the same email + orgId
   - Creates a new `DriverInvitation` record (30-day expiry, PENDING status)
   - Fetches tenant name (falls back to `'your fleet'` if unavailable)
   - Calls `sendDriverInvitation()` with the accept URL
   - Returns `{ driver, emailSent: true }` on success
   - Returns `{ driver, emailSent: false, emailWarning: '...' }` on email send failure
   - Wraps the entire invitation block in try/catch so a DB insert failure also returns the driver with a warning instead of throwing

2. When `data.email` is not provided: returns `{ driver, emailSent: false }` (no invitation created)

3. Added `CreateCarrierDriverResult` interface to the types section for explicit return typing.

4. Updated the POST handler in `route.ts` to use `result.driver` and propagate `result.emailWarning` as a `warning` field in the response body when present.

## Commits

| Task | Commit  | Description                                   |
|------|---------|-----------------------------------------------|
| 1    | 3508ef1 | feat(quick-222): add invitation flow to createCarrierDriver |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check

- [x] `apps/web/src/lib/carrier/fleet-drivers.ts` modified with sendDriverInvitation import and call
- [x] `apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts` updated with emailWarning propagation
- [x] Commit 3508ef1 exists
- [x] `npx tsc --noEmit` passes with zero errors in application code (3 pre-existing e2e test errors unrelated to this change)

## Self-Check: PASSED
