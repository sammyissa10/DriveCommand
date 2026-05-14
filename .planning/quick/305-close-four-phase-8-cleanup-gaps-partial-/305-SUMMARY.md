---
phase: quick-305
plan: 01
subsystem: driver-pay
tags: [settlements, void, deductions, migration, partial-unique-index, RBAC]
dependency_graph:
  requires: [driver_pay_phase1_migration, DriverSettlement, LoadDriverAssignment, DriverDeduction]
  provides: [ds_unique_period_active, void_manager_rbac, unified_deductions_ui]
  affects: [driver_settlements, load_driver_assignments, settlement_detail_page]
tech_stack:
  added: []
  patterns: [partial-unique-index-via-raw-migration, unified-server-data-shaping, client-badge-type-indicator]
key_files:
  created:
    - apps/web/prisma/migrations/20260514000001_driver_settlements_partial_unique/migration.sql
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/app/api/driver-pay/settlements/[settlementId]/void/route.ts
    - apps/web/src/app/(owner)/carrier/driver-pay/settlements/[settlementId]/page.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementDetailView.tsx
decisions:
  - Removed @@unique from schema.prisma — managed by raw migration instead; Prisma comment documents the manual index
  - deductionsApplied prop renamed to deductions with new UnifiedDeduction shape
  - DEDUCTION payComponents filtered out of load breakdown collapsible to prevent double-display
metrics:
  duration_minutes: 25
  completed: "2026-05-14"
  tasks_completed: 3
  files_modified: 5
---

# Quick Task 305: Close Phase 8 Cleanup Gaps — Partial Unique Index, Void Route Fix, Unified Deductions UI

One-liner: Partial unique index on driver_settlements allows void+regenerate, void route accepts MANAGER and resets payStatus to APPROVED, settlement detail unifies per-load and recurring deductions in one card with type badges.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Partial unique index migration for driver_settlements | 7d3aa47 | migration.sql, schema.prisma |
| 2 | Void route RBAC + payStatus reset | 646685b | void/route.ts |
| 3 | Unified Deductions section in SettlementDetailView | 2f907ec | page.tsx, SettlementDetailView.tsx |

## Task 1 — Partial Unique Index Migration

**Migration file:** `apps/web/prisma/migrations/20260514000001_driver_settlements_partial_unique/migration.sql`

**SQL applied (via `prisma db execute`):**
- `ALTER TABLE driver_settlements DROP CONSTRAINT IF EXISTS ds_unique_period` — drops the blanket unique constraint that blocked re-generation after void
- `DROP INDEX IF EXISTS driver_settlements_driver_id_period_start_period_end_key` — idempotent cleanup for any Prisma-generated index
- `CREATE UNIQUE INDEX IF NOT EXISTS ds_unique_period_active ON driver_settlements (driver_id, period_start, period_end) WHERE deleted_at IS NULL AND status <> 'VOIDED'` — enforces uniqueness only for active (non-voided, non-deleted) settlements

**Schema comment added** above `model DriverSettlement`:
```
/// Note: partial unique index `ds_unique_period_active` on
/// (driver_id, period_start, period_end) WHERE deleted_at IS NULL AND status <> 'VOIDED'
/// is defined manually in migration 20260514000001_driver_settlements_partial_unique
/// because Prisma does not support partial unique indexes natively.
/// @@unique partial — do NOT add @@unique([driverId, periodStart, periodEnd]) here.
```

`@@unique([driverId, periodStart, periodEnd])` removed from `schema.prisma`. `prisma generate` ran successfully after removal.

**Supabase confirmation:** Migration applied via `prisma db execute --file migration.sql` → "Script executed successfully."

## Task 2 — Void Route Fix

**File:** `apps/web/src/app/api/driver-pay/settlements/[settlementId]/void/route.ts`

**Change 1 — RBAC:** Added `UserRole.MANAGER` to allowed roles. Error message updated to "Only owners and managers can void settlements."

**Change 2 — payStatus reset:** `loadDriverAssignment.updateMany` inside `$transaction` now sets both `settlementId: null` AND `payStatus: 'APPROVED'`, reverting released assignments to APPROVED so they are eligible for inclusion in a new settlement.

**Unchanged:** deduction `amountCollected` decrement loop, audit log write, bonus release, PAID-cannot-void 409 guard.

## Task 3 — Unified Deductions UI

**Server page** (`[settlementId]/page.tsx`) now builds `deductionsView: UnifiedDeduction[]` before rendering:

```ts
type UnifiedDeduction = {
  key: string;           // "pc-{id}" or "dd-{id}"
  source: 'per-load' | 'recurring';
  label: string;         // description or deductionType
  subLabel: string | null; // "Load #REF" or schedule string
  amount: string;        // positive decimal string e.g. "150.00"
};
```

Per-load deductions come from `settlement.assignments[].payComponents` filtered by `category === 'DEDUCTION'`. Recurring deductions come from the `_deductionsApplied` snapshot in notes. Both lists merged into `deductionsView` passed as `deductions` prop.

**Client component** (`SettlementDetailView.tsx`):
- `DeductionApplied` interface replaced with `UnifiedDeduction`
- `deductionsApplied` prop renamed to `deductions: UnifiedDeduction[]`
- Deductions card renders each row with a `<Badge>` showing "Per-Load" or "Recurring", label, sub-label in muted text, amount in red prefixed with `-`
- Load Breakdown collapsibles now filter `c.category !== 'DEDUCTION'` before rendering pay components — prevents double-display

## Deviations from Plan

None — plan executed exactly as written.

## TypeScript

`pnpm tsc --noEmit` from `apps/web` passed clean (pre-existing remark-gfm type error unrelated to this task).

## Self-Check

- [x] Migration file exists: `apps/web/prisma/migrations/20260514000001_driver_settlements_partial_unique/migration.sql`
- [x] `@@unique([driverId, periodStart, periodEnd])` removed from schema.prisma
- [x] Triple-slash comment `/// @@unique partial` present above `model DriverSettlement`
- [x] Void route accepts MANAGER role
- [x] Void route sets `payStatus: 'APPROVED'` in updateMany data
- [x] `SettlementDetailView` uses `deductions: UnifiedDeduction[]` prop
- [x] Load breakdown filters `category !== 'DEDUCTION'`
- [x] Commits 7d3aa47, 646685b, 2f907ec all exist in git log

## Self-Check: PASSED
