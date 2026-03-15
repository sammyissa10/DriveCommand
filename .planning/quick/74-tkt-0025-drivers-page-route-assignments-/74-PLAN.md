---
phase: quick-74
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/migrations/20260315000001_add_driver_route_join/migration.sql
autonomous: true

must_haves:
  truths:
    - "Driver detail page shows assigned routes in the Route Assignments section"
    - "Route assignments are tenant-isolated via RLS"
    - "Creating a driver-route assignment works in production (migration-based) environments"
  artifacts:
    - path: "prisma/migrations/20260315000001_add_driver_route_join/migration.sql"
      provides: "DriverRouteJoin table creation + RLS policies"
      contains: "CREATE TABLE"
  key_links:
    - from: "src/app/(owner)/actions/driver-route-joins.ts"
      to: "prisma.driverRouteJoin"
      via: "Prisma query against DriverRouteJoin table"
      pattern: "prisma\\.driverRouteJoin\\.findMany"
---

<objective>
Fix TKT-0025: Driver detail page route assignments not working.

Root cause: The `DriverRouteJoin` table and `DriverPaymentMethod` enum exist in `prisma/schema.prisma` but have NO migration file. They were created via `prisma db push` in development only. In production (which uses `scripts/migrate.mjs`), the table does not exist, so `listDriverRouteJoinsByDriver()` fails silently (caught by `.catch(() => [])`) and returns an empty array.

Fix: Create a migration that (1) creates the `DriverPaymentMethod` enum, (2) creates the `DriverRouteJoin` table with all columns/indexes/FKs, and (3) enables RLS with tenant isolation and bypass policies -- matching the pattern used by every other tenant-scoped table in the codebase.

Purpose: Route assignments are a core feature for driver management. Without the migration, the table only exists in dev environments that ran `db push`.
Output: Migration SQL file that creates the table and RLS policies.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@prisma/schema.prisma (DriverRouteJoin model at line ~1025, DriverPaymentMethod enum at line ~1019)
@prisma/migrations/20260314000001_add_fleet_message/migration.sql (reference pattern for table + RLS creation)
@prisma/migrations/20260226000002_add_rls_missing_tables/migration.sql (reference pattern for idempotent table + RLS creation)
@src/app/(owner)/actions/driver-route-joins.ts (server actions that query DriverRouteJoin)
@src/app/(owner)/drivers/[id]/page.tsx (driver detail page that calls listDriverRouteJoinsByDriver)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create migration for DriverRouteJoin table and RLS policies</name>
  <files>prisma/migrations/20260315000001_add_driver_route_join/migration.sql</files>
  <action>
Create a new migration directory `prisma/migrations/20260315000001_add_driver_route_join/` with a `migration.sql` file.

The migration must be fully idempotent (using `IF NOT EXISTS`, `DO/EXCEPTION` blocks) following the exact pattern from `20260226000002_add_rls_missing_tables/migration.sql` and `20260314000001_add_fleet_message/migration.sql`.

The migration SQL must do the following in order:

1. **Create the `DriverPaymentMethod` enum** (idempotent via DO/EXCEPTION):
   ```sql
   DO $$ BEGIN
     CREATE TYPE "DriverPaymentMethod" AS ENUM ('FIXED_AMOUNT', 'HOURLY', 'PER_MILE');
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$;
   ```

2. **Create the `DriverRouteJoin` table** (using `CREATE TABLE IF NOT EXISTS`):
   Columns (match schema.prisma exactly):
   - `id` UUID NOT NULL DEFAULT gen_random_uuid(), PRIMARY KEY
   - `tenantId` UUID NOT NULL
   - `routeId` UUID NOT NULL
   - `driverId` UUID NOT NULL
   - `isMainDriver` BOOLEAN NOT NULL DEFAULT false
   - `paymentMethod` "DriverPaymentMethod" NOT NULL
   - `fixedAmount` DECIMAL(10,2)
   - `hourlyRate` DECIMAL(10,2)
   - `numberOfHours` DECIMAL(10,2)
   - `perMileRate` DECIMAL(10,4)
   - `numberOfMiles` DECIMAL(10,2)
   - `createdAt` TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
   - `updatedAt` TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP

3. **Create unique constraint and indexes** (all `IF NOT EXISTS`):
   - Unique index on `(routeId, driverId)`
   - Index on `tenantId`
   - Index on `routeId`
   - Index on `driverId`

4. **Create FK constraints** (idempotent via DO/EXCEPTION):
   - `tenantId` -> `Tenant(id)` ON DELETE RESTRICT ON UPDATE CASCADE
   - `routeId` -> `Route(id)` ON DELETE CASCADE ON UPDATE CASCADE
   - `driverId` -> `User(id)` ON DELETE RESTRICT ON UPDATE CASCADE

5. **Enable RLS** (matching all other tenant-scoped tables):
   ```sql
   ALTER TABLE "DriverRouteJoin" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "DriverRouteJoin" FORCE ROW LEVEL SECURITY;
   ```

6. **Create tenant isolation policy** (idempotent):
   ```sql
   CREATE POLICY tenant_isolation_policy ON "DriverRouteJoin"
     FOR ALL
     USING ("tenantId" = current_tenant_id())
     WITH CHECK ("tenantId" = current_tenant_id());
   ```

7. **Create bypass policy** (idempotent):
   ```sql
   CREATE POLICY bypass_rls_policy ON "DriverRouteJoin"
     FOR ALL
     USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
   ```

Add a header comment explaining the migration purpose: creating the DriverRouteJoin table that was previously only created via `prisma db push` and was missing from production migration chain.
  </action>
  <verify>
    1. File exists at `prisma/migrations/20260315000001_add_driver_route_join/migration.sql`
    2. SQL contains CREATE TYPE for DriverPaymentMethod, CREATE TABLE IF NOT EXISTS for DriverRouteJoin, ENABLE ROW LEVEL SECURITY, tenant_isolation_policy, bypass_rls_policy
    3. All statements are idempotent (safe to run on databases where `prisma db push` already created the table)
    4. Run `npx prisma validate` to confirm schema is consistent
  </verify>
  <done>
    Migration file exists with idempotent SQL that creates the DriverPaymentMethod enum, DriverRouteJoin table, indexes, FKs, and RLS policies. Running `scripts/migrate.mjs` in production will create the table and enable tenant-scoped access, fixing the empty route assignments on the driver detail page.
  </done>
</task>

</tasks>

<verification>
- Migration SQL is syntactically valid and idempotent
- `npx prisma validate` passes (schema matches migration expectations)
- Migration follows the established pattern from other migration files in the project
- RLS policies match the `current_tenant_id()` pattern used across all other tenant-scoped tables
</verification>

<success_criteria>
- Migration file created at the correct path with proper naming convention
- SQL creates the enum, table, indexes, FKs, and RLS policies
- All statements are idempotent (safe for both fresh installs and existing dev databases)
- After running migration, `listDriverRouteJoinsByDriver()` returns actual assignments instead of empty array
</success_criteria>

<output>
After completion, create `.planning/quick/74-tkt-0025-drivers-page-route-assignments-/74-SUMMARY.md`
</output>
