# Phase 1: Database Integrity Hardening - Research

**Researched:** 2026-02-26
**Domain:** PostgreSQL Row-Level Security, Prisma migrations, Node.js migration runner
**Confidence:** HIGH

## Summary

This phase has zero ambiguity — every gap is a concrete, enumerable defect identified through direct code inspection. There are no unknown unknowns. The work falls into three independent tracks: (1) add missing RLS to tables that already exist, (2) create CREATE TABLE migration SQL for models that are in schema.prisma but have no corresponding migration, and (3) fix one-line error handling in the migration runner.

The RLS gaps are security-critical. Without RLS on NotificationLog, InvoiceItem, and ExpenseTemplateItem, a tenant could read another tenant's records if the app ever queries these tables without explicitly filtering by tenantId — which is exactly the scenario RLS protects against. The missing migration SQL for Load and TenantIntegration means the app relies on Prisma's shadow DB or Supabase dashboard to create those tables, making the migration history incomplete and unreproducible from scratch. The error-swallowing bug in migrate.mjs means a failed migration silently lets the app start with a broken DB schema.

InvoiceItem and ExpenseTemplateItem require special handling: neither has a `tenantId` column in schema.prisma (they are child rows that inherit tenant scope through their parent). The correct approach is to add `tenantId` to both tables in the Prisma schema AND in a new migration, then use that column for RLS — identical to the pattern used for TagAssignment, which also had a tenantId added explicitly even though it's a child of Tag.

**Primary recommendation:** Create a single new migration SQL file that adds tenantId to InvoiceItem and ExpenseTemplateItem, adds RLS to all three missing tables, creates Load and TenantIntegration tables with full indexes and RLS, and creates the missing enums (LoadStatus, IntegrationProvider, IntegrationCategory). Fix migrate.mjs to call `process.exit(1)` instead of logging "Starting app anyway...".

## Standard Stack

No new libraries are needed. This phase operates entirely within the existing stack.

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| PostgreSQL RLS | Built-in | Row-level security enforcement | Already used for all other tenant-scoped tables |
| Prisma schema | 6.x (in use) | Schema source of truth | Already the project standard |
| Node.js migrate.mjs | Custom (in repo) | Migration runner | Already deployed to production |
| `pg` npm package | In use | Direct Postgres client for migrate.mjs | Already a dependency |

### No new dependencies needed

**Installation:** none required.

## Architecture Patterns

### How RLS Works in This Project (HIGH confidence — read from source)

Every tenant-scoped table uses a two-policy pattern:

1. **tenant_isolation_policy** — allows queries only when `app.current_tenant_id` session variable matches the row's tenantId.
2. **bypass_rls_policy** — allows queries when `app.bypass_rls` is set to `'on'` (used for system admin and provisioning operations).

The session variable is set inside a transaction via `set_config('app.current_tenant_id', tenantId, TRUE)`. The `TRUE` third parameter scopes the variable to the current transaction, preventing pool contamination.

The `FORCE ROW LEVEL SECURITY` modifier ensures even table owners cannot bypass the policy.

### Two RLS Policy Syntax Variants in the Codebase

Inspection of the migrations reveals two distinct syntax styles. Both are valid PostgreSQL. The newer migrations (20260218+, tags) use a simplified inline form; the original migrations use the `FOR ALL USING ... WITH CHECK` form. The most complete form (ENABLE + FORCE + FOR ALL USING + WITH CHECK + bypass) is used in migrations 20260214-20260218 for primary tenant tables.

**Older/primary style** (init through 20260218000002):
```sql
ALTER TABLE "Foo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Foo" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "Foo"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY bypass_rls_policy ON "Foo"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
```

**Newer/simplified style** (add_tags migration):
```sql
ALTER TABLE "Foo" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_policy" ON "Foo"
  USING ("tenantId"::text = current_setting('app.current_tenant_id', TRUE));
CREATE POLICY "bypass_rls_policy" ON "Foo"
  USING (current_setting('app.bypass_rls', TRUE) = 'on');
```

**Use the older/primary style** for all new policies in this phase. It is more explicit (FORCE, WITH CHECK for write enforcement) and consistent with the majority of existing tables. The simplified style is missing FORCE ROW LEVEL SECURITY and WITH CHECK, which means table owners bypass it and inserts/updates are not checked.

### RLS for Child Tables Without tenantId (InvoiceItem, ExpenseTemplateItem)

Both InvoiceItem and ExpenseTemplateItem lack `tenantId` in schema.prisma. The project already solved this problem for TagAssignment — it added `tenantId` explicitly even though TagAssignment is logically a child of Tag. The same approach applies here.

**Step 1:** Add `tenantId String @db.Uuid` to InvoiceItem and ExpenseTemplateItem in schema.prisma with a foreign key to Tenant.
**Step 2:** In the new migration SQL, ALTER TABLE to add the column, backfill it via a subquery join, add the FK constraint, add an index, and then apply RLS.
**Step 3:** Update the Prisma schema relations.

Alternative approach (RLS via subquery, no tenantId column added):
```sql
-- Do NOT use this approach — it cannot use WITH CHECK and is inconsistent
CREATE POLICY tenant_isolation_policy ON "InvoiceItem"
  USING (EXISTS (
    SELECT 1 FROM "Invoice" i
    WHERE i.id = "InvoiceItem"."invoiceId"
      AND i."tenantId" = current_tenant_id()
  ));
```
This subquery approach is rejected because: (1) it cannot enforce WITH CHECK, (2) it requires a cross-table join on every row access which hurts performance, (3) it's inconsistent with all other tables in the project.

### Migration File Naming Convention

All migration directories follow: `YYYYMMDDHHMMSS_snake_case_description`
The new migration for this phase should be named: `20260226000002_add_rls_missing_tables`
(The most recent migration is `20260226000001_add_route_distance`, so `000002` is the next slot.)

### migrate.mjs Error Handling Fix

Current code (lines 79-82):
```javascript
} catch (e) {
  console.error('Migration error:', e.message);
  console.log('Starting app anyway...');
}
```

The fix is to replace `console.log('Starting app anyway...')` with `process.exit(1)`.

The outer try/catch wraps both the migration loop AND the connection setup. The inner try/catch (lines 71-75) already does the right thing for individual migrations: it rolls back and re-throws. The outer catch should also hard-fail so the deployment/startup fails visibly.

Fixed code:
```javascript
} catch (e) {
  console.error('Migration error:', e.message);
  process.exit(1);
}
```

The `finally` block (client.end()) still runs before process.exit, so connections are cleaned up properly.

### Load Table — Full Column Audit

From schema.prisma, the Load model has columns that require enums that don't exist in any migration yet:

- **`LoadStatus` enum** — values: PENDING, DISPATCHED, PICKED_UP, IN_TRANSIT, DELIVERED, INVOICED, CANCELLED — not in any migration SQL
- **`IntegrationProvider` enum** — values: QUICKBOOKS, SAMSARA, KEEP_TRUCKIN, TRIUMPH_FACTORING, OTR_SOLUTIONS, SENDGRID, MAILGUN — not in any migration SQL
- **`IntegrationCategory` enum** — values: ACCOUNTING, ELD, FACTORING, EMAIL — not in any migration SQL

The new migration must CREATE TYPE for all three enums before creating the tables.

Additionally, Load references Customer (which exists from 20260218000002) and the migration must not re-create that table. Load also references Route, Truck, and User — all already exist.

The schema.prisma Customer model has two columns added since the 20260218 migration that do not appear in migration SQL:
- `emailNotifications Boolean @default(true)`
- The Customer_tenantId_companyName unique index now uses different columns

This is a pre-existing drift (out of scope for this phase per the audit findings), but the planner should be aware that the Load migration references Customer and should not alter the Customer table.

### TenantIntegration Table

TenantIntegration has `tenantId`, `provider` (IntegrationProvider enum), `category` (IntegrationCategory enum). Both enums must be created in the same migration. A `@@unique([tenantId, provider])` constraint is in schema.prisma.

### Recommended Migration File Structure

The new migration should be one file: `prisma/migrations/20260226000002_add_rls_missing_tables/migration.sql`

Ordering within the file:
1. CREATE TYPE for missing enums (LoadStatus, IntegrationProvider, IntegrationCategory)
2. ALTER TABLE InvoiceItem ADD COLUMN tenantId
3. ALTER TABLE ExpenseTemplateItem ADD COLUMN tenantId
4. Backfill tenantId for InvoiceItem via JOIN to Invoice
5. Backfill tenantId for ExpenseTemplateItem via JOIN to ExpenseTemplate
6. ALTER TABLE InvoiceItem ALTER COLUMN tenantId SET NOT NULL
7. ALTER TABLE ExpenseTemplateItem ALTER COLUMN tenantId SET NOT NULL
8. ADD FK constraints for new tenantId columns
9. CREATE INDEX for new tenantId columns
10. RLS for NotificationLog (ENABLE + FORCE + policies)
11. RLS for InvoiceItem (ENABLE + FORCE + policies)
12. RLS for ExpenseTemplateItem (ENABLE + FORCE + policies)
13. CREATE TABLE Load with all columns, indexes, FK constraints
14. RLS for Load
15. CREATE TABLE TenantIntegration with all columns, indexes, FK constraints
16. RLS for TenantIntegration

The schema.prisma must also be updated to add `tenantId` to InvoiceItem and ExpenseTemplateItem models (with relations).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RLS policy for child tables | Custom application-layer tenant filter | tenantId column + standard RLS policy | Consistency with all other tables, enforces at DB layer not app layer |
| Migration tracking | New migration format | Existing `_prisma_migrations` table format | Already deployed, changing would break production |

**Key insight:** The project uses a custom migration runner (migrate.mjs), not `prisma migrate deploy`. Do not suggest switching to `prisma migrate deploy` — the custom runner is intentional for the deployment environment (Vercel + Supabase).

## Common Pitfalls

### Pitfall 1: Backfilling tenantId Before Setting NOT NULL
**What goes wrong:** Running `ALTER TABLE "InvoiceItem" ALTER COLUMN "tenantId" SET NOT NULL` immediately after adding the column fails if any rows exist without a tenantId value.
**Why it happens:** The column is added as nullable; existing rows have NULL.
**How to avoid:** Always backfill via an UPDATE...FROM JOIN before setting NOT NULL.
**Warning signs:** Migration fails with "column tenantId contains null values".

Backfill SQL for InvoiceItem:
```sql
UPDATE "InvoiceItem" SET "tenantId" = i."tenantId"
FROM "Invoice" i
WHERE "InvoiceItem"."invoiceId" = i.id;
```

Backfill SQL for ExpenseTemplateItem:
```sql
UPDATE "ExpenseTemplateItem" SET "tenantId" = t."tenantId"
FROM "ExpenseTemplate" t
WHERE "ExpenseTemplateItem"."templateId" = t.id;
```

### Pitfall 2: Missing FORCE ROW LEVEL SECURITY
**What goes wrong:** Table owner (the Postgres user the app connects as) bypasses RLS even with policies in place.
**Why it happens:** By default, table owners are exempt from RLS. ENABLE ROW LEVEL SECURITY alone does not protect against the table owner.
**How to avoid:** Always pair `ENABLE ROW LEVEL SECURITY` with `FORCE ROW LEVEL SECURITY`.

### Pitfall 3: Policy Syntax Inconsistency
**What goes wrong:** Using the simplified Tag-style policy without WITH CHECK means INSERT/UPDATE are not checked against the tenant constraint.
**Why it happens:** The shorter `USING` form applies to SELECT/DELETE but not INSERT/UPDATE unless WITH CHECK is also specified.
**How to avoid:** Use `FOR ALL USING (...) WITH CHECK (...)` for the tenant_isolation_policy on all new tables.

### Pitfall 4: Enum Creation Ordering
**What goes wrong:** CREATE TABLE Load fails because `LoadStatus` type doesn't exist yet.
**Why it happens:** CREATE TYPE must precede any CREATE TABLE or ALTER TABLE that uses the type.
**How to avoid:** Put all CREATE TYPE statements at the top of the migration file.

### Pitfall 5: process.exit in finally Block Ordering
**What goes wrong:** `client.end()` in the `finally` block may not complete cleanup before process.exit(1) in the catch block.
**Why it happens:** The `finally` block runs after `catch`, so `client.end()` does execute before the process ends.
**How to avoid:** This is actually not a pitfall — `finally` runs after `catch`, so cleanup happens correctly. No change needed to the finally block.

### Pitfall 6: Schema.prisma Drift
**What goes wrong:** After adding `tenantId` to InvoiceItem/ExpenseTemplateItem in the migration SQL, Prisma type checks fail because schema.prisma still lacks those fields.
**Why it happens:** Migration SQL and schema.prisma must be kept in sync manually in this project (no `prisma migrate dev`).
**How to avoid:** Update schema.prisma BEFORE running the migration, so generated types match. Add the tenantId field and the Tenant relation to both InvoiceItem and ExpenseTemplateItem models.

## Code Examples

### Standard RLS Block (Primary Style — use this)
```sql
-- Source: prisma/migrations/20260218000002_add_crm_invoice_payroll_models/migration.sql

ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "Invoice"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY bypass_rls_policy ON "Invoice"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
```

### Adding tenantId to Child Table + Backfill + RLS
```sql
-- Source: Pattern derived from prisma/migrations/20260216223252 (ExpenseTemplate)
--         and schema.prisma InvoiceItem model

-- Step 1: Add column nullable first
ALTER TABLE "InvoiceItem" ADD COLUMN "tenantId" UUID;

-- Step 2: Backfill from parent
UPDATE "InvoiceItem" SET "tenantId" = i."tenantId"
FROM "Invoice" i
WHERE "InvoiceItem"."invoiceId" = i.id;

-- Step 3: Enforce NOT NULL now that all rows are populated
ALTER TABLE "InvoiceItem" ALTER COLUMN "tenantId" SET NOT NULL;

-- Step 4: Add FK
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 5: Add index
CREATE INDEX "InvoiceItem_tenantId_idx" ON "InvoiceItem"("tenantId");

-- Step 6: Enable RLS
ALTER TABLE "InvoiceItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceItem" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "InvoiceItem"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY bypass_rls_policy ON "InvoiceItem"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
```

### migrate.mjs Fix
```javascript
// Source: scripts/migrate.mjs lines 79-84 (current)
// Change FROM:
} catch (e) {
  console.error('Migration error:', e.message);
  console.log('Starting app anyway...');
} finally {
  await client.end();
}

// Change TO:
} catch (e) {
  console.error('Migration error:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
```

### Load Table CREATE Statement (derived from schema.prisma)
```sql
-- Source: prisma/schema.prisma model Load

CREATE TYPE "LoadStatus" AS ENUM (
  'PENDING', 'DISPATCHED', 'PICKED_UP', 'IN_TRANSIT',
  'DELIVERED', 'INVOICED', 'CANCELLED'
);

CREATE TABLE "Load" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "loadNumber" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "routeId" UUID,
    "driverId" UUID,
    "truckId" UUID,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "pickupDate" TIMESTAMPTZ NOT NULL,
    "deliveryDate" TIMESTAMPTZ,
    "weight" INTEGER,
    "commodity" TEXT,
    "rate" DECIMAL(12,2) NOT NULL,
    "status" "LoadStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "pickupLat" DECIMAL(10,8),
    "pickupLng" DECIMAL(11,8),
    "deliveryLat" DECIMAL(10,8),
    "deliveryLng" DECIMAL(11,8),
    "geofenceFlags" JSONB,
    "trackingToken" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Load_pkey" PRIMARY KEY ("id")
);
```

### TenantIntegration Table CREATE Statement
```sql
-- Source: prisma/schema.prisma model TenantIntegration

CREATE TYPE "IntegrationProvider" AS ENUM (
  'QUICKBOOKS', 'SAMSARA', 'KEEP_TRUCKIN',
  'TRIUMPH_FACTORING', 'OTR_SOLUTIONS', 'SENDGRID', 'MAILGUN'
);

CREATE TYPE "IntegrationCategory" AS ENUM (
  'ACCOUNTING', 'ELD', 'FACTORING', 'EMAIL'
);

CREATE TABLE "TenantIntegration" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "category" "IntegrationCategory" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "configJson" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "TenantIntegration_pkey" PRIMARY KEY ("id")
);
```

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| Swallow migration errors and start app | Hard-fail with process.exit(1) | Fix removes silent data-corruption risk |
| RLS via app-layer tenantId filter only | RLS at DB layer + app layer | DB-layer RLS is defense-in-depth |
| Child tables without tenantId column | Add tenantId to all tenant-scoped tables | Consistent pattern, simpler policy |

## Open Questions

1. **DocumentType enum not in migrations**
   - What we know: `DocumentType` is in schema.prisma (DRIVER_LICENSE, DRIVER_APPLICATION, GENERAL) but not in any migration SQL. The Document table was created in `20260214000004_add_document_model/migration.sql`.
   - What's unclear: Is the `documentType` column present in the live DB with the enum type, or was it added manually?
   - Recommendation: This is out of scope for the current phase (not in the audit findings). Flag as a follow-up item.

2. **Customer table schema drift (emailNotifications column)**
   - What we know: `emailNotifications Boolean @default(true)` is in schema.prisma but not in `20260218000002` migration SQL. Same for `emailNotifications` in the `totalLoads/totalRevenue` section.
   - What's unclear: Whether this column exists in the live DB.
   - Recommendation: Out of scope for this phase. The Load migration references Customer but does not ALTER it.

3. **Whether Load and TenantIntegration tables already exist in the live DB**
   - What we know: No migration SQL creates them, but the app has Load/TenantIntegration routes and actions that query them.
   - What's unclear: Were they created via Supabase dashboard or Prisma introspection?
   - Recommendation: The new migration must use `CREATE TABLE IF NOT EXISTS` OR the planner must ensure the migration only runs against environments where these tables don't yet exist. Since the migration runner tracks applied migrations, a fresh migration will only run once. However, if the table already exists in production, the migration will fail. Use `CREATE TABLE IF NOT EXISTS` to be safe, but note this masks errors. Better: coordinate with the deployment team. The safest SQL form for production is to include `CREATE TABLE IF NOT EXISTS` with a comment noting the table may already exist.

## Sources

### Primary (HIGH confidence)
- `prisma/schema.prisma` — authoritative schema for all 5 affected models
- `prisma/migrations/00000000000000_init/migration.sql` — canonical RLS pattern
- `prisma/migrations/20260218000002_add_crm_invoice_payroll_models/migration.sql` — confirmed InvoiceItem has no tenantId, confirmed RLS style used for Invoice/Customer/PayrollRecord
- `prisma/migrations/20260216223252_add_route_finance_models/migration.sql` — confirmed ExpenseTemplateItem has no tenantId, confirmed RLS for ExpenseTemplate
- `prisma/migrations/20260214000006_add_notification_log/migration.sql` — confirmed no RLS block present
- `prisma/migrations/20260215000002_add_tags/migration.sql` — TagAssignment child-table tenantId pattern
- `scripts/migrate.mjs` — confirmed "Starting app anyway..." bug at line 81
- `src/lib/db/extensions/tenant-rls.ts` — confirmed set_config pattern
- `src/lib/db/repositories/base.repository.ts` — confirmed TenantRepository pattern
- `src/lib/auth/server.ts` — confirmed bypass_rls usage pattern
- Direct enumeration of all `CREATE TABLE` and `CREATE TYPE` statements across all 13 migrations — confirmed Load and TenantIntegration have zero SQL

### Secondary (MEDIUM confidence)
- None needed — all findings are from first-party source inspection

## Metadata

**Confidence breakdown:**
- Gap identification (missing tables, missing RLS): HIGH — confirmed by direct enumeration of all SQL across all migrations
- RLS policy syntax: HIGH — derived from 20+ existing policies in the codebase
- tenantId backfill approach: HIGH — identical to TagAssignment pattern already used
- migrate.mjs fix: HIGH — single-line change with clear intent
- Load/TenantIntegration CREATE TABLE SQL: HIGH — derived directly from schema.prisma with no ambiguity
- Open question about live DB state: LOW — cannot verify without DB access

**Research date:** 2026-02-26
**Valid until:** 2026-03-28 (stable domain — PostgreSQL RLS and Prisma schema are not fast-moving)
