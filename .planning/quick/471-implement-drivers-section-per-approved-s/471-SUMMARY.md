---
phase: quick-471
plan: 471
subsystem: drivers
tags: [design-system, drivers, ui-rebuild]
dependency-graph:
  requires: [quick-469]
  provides: [drivers-overview, drivers-kpi, drivers-data-grid, driver-record, driver-invite-form]
  affects: [/drivers, /drivers/invite, /drivers/[id], /drivers/[id]/edit]
tech-stack:
  added: []
  patterns: [design-system-components, tanstack-table, optimistic-updates]
key-files:
  created:
    - apps/web/src/lib/drivers/compute-driver-status.ts
    - apps/web/src/app/(owner)/drivers/_components/DriversKPICards.tsx
    - apps/web/src/app/(owner)/drivers/_components/DriversDataGrid.tsx
    - apps/web/src/app/(owner)/drivers/_components/DriversPageClient.tsx
    - apps/web/src/app/(owner)/drivers/invite/_components/DriverInviteForm.tsx
    - apps/web/src/app/(owner)/drivers/[id]/_components/DriverRecord.tsx
    - apps/web/src/app/(owner)/drivers/[id]/page.tsx
  modified:
    - apps/web/src/app/(owner)/actions/drivers.ts
    - apps/web/src/app/(owner)/drivers/page.tsx
    - apps/web/src/app/(owner)/drivers/invite/page.tsx
    - apps/web/src/app/(owner)/drivers/[id]/edit/page.tsx
  deleted:
    - apps/web/src/app/(owner)/drivers/driver-list-wrapper.tsx
    - apps/web/src/components/drivers/driver-list.tsx
    - apps/web/src/components/drivers/driver-invite-form.tsx
    - apps/web/src/app/(owner)/drivers/[id]/edit/edit-driver-client.tsx
decisions:
  - "DriverWithRelations.documentType allows null to match Prisma schema"
  - "Map driverDocuments to documents in listDrivers for interface compatibility"
  - "Compliance alerts for license, medical card, and CDL tracked separately"
  - "Deactivate/reactivate buttons on driver detail page"
metrics:
  duration: 624s
  completed: 2026-06-21
  tasks: 12
  files: 16
---

# Quick Task 471: Implement Drivers Section Per Approved Spec Summary

Rebuilt the Drivers section using the design system, mirroring the Trucks section pattern exactly.

## One-liner

Driver status computation utility with KPI cards, status tabs, searchable data grid, sectioned invite form, and unified view/edit DriverRecord component.

## Commits

| Hash | Message |
|------|---------|
| `7e60fdb4` | feat(quick-471): add driver status computation utility |
| `f35f4f1d` | feat(quick-471): enhance listDrivers with compliance docs, add deleteDriver |
| `69835c17` | feat(quick-471): add DriversKPICards component |
| `bd552149` | feat(quick-471): add DriversDataGrid component |
| `721f1e70` | feat(quick-471): add DriversPageClient wrapper |
| `b0c0799f` | feat(quick-471): rebuild drivers overview page with design system |
| `33171cfc` | feat(quick-471): add DriverInviteForm component |
| `1598282c` | feat(quick-471): rebuild driver invite page with design system form |
| `f4745225` | feat(quick-471): add DriverRecord component for view/edit modes |
| `9c77f94f` | feat(quick-471): add driver view page |
| `79615427` | feat(quick-471): rebuild driver edit page with DriverRecord |
| `b8d9d143` | chore(quick-471): remove legacy driver files |

## Deviations from Plan

None - plan executed exactly as written.

## Key Decisions

1. **DriverWithRelations documentType allows null** - The Prisma schema has documentType as nullable, so the interface was updated to match.

2. **Map driverDocuments to documents** - The User model uses `driverDocuments` relation name, but the interface expects `documents`, so we map in the action.

3. **Separate compliance alerts** - License expiry, Medical Card expiry, and CDL expiry are tracked as separate alerts in the right rail.

## Verification Results

- TypeScript compilation: PASSED
- All 12 tasks completed
- All commits created with proper format
- Legacy files cleaned up

## Files Created

- `apps/web/src/lib/drivers/compute-driver-status.ts` - Pure utility for driver status computation
- `apps/web/src/app/(owner)/drivers/_components/DriversKPICards.tsx` - KPI cards for overview
- `apps/web/src/app/(owner)/drivers/_components/DriversDataGrid.tsx` - Data grid with tabs, search, table/cards
- `apps/web/src/app/(owner)/drivers/_components/DriversPageClient.tsx` - Client wrapper for optimistic updates
- `apps/web/src/app/(owner)/drivers/invite/_components/DriverInviteForm.tsx` - Sectioned invite form
- `apps/web/src/app/(owner)/drivers/[id]/_components/DriverRecord.tsx` - Unified view/edit component
- `apps/web/src/app/(owner)/drivers/[id]/page.tsx` - Driver detail view page

## Files Modified

- `apps/web/src/app/(owner)/actions/drivers.ts` - Added listDrivers with compliance docs, deleteDriver, getDriverWithRelations
- `apps/web/src/app/(owner)/drivers/page.tsx` - Rebuilt with KPIs, tabs, data grid
- `apps/web/src/app/(owner)/drivers/invite/page.tsx` - Rebuilt with sectioned form
- `apps/web/src/app/(owner)/drivers/[id]/edit/page.tsx` - Rebuilt with DriverRecord

## Files Deleted

- `apps/web/src/app/(owner)/drivers/driver-list-wrapper.tsx`
- `apps/web/src/components/drivers/driver-list.tsx`
- `apps/web/src/components/drivers/driver-invite-form.tsx`
- `apps/web/src/app/(owner)/drivers/[id]/edit/edit-driver-client.tsx`

## Self-Check: PASSED

All created files exist:
- [x] `apps/web/src/lib/drivers/compute-driver-status.ts`
- [x] `apps/web/src/app/(owner)/drivers/_components/DriversKPICards.tsx`
- [x] `apps/web/src/app/(owner)/drivers/_components/DriversDataGrid.tsx`
- [x] `apps/web/src/app/(owner)/drivers/_components/DriversPageClient.tsx`
- [x] `apps/web/src/app/(owner)/drivers/invite/_components/DriverInviteForm.tsx`
- [x] `apps/web/src/app/(owner)/drivers/[id]/_components/DriverRecord.tsx`
- [x] `apps/web/src/app/(owner)/drivers/[id]/page.tsx`

All commits exist:
- [x] 7e60fdb4
- [x] f35f4f1d
- [x] 69835c17
- [x] bd552149
- [x] 721f1e70
- [x] b0c0799f
- [x] 33171cfc
- [x] 1598282c
- [x] f4745225
- [x] 9c77f94f
- [x] 79615427
- [x] b8d9d143
