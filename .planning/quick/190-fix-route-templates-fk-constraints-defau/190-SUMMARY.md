---
phase: quick-190
plan: "01"
subsystem: carrier/templates
tags: [carrier, templates, forms, dropdowns, fk-constraints]
dependency_graph:
  requires: [carrier-fleet-drivers-api, carrier-fleet-trucks-api]
  provides: [route-template-driver-truck-selects]
  affects: [RouteTemplateForm]
tech_stack:
  added: []
  patterns: [fetch-on-mount, sentinel-value-for-optional-select]
key_files:
  modified:
    - apps/web/src/components/carrier/templates/RouteTemplateForm.tsx
decisions:
  - "Used '__none__' sentinel instead of empty string for shadcn Select None option (shadcn does not support empty string values)"
  - "Fixed API response shape from plan's data.data?.drivers/trucks to data.data?.items (matching actual listCarrierDrivers/listCarrierTrucks return shape)"
metrics:
  duration: "5 minutes"
  completed: "2026-04-06"
  tasks_completed: 1
  files_modified: 1
---

# Phase quick-190 Plan 01: Fix Route Templates FK Constraints Summary

Select dropdowns for Default Driver and Default Truck in RouteTemplateForm, fetching active fleet members from existing API endpoints to prevent FK constraint violations from raw UUID text entry.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace free-text driver/truck inputs with Select dropdowns | 37b674d | RouteTemplateForm.tsx |

## What Was Built

- Added `DriverItem` and `TruckItem` interfaces to the form file
- Added `drivers` and `trucks` state variables
- Added two `useEffect` hooks that fetch active drivers (`/api/v1/carrier/fleet/drivers?status=active&pageSize=200`) and active trucks (`/api/v1/carrier/fleet/trucks?status=active&pageSize=200`) on mount
- Replaced both free-text UUID `<Input>` fields with shadcn `<Select>` dropdowns
- Both dropdowns show "None" as the first option (using `__none__` sentinel since shadcn Select does not allow empty string values)
- Pre-existing `defaultDriverId`/`defaultTruckId` values are correctly pre-selected on edit
- Removed the stale TODO comment

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect API response property names in plan**
- **Found during:** Task 1 — reviewing actual `listCarrierDrivers` and `listCarrierTrucks` return shapes
- **Issue:** Plan specified `data.data?.drivers` and `data.data?.trucks` but the functions return `{ items, total }`, so the API responds with `data.data.items`
- **Fix:** Used `data.data?.items` in both fetch effects instead of the plan's `.drivers` / `.trucks`
- **Files modified:** RouteTemplateForm.tsx
- **Commit:** 37b674d

## Self-Check: PASSED

- [x] `apps/web/src/components/carrier/templates/RouteTemplateForm.tsx` — modified (confirmed)
- [x] Commit 37b674d exists: `feat(quick-190): replace free-text UUID inputs with Select dropdowns for driver/truck`
- [x] `tsc --noEmit` passes with no errors
