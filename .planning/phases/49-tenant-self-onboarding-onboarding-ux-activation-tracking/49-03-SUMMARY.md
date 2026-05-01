---
phase: 49-tenant-self-onboarding-onboarding-ux-activation-tracking
plan: 03
subsystem: ui
tags: [onboarding, sample-data, react, nextjs, prisma, suspense]

# Dependency graph
requires:
  - phase: 49-01
    provides: SampleDataBanner and SamplePill components in apps/web/src/components/onboarding/
  - phase: 49-02
    provides: activation-tracker library and isSample fields on Truck/User/Load/Customer models
provides:
  - SampleDataBanner wired into carrier dashboard, trucks, drivers, loads, and CRM pages
  - SamplePill rendered on isSample rows in all 4 list components (trucks, drivers, loads, customers)
  - Header counts for loads and CRM exclude isSample=true records
  - TruckWithRelations interface includes isSample?: boolean
affects: [49-04, onboarding-ux, sample-data-display]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SampleDataBanner inside inner async sub-components (TruckListSection/DriverListSection) to preserve Suspense streaming — outer synchronous page components unchanged"
    - "hasSampleRecords derived from already-fetched rows (rows.some(r => r.isSample)) — no extra DB query for trucks/drivers/loads/crm"
    - "Dashboard uses bypass_rls + Promise.all across all 4 entity types for hasSampleRecords check"
    - "sampleDataSeeded read from Tenant.findFirst (tenant-scoped client, no bypass needed)"

key-files:
  created: []
  modified:
    - apps/web/src/lib/trucks/compute-truck-status.ts
    - apps/web/src/components/trucks/truck-list.tsx
    - apps/web/src/components/drivers/driver-list.tsx
    - apps/web/src/components/loads/load-list.tsx
    - apps/web/src/components/crm/customer-list.tsx
    - apps/web/src/app/(owner)/carrier/dashboard/page.tsx
    - apps/web/src/app/(owner)/trucks/page.tsx
    - apps/web/src/app/(owner)/drivers/page.tsx
    - apps/web/src/app/(owner)/loads/page.tsx
    - apps/web/src/app/(owner)/crm/page.tsx

key-decisions:
  - "Banner placed inside TruckListSection/DriverListSection (not outer TrucksPage/DriversPage) to preserve Suspense streaming — outer page components remain synchronous"
  - "hasSampleRecords derived from already-fetched row data (no extra query) for trucks/drivers/loads/crm pages"
  - "Carrier dashboard uses bypass_rls transaction with Promise.all across Truck/User/Load/Customer for hasSampleRecords since it has no list data to reuse"

patterns-established:
  - "Sample pill placement: inline after primary identifier (make column for trucks, firstName for drivers, loadNumber for loads, companyName for customers)"
  - "Banner + pill guard pattern: check sampleDataSeeded from Tenant before rendering either component"

# Metrics
duration: 18min
completed: 2026-05-01
---

# Phase 49 Plan 03: Sample Data UX — Banner + Pill Wiring Summary

**SampleDataBanner wired into all 5 owner pages and SamplePill rendered on isSample rows in all 4 list components, with header counts excluding sample records**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-05-01T18:10:00Z
- **Completed:** 2026-05-01T18:28:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- SampleDataBanner appears on carrier dashboard, trucks, drivers, loads, and CRM pages when tenant has seeded sample data with at least one isSample=true record remaining
- SamplePill renders next to the primary identifier (make/firstName/loadNumber/companyName) on all isSample=true rows in the four list components, on both desktop table and mobile card views
- Loads and CRM header stat counts (total/active/VIP) exclude isSample=true records; findMany queries unchanged so sample rows remain visible in lists
- TruckWithRelations extended with isSample?: boolean so truck-list.tsx TypeScript compiles cleanly
- Suspense streaming preserved: TrucksPage and DriversPage outer components remain synchronous; banner rendered inside inner async TruckListSection/DriverListSection sub-components

## Task Commits

Each task was committed atomically:

1. **Task 1: isSample=false filters for list page header counts** - `e137957` (feat)
2. **Task 2: Add SamplePill to list components + SampleDataBanner to pages** - `7d4f055` (feat)

**Plan metadata:** see final commit in STATE.md update

## Files Created/Modified

- `apps/web/src/lib/trucks/compute-truck-status.ts` - Added isSample?: boolean to TruckWithRelations interface
- `apps/web/src/components/trucks/truck-list.tsx` - Import SamplePill, render on isSample rows (Make column + mobile card)
- `apps/web/src/components/drivers/driver-list.tsx` - Import SamplePill, render on isSample rows (firstName column + mobile card)
- `apps/web/src/components/loads/load-list.tsx` - Add isSample to LoadItem, import SamplePill, render on isSample rows (loadNumber column + mobile card)
- `apps/web/src/components/crm/customer-list.tsx` - Add isSample to Customer, import SamplePill, render on isSample rows (company column + mobile card)
- `apps/web/src/app/(owner)/carrier/dashboard/page.tsx` - Bypass_rls Promise.all across 4 entity types, render SampleDataBanner
- `apps/web/src/app/(owner)/trucks/page.tsx` - SampleDataBanner inside TruckListSection (preserves sync outer page)
- `apps/web/src/app/(owner)/drivers/page.tsx` - SampleDataBanner inside DriverListSection (preserves sync outer page)
- `apps/web/src/app/(owner)/loads/page.tsx` - isSample: false on count query, SampleDataBanner at page level
- `apps/web/src/app/(owner)/crm/page.tsx` - isSample: false on all 3 count queries, SampleDataBanner at page level

## Decisions Made

- **Suspense streaming preserved for trucks/drivers**: Banner placed inside inner async sub-components (TruckListSection, DriverListSection) not in the outer synchronous page — prevents blocking the Suspense skeleton rendering
- **No extra DB query for hasSampleRecords on list pages**: For trucks/drivers/loads/crm, `hasSampleRecords` is derived from already-fetched row data (`rows.some(r => r.isSample)`) — zero extra queries
- **Dashboard uses bypass_rls**: Since dashboard has no list data to reuse, it uses `prisma.$transaction` with `set_config('app.bypass_rls', 'on', TRUE)` and Promise.all across all 4 entity types

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 49 complete — all 3 plans delivered:
- 49-01: SampleDataBanner + SamplePill components + seedSampleData action
- 49-02: Activation tracker library + hooks in trucks/customers/loads/accept-invitation
- 49-03: Banner + pill wired into all 5 owner pages, list component isSample annotations, count filters

Tenant self-onboarding UX + activation tracking milestone is complete.

---
*Phase: 49-tenant-self-onboarding-onboarding-ux-activation-tracking*
*Completed: 2026-05-01*
