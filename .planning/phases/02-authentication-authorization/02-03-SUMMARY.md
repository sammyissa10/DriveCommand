---
phase: 02-authentication-authorization
plan: 03
subsystem: auth
tags: [clerk, nextjs, react, role-based-access-control, route-groups, server-components]

# Dependency graph
requires:
  - phase: 02-01
    provides: Role definitions, server-side auth helpers (getRole, isSystemAdmin), UserRole enum
  - phase: 02-02
    provides: UserMenu component for sign-out functionality
provides:
  - RoleGuard client component for conditional UI rendering based on user role
  - Three portal layouts with server-side role-based access control
  - Unauthorized page for access denial feedback
  - Dashboard placeholder as post-login landing page
affects: [03-tenant-management, 04-fleet-management, 05-driver-management]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Next.js route groups for portal isolation
    - Server component layouts with async auth checks
    - Client component guards for conditional UI rendering
    - Redirect pattern for unauthorized access

key-files:
  created:
    - src/lib/auth/guards.tsx
    - src/app/unauthorized/page.tsx
    - src/app/(admin)/layout.tsx
    - src/app/(owner)/layout.tsx
    - src/app/(owner)/dashboard/page.tsx
    - src/app/(driver)/layout.tsx
  modified: []

key-decisions:
  - "Layout auth checks are UX-only; security enforced in server actions and Data Access Layer"
  - "RoleGuard returns null during loading to prevent content flash"
  - "Each portal has distinct visual styling (dark for admin, white for owner, blue for driver)"

patterns-established:
  - "Portal layouts: Server component async function with auth() and role check, redirect unauthorized"
  - "Client guards: useUser hook from Clerk, check publicMetadata.role, handle loading state"
  - "Unauthorized flow: Redirect to /unauthorized with clear message and navigation back to home"

# Metrics
duration: 87s
completed: 2026-02-14
---

# Phase 02 Plan 03: Portal Layouts and Role Guards Summary

**Three portal layouts with server-side role checks (admin, owner, driver) and client-side RoleGuard for conditional UI rendering**

## Performance

- **Duration:** 1 min 27s
- **Started:** 2026-02-14T18:16:23Z
- **Completed:** 2026-02-14T18:17:50Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Portal-specific route groups with server-side role-based access control
- Client-side RoleGuard component for conditional rendering without security implications
- Unauthorized access page with clear messaging and navigation
- Dashboard placeholder as landing page after Clerk sign-in
- All portals include UserMenu for sign-out capability

## Task Commits

Each task was committed atomically:

1. **Task 1: Create client-side RoleGuard component and unauthorized page** - `6df06a9` (feat)
2. **Task 2: Create portal-specific layouts with role-based access control** - `a4e7638` (feat)

## Files Created/Modified
- `src/lib/auth/guards.tsx` - Client-side RoleGuard component for conditional UI rendering based on user role from Clerk publicMetadata
- `src/app/unauthorized/page.tsx` - Access denial page with clear message and link back to home
- `src/app/(admin)/layout.tsx` - Admin portal layout with isSystemAdmin check and dark gray header
- `src/app/(owner)/layout.tsx` - Owner portal layout with OWNER/MANAGER role check and white header
- `src/app/(owner)/dashboard/page.tsx` - Placeholder dashboard page as post-login destination
- `src/app/(driver)/layout.tsx` - Driver portal layout with DRIVER role check and blue header

## Decisions Made

**Layout auth is UX, not security:**
- Layouts enforce role checks on initial access for good UX (immediate feedback)
- Next.js optimizes layouts to not re-render on client navigation
- Security MUST be enforced in server actions and Data Access Layer repositories
- This pattern documented in all three layout files

**Visual distinction between portals:**
- Admin: Dark gray (bg-gray-900) to signal platform-level administration
- Owner: White with border to feel like main application
- Driver: Blue (bg-blue-700) to visually distinguish from owner portal

**RoleGuard loading state:**
- Returns null while Clerk isLoaded is false
- Prevents flash of unauthorized content before session loads
- Fallback prop allows custom unauthorized UI instead of hiding content

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Portal infrastructure complete and ready for tenant management features:
- Admin portal ready for tenant provisioning UI (Phase 3)
- Owner portal ready for fleet and driver management features (Phases 4-5)
- Driver portal ready for route assignment and status updates (Phases 7-8)
- Role-based access control established at layout level
- Client-side conditional rendering available via RoleGuard

**Blockers:** None

## Self-Check: PASSED

All files verified to exist:
- src/lib/auth/guards.tsx ✓
- src/app/unauthorized/page.tsx ✓
- src/app/(admin)/layout.tsx ✓
- src/app/(owner)/layout.tsx ✓
- src/app/(owner)/dashboard/page.tsx ✓
- src/app/(driver)/layout.tsx ✓

All commits verified:
- 6df06a9 (Task 1) ✓
- a4e7638 (Task 2) ✓

---
*Phase: 02-authentication-authorization*
*Completed: 2026-02-14*
