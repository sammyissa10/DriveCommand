---
phase: quick-344
plan: 344
subsystem: notifications
tags: [notifications, carrier-driver, email, bug-fix]
key-files:
  modified:
    - apps/web/src/lib/notifications/types.ts
    - apps/web/src/app/(owner)/actions/load-driver-assignments.ts
    - apps/web/src/app/(owner)/actions/loads.ts
    - apps/web/src/lib/notifications/__tests__/dispatcher.test.ts
  db-rows-updated:
    - "NotificationTemplate (triggerKey=load.assigned) — defaultRecipients JSONB"
decisions:
  - "Use empty string sentinel (not undefined/null) for missing CarrierDriver.email — resolver's @-shape check filters it, preserving existing skip behavior"
  - "No changes to recipient-resolver.ts — external_email branch already handles User-promote-or-emailOnly fallback correctly"
  - "loads.ts legacy path sources driverEmail from User.email; no double-send risk since resolver deduplicates by userId then by email"
metrics:
  duration: ~8min
  completed: "2026-05-16"
  tasks_completed: 2
  files_changed: 4
---

# Quick Task 344: Fix load.assigned Notification Routing for CarrierDrivers Without User Account

**One-liner:** Added `external_email` recipient rule to load.assigned NotificationTemplate and plumbed `CarrierDriver.email` through both dispatch call sites so drivers without a linked User row receive the assignment email.

## What Was Done

### Task 1: DB Migration + Type Extension

**DB update (Supabase direct connection via pg):**

Updated `NotificationTemplate` row where `triggerKey = 'load.assigned'` to add a third recipient rule:

```json
[
  {"type": "related", "payloadKey": "driverId"},
  {"type": "external_email", "payloadKey": "driverEmail"},
  {"role": "OWNER", "type": "role"}
]
```

Previously only `related` + `role/OWNER` rules existed. The new `external_email` rule causes the recipient resolver to read `payload.driverEmail` and route via email for CarrierDriver rows with `user_id IS NULL`.

**Type extension (`types.ts`):**

Added `driverEmail: string` to `NotificationPayload['load.assigned']` between `driverId` and `driverName`, matching the existing strict-required pattern. Empty string is the documented "no email" sentinel.

### Task 2: Call Site Plumbing + Test Fix

**`load-driver-assignments.ts` (createAssignment — the actual fix):**
- Extended `carrierDriver.findUnique` prefetch select to include `email`
- Added `driverEmail: driver.email ?? ''` to `dispatchNotification` payload immediately after `driverId`

**`loads.ts` (dispatchLoad — legacy User FK path):**
- Extended `user.findUnique` prefetch select to include `email`
- Added `driverEmail: dispatchDriver?.email ?? ''` to the `load.assigned` payload
- Behavioral note: the `related` rule already routes the User by `driverId`, so `external_email` will promote into the same userMap entry and dedup — no double-send risk

**`dispatcher.test.ts` (Test 5 — compile fix):**
- Added `driverEmail: 'alex@test.com'` to the inline `load.assigned` payload so the test compiles after the type was made required

## Verification Results

- `npx tsc --noEmit` from `apps/web`: exits 0
- `npm run build` from `apps/web`: exits 0 (Turbopack build, 55s compile)
- `npx vitest run src/lib/notifications/__tests__/dispatcher.test.ts`: 6/6 tests pass
- `recipient-resolver.ts`: unchanged (`git diff` is empty)
- DB SELECT confirms 3-rule defaultRecipients array with external_email/driverEmail rule in position 2

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files verified:
- FOUND: apps/web/src/lib/notifications/types.ts (contains `driverEmail: string`)
- FOUND: apps/web/src/app/(owner)/actions/load-driver-assignments.ts (contains `driverEmail`)
- FOUND: apps/web/src/app/(owner)/actions/loads.ts (contains `driverEmail`)
- FOUND: apps/web/src/lib/notifications/__tests__/dispatcher.test.ts (contains `driverEmail`)

Commits verified:
- 6966847: fix(quick-task-344): extend NotificationPayload load.assigned with driverEmail field + DB migration
- 4096cbd: fix(quick-task-344): plumb driverEmail through load.assigned dispatch call sites
