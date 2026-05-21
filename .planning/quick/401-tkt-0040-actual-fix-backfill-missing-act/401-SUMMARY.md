---
phase: quick-401
plan: 401
subsystem: onboarding/activation-tracking
tags: [tkt-0040, migration, backfill, activation-progress, observability]
dependency_graph:
  requires: []
  provides: [activation-progress-rows-for-all-tenants, upsert-on-miss-guard]
  affects: [onboarding/welcome, activation-tracker]
tech_stack:
  added: []
  patterns: [upsert-on-miss, idempotent-backfill-migration, logger-warn-observability]
key_files:
  created:
    - apps/web/prisma/migrations/20260521000001_backfill_activation_progress/migration.sql
  modified:
    - apps/web/src/lib/onboarding/activation-tracker.ts
decisions:
  - "Used two separate CTEs (one per DML statement) because PostgreSQL CTEs are scoped to a single statement — the first attempt used a shared CTE before both INSERT and UPDATE which failed with 'relation computed does not exist'"
  - "logger.warn signature is (message: string, context?) not (context, message) — fixed after seeing TS2345 errors"
  - "logger.error signature is (message, error?, context?) — passed undefined for error param to reach context"
  - "Committed both migration and activation-tracker.ts in a single commit per the specified commit message"
metrics:
  duration: ~12 minutes
  completed_date: "2026-05-21"
  tasks_completed: 2
  files_changed: 2
---

# Quick-401: TKT-0040 Actual Fix — Backfill ActivationProgress + Upsert-on-Miss Guard

Idempotent backfill migration + defensive upsert guard that eliminates the silent no-op data loss for pre-29-Apr tenants whose ActivationProgress rows were never seeded.

## What Was Built

### Task 1: Idempotent Backfill Migration

**File:** `apps/web/prisma/migrations/20260521000001_backfill_activation_progress/migration.sql`

Two-step SQL script applied via `prisma migrate deploy`:

**Step A — INSERT** rows for tenants with no ActivationProgress row (WHERE ap.id IS NULL):
- `accountCreatedAt` = tenant."createdAt"
- `firstRealTruckAt` = MIN across "Truck"."createdAt" (isSample=false) UNION ALL carrier_trucks.created_at (is_sample=false)
- `firstRealDriverAt` = MIN across "User"."createdAt" (role=DRIVER, isSample=false) UNION ALL carrier_drivers.created_at (is_sample=false)
- `firstRealClientAt` = MIN across "Customer"."createdAt" (isSample=false) UNION ALL clients.created_at (is_sample=false)
- `firstLoadInTransitAt` = MIN("Load"."updatedAt") WHERE status='IN_TRANSIT' AND isSample=false
- `completionPct` = 20 * (1 + truck + driver + client + transit booleans)
- `isActivated` = (completionPct = 100)

**Step B — UPDATE** existing rows to fill NULL milestone columns via COALESCE (non-NULL values are never overwritten).

**Migration application output:**
```
Applying migration `20260521000001_backfill_activation_progress`
All migrations have been successfully applied.
```

### Task 2: Upgraded recordActivationEvent Guard

**File:** `apps/web/src/lib/onboarding/activation-tracker.ts`

Changes made:
1. Added `import { logger } from '@/lib/logger';`
2. Changed `const current` to `let current` (required for reassignment)
3. Replaced `if (!current) return; // skip silently` with upsert-on-miss:
   - `logger.warn('ActivationProgress row missing...', { tenantId, event })`
   - `tx.activationProgress.create({ data: { tenantId, accountCreatedAt: new Date() } })`
   - Re-fetch `current` inside the same transaction (bypass_rls still in effect)
   - `logger.error(...)` fallback if create+refetch still returns null
4. All existing code below the guard (idempotency check, update, AppEvent writes, tenant.activated logic, outer catch) is unchanged.

## Diff Snippet (guard change)

```diff
-      const current = await tx.activationProgress.findUnique({ ... });
-      if (!current) return; // ActivationProgress row missing — skip silently
+      let current = await tx.activationProgress.findUnique({ ... });
+
+      if (!current) {
+        logger.warn(
+          'ActivationProgress row missing during recordActivationEvent — auto-creating',
+          { tenantId, event }
+        );
+        await tx.activationProgress.create({
+          data: { tenantId, accountCreatedAt: new Date() },
+        });
+        current = await tx.activationProgress.findUnique({ ... });
+        if (!current) {
+          logger.error(
+            'ActivationProgress row still missing after auto-create — aborting',
+            undefined,
+            { tenantId, event }
+          );
+          return;
+        }
+      }
```

## TypeScript Build Result

`npx tsc --noEmit` — zero errors in activation-tracker.ts or any files touched by this task.

Pre-existing errors in the codebase (framer-motion, zustand, nuqs, papaparse, @tanstack/react-virtual) are unrelated to this task and pre-date this change.

## Migration Verification

Migration applied successfully by `prisma migrate deploy`. The migration hook auto-applied it immediately on file creation.

**Post-apply verification required manually:**
```sql
-- Should return 0
SELECT COUNT(*) FROM "Tenant" t
LEFT JOIN "ActivationProgress" ap ON ap."tenantId" = t.id
WHERE ap.id IS NULL;

-- Spot-check a tenant
SELECT "firstRealTruckAt", "firstRealDriverAt", "firstRealClientAt",
       "firstLoadInTransitAt", "completionPct", "isActivated"
FROM "ActivationProgress"
WHERE "tenantId" = '<known-tenant-id>';
```

## Manual Verification Required

**Steps 6 and 7 from the plan require manual UI testing:**

**Step 6 — Defensive path smoke test:**
1. In Supabase dashboard, delete one tenant's ActivationProgress row
2. In the web app as that tenant, create a real truck (or driver)
3. Confirm a new ActivationProgress row was auto-created
4. Check Sentry or server logs for the `logger.warn` message: "ActivationProgress row missing during recordActivationEvent — auto-creating"
5. Confirm the milestone field (e.g., firstRealTruckAt) is now set

**Step 7 — Idempotency test:**
1. Re-run the migration SQL manually against the database
2. Confirm no non-NULL columns are changed (compare before/after values for a tenant with populated milestones)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two-statement SQL requires separate CTEs**
- **Found during:** Task 1 — first `prisma migrate deploy` attempt
- **Issue:** PostgreSQL CTEs are scoped to a single DML statement. Using a shared `WITH computed AS (...)` before both INSERT and UPDATE caused "relation computed does not exist" error on the UPDATE.
- **Fix:** Rewrote migration with two fully independent CTE+DML blocks — one WITH...INSERT and one WITH...UPDATE, each carrying its own CTE.
- **Files modified:** `apps/web/prisma/migrations/20260521000001_backfill_activation_progress/migration.sql`
- **Required:** `prisma migrate resolve --rolled-back` to clear the failed migration record, then re-deploy.

**2. [Rule 1 - Bug] logger.warn/error argument order**
- **Found during:** Task 2 TypeScript check
- **Issue:** logger.warn signature is `(message: string, context?)` not the pino-style `(context, message)` used in the spec. Two TS2345 errors.
- **Fix:** Swapped argument order in both calls. For logger.error, passed `undefined` as the `error` parameter to reach the `context` third parameter.

## Commits

| Hash | Message |
|------|---------|
| 3160437d | fix(onboarding): backfill ActivationProgress for pre-29Apr tenants + upgrade silent guard to upsert-and-log [TKT-0040 actual root cause] |

## Self-Check

- [x] Migration file exists: `apps/web/prisma/migrations/20260521000001_backfill_activation_progress/migration.sql`
- [x] activation-tracker.ts modified: `import { logger }`, `let current`, upsert-on-miss block present
- [x] Commit 3160437d exists in git log
- [x] TypeScript: zero errors in files touched by this task
- [x] `git push origin master` confirmed: `master -> master`
