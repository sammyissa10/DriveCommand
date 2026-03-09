---
phase: 23-system-admin-portal-super-admin-interface-for-the-drivecommand-team-to-manage-all-tenants
plan: "02"
subsystem: ui
tags: [nextjs, prisma, shadcn, admin, dashboard, tenants]

# Dependency graph
requires:
  - phase: 23-01
    provides: ADMIN_SECRET_KEY auth layer, requireSystemAdmin(), /admin/* middleware guard, admin layout

provides:
  - Admin home dashboard at /admin with 4 real-data system metric cards
  - Tenant detail page at /admin/tenants/[id] with owner info, resource counts, status badge
  - TenantStatusControls client component with suspend/reactivate with router.refresh()
  - getSystemMetrics server action (totalTenants, activeLoadsToday, newSignupsThisWeek, openTickets)
  - getTenantById server action returning full tenant with owner user/invitation and _count
  - View link column in tenant list navigating to detail page

affects:
  - 23-03 (support ticket admin phase, uses same admin portal layout)
  - future admin phases

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Promise.all for parallel cross-tenant Prisma queries in admin server actions
    - Inline TenantStatusControls 'use client' component receiving tenantId + isActive props
    - Three-state status badge (Suspended/Pending/Active) reused from tenant-list-client
    - force-dynamic on admin server pages to prevent stale metrics

key-files:
  created:
    - src/app/(admin)/page.tsx
    - src/app/(admin)/tenants/[id]/page.tsx
    - src/app/(admin)/tenants/[id]/tenant-status-controls.tsx
  modified:
    - src/app/(admin)/actions/tenants.ts
    - src/app/(admin)/tenants/tenant-list-client.tsx
    - src/app/(admin)/admin-support/ticket-list.tsx

key-decisions:
  - "getSystemMetrics uses Promise.all for all 4 metrics in parallel — single round-trip"
  - "Three-state status badge logic duplicated from tenant-list-client (not extracted) — colocation over abstraction"
  - "TenantStatusControls as separate file tenant-status-controls.tsx — respects server/client boundary"
  - "params typed as Promise<{ id: string }> for Next.js 15 async params pattern (consistent with Phase 22-02)"

patterns-established:
  - "Admin pages export const dynamic = 'force-dynamic' to prevent metric staleness"
  - "Admin detail pages: try/catch getTenantById with error card fallback"

# Metrics
duration: 8min
completed: 2026-03-09
---

# Phase 23 Plan 02: Admin Dashboard + Tenant Detail Page Summary

**Admin home with 4 real-time metric cards, per-tenant detail page with owner info and one-click suspension controls, and View link in tenant list**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-09T21:11:00Z
- **Completed:** 2026-03-09T21:19:20Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- `/admin` dashboard showing live totalTenants, activeLoadsToday, newSignupsThisWeek, openTickets via parallel Prisma queries
- `/admin/tenants/[id]` detail page with three-state status badge, owner info (active user or pending invitation), resource counts (users/trucks/routes), and suspend/reactivate controls
- Tenant list table updated with clickable "View" column linking to `/tenants/{id}`

## Task Commits

1. **Task 1: getSystemMetrics + getTenantById server actions** - `a4476da` (feat)
2. **Task 2: Admin home dashboard + tenant detail page + tenant list view link** - `ea29a4f` (feat)

## Files Created/Modified

- `src/app/(admin)/page.tsx` - Admin home dashboard with 4 metric cards + quick-link nav
- `src/app/(admin)/tenants/[id]/page.tsx` - Tenant detail server component with full info
- `src/app/(admin)/tenants/[id]/tenant-status-controls.tsx` - Client component for suspend/reactivate
- `src/app/(admin)/actions/tenants.ts` - Added getSystemMetrics and getTenantById exports
- `src/app/(admin)/tenants/tenant-list-client.tsx` - Added View link column + Link import
- `src/app/(admin)/admin-support/ticket-list.tsx` - Fixed missing tenantOptions prop in interface

## Decisions Made

- `getSystemMetrics` uses `Promise.all` for all 4 queries in parallel — minimizes latency on dashboard load
- Three-state status badge logic copied from `tenant-list-client.tsx` rather than extracted — avoids shared component complexity for a two-line conditional
- `params` typed as `Promise<{ id: string }>` following Next.js 15 async params pattern (established in Phase 22-02)
- `TenantStatusControls` in a separate file to maintain clean server/client module boundary

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed AdminTicketList missing tenantOptions prop in TypeScript interface**
- **Found during:** Task 2 (final TypeScript verification)
- **Issue:** `admin-support/page.tsx` passes `tenantOptions` to `AdminTicketList` but the component interface didn't declare it, causing `tsc --noEmit` to fail with TS2322
- **Fix:** Added `tenantOptions?: { id: string; name: string }[]` as optional prop to `AdminTicketListProps`
- **Files modified:** `src/app/(admin)/admin-support/ticket-list.tsx`
- **Verification:** `npx tsc --noEmit` passes with 0 errors
- **Committed in:** `ea29a4f` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - pre-existing bug)
**Impact on plan:** Fix was necessary to achieve clean TypeScript compile. No scope creep.

## Issues Encountered

None — plan executed as specified with one pre-existing TypeScript bug auto-fixed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Admin portal now has home dashboard + tenant management with drill-down
- Ready for Phase 23-03 (support ticket admin page is already built from quick-44; 23-03 can extend it)
- All suspension controls functional and verified compiling cleanly

---
*Phase: 23-system-admin-portal*
*Completed: 2026-03-09*

## Self-Check: PASSED

- FOUND: `src/app/(admin)/page.tsx`
- FOUND: `src/app/(admin)/tenants/[id]/page.tsx`
- FOUND: `src/app/(admin)/tenants/[id]/tenant-status-controls.tsx`
- FOUND: `.planning/phases/.../23-02-SUMMARY.md`
- FOUND: commit `a4476da` (Task 1)
- FOUND: commit `ea29a4f` (Task 2)
- TypeScript: 0 errors (`npx tsc --noEmit`)
