---
phase: quick-213
plan: "01"
subsystem: carrier-operations
tags: [security, audit, tenant-isolation, validation, carrier]
dependency_graph:
  requires: []
  provides: [carrier-ops-audit-report]
  affects: [carrier-operations, api-v1-carrier]
tech_stack:
  added: []
  patterns: [read-only-audit]
key_files:
  created:
    - .planning/quick/213-carrier-operations-server-actions-audit-/213-REPORT.md
  modified: []
decisions:
  - "Audit only — no source files modified"
  - "Supabase tables confirmed to have no SQL-level CHECK constraints on carrier enum columns — all constraint enforcement is application-layer Zod only"
metrics:
  duration: "25 minutes"
  completed: "2026-04-14"
  tasks_completed: 1
  files_created: 2
---

# Phase quick-213 Plan 01: Carrier Operations Audit Summary

## What Was Done
Complete 4-audit read-only security review of all Carrier Operations server actions, Zod schemas, form components, and API routes. No source files were modified.

## Key Findings

### Audit 1 — CHECK Constraint Alignment
All 13 carrier tables confirmed to have no SQL-level CHECK constraints. Constraints are enforced exclusively at the application layer. 4 Critical/High mismatches found:

- **Critical**: `carrier_drivers.pay_model` — API Zod enum accepts `['per_mile', 'percentage', 'flat_rate', 'per_stop']` but `pay-calculator.ts` uses `per_mile`, `percentage_gross`, `hourly`, `flat_rate`, `team_split`. The value `percentage` (accepted by Zod) is not handled by the calculator — silently produces no pay record. Values `hourly`, `percentage_gross`, `team_split` cannot be created via the API at all.
- **High**: `loads.rate_type` — `per_load` is selectable in `ContractForm` and propagates to loads via contract auto-populate, but `per_load` is NOT in the loads API Zod enum, causing a 400 rejection.
- **High**: `facilities.facility_type` — `softDeleteFacility` writes `inactive_terminal` etc. via a prefix convention, producing values that are NOT in the FacilityCreateSchema Zod enum. A PATCH after soft-delete would reject with 400.

### Audit 2 — Zod vs NOT NULL Columns
- **High**: `CarrierStop.stopType` — accepted as `z.string()` (unconstrained) in the stops API route. Should be `z.enum(['pickup', 'delivery', 'fuel_stop', 'layover'])`.
- **Medium**: `CarrierDocument` upload fields (`parentType`, `parentId`, `documentType`) validated via raw FormData cast + manual null guard instead of a Zod schema.
- **Medium**: `RouteTemplate.scheduleType` and `equipmentType` accepted as `z.string().min(1)` without enum enforcement at API layer.

### Audit 3 — Null String Initialization
**All carrier forms are clean.** No `null` default patterns found for string form fields. All forms initialize string fields with `''` and convert empty strings to `undefined` before submission. One Medium finding: the documents API route uses `formData.get('field') as string | null` cast without a type-safe helper.

### Audit 4 — Tenant Isolation
4 Critical/High FK ownership gaps:

- **Critical**: `createLoad` — `clientId` accepted from request with no ownership verification. Cross-tenant load attribution is possible.
- **Critical**: `createDispatch` — `primaryDriverId` and `truckId` accepted without ownership checks. Cross-tenant FK links possible.
- **Critical**: `uploadDocument` — `parentId` not ownership-verified at upload time. The list/delete functions correctly chain-verify, but upload does not.
- **High**: `createExpense` — `dispatchId`, `driverId`, `stopId`, `receiptDocumentId` accepted without ownership checks (only `loadId` verified).
- **High**: `createRouteTemplate` / `saveRouteTemplate` server action — `clientId` and `contractId` accepted without ownership verification.
- **High**: `createStop` — `loadId` and `clientId` accepted without ownership checks (dispatch and facility are correctly verified).

## Deviations from Plan
None — plan executed exactly as written. Read-only audit with no source file modifications.

## Self-Check: PASSED
- 213-REPORT.md exists: confirmed
- 4 audit sections: confirmed (grep returned 4)
- 13 table names referenced: confirmed (grep returned 56 matches)
- Zero source files modified: confirmed
