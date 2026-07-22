---
phase: quick-494
plan: 494
subsystem: carrier-drivers
tags: [driver-invitation, carrier-fleet, route-form, ux, data-grid, prisma]

# Dependency graph
requires:
  - phase: quick-480
    provides: DriverInvitation acceptance idempotency (email link-on-accept)
  - phase: quick-484
    provides: sendInvite opt-in gate on createCarrierDriver (this plan reverses the default)
provides:
  - Auto-invite on fleet Add Driver (default ON, opt-out preserved)
  - Actionable New Route driver empty-states (mobile-web + desktop) linking to Add Driver
  - Native validation surfaced on the mobile New Route programmatic Create button
  - Portal Access status column on the desktop drivers DataGrid
affects: [route-form, carrier-fleet-drivers, driver-invitation-flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sendInvite !== false gate — default-on with explicit-false opt-out, instead of default-off with explicit-true opt-in"
    - "formRef.current.reportValidity() guard before requestSubmit() for programmatic form submission (NavHeader buttons bypassing native submit)"

key-files:
  created: []
  modified:
    - apps/web/src/lib/carrier/fleet-drivers.ts
    - apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx
    - "apps/web/src/app/(owner)/carrier/fleet/drivers/new/DriverCreateMobile.tsx"
    - apps/web/tests/unit/carrier/create-driver-invite-optin.test.ts
    - "apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx"
    - apps/web/src/components/routes/route-form.tsx
    - "apps/web/src/app/(owner)/carrier/fleet/drivers/page.tsx"
    - "apps/web/src/app/(owner)/carrier/fleet/drivers/_grid/columns.tsx"
    - "apps/web/src/app/(owner)/carrier/fleet/drivers/_grid/types.ts"

key-decisions:
  - "Flipped the invite gate to sendInvite !== false (default-on) rather than adding a second parameter, keeping the existing DriverInvitation machinery untouched"
  - "Both Add-Driver form defaults flipped to true so the product behavior (adding a driver with an email now invites them) actually reaches the gate — flipping only the lib default would have been a no-op since both forms always pass an explicit boolean"
  - "Implemented Task 3 (portal status) on the desktop grid as a small display-only column, since the mobile-web drivers list already had this exact status derivation shipped from a prior task — extending it to desktop required only a derived field + one column, no new queries"

patterns-established:
  - "Actionable empty-state pattern: warning copy + inline Link to the resolving action (Add Driver), applied identically on both mobile-web and desktop route forms"

# Metrics
duration: 25min
completed: 2026-07-22
---

# Quick Task 494: Auto-Invite Fleet Drivers on Add + Fix Route-Form Dead-Ends Summary

**Flipped createCarrierDriver's invite gate to default-on (`sendInvite !== false`) so adding a fleet driver with an email now sends a portal invitation automatically, fixed the New Route driver-picker dead-ends with actionable copy + links, and added a Portal Access status column to the desktop drivers grid.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-22T18:00:00-05:00 (approx.)
- **Completed:** 2026-07-22T18:20:34-05:00
- **Tasks:** 3 (2 required + 1 optional, both shipped)
- **Files modified:** 9

## Accomplishments
- Adding a fleet driver with an email now sends exactly one portal invitation by default (previously required an explicit opt-in checkbox that defaulted OFF on both forms — quick-484 had made this opt-in, which silently orphaned freshly-added drivers with no path to becoming assignable)
- Owners can still opt out per-driver by unchecking "Send portal invite email now" on either Add Driver form
- New Route driver picker's empty state (both mobile-web and desktop) now tells the owner exactly what to do and links straight to Add Driver, instead of a passive "Invite drivers first" warning that dead-ended
- Mobile New Route's programmatic Create button (`NavHeader` → `requestSubmit()`) now calls `reportValidity()` first, so missing required fields show native browser validation instead of silently no-opping
- Desktop drivers grid now shows a Portal Access column (Active / Invited · pending / —), matching the status already surfaced on the mobile-web drivers list

## Task Commits

Each task was committed atomically:

1. **Task 1: Auto-invite on fleet Add Driver (flip gate + form defaults + test)** - `2f1e89bc` (feat)
2. **Task 2: Fix New Route driver dead-ends (mobile-web + desktop)** - `34551ae7` (fix)
3. **Task 3: Invite/active status on fleet drivers list (desktop grid)** - `77fde320` (feat)

_No separate plan-metadata commit — this SUMMARY is committed alongside STATE.md as the final commit._

## Files Created/Modified
- `apps/web/src/lib/carrier/fleet-drivers.ts` - createCarrierDriver invite gate: `sendInvite === true` → `sendInvite !== false`
- `apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx` - sendInvite default `useState(false)` → `useState(true)`; caption updated to on-by-default copy
- `apps/web/src/app/(owner)/carrier/fleet/drivers/new/DriverCreateMobile.tsx` - same default + caption flip for the mobile-web Add Driver form
- `apps/web/tests/unit/carrier/create-driver-invite-optin.test.ts` - Test B (`sendInvite` omitted) inverted to assert invite now sends; describe block renamed from "opt-in" to "default-on"
- `apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx` - actionable driver empty-state + `Link` to Add Driver; `reportValidity()` guard on the NavHeader Create button
- `apps/web/src/components/routes/route-form.tsx` - matching actionable empty-state + `Link` on the desktop New Route form
- `apps/web/src/app/(owner)/carrier/fleet/drivers/page.tsx` - derives `portalStatus` ('active' | 'invited' | 'none') per driver for the desktop grid from the already-fetched `user.isActive` + `pendingEmails` set
- `apps/web/src/app/(owner)/carrier/fleet/drivers/_grid/columns.tsx` - new "Portal Access" column rendering the derived status as a StatusBadge
- `apps/web/src/app/(owner)/carrier/fleet/drivers/_grid/types.ts` - `DriverRow` gains `portalStatus` field

## Decisions Made
- Reused the existing DriverInvitation machinery entirely (no new tables, no Supabase Auth user creation, no bare Prisma User rows) — only the boolean gate and its two form defaults changed
- Both Add-Driver form defaults had to flip alongside the lib gate, not just the lib gate alone, because both forms always pass an explicit `sendInvite` boolean in their create payload (`...(!isEdit ? { sendInvite } : {})` / `sendInvite,`) — omission never reaches the API
- Task 3 (optional) was implemented rather than deferred: the mobile-web drivers list already had this exact status logic shipped from a prior quick task, so extending the same pre-fetched data (`pendingEmails`, `user.isActive`) to the desktop grid was a small, no-new-query, display-only addition — well within "small display-only change" scope from the plan

## Deviations from Plan

None - plan executed exactly as written. Task 3's assessment path ("implement if small display-only, else defer") resolved to "implement" per the plan's own criteria, using data already fetched in `page.tsx` (no new joins/queries).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Fleet drivers added with an email now become reachable for route assignment once they accept their auto-sent invitation — the diagnosed dead-end (Route.driverId → User(role=DRIVER), Users only existing post-acceptance) now has a working, visible path from Add Driver.
- Explicitly NOT touched (per plan constraints): `listDrivers()`, `createRoute`, Route/User Prisma schema, accept-invitation flow.
- `npx next build` passes from `apps/web` with no new TypeScript errors; the 3/3 invite-gate unit test suite passes.

---
*Phase: quick-494*
*Completed: 2026-07-22*

## Self-Check: PASSED

All 9 modified source files + PLAN.md + this SUMMARY.md verified present on disk. All 3 task commits (`2f1e89bc`, `34551ae7`, `77fde320`) verified present in git history.
