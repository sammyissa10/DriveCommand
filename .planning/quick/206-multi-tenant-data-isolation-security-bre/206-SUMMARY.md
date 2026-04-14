---
phase: quick-206
plan: 01
subsystem: api-security
tags: [security, multi-tenant, data-isolation, p0, toctou]
dependency_graph:
  requires: []
  provides: [multi-tenant-data-isolation]
  affects: [mobile-api, carrier-api, owner-portal]
tech_stack:
  added: []
  patterns: [tenantId-scoped-secondary-lookups, transactional-ownership-checks]
key_files:
  created: []
  modified:
    - apps/web/src/app/api/mobile/owner/fleet/messages/route.ts
    - apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts
    - apps/web/src/app/api/mobile/driver/documents/[id]/url/route.ts
    - apps/web/src/app/api/mobile/owner/invoices/route.ts
    - apps/web/src/app/api/mobile/owner/invoices/[id]/route.ts
    - apps/web/src/app/api/mobile/owner/loads/[id]/route.ts
    - apps/web/src/app/api/mobile/owner/routes/[id]/route.ts
    - apps/web/src/app/api/mobile/owner/trucks/[id]/route.ts
    - apps/web/src/app/api/mobile/owner/trucks/[id]/scheduled-service/route.ts
    - apps/web/src/app/api/mobile/driver/loads/[id]/status/route.ts
    - apps/web/src/app/api/mobile/driver/loads/[id]/revert/route.ts
    - apps/web/src/app/api/v1/carrier/pay-records/[id]/approve/route.ts
    - apps/web/src/app/api/v1/carrier/pay-records/[id]/mark-paid/route.ts
    - apps/web/src/app/api/v1/carrier/pay-records/[id]/void/route.ts
    - apps/web/src/actions/carrier/save-route-template.ts
decisions:
  - "Use findFirst({ id, tenantId }) instead of findUnique({ id }) for all secondary name-resolution queries in bypass_rls contexts"
  - "Wrap findFirst ownership check + update in single $transaction for pay-records routes to eliminate TOCTOU"
  - "save-route-template: moved ownership findFirst into the update transaction (converted from batch array syntax to async callback to support conditional logic)"
  - "Add SAFE comments on routes where ownership check + update already share a transaction"
  - "owner/loads/[id] PATCH: geocoding must occur outside transaction; documented as safe via pre-check with tenantId"
metrics:
  duration_minutes: 20
  completed_date: "2026-04-14"
  tasks_completed: 2
  files_modified: 15
---

# Phase quick-206 Plan 01: Multi-Tenant Data Isolation Security Fix Summary

**One-liner:** Patched 15 API routes to add tenantId WHERE-clause scoping on all secondary lookups and wrapped 4 TOCTOU-vulnerable ownership-check+update pairs in single atomic transactions.

## What Was Built

This was a P0 security fix addressing two classes of multi-tenant data isolation breaches in routes that bypass Postgres RLS via `set_config('app.bypass_rls', 'on', TRUE)`.

### Class 1: Missing tenantId in Secondary Lookups (Task 1)

Routes that correctly scoped their primary queries by tenantId were performing secondary "name resolution" lookups by bare ID — allowing a malicious actor to probe for records belonging to other tenants.

**Files fixed:**

| File | Queries fixed |
|------|--------------|
| `mobile/owner/fleet/messages/route.ts` | user `findMany`, load `findMany`, route `findMany`, recipient `findUnique → findFirst` |
| `mobile/owner/fleet/messages/[recipientId]/route.ts` | sender user `findMany`, load `findUnique → findFirst`, route `findUnique → findFirst`, recipient `findUnique → findFirst`, sender POST `findUnique → findFirst` |
| `mobile/driver/documents/[id]/url/route.ts` | document `findUnique → findFirst` (was 404 vs 403 oracle attack) |
| `mobile/owner/invoices/route.ts` | customer `findMany` |
| `mobile/owner/invoices/[id]/route.ts` | customer `findUnique → findFirst` |

All `findUnique` → `findFirst` conversions retain the same null-handling behavior.

### Class 2: TOCTOU in Ownership-Check + Update Pairs (Task 2)

Three pay-records routes and one server action performed ownership verification in one Prisma call and the mutation in a separate call, creating a time-of-check-to-time-of-use window.

**TOCTOU fixes (wrapped in single `$transaction`):**

| File | Fix |
|------|-----|
| `v1/carrier/pay-records/[id]/approve/route.ts` | `findFirst` + `update` now atomic |
| `v1/carrier/pay-records/[id]/mark-paid/route.ts` | `findFirst` + `update` now atomic |
| `v1/carrier/pay-records/[id]/void/route.ts` | `findFirst` + `update` now atomic |
| `actions/carrier/save-route-template.ts` | `findFirst` + `update` + `deleteMany` + `createMany` now atomic (converted from array batch to async callback to allow conditional notFound return) |

**Already safe (ownership check + update in same transaction) — documented with SAFE comments:**

- `mobile/owner/loads/[id]/route.ts` PATCH — geocoding constraint requires split transactions; pre-check uses `{ id, tenantId }`
- `mobile/owner/routes/[id]/route.ts` PATCH — single transaction
- `mobile/owner/trucks/[id]/route.ts` PATCH — single transaction
- `mobile/owner/trucks/[id]/scheduled-service/route.ts` PATCH — single transaction
- `mobile/driver/loads/[id]/status/route.ts` POST — single transaction
- `mobile/driver/loads/[id]/revert/route.ts` PATCH — single transaction

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `f2b9880` | fix(quick-206): add tenantId filters to name-resolution queries |
| Task 2 | `a67547a` | fix(quick-206): eliminate TOCTOU in update/delete operations |

## Verification

- TypeScript: `npx tsc --noEmit` passes with zero source errors (3 pre-existing e2e test errors unrelated to this fix)
- Grep audit: zero unscoped `where: { id:` queries in mobile API routes
- Transaction count confirmed on all 4 TOCTOU-fixed files

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- All 15 modified files are confirmed changed (git diff a67547a~2..HEAD shows all files)
- Commits f2b9880 and a67547a both exist in git log
- TypeScript compilation passes with zero source-file errors
- Verification greps return zero results
