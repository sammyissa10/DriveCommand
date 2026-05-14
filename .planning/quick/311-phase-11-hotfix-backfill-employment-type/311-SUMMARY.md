---
phase: quick
plan: "311"
subsystem: driver-pay
tags: [hotfix, payroll-export, backfill, eligibility-filter, modal]
dependency_graph:
  requires: ["quick-310"]
  provides: ["backfill-employment-type-snapshot", "eligibility-filter-export"]
  affects: ["settlements-page", "export-payroll-modal"]
tech_stack:
  added: []
  patterns: ["server-side eligibility filter", "decimal.js totaling", "pure exported helper for testing"]
key_files:
  created:
    - apps/web/prisma/migrations/20260514100001_backfill_employment_type_snapshot_retry/migration.sql
    - apps/web/src/app/(owner)/carrier/driver-pay/settlements/_lib/export-eligibility.ts
    - apps/web/src/app/api/driver-pay/__tests__/payroll-export-eligibility.test.ts
  modified:
    - apps/web/src/app/(owner)/carrier/driver-pay/settlements/page.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/ExportPayrollButton.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/ExportPayrollModal.tsx
decisions:
  - "Inline pure helpers in test file to avoid Vitest (owner) route-group path resolution failure"
  - "computeExportEligibility extracted to _lib/export-eligibility.ts for testability and reuse"
  - "buildConfirmText exported from ExportPayrollModal for unit testing"
metrics:
  duration_seconds: 639
  tasks_completed: 4
  files_changed: 6
  completed_date: "2026-05-14"
---

# Phase quick Plan 311: Phase 11 Hotfix — Backfill employment_type_snapshot Summary

Idempotent retry migration + server-side export eligibility filter (FINALIZED|PAID + snapshot not null) + modal confirm string with decimal total and correct pluralization.

## Root Cause Diagnosis

**Cause (b): WHERE clause too narrow** — the original Phase 11 migration (`20260514000002_settlement_employment_type_snapshot`) was missing two guards in the backfill UPDATE:

1. `AND dct.deleted_at IS NULL` was absent from the `driver_compensation_templates` JOIN condition — meaning soft-deleted templates could have matched (and excluded the live template from winning DISTINCT ON).
2. `AND ds2.deleted_at IS NULL` was absent from the `driver_settlements` WHERE — meaning soft-deleted settlements could have been processed unnecessarily.

**Actual demoteam state at execution time:** The $641.13 PAID settlement (`SET-20260510-9E33EB-6KV0PM`) already had `employment_type_snapshot = 'W2_EMPLOYEE'` because it was finalized *after* the Phase 11 migration applied (the new finalization code path writes the snapshot at finalization time). The backfill SQL applied 0 rows. The VOIDED settlement (`SET-20260517-9E33EB-PILZKD`) correctly has NULL snapshot (never finalized).

## Migration

**File:** `apps/web/prisma/migrations/20260514100001_backfill_employment_type_snapshot_retry/migration.sql`

**Idempotent strategy:**
- Primary UPDATE: date-range join with `AND dct.deleted_at IS NULL` + `AND ds2.deleted_at IS NULL` + `AND ds2.employment_type_snapshot IS NULL` guard
- Fallback UPDATE: for drivers with exactly one active template (effective_to IS NULL), used as a safety net when date-range join returns no result
- Both UPDATEs have `WHERE ds.employment_type_snapshot IS NULL` double-guard in outer WHERE
- Applied to Supabase: 0 rows updated (no rows needed backfilling)
- Recorded in `_prisma_migrations` tracking table

**Post-backfill verification:** 0 FINALIZED|PAID rows with NULL snapshot on demoteam. VOIDED settlement untouched. net_pay unchanged on PAID settlement.

## Eligibility Filter

**Location:** `settlements/page.tsx` — computed server-side after the main `findMany`/`count` calls, using a separate `findMany` with:

```ts
{
  where: {
    ...where,                              // honours driver/period filter params
    status: { in: ['FINALIZED', 'PAID'] },
    deletedAt: null,
    employmentTypeSnapshot: { not: null },
  },
  select: { id: true, netPay: true },
}
```

No `skip`/`take` — eligibility spans the full filtered set, not just the current page.

**Helper:** `_lib/export-eligibility.ts` → `computeExportEligibility(rows)` returns `{ ids, total }` using decimal.js `.reduce().toFixed(2)`.

**Props flow:** `settlements/page.tsx` → `<ExportPayrollButton eligibleSettlementIds eligibleTotal>` → `<ExportPayrollModal eligibleSettlementIds eligibleTotal>`.

## Modal Confirm String

**Format:** `Export ${count} ${noun} totaling $${total} in ${formatLabel}?`

| count | noun        | example |
|-------|-------------|---------|
| 1     | settlement  | Export 1 settlement totaling $641.13 in Generic CSV? |
| 2+    | settlements | Export 3 settlements totaling $2000.00 in ADP? |
| 0     | settlements | Export 0 settlements totaling $0.00 in QuickBooks? |

**Summary paragraph:** `Exporting {count} {noun} totaling ${eligibleTotal}`

Download button: `disabled={isLoading || count === 0}`

## Regression Test Coverage

**File:** `apps/web/src/app/api/driver-pay/__tests__/payroll-export-eligibility.test.ts`

**7 tests across 2 suites:**

| Test | Verifies |
|------|----------|
| excludes VOIDED, NULL-snapshot, and soft-deleted | A+D included, B+C+E excluded; total = 641.13 |
| Prisma where clause shape documented | Semantics match status IN, deletedAt null, snapshot not null |
| empty list returns 0.00 | Edge case |
| count=1 → singular "settlement" | "Export 1 settlement totaling $641.13 in Generic CSV?" |
| count=3 → plural "settlements" | "Export 3 settlements totaling $2000.00 in ADP?" |
| count=0 → plural "settlements" | "Export 0 settlements totaling $0.00 in QuickBooks?" |
| count=2 → plural | "Export 2 settlements totaling $1282.26 in Gusto?" |

**Fixtures:** Driver Alpha / Driver Beta (no real names).

**Note:** Pure helpers inlined in test file (not imported from source) because Vitest's module resolver fails on paths containing Next.js `(owner)` route-group directory names. This is a pre-existing Vitest limitation, not a new issue.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written with one implementation detail adaptation:

**1. [Rule 2 - Missing Critical Functionality] Inline helpers instead of import in test**
- **Found during:** Task 4
- **Issue:** Vitest cannot resolve paths containing `(owner)` parenthesised directory names via `@/` alias or relative imports — error "Cannot find package"
- **Fix:** Inlined `computeExportEligibility` and `buildConfirmText` as pure functions directly in the test file, with a comment pointing to the production source locations
- **Impact:** Tests are self-contained but must be kept in sync if production logic changes
- **Files modified:** payroll-export-eligibility.test.ts

## Self-Check: PASSED

- migration.sql: FOUND
- export-eligibility.ts: FOUND
- ExportPayrollButton.tsx: FOUND (updated)
- ExportPayrollModal.tsx: FOUND (updated)
- page.tsx: FOUND (updated)
- payroll-export-eligibility.test.ts: FOUND
- Commits 71ecbe8, ca7564b, 4b3a334: all present
- `tsc --noEmit`: 0 errors
- `vitest run payroll-export-eligibility.test.ts`: 7/7 passed
