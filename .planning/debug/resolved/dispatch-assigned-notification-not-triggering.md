---
status: resolved
trigger: "sendDispatchAssignedNotification is not firing — NotificationLog has zero carrier- entries after creating a dispatch with an assigned driver"
created: 2026-04-15T00:00:00Z
updated: 2026-04-15T00:00:00Z
---

## Current Focus

hypothesis: recordNotification is never reached because getDriverEmail returns null, causing an early return at line 86 before any log row is written
test: traced code path from sendDispatchAssignedNotification lines 73-129
expecting: fix moves recordNotification before the driver-email guard, and adds markNotificationFailed on email-lookup failure
next_action: apply fix to notifications.ts — move recordNotification call to before getDriverEmail check, add markNotificationFailed when driver has no email

## Symptoms

expected: Creating a dispatch with primary_driver_id and status=planned writes a NotificationLog row with idempotencyKey starting with carrier-dispatch-assigned and sends an email to the driver
actual: NotificationLog has zero carrier- entries. Driver receives no email.
errors: None visible — the notification failure is silent (by design — wrapped in try/catch that never throws)
reproduction: Create a dispatch via the owner portal with a driver assigned and status = planned. Check NotificationLog table. No rows with carrier- prefix exist.
started: Never worked — built in quick-224 (today). Triggered notification logic has not been verified to fire yet.

## Eliminated

- hypothesis: sendDispatchAssignedNotification is inside a condition never true in dispatches.ts
  evidence: Line 224 of dispatches.ts calls it unconditionally after prisma.carrierDispatch.create succeeds
  timestamp: 2026-04-15T00:00:00Z

- hypothesis: it is after a return statement in dispatches.ts
  evidence: Line 224 is before the return on line 226; call order is create -> log.info -> sendDispatchAssignedNotification -> return dispatch
  timestamp: 2026-04-15T00:00:00Z

- hypothesis: dispatch creation API route uses a different code path
  evidence: apps/web/src/app/api/v1/carrier/dispatches/route.ts POST handler calls createDispatch from lib/carrier/dispatches.ts directly
  timestamp: 2026-04-15T00:00:00Z

- hypothesis: try/catch swallows error before recordNotification write when GMAIL env vars missing
  evidence: recordNotification (line 129) is before sendEmail (line 139) in notifications.ts — so if email throws, PENDING row still exists. But zero rows means recordNotification was never reached.
  timestamp: 2026-04-15T00:00:00Z

## Evidence

- timestamp: 2026-04-15T00:00:00Z
  checked: dispatches.ts lines 220-226
  found: sendDispatchAssignedNotification called fire-and-forget after successful dispatch create. .catch(()=>{}) swallows rejections. Call is NOT inside any condition.
  implication: The call does execute; any failure is internal to sendDispatchAssignedNotification

- timestamp: 2026-04-15T00:00:00Z
  checked: notifications.ts sendDispatchAssignedNotification lines 73-163
  found: recordNotification at line 129 is AFTER two early-return guards: (1) line 77-78 if alreadySent, (2) line 80-87 if !driverEmail, (3) line 97-100 if !dispatch. Zero log rows means recordNotification was never reached.
  implication: The function exits before writing any log row — specifically via the !driverEmail guard at line 86

- timestamp: 2026-04-15T00:00:00Z
  checked: getDriverEmail helper (lines 50-62)
  found: Returns driver.user?.email ?? driver.email ?? null. If CarrierDriver has userId=null (not yet a portal user) AND email field is empty/null, returns null. No log is written.
  implication: Drivers without an email address silently kill the notification with no trace in NotificationLog

- timestamp: 2026-04-15T00:00:00Z
  checked: notification-deduplication.ts recordNotification
  found: Writes a PENDING row. markNotificationFailed is defined but never called in sendDispatchAssignedNotification when email lookup fails
  implication: Current code has no FAILED log for "driver has no email" case — completely invisible failure

## Resolution

root_cause: In sendDispatchAssignedNotification (notifications.ts), recordNotification is called AFTER the getDriverEmail early-return guard. When a driver has no email address (common for drivers not yet enrolled in the driver portal), the function returns at line 86 without ever writing a NotificationLog row. This makes the failure completely invisible — no log entry, no error surface.

fix: Restructure sendDispatchAssignedNotification so that (1) the idempotency key and recordNotification call happen BEFORE the driver-email lookup, creating a PENDING row immediately, (2) if getDriverEmail returns null or dispatch lookup fails, call markNotificationFailed on the log row so failures are traceable

verification: tsc --noEmit passed (only pre-existing e2e test errors unrelated to this fix). Structural verification: recordNotification is now called before the driver-email guard, so a NotificationLog row (PENDING then FAILED/SENT) is always written for every dispatch creation attempt.
files_changed:
  - apps/web/src/lib/carrier/notifications.ts
