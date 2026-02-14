---
phase: 04-driver-management
plan: 02
subsystem: ui
tags: [clerk, webhook, tanstack-table, react-19, optimistic-updates, server-actions]

# Dependency graph
requires:
  - phase: 04-driver-management
    plan: 01
    provides: Driver server actions, DriverInvitation model, Zod schemas
  - phase: 03-truck-management
    plan: 02
    provides: UI patterns (TanStack Table, useOptimistic, server/client split)
  - phase: 02-auth-and-portals
    provides: (owner) layout, role-based access control
provides:
  - Extended Clerk webhook to handle driver invitation sign-up flow
  - Complete driver management UI (list, invite, detail, edit)
  - TanStack Table driver list with sorting, filtering, status badges
  - Optimistic UI updates for deactivate/reactivate actions
  - Invite-based driver onboarding via Clerk Invitations API
affects: [owner-portal-navigation, driver-onboarding, tenant-user-management]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Clerk webhook driver invitation acceptance (validates pending invite, creates User with DRIVER role)"
    - "DriverForm mode prop pattern (invite mode with email, edit mode without)"
    - "useOptimistic for instant status toggle feedback"
    - "Conditional rendering for deactivate/reactivate based on isActive flag"

key-files:
  created:
    - src/components/drivers/driver-invite-form.tsx
    - src/components/drivers/driver-list.tsx
    - src/app/(owner)/drivers/page.tsx
    - src/app/(owner)/drivers/driver-list-wrapper.tsx
    - src/app/(owner)/drivers/invite/page.tsx
    - src/app/(owner)/drivers/[id]/page.tsx
    - src/app/(owner)/drivers/[id]/edit/page.tsx
    - src/app/(owner)/drivers/[id]/edit/edit-driver-client.tsx
  modified:
    - src/app/api/webhooks/clerk/route.ts

key-decisions:
  - "Single DriverForm component with mode prop - reusable for both invite (with email) and edit (without email, pre-filled)"
  - "Status badge with color coding (green for Active, red for Deactivated) in both list and detail views"
  - "Confirmation dialogs for deactivate (warns about immediate logout) and reactivate actions"
  - "useOptimistic update pattern for status changes - provides instant feedback while server action processes"
  - "Webhook validates invitation expiry before creating user - expired invitations are marked EXPIRED and rejected"

patterns-established:
  - "Webhook driver flow: check metadata → find pending invitation → validate expiry → create User → mark invitation ACCEPTED → update Clerk metadata"
  - "Driver UI navigation: list → invite (form), list → detail → edit (pre-filled form)"
  - "Optimistic status toggle: update local state → call server action → revalidate on server"
  - "License number display fallback: show '—' (em dash) when null instead of empty cell"

# Metrics
duration: 212s
completed: 2026-02-14
---

# Phase 04 Plan 02: Driver Management UI Summary

**Extended Clerk webhook for driver sign-up flow, complete driver management UI with TanStack Table list (sorting, filtering), invite form, detail page, and edit page, all following Phase 03 truck management patterns**

## Performance

- **Duration:** 3 min 32 sec (212 seconds)
- **Started:** 2026-02-14T21:16:23Z
- **Completed:** 2026-02-14T21:19:55Z
- **Tasks:** 2
- **Files modified:** 9 (1 extended, 8 created)

## Accomplishments

- Extended Clerk webhook to handle driver invitation acceptance: validates pending invitation, checks expiry, creates User with DRIVER role linked to correct tenant, marks invitation as ACCEPTED
- Created complete driver management UI following exact Phase 03 patterns: DriverForm (dual-mode), DriverList (TanStack Table), DriverListWrapper (useOptimistic), five pages (list, invite, detail, edit, edit-client)
- Implemented instant UI feedback for deactivate/reactivate via useOptimistic hook
- Navigation flow complete: drivers list ↔ invite, list ↔ detail, detail ↔ edit
- All UI components use React 19 patterns (useActionState, useOptimistic, useTransition)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend Clerk webhook to handle driver invitation sign-up** - `15cc038` (feat)
   - Driver invitation flow: validates pending invitation, checks expiry
   - Creates User with DRIVER role linked to correct tenant (from privateMetadata.tenantId)
   - Marks DriverInvitation as ACCEPTED with timestamp and userId
   - Updates Clerk metadata (publicMetadata.role = DRIVER, privateMetadata.tenantId)
   - Idempotent: existing user check prevents duplicate creation
   - Owner provisioning flow unchanged for non-driver sign-ups

2. **Task 2: Create driver management UI pages and components** - `26d7066` (feat)
   - DriverForm component (driver-invite-form.tsx): dual-mode (invite with email, edit without)
   - DriverList component (driver-list.tsx): TanStack Table with sorting, filtering, status badges, deactivate/reactivate buttons
   - DriverListWrapper: useOptimistic for instant status toggle feedback
   - Five pages: list (/drivers), invite (/drivers/invite), detail (/drivers/[id]), edit server (/drivers/[id]/edit), edit client
   - All pages under (owner) layout with role-based access control
   - Navigation links: list ↔ invite, list ↔ detail, detail ↔ edit

## Files Created/Modified

**Created:**
- `src/components/drivers/driver-invite-form.tsx` - Dual-mode DriverForm (invite/edit), useActionState, email field conditional on mode
- `src/components/drivers/driver-list.tsx` - TanStack Table list with sorting, filtering, status column (green/red badges), deactivate/reactivate actions
- `src/app/(owner)/drivers/page.tsx` - Server component driver list page, calls listDrivers(), renders DriverListWrapper
- `src/app/(owner)/drivers/driver-list-wrapper.tsx` - Client wrapper with useOptimistic for status toggles
- `src/app/(owner)/drivers/invite/page.tsx` - Client page with DriverForm in invite mode
- `src/app/(owner)/drivers/[id]/page.tsx` - Server component detail page with driver info (email, license, status, dates)
- `src/app/(owner)/drivers/[id]/edit/page.tsx` - Server component edit page, fetches driver and passes to EditDriverClient
- `src/app/(owner)/drivers/[id]/edit/edit-driver-client.tsx` - Client wrapper, binds updateDriver with driverId, renders DriverForm in edit mode

**Modified:**
- `src/app/api/webhooks/clerk/route.ts` - Extended webhook with driver invitation acceptance flow (93 lines added)

## Decisions Made

1. **Single DriverForm with mode prop:** Created one reusable component with `mode: 'invite' | 'edit'`. Invite mode shows email field, edit mode hides it and pre-fills firstName/lastName/licenseNumber. Simpler than two separate forms, follows DRY principle.

2. **Status badge color coding:** Active drivers show green badge, Deactivated show red badge. Visual distinction helps owner quickly scan driver status in both list and detail views.

3. **Confirmation dialogs for status changes:** Deactivate button warns "They will be logged out immediately" to clarify impact. Reactivate button confirms action. Prevents accidental status changes.

4. **useOptimistic for status toggles:** Instant UI feedback when deactivating/reactivating. User sees status change immediately while server action processes in background. Follows React 19 best practices from Phase 03.

5. **Webhook invitation expiry validation:** Before creating driver User record, webhook checks if invitation has expired. Expired invitations are marked EXPIRED and return 400 error. Prevents stale invitation acceptance.

## Deviations from Plan

None - plan executed exactly as written. All eight files created with correct patterns (TanStack Table, useOptimistic, useActionState, server/client split). Webhook extension follows idempotent pattern with early return for driver flow.

## Issues Encountered

None - TypeScript compilation passed on first attempt for both tasks. All patterns from Phase 03 transferred cleanly to driver management UI.

## User Setup Required

None - Clerk integration already configured from Phase 2. All server actions and webhook use existing Clerk client.

## Next Phase Readiness

**Ready for Phase 05 (Route Management):**
- Complete driver management UI operational
- Webhook handles driver invitation acceptance automatically
- listDrivers() server action available for route assignment UI
- isActive flag can be used to filter active drivers for route assignment

**Blockers:** None

**Concerns:** None - full driver lifecycle (invite → accept → manage → deactivate) is now operational.

## Self-Check: PASSED

**Files verification:**
- FOUND: src/components/drivers/driver-invite-form.tsx
- FOUND: src/components/drivers/driver-list.tsx
- FOUND: src/app/(owner)/drivers/page.tsx
- FOUND: src/app/(owner)/drivers/driver-list-wrapper.tsx
- FOUND: src/app/(owner)/drivers/invite/page.tsx
- FOUND: src/app/(owner)/drivers/[id]/page.tsx
- FOUND: src/app/(owner)/drivers/[id]/edit/page.tsx
- FOUND: src/app/(owner)/drivers/[id]/edit/edit-driver-client.tsx
- FOUND: src/app/api/webhooks/clerk/route.ts

**Commits verification:**
- FOUND: 15cc038 (Task 1 - webhook extension)
- FOUND: 26d7066 (Task 2 - UI components)

All claimed files exist, all commits verified.

---
*Phase: 04-driver-management*
*Completed: 2026-02-14*
