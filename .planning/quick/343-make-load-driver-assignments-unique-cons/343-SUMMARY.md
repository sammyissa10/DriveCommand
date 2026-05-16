---
phase: quick-343
plan: 01
subsystem: driver-pay
tags: [db-migration, partial-unique-index, soft-delete, modal-resilience, prisma]
dependency_graph:
  requires: []
  provides:
    - load_driver_assignments_load_id_driver_id_active_unique (partial unique index)
    - handleAssign try/catch/finally (modal resilience)
  affects:
    - apps/web/src/components/driver-pay/assign-driver-modal.tsx
    - apps/web/prisma/schema.prisma
    - load_driver_assignments table (Postgres)
tech_stack:
  added: []
  patterns:
    - partial unique index (WHERE deleted_at IS NULL) for soft-delete-aware uniqueness
    - try/catch/finally in async Server Action call sites
key_files:
  created:
    - apps/web/prisma/migrations/20260515000001_apply_partial_unique_load_driver/migration.sql
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/components/driver-pay/assign-driver-modal.tsx
    - apps/web/src/generated/prisma/* (regenerated client)
decisions:
  - "Used pg module (already in root node_modules) for direct DB queries since psql and Supabase CLI were not available with credentials in shell"
  - "Kept catch { } (no error binding) to satisfy TypeScript strict/no-unused-vars — consistent with project conventions"
  - "Migration applied directly to Supabase DB; file recorded for repo history only — prisma migrate dev NOT run"
metrics:
  duration: 25m
  completed: "2026-05-16"
  tasks_completed: 3
  files_modified: 4
---

# Phase quick-343 Plan 01: Soft-delete-aware driver assignment uniqueness + frozen modal fix

Fixed `P2002 UniqueConstraintViolation` on driver re-assignment (caused by full unique constraint ignoring soft deletes) and eliminated the frozen "Assigning..." button that occurred when the Server Action threw.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Apply partial unique index via DB + record migration | 7709bb3 | apps/web/prisma/migrations/20260515000001_apply_partial_unique_load_driver/migration.sql |
| 2 | Remove @@unique from Prisma schema + regenerate client | aa01d00 | apps/web/prisma/schema.prisma, apps/web/src/generated/prisma/* |
| 3 | Wrap handleAssign in try/catch/finally + verify build | bde449f | apps/web/src/components/driver-pay/assign-driver-modal.tsx |

## DB Migration Details

### Pre-flight: Actual Constraint Name

```sql
SELECT conname FROM pg_constraint
WHERE conrelid = 'load_driver_assignments'::regclass
  AND contype  = 'u';
```

**Result:** `lda_unique_load_driver` (one row)

This was Prisma's generated name for the `@@unique([loadId, driverId])` directive — different from the Prisma-default `load_driver_assignments_load_id_driver_id_key` pattern. The actual name was used verbatim in the DROP statement.

### Migration Applied

```sql
ALTER TABLE load_driver_assignments
  DROP CONSTRAINT lda_unique_load_driver;

CREATE UNIQUE INDEX load_driver_assignments_load_id_driver_id_active_unique
  ON load_driver_assignments (load_id, driver_id)
  WHERE deleted_at IS NULL;
```

### Post-Apply Verification

**CHECK 1 — old constraint gone (0 rows):**
```sql
SELECT conname FROM pg_constraint
WHERE conrelid = 'load_driver_assignments'::regclass
  AND contype  = 'u'
  AND conname  = 'lda_unique_load_driver';
```
Result: **0 rows** — constraint dropped.

**CHECK 2 — partial index in place (1 row):**
```sql
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'load_driver_assignments'
  AND indexname = 'load_driver_assignments_load_id_driver_id_active_unique';
```
Result: **1 row**
```
indexdef: CREATE UNIQUE INDEX load_driver_assignments_load_id_driver_id_active_unique
          ON public.load_driver_assignments USING btree (load_id, driver_id)
          WHERE (deleted_at IS NULL)
```

### Important: prisma migrate dev NOT used

The migration was applied directly to the Supabase DB. The migration file at `apps/web/prisma/migrations/20260515000001_apply_partial_unique_load_driver/migration.sql` is for repo history only. `prisma migrate dev` and `prisma migrate deploy` were NOT run.

## Schema Change (Task 2)

`@@unique([loadId, driverId])` removed from `LoadDriverAssignment` model and replaced with:

```prisma
// Uniqueness enforced by partial unique index in DB (only live rows);
// see migration apply-partial-unique-load-driver.sql
```

`npx prisma generate` succeeded (v7.6.0, no errors).

## Modal Fix (Task 3)

`handleAssign` now wrapped in `try/catch/finally`:
- `catch { setError('Something went wrong. Please try again.') }` — no error binding (TypeScript strict mode)
- `finally { setIsSubmitting(false) }` — button always re-enables regardless of outcome
- Standalone `setIsSubmitting(false)` between the await and `if (result.error)` removed

## Build Verification

- `npx tsc --noEmit`: **passed (0 errors)**
- `npm run build`: **passed (exit code 0)**

## Deviations from Plan

None — plan executed exactly as written. The only note: used `pg` module from root `node_modules` for DB queries since `psql` was unavailable in the shell environment. This is equivalent to the plan's Supabase MCP `execute_sql` approach.

## Self-Check

### Files Exist
- [x] `apps/web/prisma/migrations/20260515000001_apply_partial_unique_load_driver/migration.sql` — created
- [x] `apps/web/prisma/schema.prisma` — modified (@@unique removed, comment added)
- [x] `apps/web/src/components/driver-pay/assign-driver-modal.tsx` — modified (try/catch/finally)

### Commits Exist
- [x] `7709bb3` — migration file
- [x] `aa01d00` — schema + regenerated client
- [x] `bde449f` — modal fix

### DB State
- [x] Old constraint `lda_unique_load_driver`: 0 rows in pg_constraint
- [x] New partial index: 1 row in pg_indexes with `WHERE (deleted_at IS NULL)`

## Self-Check: PASSED
