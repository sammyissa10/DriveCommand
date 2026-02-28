---
phase: quick-38
plan: 01
subsystem: ui
tags: [error-handling, server-components, nextjs, prisma, try-catch]

requires: []
provides:
  - "DB error handling on all 29 owner-portal pages (.catch / try-catch)"
  - "null guards on payroll driver name fields"
  - "requireRole auth guard on live-map page"
  - "server-component correctness for trucks/new and drivers/invite"
affects: [all-owner-portal-pages]

tech-stack:
  added: []
  patterns:
    - ".catch(() => []) on server-action list calls"
    - "try/catch with notFound() for primary entity fetches"
    - "try/catch with zero-value defaults for dashboard aggregates"

key-files:
  created: []
  modified:
    - "src/app/(owner)/routes/page.tsx"
    - "src/app/(owner)/trucks/page.tsx"
    - "src/app/(owner)/drivers/page.tsx"
    - "src/app/(owner)/settings/integrations/page.tsx"
    - "src/app/(owner)/tags/page.tsx"
    - "src/app/(owner)/invoices/page.tsx"
    - "src/app/(owner)/loads/page.tsx"
    - "src/app/(owner)/loads/new/page.tsx"
    - "src/app/(owner)/crm/page.tsx"
    - "src/app/(owner)/payroll/page.tsx"
    - "src/app/(owner)/fuel/page.tsx"
    - "src/app/(owner)/safety/page.tsx"
    - "src/app/(owner)/trucks/[id]/edit/page.tsx"
    - "src/app/(owner)/trucks/[id]/maintenance/page.tsx"
    - "src/app/(owner)/invoices/[id]/page.tsx"
    - "src/app/(owner)/invoices/[id]/edit/page.tsx"
    - "src/app/(owner)/loads/[id]/page.tsx"
    - "src/app/(owner)/loads/[id]/edit/page.tsx"
    - "src/app/(owner)/payroll/[id]/page.tsx"
    - "src/app/(owner)/payroll/[id]/edit/page.tsx"
    - "src/app/(owner)/crm/[id]/page.tsx"
    - "src/app/(owner)/crm/[id]/edit/page.tsx"
    - "src/app/(owner)/drivers/[id]/page.tsx"
    - "src/app/(owner)/compliance/page.tsx"
    - "src/app/(owner)/ifta/page.tsx"
    - "src/app/(owner)/lane-analytics/page.tsx"
    - "src/app/(owner)/live-map/page.tsx"
    - "src/app/(owner)/trucks/new/page.tsx"
    - "src/app/(owner)/drivers/invite/page.tsx"

key-decisions:
  - "Use any[] for prisma.findMany() with include — avoids Awaited<ReturnType<...>> mismatch where base model type differs from include-extended type"
  - "Declare Awaited<ReturnType<typeof action>> typed defaults for server action calls — preserves exact return type for component prop compatibility"
  - "Wrap entire Promise.all in try/catch for fuel/safety dashboards — avoids per-item fallback type complexity with custom action return types"
  - "notFound() in catch block for primary entity fetches — consistent with existing null-check pattern; DB errors are treated same as missing records"
  - "Zero-value defaults for dashboard aggregates (compliance, ifta, lane-analytics) — preferred over notFound() so dashboard renders empty state instead of 404"

duration: 18min
completed: 2026-02-28
---

# Quick-38: Fix All 35 Audit Issues Summary

**DB error handling added to 29 owner-portal pages via .catch(() => []) and try/catch, with requireRole on live-map, null guards on payroll driver names, and 'use client' removed from two page files**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-02-28T00:00:00Z
- **Completed:** 2026-02-28T00:18:00Z
- **Tasks:** 3
- **Files modified:** 29

## Accomplishments
- All 12 list pages now return empty arrays on DB failure instead of crashing the server component
- All 14 detail pages now return 404 on DB failure instead of an unhandled exception
- Compliance, IFTA, and lane-analytics dashboards render with zero-value defaults on DB failure
- live-map page now requires OWNER or MANAGER role (was unguarded)
- payroll/[id] null-guards `driver.firstName ?? ''` and `driver.lastName ?? ''` so null names render blank instead of crashing
- trucks/new and drivers/invite no longer carry illegal 'use client' directives (they are correct server components)
- `npx tsc --noEmit` exits clean with zero errors

## Task Commits

1. **Task 1: Add .catch/try-catch error handling to 12 list pages** - `2fcb868` (fix)
2. **Task 2: Add try/catch notFound guards to 14 detail pages** - `bbd4e2a` (fix)
3. **Task 3: requireRole on live-map, remove use client from trucks/new and drivers/invite** - `cc48a9c` (fix)

## Files Created/Modified

**Task 1 — list pages (12 files):**
- `src/app/(owner)/routes/page.tsx` - `.catch(() => [])` on listRoutes()
- `src/app/(owner)/trucks/page.tsx` - `.catch(() => [])` on listTrucks()
- `src/app/(owner)/drivers/page.tsx` - `.catch(() => [])` on listDrivers()
- `src/app/(owner)/settings/integrations/page.tsx` - `.catch(() => [])` on listIntegrations()
- `src/app/(owner)/tags/page.tsx` - per-item `.catch(() => [])` inside Promise.all
- `src/app/(owner)/invoices/page.tsx` - try/catch wrapping prisma.invoice.findMany
- `src/app/(owner)/loads/page.tsx` - try/catch wrapping prisma.load.findMany
- `src/app/(owner)/loads/new/page.tsx` - try/catch wrapping prisma.customer.findMany
- `src/app/(owner)/crm/page.tsx` - try/catch wrapping prisma.customer.findMany
- `src/app/(owner)/payroll/page.tsx` - try/catch wrapping prisma.payrollRecord.findMany
- `src/app/(owner)/fuel/page.tsx` - try/catch wrapping entire Promise.all with typed defaults
- `src/app/(owner)/safety/page.tsx` - try/catch wrapping entire Promise.all with typed defaults

**Task 2 — detail pages (14 files):**
- `src/app/(owner)/trucks/[id]/edit/page.tsx` - try/catch → notFound() on getTruck
- `src/app/(owner)/trucks/[id]/maintenance/page.tsx` - try/catch on getTruck; .catch on Promise.all items
- `src/app/(owner)/invoices/[id]/page.tsx` - try/catch → notFound() on findUnique
- `src/app/(owner)/invoices/[id]/edit/page.tsx` - try/catch → notFound() on findUnique
- `src/app/(owner)/loads/[id]/page.tsx` - try/catch → notFound() on primary fetch; .catch on PENDING dispatch modal queries
- `src/app/(owner)/loads/[id]/edit/page.tsx` - try/catch wrapping entire Promise.all → notFound()
- `src/app/(owner)/payroll/[id]/page.tsx` - try/catch → notFound(); `?? ''` null guards on driver name
- `src/app/(owner)/payroll/[id]/edit/page.tsx` - try/catch → notFound() on findUnique
- `src/app/(owner)/crm/[id]/page.tsx` - try/catch → notFound() on findUnique
- `src/app/(owner)/crm/[id]/edit/page.tsx` - try/catch → notFound() on findUnique
- `src/app/(owner)/drivers/[id]/page.tsx` - `.catch(() => [])` on listDriverDocuments
- `src/app/(owner)/compliance/page.tsx` - try/catch with zero-value ComplianceDashboard default
- `src/app/(owner)/ifta/page.tsx` - try/catch on getIFTAReport + try/catch on generateIFTACSV
- `src/app/(owner)/lane-analytics/page.tsx` - try/catch with zero-value LaneAnalytics default

**Task 3 — auth and directive fixes (3 files):**
- `src/app/(owner)/live-map/page.tsx` - requireRole([OWNER, MANAGER]) + .catch on Promise.all
- `src/app/(owner)/trucks/new/page.tsx` - removed 'use client' directive
- `src/app/(owner)/drivers/invite/page.tsx` - removed 'use client' directive

## Decisions Made

- Used `any[]` for `prisma.findMany()` with `include` — the `Awaited<ReturnType<...>>` approach returns the base model type (no includes), causing TS2322 mismatches against component prop types. `any[]` avoids this while preserving runtime correctness.
- Used `Awaited<ReturnType<typeof action>>` for typed server action defaults — server actions return explicit shapes, so typed defaults are safe and preserve prop compatibility.
- Chose try/catch over per-item .catch for fuel/safety dashboards — the multiple action calls return complex custom types; wrapping the whole block is simpler and avoids having to construct per-type fallbacks for six separate functions.
- Zero-value defaults preferred over notFound() for compliance/IFTA/lane-analytics dashboards — these are analytics pages; a DB error should show an empty state, not a 404.
- notFound() in catch block for trucks/new, invoices/[id], loads/[id], etc. — consistent with existing null-check pattern directly below the try block.

## Deviations from Plan

**1. [Rule 1 - Bug] Fixed type mismatch: Awaited<ReturnType<typeof prisma.X.findMany>> does not include `include` fields**
- **Found during:** Task 1 (after first tsc check)
- **Issue:** Using `Awaited<ReturnType<typeof prisma.invoice.findMany>>` for the empty default typed `[]` as the base model type (no includes), causing TS2322 "Property 'items' is missing" errors when passed to component props expecting the extended type.
- **Fix:** Replaced with `any[]` for the empty default on all prisma.findMany wraps. Actual values retain correct types from the real query result.
- **Files modified:** crm/page.tsx, invoices/page.tsx, loads/page.tsx, loads/new/page.tsx, payroll/page.tsx
- **Verification:** tsc --noEmit exits clean after fix
- **Committed in:** 2fcb868 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - type bug)
**Impact on plan:** Necessary correction — the plan's suggested `Awaited<ReturnType<...>>` pattern doesn't account for Prisma include-extended types. `any[]` is the correct empty-fallback approach.

## Issues Encountered

None beyond the tsc type mismatch documented above, which was fixed inline during Task 1.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 29 pages are now hardened against transient DB failures
- Owner portal will render empty states or 404s instead of crashing on DB errors
- live-map is now properly auth-guarded
- Ready for Phase 20 (Driver Pay Settlement)

---

*Phase: quick-38*
*Completed: 2026-02-28*
