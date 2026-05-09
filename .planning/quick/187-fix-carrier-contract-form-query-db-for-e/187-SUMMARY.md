---
phase: quick-187
plan: 01
subsystem: carrier-ops
tags: [contracts, prisma, migration, forms, dropdowns, validation]
dependency_graph:
  requires: [carrier-contracts-table]
  provides: [working-contract-crud, correct-check-constraints]
  affects: [ContractForm, carrier-contracts-api, ContractDetail]
tech_stack:
  added: []
  patterns: [zod-enum-validation, prisma-decimal-serialization]
key_files:
  created:
    - apps/web/prisma/migrations/20260408000001_contract_add_missing_fields/migration.sql
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/components/carrier/contracts/ContractForm.tsx
    - apps/web/src/lib/carrier/contracts.ts
    - apps/web/src/app/api/v1/carrier/contracts/route.ts
    - apps/web/src/app/api/v1/carrier/contracts/[id]/route.ts
    - apps/web/src/app/(owner)/carrier/contracts/[id]/ContractDetail.tsx
    - apps/web/src/app/(owner)/carrier/contracts/[id]/page.tsx
decisions:
  - softDeleteContract status changed from terminated to cancelled to match DB CHECK constraint (active/expired/cancelled/draft)
metrics:
  duration: 25m
  completed: 2026-04-05
  tasks_completed: 2
  files_modified: 7
  files_created: 1
---

# Quick-187: Fix Carrier Contract Form — Query DB for Exact Constraint Values

**One-liner:** Fixed 4 dropdown CHECK constraint mismatches and added 7 missing spec fields (contract_name, detention, TONU, layover, payment_terms, auto_renew) through migration, Prisma schema, lib, API, form, and detail view.

## What Was Done

### Task 1: Migration + Prisma Schema

Created migration `20260408000001_contract_add_missing_fields` adding 7 columns to the `contracts` table:
- `contract_name TEXT`
- `detention_free_minutes INTEGER DEFAULT 120`
- `detention_rate_per_hour NUMERIC(10,2)`
- `tonu_rate NUMERIC(10,2)`
- `layover_rate_per_day NUMERIC(10,2)`
- `payment_terms_override TEXT` with CHECK constraint for valid payment terms
- `auto_renew BOOLEAN NOT NULL DEFAULT false`

Updated CarrierContract model in schema.prisma with all 7 new fields.

Also resolved a pre-existing failed migration (`20260406000001_facility_lumper_appointment_contacts`) that had already been applied to the DB but wasn't tracked by Prisma — marked it as applied to unblock migration deployment.

### Task 2: Full Stack Wiring

**Dropdown constants corrected** to match exact DB CHECK constraints:
- `CONTRACT_TYPES`: removed `volume`, `brokerage`; added `contract` → now `['spot', 'contract', 'dedicated']`
- `RATE_TYPES`: removed `per_hour`, `percentage`; added `hourly` → now `['per_mile', 'flat', 'per_load', 'hourly']`
- `FUEL_SURCHARGE_METHODS`: removed `flat_rate`, `doe_index`; added `per_mile`, `table` → now `['none', 'percentage', 'per_mile', 'table']`
- `STATUS_OPTIONS`: removed `pending`, `terminated`; added `cancelled`, `draft` → now `['active', 'expired', 'cancelled', 'draft']`

**API schemas** updated with `z.enum()` validation for all CHECK-constrained fields to catch violations before they hit the DB. Added all 7 new field schemas to both `ContractCreateSchema` and `ContractUpdateSchema`.

**lib/carrier/contracts.ts** updated:
- `ContractCreateInput` and `ContractUpdateInput` types include all new fields
- `createContract` and `updateContract` handle decimal, int, and bool new fields
- `listContracts` and `getContract` serialize new Decimal fields via `decStr()`
- `softDeleteContract` changed status from `'terminated'` to `'cancelled'` (valid CHECK value)

**ContractForm.tsx**: removed TODO comment block, updated `ContractData` interface, added form state for all 7 new fields with sensible defaults, added UI sections for contract name, detention/TONU/layover, and payment terms + auto-renew.

**ContractDetail.tsx**: updated `ContractSerialized` interface, passes all new fields through `editFormData`, displays detention/TONU/layover sub-section in Rate card, adds payment terms and auto-renew to Basic Info card. Header now shows contractName as primary title when set.

**page.tsx**: serialized object now includes all 7 new fields.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing failed migration blocking deployment**
- **Found during:** Task 1 (`prisma migrate deploy`)
- **Issue:** Migration `20260406000001_facility_lumper_appointment_contacts` failed with "column already exists" — the migration had been applied manually to the DB but Prisma's migration table didn't know
- **Fix:** Ran `prisma migrate resolve --applied 20260406000001_facility_lumper_appointment_contacts`
- **Files modified:** None (DB state only)
- **Commit:** 933163d

**2. [Rule 1 - Bug] softDeleteContract used status `terminated` (invalid CHECK value)**
- **Found during:** Task 2 code review
- **Issue:** `softDeleteContract` set status to `'terminated'` which is not in the DB CHECK constraint `('active', 'expired', 'cancelled', 'draft')`
- **Fix:** Changed to `'cancelled'`
- **Files modified:** `apps/web/src/lib/carrier/contracts.ts`
- **Commit:** 9d110e7

**3. [Rule 3 - Blocking] page.tsx missing new fields in serialized object**
- **Found during:** `tsc --noEmit` after Task 2
- **Issue:** `ContractDetail` component required new fields but `page.tsx` serialized object didn't include them — TypeScript error
- **Fix:** Added all 7 new fields to the serialized object in page.tsx
- **Files modified:** `apps/web/src/app/(owner)/carrier/contracts/[id]/page.tsx`
- **Commit:** 9d110e7

## Commits

| Hash | Message |
|------|---------|
| 933163d | feat(quick-187): add 7 missing columns to contracts table via migration + update Prisma schema |
| 9d110e7 | feat(quick-187): fix contract form dropdowns + add 7 new fields across full stack |

## Self-Check: PASSED

Files verified:
- FOUND: apps/web/prisma/migrations/20260408000001_contract_add_missing_fields/migration.sql
- FOUND: apps/web/prisma/schema.prisma (contractName field present)
- FOUND: apps/web/src/components/carrier/contracts/ContractForm.tsx (no TODO comment, PAYMENT_TERMS constant present)
- FOUND: apps/web/src/lib/carrier/contracts.ts (detentionFreeMinutes in ContractCreateInput)
- FOUND: apps/web/src/app/api/v1/carrier/contracts/route.ts (z.enum for contractType)
- FOUND: apps/web/src/app/(owner)/carrier/contracts/[id]/ContractDetail.tsx (detentionFreeMinutes in interface)
- tsc --noEmit: PASSED
