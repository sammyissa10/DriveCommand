---
phase: quick-401
plan: 401
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/migrations/20260521000001_backfill_activation_progress/migration.sql
  - apps/web/src/lib/onboarding/activation-tracker.ts
autonomous: true

must_haves:
  truths:
    - "Every existing tenant has an ActivationProgress row after the migration runs"
    - "Tenants with real trucks/drivers/clients/in-transit loads have those milestone timestamps populated from real data, not NULL"
    - "Re-running the backfill migration does NOT overwrite any non-NULL milestone column (idempotency)"
    - "When recordActivationEvent is called for a tenant lacking an ActivationProgress row, the row is auto-created (no longer silent no-op) and a logger.warn is emitted"
    - "After the row is auto-created, the same recordActivationEvent invocation continues and stamps the milestone field normally"
  artifacts:
    - path: "apps/web/prisma/migrations/20260521000001_backfill_activation_progress/migration.sql"
      provides: "Idempotent backfill SQL that creates missing ActivationProgress rows with milestone timestamps computed from real records"
      contains: "INSERT INTO \"ActivationProgress\""
    - path: "apps/web/src/lib/onboarding/activation-tracker.ts"
      provides: "recordActivationEvent with upsert-on-miss defensive guard + logger.warn observability"
      contains: "ActivationProgress row missing"
  key_links:
    - from: "apps/web/src/lib/onboarding/activation-tracker.ts"
      to: "logger"
      via: "import from @/lib/logger"
      pattern: "import.*logger.*@/lib/logger"
    - from: "migration.sql"
      to: "Tenant table"
      via: "LEFT JOIN ActivationProgress to find tenants missing rows"
      pattern: "LEFT JOIN .*ActivationProgress"
---

<objective>
TKT-0040 actual fix — ship the three-part remediation confirmed by QT-400 diagnostic:

1. PRIMARY: Backfill migration that creates ActivationProgress rows for every pre-existing tenant (those created before migration 20260429000001 added the seeding logic in provision-tenant.ts) with milestone timestamps computed from existing real records in carrier_trucks, carrier_drivers, clients, Truck, Customer, and Load tables.
2. DEFENSIVE: Upgrade recordActivationEvent's silent `if (!current) return;` guard to auto-create the row, log a warning, and continue stamping the milestone field.
3. OBSERVABILITY: Emit logger.warn on the auto-create path so we can detect future provisioning drift.

Purpose: Stop activation tracking from silently dropping events for tenants whose ActivationProgress row was never created. Eliminate the silent no-op data-model mismatch that produced 4 wrong diagnoses before QT-400 found the root cause.

Output: One new Prisma migration (auto-applied via the migration hook) plus a hardened activation-tracker.ts. No UI, no route, no schema changes.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/debug/tkt-0040-post-fix-verification.md
@apps/web/src/lib/onboarding/activation-tracker.ts
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create idempotent ActivationProgress backfill migration</name>
  <files>apps/web/prisma/migrations/20260521000001_backfill_activation_progress/migration.sql</files>
  <action>
    Create the migration directory and write `migration.sql` to backfill ActivationProgress for every existing tenant.

    The SQL MUST be a single idempotent script doing TWO things in order:

    STEP A — INSERT rows for tenants that have no ActivationProgress yet.
    STEP B — UPDATE rows that exist but have NULL milestone columns (only fill in missing values; never overwrite).

    Computed values per tenant:

    - `accountCreatedAt` = tenant."createdAt" (from "Tenant" table; column is `createdAt`, db.Timestamptz)
    - `firstRealTruckAt` = LEAST of:
        * MIN("Truck"."createdAt") WHERE "Truck"."tenantId" = t.id AND "Truck"."isSample" = false
        * MIN(carrier_trucks.created_at) WHERE carrier_trucks.org_id = t.id AND carrier_trucks.is_sample = false
      (Use a single subquery that UNIONs both, then takes MIN.)
    - `firstRealDriverAt` = LEAST of:
        * MIN("User"."createdAt") WHERE "User"."tenantId" = t.id AND "User"."role" = 'DRIVER' AND "User"."isSample" = false
        * MIN(carrier_drivers.created_at) WHERE carrier_drivers.org_id = t.id AND carrier_drivers.is_sample = false
    - `firstRealClientAt` = LEAST of:
        * MIN("Customer"."createdAt") WHERE "Customer"."tenantId" = t.id AND "Customer"."isSample" = false
        * MIN(clients.created_at) WHERE clients.org_id = t.id (skip the is_sample predicate by wrapping the column ref in a `to_regclass`-style guard OR detect column existence; simplest: just JOIN without is_sample filter — clients table may not have that column, comment this clearly)
    - `firstLoadInTransitAt` = MIN("Load"."updatedAt") WHERE "Load"."tenantId" = t.id AND "Load"."status" IN ('IN_TRANSIT','IN_PROGRESS') — use updatedAt as the proxy for transition time since there is no transitioned_at column. If a dispatch-level table tracks transitions more precisely, leave a SQL comment noting we picked Load.updatedAt as the best available proxy.
    - `completionPct` = 20 * (1 + (CASE WHEN firstRealTruckAt IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN firstRealDriverAt IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN firstRealClientAt IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN firstLoadInTransitAt IS NOT NULL THEN 1 ELSE 0 END))
    - `isActivated` = (completionPct = 100). Per the activation-tracker logic the boolean trips at 100% so derive it from the computed completionPct rather than just firstLoadInTransitAt.
    - `updatedAt` = NOW()
    - `createdAt` = NOW() on INSERT only
    - `id` = gen_random_uuid()

    INSERT clause (Step A):
    ```sql
    INSERT INTO "ActivationProgress" (
      id, "tenantId", "accountCreatedAt",
      "firstRealTruckAt", "firstRealDriverAt", "firstRealClientAt", "firstLoadInTransitAt",
      "completionPct", "isActivated", "createdAt", "updatedAt"
    )
    SELECT
      gen_random_uuid(),
      t.id,
      t."createdAt",
      ... computed values ...
    FROM "Tenant" t
    LEFT JOIN "ActivationProgress" ap ON ap."tenantId" = t.id
    WHERE ap.id IS NULL;
    ```

    UPDATE clause (Step B) — use COALESCE so non-NULL values are preserved:
    ```sql
    UPDATE "ActivationProgress" ap
    SET
      "firstRealTruckAt"     = COALESCE(ap."firstRealTruckAt", computed.first_truck),
      "firstRealDriverAt"    = COALESCE(ap."firstRealDriverAt", computed.first_driver),
      "firstRealClientAt"    = COALESCE(ap."firstRealClientAt", computed.first_client),
      "firstLoadInTransitAt" = COALESCE(ap."firstLoadInTransitAt", computed.first_transit),
      "completionPct"        = 20 * (1 + ...),
      "isActivated"          = (computedCompletionPct = 100) OR ap."isActivated",
      "updatedAt"            = NOW()
    FROM ( ... per-tenant CTE with computed values ... ) computed
    WHERE ap."tenantId" = computed.tenant_id;
    ```

    Implementation tips:
    - Build per-tenant computed values in a single CTE (`WITH tenant_milestones AS (...)`) so both the INSERT and UPDATE reuse it. This avoids duplicate subqueries and keeps the script readable.
    - Wrap UNIONs for cross-table MIN computations in subqueries: e.g. `(SELECT MIN(d) FROM (SELECT MIN("Truck"."createdAt") d FROM ... UNION ALL SELECT MIN(carrier_trucks.created_at) d FROM ...) u)`.
    - Reference Prisma's quoted PascalCase table names (`"Tenant"`, `"Truck"`, `"User"`, `"Customer"`, `"Load"`, `"ActivationProgress"`) and snake_case for legacy tables (`carrier_trucks`, `carrier_drivers`, `clients`).
    - Add a SQL header comment explaining: TKT-0040 backfill, idempotent, safe to re-run, COALESCE preserves non-NULL.
    - DO NOT alter any column types, add constraints, or touch indexes.
    - DO NOT touch provision-tenant.ts or the ActivationProgress Prisma model.

    The migration hook will auto-apply via `prisma migrate deploy` once migration.sql is written.
  </action>
  <verify>
    1. File exists: `apps/web/prisma/migrations/20260521000001_backfill_activation_progress/migration.sql`
    2. After hook runs `prisma migrate deploy`, query Supabase:
       ```sql
       SELECT COUNT(*) FROM "Tenant" t LEFT JOIN "ActivationProgress" ap ON ap."tenantId" = t.id WHERE ap.id IS NULL;
       ```
       Result MUST be 0.
    3. Spot-check a tenant known to have real trucks: `SELECT "firstRealTruckAt", "completionPct" FROM "ActivationProgress" WHERE "tenantId" = '<id>';` — `firstRealTruckAt` should NOT be NULL and should equal MIN(carrier_trucks.created_at) for that tenant.
    4. Run the migration SQL a second time manually against a scratch row that already has non-NULL milestones; confirm the non-NULL values are NOT changed (only NULL→value transitions occur).
  </verify>
  <done>
    Migration file written, hook auto-applied successfully, every tenant has an ActivationProgress row, milestone timestamps populated from real records, idempotency confirmed (re-running does not overwrite non-NULL columns).
  </done>
</task>

<task type="auto">
  <name>Task 2: Upgrade recordActivationEvent guard to upsert-on-miss with logger.warn</name>
  <files>apps/web/src/lib/onboarding/activation-tracker.ts</files>
  <action>
    Modify `apps/web/src/lib/onboarding/activation-tracker.ts` to replace the silent no-op guard with a defensive auto-create path:

    1. Add `import { logger } from '@/lib/logger';` at the top of the file (alongside the existing `prisma` import).
    2. Locate the block at approximately lines 52–64 that fetches `current` and silently returns on missing row.
    3. Replace the `const current = await tx.activationProgress.findUnique(...)` + `if (!current) return;` block with the following structure:

       ```ts
       let current = await tx.activationProgress.findUnique({
         where: { tenantId },
         select: {
           firstRealTruckAt: true,
           firstRealDriverAt: true,
           firstRealClientAt: true,
           firstLoadInTransitAt: true,
           isActivated: true,
           accountCreatedAt: true,
         },
       });

       if (!current) {
         logger.warn(
           { tenantId, event },
           'ActivationProgress row missing during recordActivationEvent — auto-creating'
         );
         await tx.activationProgress.create({
           data: { tenantId, accountCreatedAt: new Date() },
         });
         current = await tx.activationProgress.findUnique({
           where: { tenantId },
           select: {
             firstRealTruckAt: true,
             firstRealDriverAt: true,
             firstRealClientAt: true,
             firstLoadInTransitAt: true,
             isActivated: true,
             accountCreatedAt: true,
           },
         });
         if (!current) {
           // Truly defensive — if create+refetch still returns null something is very wrong
           logger.error(
             { tenantId, event },
             'ActivationProgress row still missing after auto-create — aborting'
           );
           return;
         }
       }
       ```

    4. Change the original `const current = ...` declaration to `let current = ...` so it can be reassigned after auto-create. Do NOT change anything else in the function — the existing idempotency check (`if (currentFieldValue !== null && currentFieldValue !== undefined) return;`), update logic, completionPct math, AppEvent writes, tenant.activated emission, and outer try/catch all stay intact.

    5. Keep the existing transaction (`prisma.$transaction(async (tx) => {`) and the `SELECT set_config('app.bypass_rls', 'on', TRUE)` line untouched. The create call must happen inside the same transaction so bypass_rls is in effect.

    Constraints:
    - DO NOT modify provision-tenant.ts.
    - DO NOT change the Prisma ActivationProgress model.
    - DO NOT touch carrier POST routes, /onboarding/welcome/page.tsx, or any create forms.
    - DO NOT alter the outer try/catch or its error-event fallback.
    - The eventType passed to logger.warn is the `event` parameter (an `ActivationEventType` string literal), matching the spec.
  </action>
  <verify>
    1. `cd apps/web && npx tsc --noEmit` returns zero errors.
    2. Read the modified file and confirm:
       - `import { logger } from '@/lib/logger';` is present.
       - `let current = await tx.activationProgress.findUnique(...)` (not `const`).
       - The `if (!current)` block calls `logger.warn(...)`, `tx.activationProgress.create(...)`, and re-fetches `current`.
       - The rest of the function (idempotency check, update, AppEvent writes, tenant.activated logic, outer catch) is unchanged.
    3. Smoke test in a dev shell (optional but recommended):
       ```ts
       // Delete a tenant's ActivationProgress row, then call recordActivationEvent('<tenantId>', 'first_real_truck').
       // Confirm: a fresh row exists, firstRealTruckAt is set to now, completionPct = 40, logger.warn was emitted.
       ```
  </verify>
  <done>
    activation-tracker.ts no longer silently no-ops on missing rows; it logs a warning, auto-creates the row inside the same transaction, then continues stamping the milestone field. TypeScript builds clean. The outer error-swallowing contract is preserved (user actions still succeed regardless of tracker outcome).
  </done>
</task>

</tasks>

<verification>
End-to-end verification after both tasks ship:

1. Run `cd apps/web && npx tsc --noEmit` — zero errors.
2. Confirm migration applied: `SELECT COUNT(*) FROM "Tenant" t LEFT JOIN "ActivationProgress" ap ON ap."tenantId" = t.id WHERE ap.id IS NULL;` returns 0.
3. Pick a tenant known to have created a real truck before today: confirm `firstRealTruckAt IS NOT NULL` and `completionPct >= 40`.
4. Defensive path smoke test: temporarily delete one tenant's ActivationProgress row in a dev DB, trigger any real-record creation that fires recordActivationEvent (e.g., add a real driver), confirm the row is recreated with the milestone stamped and a `logger.warn` is visible in logs.
5. Idempotency: re-run the migration SQL manually; confirm no non-NULL columns are overwritten.
</verification>

<success_criteria>
- Migration file exists at `apps/web/prisma/migrations/20260521000001_backfill_activation_progress/migration.sql` and has been auto-applied via the migration hook.
- Every existing tenant has an ActivationProgress row with milestone timestamps populated from real records (where real records exist).
- Re-running the migration does not change non-NULL milestone columns.
- `apps/web/src/lib/onboarding/activation-tracker.ts` imports `logger` from `@/lib/logger`, uses `let current`, and replaces the silent return with an auto-create path that emits `logger.warn` and re-fetches `current`.
- `tsc --noEmit` passes for apps/web.
- No changes outside the two files listed in `files_modified`.
</success_criteria>

<output>
After completion, create `.planning/quick/401-tkt-0040-actual-fix-backfill-missing-act/401-SUMMARY.md` documenting:
- Migration filename and exact rows-affected count from the INSERT + UPDATE
- Tenant spot-check results (one example with computed milestones)
- Diff snippet showing the activation-tracker.ts guard change
- TypeScript build result
</output>
