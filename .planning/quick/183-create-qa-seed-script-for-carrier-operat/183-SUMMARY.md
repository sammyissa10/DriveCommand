---
phase: quick-183
plan: "01"
subsystem: scripts/qa
tags: [qa, seed, carrier-ops, idempotent]
dependency_graph:
  requires: [Supabase Auth admin API, Prisma carrier ops models]
  provides: [seed-qa-accounts.ts]
  affects: [qa test data, carrier ops testing]
tech_stack:
  added: []
  patterns: [idempotent seed with SKIP/CREATED counters, PrismaPg adapter, supabase admin client]
key_files:
  created:
    - apps/web/scripts/seed-qa-accounts.ts
  modified: []
decisions:
  - "Mapped spec's companyName to CarrierClient.name (schema uses name not companyName)"
  - "Mapped spec's loaded_mile_rate to payRate (schema has payRate not loadedMileRate/emptyMileRate)"
  - "Omitted facilityType fields lumperRequired/appointmentRequired (not in schema)"
  - "listUsers() used for idempotency lookup when createUser returns 'already' error"
metrics:
  duration: "52s"
  completed: "2026-04-05"
  tasks_completed: 1
  files_created: 1
  files_modified: 0
---

# Phase quick-183 Plan 01: QA Seed Script for Carrier Operations Summary

**One-liner:** Idempotent seed script creating 2 QA tenants with Auth users, DB users, CarrierDriver, CarrierTruck, CarrierFacilities, and CarrierClient via PrismaPg + Supabase admin API.

## What Was Built

`apps/web/scripts/seed-qa-accounts.ts` — a TypeScript seed script runnable via:
```
npx tsx --env-file=.env.local scripts/seed-qa-accounts.ts
```

### Tenant 1 — "QA Test Org" (slug: `qa-test-org`)
- 3 Supabase Auth users: `owner@test.com`, `manager@test.com`, `driver@test.com` (password: `TestPass123!`, email confirmed)
- app_metadata set with `role` + `tenantId` on each Auth user
- 3 DB User records (id = Auth UUID)
- 1 CarrierDriver linked to `driver@test.com` (CDL-A, per_mile @ $0.52, active)
- 1 CarrierTruck: UNIT-QA-01 (Kenworth T680, day_cab, 2022)
- 2 CarrierFacility: QA Shipper Facility (IL) + QA Receiver Facility (IN)

### Tenant 2 — "QA Test Org B" (slug: `qa-test-org-b`)
- 1 Supabase Auth user: `owner_b@test.com`
- 1 DB User record
- 1 CarrierClient: QA Test Client Co (TX, active)

### Idempotency
Every record checks for existence before creation. Output: `CREATED: [description]` or `SKIP — already exists: [description]`. Summary prints final created/skipped counts.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written. Schema field mapping was specified explicitly in the plan and applied correctly.

## Self-Check: PASSED

- [x] `apps/web/scripts/seed-qa-accounts.ts` exists
- [x] TypeScript compiles without errors (`tsc --noEmit` returned clean)
- [x] Follows same setup pattern as `cleanup-test-tenants.ts` (PrismaPg, supabase admin, dotenv/config)
- [x] All records have idempotency checks
- [x] Summary prints created/skipped counts
- [x] Commit `797e683` exists
