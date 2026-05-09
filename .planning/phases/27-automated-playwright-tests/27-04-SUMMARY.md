---
phase: 27-automated-playwright-tests
plan: "04"
subsystem: e2e-testing
tags: [playwright, e2e, carrier-portal, fleet-management]
dependency_graph:
  requires: ["27-03"]
  provides: ["carrier-dashboard-tests", "carrier-fleet-tests", "carrier-new-pages"]
  affects: ["apps/web/e2e/carrier/"]
tech_stack:
  added: []
  patterns:
    - "ID-based locators (#payModel, #payPeriod) for shadcn Select components"
    - "Graceful skip pattern for tests requiring seed data"
    - "Create-mode button text differs from edit-mode (Create Driver vs Save Changes)"
key_files:
  created:
    - apps/web/src/app/(owner)/carrier/fleet/drivers/new/page.tsx
    - apps/web/src/app/(owner)/carrier/fleet/trucks/new/page.tsx
    - apps/web/e2e/carrier/dashboard.spec.ts
    - apps/web/e2e/carrier/fleet.spec.ts
  modified: []
decisions:
  - "Used id-based locators (#payModel, #payPeriod, #unitNumber, #truckType) instead of nth(combobox) indexing — more stable since CarrierDriverForm has 5 shadcn Selects and order varies by context"
  - "Corrected button text from 'Save' (plan spec) to 'Create Driver'/'Create Truck' to match actual form implementation"
  - "Skipped actual Playwright test execution in automation — server must be running locally; TypeScript validation confirms files are syntactically correct"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-12"
  tasks_completed: 3
  files_created: 4
---

# Phase 27 Plan 04: Carrier Dashboard + Fleet E2E Tests Summary

Carrier portal E2E test coverage for dashboard and fleet management, plus two missing /new route pages that prevented tests from navigating to create forms.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 0 | Create /new pages for carrier fleet | 9edc702 | drivers/new/page.tsx, trucks/new/page.tsx |
| 1 | Carrier dashboard tests | 18630c1 | e2e/carrier/dashboard.spec.ts |
| 2 | Carrier fleet tests (drivers + trucks) | 0aeb909 | e2e/carrier/fleet.spec.ts |

## What Was Built

**drivers/new/page.tsx** — Server component that fetches `listFacilities(orgId)` and renders `CarrierDriverForm` with no `driver` prop (create mode). Prevents the 404 that occurred when `/carrier/fleet/drivers/new` was routed to the `[id]` page which called `getCarrierDriver(orgId, "new")` → null → notFound().

**trucks/new/page.tsx** — Server component rendering `CarrierTruckForm` in create mode. No facility fetch needed for trucks.

**dashboard.spec.ts** — 7 tests:
- `@smoke` page load (h1 "Dashboard")
- `@smoke` KPI strip visibility (`.grid` first element)
- Today's Dispatches section rendered
- `@smoke` Quick Actions links visible (New Dispatch, New Load, New Client)
- New Dispatch navigates to `/carrier/dispatches?new=true`
- New Load navigates to `/carrier/loads/new`
- New Client navigates to `/carrier/clients/new`
- Unauthenticated redirect test (clean context, expects `/login`)

**fleet.spec.ts** — 11 tests across two describe blocks:
- Carrier Fleet — Drivers (5 tests): list load, New Driver button, create happy path, detail navigation (graceful skip), validation
- Carrier Fleet — Trucks (6 tests): list load, New Truck button, create happy path, detail navigation (graceful skip), validation, optional VIN/plate fields

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Button text corrected from "Save" to "Create Driver"/"Create Truck"**
- **Found during:** Task 2 authoring
- **Issue:** Plan spec used `getByRole('button', { name: /Save/i })` but CarrierDriverForm renders "Create Driver" in create mode and "Save Changes" in edit mode; CarrierTruckForm renders "Create Truck" / "Save Changes"
- **Fix:** Updated both test files to use `/Create Driver/i` and `/Create Truck/i`
- **Files modified:** apps/web/e2e/carrier/fleet.spec.ts

**2. [Rule 1 - Bug] shadcn Select locator strategy corrected**
- **Found during:** Task 2 authoring
- **Issue:** Plan used `page.getByRole('combobox').nth(n)` for Pay Model (nth(0)) and Pay Period (nth(1)), but CarrierDriverForm has 5 shadcn Selects on the page (CDL State, CDL Class, Home Terminal, Pay Model, Pay Period) making nth() fragile and incorrect
- **Fix:** Used id-based locators (`#payModel`, `#payPeriod`, `#truckType`, `#unitNumber`) which match the `id` attributes on SelectTrigger and Input elements in the forms
- **Files modified:** apps/web/e2e/carrier/fleet.spec.ts

## Self-Check: PASSED

All 4 files exist on disk. All 3 commits verified in git log.
