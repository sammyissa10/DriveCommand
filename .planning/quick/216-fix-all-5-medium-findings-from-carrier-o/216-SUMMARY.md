---
phase: quick-216
plan: "01"
subsystem: carrier-api-security
tags: [security, validation, enum-hardening, fk-ownership, carrier]
dependency_graph:
  requires: [quick-213, quick-215]
  provides: [carrier-enum-validation, carrier-fk-ownership]
  affects: [carrier-stops-api, carrier-documents-api, carrier-route-templates-api, carrier-fleet-drivers-lib]
tech_stack:
  added: []
  patterns: [zod-enum-validation, fk-ownership-check]
key_files:
  modified:
    - apps/web/src/app/api/v1/carrier/stops/route.ts
    - apps/web/src/app/api/v1/carrier/documents/route.ts
    - apps/web/src/app/api/v1/carrier/route-templates/route.ts
    - apps/web/src/lib/carrier/fleet-drivers.ts
decisions:
  - "parentType enum uses actual lib values (stop, load, dispatch, contract, expense) not the audit's suggested values"
  - "homeTerminalId ownership check added to both createCarrierDriver and updateCarrierDriver for consistency"
metrics:
  duration: "8 minutes"
  completed: "2026-04-14"
  tasks_completed: 2
  files_modified: 4
---

# Phase quick-216 Plan 01: Fix All 5 Medium Findings from Carrier Operations Audit Summary

Closed all 5 Medium-severity carrier audit findings: z.enum validation on 4 fields across 3 API routes, safe FormData extraction with parentType validation in the documents route, and cross-tenant FK ownership checks for homeTerminalId and userId in the fleet-drivers lib.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Harden enum validation in 3 API routes | b649fe6 | stops/route.ts, documents/route.ts, route-templates/route.ts |
| 2 | Add FK ownership checks in fleet-drivers.ts | d485155 | lib/carrier/fleet-drivers.ts |

## Changes by File

### apps/web/src/app/api/v1/carrier/stops/route.ts
- `stopType: z.string()` → `z.enum(['pickup', 'delivery', 'fuel_stop', 'layover'])`

### apps/web/src/app/api/v1/carrier/route-templates/route.ts
- `scheduleType: z.string().min(1)` → `z.enum(['fixed_days', 'frequency', 'on_call'])`
- `equipmentType: z.string().min(1)` → `z.enum(['dry_van', 'flatbed', 'reefer', 'tanker', 'step_deck', 'other'])`

### apps/web/src/app/api/v1/carrier/documents/route.ts
- Replaced `formData.get(...) as string | null` casts with safe `.toString() ?? null` extraction for `parent_type`, `parent_id`, `document_type`
- Added parentType enum validation after the null guard: rejects values not in `['stop', 'load', 'dispatch', 'contract', 'expense']` with HTTP 400

### apps/web/src/lib/carrier/fleet-drivers.ts
- `createCarrierDriver`: after userId duplicate check, verify `homeTerminalId` via `prisma.carrierFacility.findFirst({ where: { id, orgId } })` — throws if not found
- `updateCarrierDriver`: verify `userId` via `prisma.user.findFirst({ where: { id, tenantId: orgId } })` when being set — throws if not in org
- `updateCarrierDriver`: verify `homeTerminalId` via `prisma.carrierFacility.findFirst({ where: { id, orgId } })` when being set — throws if not in org

## Deviations from Plan

### Adjusted Enum Values

The plan (from the audit report) suggested parentType values `['dispatch', 'load', 'truck', 'driver']`. After reading `apps/web/src/lib/carrier/documents.ts`, the actual values handled by `uploadDocument` are `stop`, `load`, `dispatch`, `contract`, `expense`. Used the actual lib values to avoid rejecting valid requests.

## Decisions Made

1. Used actual parentType values from the lib (`stop`, `load`, `dispatch`, `contract`, `expense`) rather than the audit's suggested values — the lib is the source of truth
2. Added `homeTerminalId` ownership check to `updateCarrierDriver` as well, not just `createCarrierDriver` (matching the plan's "also add for consistency" note)

## Self-Check: PASSED

Files verified to exist:
- apps/web/src/app/api/v1/carrier/stops/route.ts - FOUND
- apps/web/src/app/api/v1/carrier/documents/route.ts - FOUND
- apps/web/src/app/api/v1/carrier/route-templates/route.ts - FOUND
- apps/web/src/lib/carrier/fleet-drivers.ts - FOUND

Commits verified:
- b649fe6 - FOUND
- d485155 - FOUND

TypeScript: zero errors in src/ (3 pre-existing e2e/ errors unrelated to these changes)
