---
phase: quick
plan: "310"
subsystem: driver-pay
tags: [payroll-export, csv, streaming, golden-tests, rbac, audit-log, employment-type-snapshot]
dependency_graph:
  requires: [quick-304, quick-307, quick-301]
  provides: [payroll-export-api, employment-type-snapshot, exporter-library]
  affects: [driver-pay-settlements-page, finalize-route, audit-log]
tech_stack:
  added: [archiver]
  patterns: [streaming-response, async-generator-readable, golden-file-testing, exporter-registry]
key_files:
  created:
    - apps/web/prisma/migrations/20260514000002_settlement_employment_type_snapshot/migration.sql
    - apps/web/src/lib/driver-pay/exporters/index.ts
    - apps/web/src/lib/driver-pay/exporters/generic-csv.ts
    - apps/web/src/lib/driver-pay/exporters/quickbooks.ts
    - apps/web/src/lib/driver-pay/exporters/adp.ts
    - apps/web/src/lib/driver-pay/exporters/gusto.ts
    - apps/web/src/lib/driver-pay/exporters/README.md
    - apps/web/src/app/api/reports/payroll-export/route.ts
    - apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/ExportPayrollButton.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/ExportPayrollModal.tsx
    - apps/web/src/lib/driver-pay/__tests__/state-machine.finalize.snapshot.test.ts
    - apps/web/src/lib/driver-pay/__tests__/exporters/__fixtures__/settlements.fixture.ts
    - apps/web/src/lib/driver-pay/__tests__/exporters/generic-csv.golden.test.ts
    - apps/web/src/lib/driver-pay/__tests__/exporters/quickbooks.golden.test.ts
    - apps/web/src/lib/driver-pay/__tests__/exporters/adp.golden.test.ts
    - apps/web/src/lib/driver-pay/__tests__/exporters/gusto.golden.test.ts
    - apps/web/src/app/api/driver-pay/__tests__/payroll-export-rbac.test.ts
    - apps/web/src/app/api/driver-pay/__tests__/payroll-export-audit.test.ts
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/lib/driver-pay/state-machine.ts
    - apps/web/src/app/api/driver-pay/settlements/[settlementId]/finalize/route.ts
    - apps/web/src/app/(owner)/carrier/driver-pay/settlements/page.tsx
    - apps/web/src/app/api/driver-pay/__tests__/settlements-finalize.test.ts
decisions:
  - "QuickBooks uses CSV (General Journal Entry) format, not IIF — Intuit has deprecated IIF for new integrations"
  - "employmentTypeSnapshot is nullable in schema for backfill safety; future migration (out-of-scope) can make it NOT NULL"
  - "Archiver loaded via lazy require() inside the BOTH branch to avoid createRequire/import.meta.url issues in vitest"
  - "OWNER and SYSTEM_ADMIN both treated as ADMIN for export access (matching finalize route pattern)"
  - "Gusto W-2 maps gross_taxable to bonus column since Gusto CSV is designed for hourly workers (trucking is flat/CPM)"
  - "Each exporter receives homogeneous list — API route pre-splits W-2 vs 1099 before calling build()"
metrics:
  duration: "~2.5 hours"
  completed_date: "2026-05-14"
  tasks: 4
  files: 33
---

# Phase quick Plan 310: Driver Pay Phase 11 — Payroll Export Summary

Streaming, ADMIN-only payroll export for 4 providers (Generic CSV, QuickBooks, ADP, Gusto) with immutable employment-type snapshots at finalization, golden-file-tested, RBAC-guarded, and fully auditable.

## What Was Built

### Task 1: Schema + Migration + Snapshot Wiring (commit af145a0)

- Added `employmentTypeSnapshot EmploymentType?` to `DriverSettlement` schema
- Migration `20260514000002` adds `employment_type_snapshot` column + backfill from `DriverCompensationTemplate` effective at `finalized_at` + composite index
- Migration applied to Supabase production
- `finalize/route.ts`: now fetches active `DriverCompensationTemplate` before updating settlement, stamps `employmentTypeSnapshot` atomically at `FINALIZED` transition, returns 409 if no active template
- Audit log `newValue` extended to include `employmentTypeSnapshot`
- Added clarifying comment to `state-machine.ts` noting settlement-level transitions live in route handlers
- 4 new tests in `state-machine.finalize.snapshot.test.ts` (W2_EMPLOYEE, OWNER_OPERATOR_1099, no-template 409, audit log content)
- Fixed `settlements-finalize.test.ts` mock to include `driverCompensationTemplate` stub

### Task 2: Exporter Library (commit 41c0263)

- `exporters/index.ts`: `ExportFormat` type, `SettlementWithLines` interface, `Exporter` interface, `PayrollExportReconciliationError`, `getExporter()` registry
- `exporters/generic-csv.ts`: DriveCommand canonical 15-column CSV, one row per settlement, RFC 4180 escaping
- `exporters/quickbooks.ts`: QuickBooks Desktop General Journal Entry CSV (debit to Payroll Expense + credit per deduction + credit to Cash/Checking), `TODO:DEDUCTION_ACCOUNT` placeholder
- `exporters/adp.ts`: ADP Run Paydata Grid CSV (MISC for W-2, 1099 for contractors), `TODO:CO_CODE`/`TODO:BATCH_ID`/`TODO:FILE_NUM` placeholders
- `exporters/gusto.ts`: Gusto W-2 (bulk hours) and 1099 (contractor) CSV shapes detected by `employmentTypeSnapshot`
- `exporters/README.md`: per-format spec URLs, verified/unverified columns, sandbox verification checklist, W-2 vs 1099 split rationale
- All `build()` implementations use `Readable.from(async function*())` for streaming
- All money math via `decimal.js`; no `any` types; no `computeDeductionBreakdown` imports

### Task 3: API Route + UI (commit 38ad20a)

- `POST /api/reports/payroll-export`: Zod-validated body (format + employmentType + settlementIds), ADMIN-only (OWNER|SYSTEM_ADMIN), 401/403/400/422/500 error paths
- 422 returns `{ draftIds }` for DRAFT settlements, `{ unfinalizedIds }` for missing snapshots
- Streaming response via `nodeReadableToWebStream()` (Node Readable → Web ReadableStream)
- "BOTH" mode: archiver zip with `w2.<ext>` and `1099.<ext>` inside (lazy `require('archiver')`)
- Audit log written BEFORE streaming begins (exactly once per request)
- `ExportPayrollModal.tsx`: Pattern E modal (format Select + employment type Select), blob download trigger, 422 draft ID list display, loading state
- `ExportPayrollButton.tsx`: Download icon button, opens modal
- `settlements/page.tsx`: ExportPayrollButton mounted in header for OWNER|SYSTEM_ADMIN
- `archiver` + `@types/archiver` added to dependencies

### Task 4: Golden Tests + RBAC + Audit Log Tests (commit 4d65900)

- `settlements.fixture.ts`: W-2 and 1099 test fixtures with correct Prisma enum values, qty=2 for 1099 (Phase 4 multiplier regression), valid RFC 4122 UUIDs for Zod, `.invalid` TLD emails
- 5 golden CSV files committed (generic, quickbooks, adp, gusto-w2, gusto-1099) — LF line endings
- 4 golden test files: 33 total tests covering byte equality, W-2/1099 split, empty input, qty>1, deduction sign handling, TODO placeholders
- `payroll-export-rbac.test.ts`: 6 tests (DRIVER/MANAGER → 403, OWNER/SYSTEM_ADMIN → not 403, no-session → 401, bad body → 400)
- `payroll-export-audit.test.ts`: 5 tests (audit written once, correct fields, settlementCount/w2Count/c1099Count, zero logs on 422, draftIds in response)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Existing settlements-finalize.test.ts mock missing driverCompensationTemplate**
- **Found during:** Task 1 — after adding template lookup to finalize route, existing tests broke
- **Issue:** `makePrisma()` in `settlements-finalize.test.ts` didn't include `driverCompensationTemplate.findFirst` mock, causing 2 test failures
- **Fix:** Added `driverCompensationTemplate: { findFirst: vi.fn().mockResolvedValue({...}) }` to mock
- **Files modified:** `apps/web/src/app/api/driver-pay/__tests__/settlements-finalize.test.ts`
- **Commit:** af145a0

**2. [Rule 1 - Bug] archiver module's default export not found by Turbopack**
- **Found during:** Task 3 next build
- **Issue:** `import archiver from 'archiver'` failed with "Export default doesn't exist in target module" in Turbopack build
- **Fix:** Changed to lazy `require('archiver')` inside the BOTH branch to avoid module-init execution; also removes `createRequire`/`import.meta.url` that caused vitest issues
- **Files modified:** `apps/web/src/app/api/reports/payroll-export/route.ts`
- **Commit:** 4d65900

**3. [Rule 1 - Bug] Fixture UUIDs failed Zod v4 strict UUID validation**
- **Found during:** Task 4 — audit tests returning 400 instead of expected status codes
- **Issue:** UUIDs like `11111111-0000-0000-0000-000000000001` don't satisfy RFC 4122 variant bits (group 4 must be `[89abAB]xxx`); Zod v4 validates this strictly
- **Fix:** Updated test request bodies to use valid RFC 4122 UUIDs (e.g., `ce8f9e8f-3571-4c9e-8ad0-dc62da71fb69`). Fixture file UUIDs unchanged (they are not passed through Zod validation)
- **Files modified:** `payroll-export-audit.test.ts`, `payroll-export-rbac.test.ts`
- **Commit:** 4d65900

### Pre-existing Issues (Not Introduced)

- `settlements-paid.test.ts` has 2 pre-existing failing tests on master (confirmed via `git stash` test). These are unrelated to Phase 11 changes.

## Test Results

```
New tests:    44 (4 finalize snapshot + 33 golden + 6 RBAC + 5 audit + 2 QuickBooks correction)
Existing:   278 passing (all pre-existing passing tests still pass)
Pre-existing failures: 2 (settlements-paid.test.ts — unrelated, pre-existing on master)
```

## Self-Check: PASSED

Files verified:
- apps/web/src/lib/driver-pay/exporters/index.ts — EXISTS
- apps/web/src/lib/driver-pay/exporters/generic-csv.ts — EXISTS
- apps/web/src/lib/driver-pay/exporters/quickbooks.ts — EXISTS
- apps/web/src/lib/driver-pay/exporters/adp.ts — EXISTS
- apps/web/src/lib/driver-pay/exporters/gusto.ts — EXISTS
- apps/web/src/app/api/reports/payroll-export/route.ts — EXISTS
- apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/ExportPayrollButton.tsx — EXISTS
- apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/ExportPayrollModal.tsx — EXISTS
- apps/web/prisma/migrations/20260514000002_settlement_employment_type_snapshot/migration.sql — EXISTS

Commits verified:
- af145a0 — Task 1: schema + migration + finalize snapshot wiring
- 41c0263 — Task 2: exporter library
- 38ad20a — Task 3: API route + UI
- 4d65900 — Task 4: golden tests + RBAC + audit
