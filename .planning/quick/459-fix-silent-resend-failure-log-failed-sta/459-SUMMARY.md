---
phase: quick-459
plan: 01
subsystem: notifications
tags: [resend, email, audit-log, dispatcher, notifications]

# Dependency graph
requires:
  - phase: quick-458
    provides: bisect result identifying dispatcher.ts email-send block as the silent-failure site
provides:
  - Truthful NotificationSendLog: API-level Resend failures now record FAILED (not SENT)
  - errorMessage on FAILED rows carries the Resend error name + message for diagnosability
affects: [notifications, driver.invited, any trigger that sends email via dispatcher.ts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Resend SDK pattern: destructure { error } from resend.emails.send(); branch on error presence before logging status"

key-files:
  created: []
  modified:
    - apps/web/src/lib/notifications/dispatcher.ts

key-decisions:
  - "Outer catch retained for network-level throws — Resend only throws on network errors, not API errors; both paths log FAILED"
  - "errorMessage truncated to 1000 chars consistent with existing catch block convention"
  - "No any casts needed — Resend ErrorResponse is typed with .name and .message properties"

patterns-established:
  - "Resend result capture: const { error: sendError } = await resend.emails.send(...) — always check error before treating as SENT"

# Metrics
duration: 5min
completed: 2026-06-16
---

# Quick-459: Fix Silent Resend Failure — Log FAILED Status Summary

**Resend API-level failures (unverified domain, bad from-address, 4xx/5xx) now record NotificationSendLog.status = FAILED with the real error message instead of silently logging SENT.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-16T~16:10:00Z
- **Completed:** 2026-06-16T~16:15:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Captured the `{ error }` return value from `resend.emails.send()` (previously discarded with a bare `await`)
- Added `if (sendError)` branch: pushes FAILED audit row with `errorMessage = "${sendError.name}: ${sendError.message}"`
- Kept the `else` branch for genuine success: pushes SENT audit row unchanged
- Retained the outer `catch (emailErr)` for network-level throws — both error paths now correctly record FAILED
- Per-recipient loop isolation preserved; one failure does not abort remaining recipients

## Task Commits

1. **Task 1: Capture Resend { error } and log FAILED on API-level send failures** - `bc0fc058` (fix)

**Plan metadata:** (combined with task commit)

## Files Created/Modified

- `apps/web/src/lib/notifications/dispatcher.ts` — Email-send block now destructures `{ error: sendError }`, branches on `sendError` to push FAILED vs SENT audit row

## Decisions Made

- Outer `catch` block retained unchanged — Resend only throws on network errors; both API-error and network-error paths must log FAILED
- `errorMessage` built as `"${sendError.name}: ${sendError.message}"` and `.slice(0, 1000)` to match existing truncation convention
- No `any` cast needed — Resend SDK types `ErrorResponse` with `.name: string` and `.message: string`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `driver.invited` (and any trigger routed through the dispatcher) will now produce accurate `NotificationSendLog` rows on Resend API failures
- If the from-address (`RESEND_FROM_EMAIL`) is still unverified, sends will log `FAILED` with the Resend domain-verification error — actionable for debugging
- No follow-up code changes required; monitoring/alerting on `status = FAILED` in `NotificationSendLog` is now meaningful

---
*Phase: quick-459*
*Completed: 2026-06-16*
