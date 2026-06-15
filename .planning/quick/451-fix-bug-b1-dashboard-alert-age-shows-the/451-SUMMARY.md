---
phase: quick-451
plan: 451
subsystem: ui
tags: [dashboard, notifications, alerts, timestamp]

requires: []
provides:
  - Owner dashboard expiry alerts now show alert recency instead of expiry date age
affects: [dashboard, owner-alerts, notification-feed]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - apps/web/src/app/(owner)/actions/dashboard.ts

key-decisions:
  - "Anchor expiry alert timestamps to now so relativeTime() reflects when alert surfaced, not when the document expired"

patterns-established: []

duration: 5min
completed: 2026-06-15
---

# Quick-451: Fix Bug B1 — Dashboard Alert Age Shows Expiry Date Age Summary

**Two-line fix in `_fetchNotificationAlerts()` replaces `expiryDate.toISOString()` with `now.toISOString()` on both expiry alert blocks so the UI reads "just now" instead of "23d ago"**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-15T00:00:00Z
- **Completed:** 2026-06-15T00:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Truck-document expiry alerts (registration/insurance) now report current time as timestamp
- Driver-document expiry alerts now report current time as timestamp
- Alert titles and descriptions ("Expired N days ago" / "Expires in N days") left completely untouched
- Overdue invoice and safety event alert timestamps unchanged — they were already correct

## Task Commits

1. **Task 1: Anchor expiry alert timestamps to now** - `bc9539d6` (fix)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `apps/web/src/app/(owner)/actions/dashboard.ts` - Changed `timestamp: expiryDate.toISOString()` to `timestamp: now.toISOString()` in the truck-doc and driver-doc expiry alert blocks

## Decisions Made
- Used the already-in-scope `now` variable (line 87) — no new imports required, type-safe, zero scope creep

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Bug B1 resolved; owner dashboard expiry alerts surface with correct relative age
- No blockers

---
*Phase: quick-451*
*Completed: 2026-06-15*
