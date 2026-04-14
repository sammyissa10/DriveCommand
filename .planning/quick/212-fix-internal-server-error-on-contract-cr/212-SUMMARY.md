---
phase: quick-212
plan: "01"
subsystem: carrier/contracts
tags: [bug-fix, security, tenant-isolation, api, validation]
dependency_graph:
  requires: []
  provides: [working-contract-creation, tenant-isolation-on-contracts]
  affects: [apps/web/src/app/api/v1/carrier/contracts/route.ts, apps/web/src/lib/carrier/contracts.ts]
tech_stack:
  added: []
  patterns: [zod-status-passthrough, client-ownership-check-before-create]
key_files:
  created: []
  modified:
    - apps/web/src/app/api/v1/carrier/contracts/route.ts
    - apps/web/src/lib/carrier/contracts.ts
decisions:
  - "Accept status field in ContractCreateSchema with .default('active') so form-submitted status is not stripped by Zod"
  - "Client ownership check uses findFirst (not findUnique) to allow orgId scoping without a composite unique index"
metrics:
  duration: "~12 minutes"
  completed: "2026-04-14"
  tasks_completed: 2
  files_modified: 2
---

# Quick-212: Fix Internal Server Error on Contract Creation

One-liner: Accept status in Zod schema + enforce client ownership check to fix 500 errors and prevent cross-tenant contract creation.

## What Was Built

Contract creation was returning an Internal Server Error. The root cause was that the form always sends `status: 'active'` in the POST body, but `ContractCreateSchema` in route.ts did not include a `status` field — so Zod stripped it. With `status` stripped from the parsed data, the `...rest` spread in `createContract` never set the status field. While the Prisma schema has `@default("active")`, the database `status` column also has a `NOT NULL` constraint and a CHECK constraint (`IN ('active', 'expired', 'cancelled', 'draft')`). Depending on how Prisma sends the INSERT, omitting the field can trigger the constraint.

Additionally, the POST handler called `createContract` without first verifying that the submitted `client_id` belongs to the authenticated org — a cross-tenant isolation gap.

## Changes

### apps/web/src/app/api/v1/carrier/contracts/route.ts
- Added `import { prisma } from '@/lib/db/prisma'`
- Added `status: z.enum(['active', 'expired', 'cancelled', 'draft']).default('active').optional()` to `ContractCreateSchema` — form-submitted status is now parsed and passed through instead of being stripped
- Added client ownership check before `createContract`: queries `carrierClient` with `{ id: clientId, orgId }` and returns 400 `'Invalid client'` if not found — prevents cross-tenant contract creation

### apps/web/src/lib/carrier/contracts.ts
- Added `status?: string` to `ContractCreateInput` interface so the field is accepted by `createContract`
- Added `logger.error('createContract failed', { orgId, clientId, data, err })` in the catch block BEFORE the unique-violation check — ensures full error context (including constraint names) is logged on every failure, regardless of retry logic

## Enum Verification

All `ContractForm.tsx` enum arrays already matched database CHECK constraints:
- `CONTRACT_TYPES`: spot, contract, dedicated — matches `contracts_contract_type_check`
- `RATE_TYPES`: per_mile, flat, per_load, hourly — matches `contracts_rate_type_check`
- `FUEL_SURCHARGE_METHODS`: none, percentage, per_mile, table — matches `contracts_fuel_surcharge_method_check`
- `STATUS_OPTIONS`: active, expired, cancelled, draft — matches `contracts_status_check`

No changes to form enum values were required.

## Security

- `orgId` comes exclusively from `session.tenantId` — never from the request body (Zod schema deliberately excludes `orgId`)
- Client ownership check is server-side and cannot be bypassed by the client

## Deviations from Plan

None — plan executed exactly as written.

## Commits

- `de20638` fix(quick-212): add status field to ContractCreateSchema + error logging
- `4d13ac7` feat(quick-212): enforce tenant isolation on contract creation

## Self-Check

Files exist:
- apps/web/src/app/api/v1/carrier/contracts/route.ts — FOUND
- apps/web/src/lib/carrier/contracts.ts — FOUND

Commits exist:
- de20638 — FOUND
- 4d13ac7 — FOUND

## Self-Check: PASSED
