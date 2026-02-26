---
phase: 01-database-integrity-hardening
plan: 01
subsystem: database
tags: [postgresql, prisma, rls, row-level-security, migrations, tenant-isolation]

requires:
  - phase: 16-route-finance
    provides: InvoiceItem and ExpenseTemplateItem models (no tenantId yet)
  - phase: quick-8
    provides: Load and TenantIntegration tables (added via db push, no migration SQL)
  - phase: quick-14
    provides: TenantIntegration model and IntegrationProvider/IntegrationCategory enums

provides:
  - Migration SQL for all missing RLS policies (NotificationLog, InvoiceItem, ExpenseTemplateItem, Load, TenantIntegration)
  - tenantId column + FK + index on InvoiceItem and ExpenseTemplateItem
  - CREATE TABLE IF NOT EXISTS for Load and TenantIntegration (fresh-environment safe)
  - Idempotent enum creation for LoadStatus, IntegrationProvider, IntegrationCategory

affects:
  - invoices
  - expense-templates
  - loads
  - tenant-integrations
  - any future plan that creates InvoiceItem or ExpenseTemplateItem records

tech-stack:
  added: []
  patterns:
    - "ADD COLUMN IF NOT EXISTS then backfill then SET NOT NULL — safe zero-downtime column addition"
    - "DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$ — idempotent DDL for enums and FK constraints"
    - "CREATE TABLE IF NOT EXISTS for tables previously added via db push — ensures migration-based deployments work"
    - "tenantId required on all child tables even when accessible via parent JOIN — defense-in-depth RLS"

key-files:
  created:
    - prisma/migrations/20260226000002_add_rls_missing_tables/migration.sql
  modified:
    - prisma/schema.prisma
    - src/app/(owner)/actions/expense-templates.ts
    - src/app/(owner)/actions/invoices.ts

key-decisions:
  - "InvoiceItem gets direct tenantId (not just via Invoice cascade) — enables direct RLS without join"
  - "ExpenseTemplateItem gets direct tenantId (not just via ExpenseTemplate cascade) — enables direct RLS without join"
  - "Backfill before NOT NULL — nullable column added first so UPDATE can run before constraint is enforced"
  - "CREATE TABLE IF NOT EXISTS for Load and TenantIntegration — tables already exist in prod (via db push), migration must be idempotent"
  - "All enum creation uses DO/EXCEPTION blocks — enums already exist in prod after quick-8/14, migration must not fail on re-run"

patterns-established:
  - "Pattern: Every table with tenantId gets tenant_isolation_policy + bypass_rls_policy — both required for proper RLS"
  - "Pattern: Child tables (InvoiceItem, ExpenseTemplateItem) carry their own tenantId for direct RLS without parent join"

duration: 3min 12sec
completed: 2026-02-26
---

# Phase 01 Plan 01: Database Integrity Hardening — RLS Policies and Migration SQL Summary

**Migration SQL that adds RLS to 5 tables, tenantId to InvoiceItem and ExpenseTemplateItem, and idempotent CREATE TABLE for Load and TenantIntegration — sealing security gaps from db-push-only table creation**

## Performance

- **Duration:** 3 min 12 sec
- **Started:** 2026-02-26T21:50:11Z
- **Completed:** 2026-02-26T21:53:23Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created `prisma/migrations/20260226000002_add_rls_missing_tables/migration.sql` with 10 ordered sections covering all missing integrity pieces
- Added `tenantId` column to `InvoiceItem` and `ExpenseTemplateItem` with backfill, NOT NULL enforcement, FK constraint to Tenant, and index
- Enabled RLS with `tenant_isolation_policy` and `bypass_rls_policy` on all 5 tables: NotificationLog, InvoiceItem, ExpenseTemplateItem, Load, TenantIntegration
- Created `CREATE TABLE IF NOT EXISTS` blocks for Load and TenantIntegration — safe for fresh environments and idempotent on prod (tables already exist via db push)
- Updated `prisma/schema.prisma` with `tenantId` field, `tenant` relation, and `@@index([tenantId])` on both child models
- Added `invoiceItems` and `expenseTemplateItems` back-relations to Tenant model
- Fixed two server action files that were missing `tenantId` in InvoiceItem/ExpenseTemplateItem mutation calls
- Zero TypeScript errors after all changes

## Task Commits

Each task was committed atomically:

1. **Task 1: Create migration SQL file with all integrity fixes** - `29f3be4` (feat)
2. **Task 2: Update schema.prisma and regenerate Prisma client** - `472ed1a` (feat)

## Files Created/Modified

- `prisma/migrations/20260226000002_add_rls_missing_tables/migration.sql` — 267-line migration with all RLS, column additions, table creations, and idempotent enum creation
- `prisma/schema.prisma` — InvoiceItem and ExpenseTemplateItem now have tenantId; Tenant model has invoiceItems and expenseTemplateItems back-relations
- `src/app/(owner)/actions/expense-templates.ts` — createTemplate now passes tenantId when creating ExpenseTemplateItem records
- `src/app/(owner)/actions/invoices.ts` — createInvoice and updateInvoice now pass tenantId when creating InvoiceItem records; updateInvoice now calls requireTenantId()

## Decisions Made

- InvoiceItem and ExpenseTemplateItem get their own tenantId column even though they are accessible via parent relation — direct tenantId enables RLS row filtering without JOIN, which is required for `current_tenant_id()` policy evaluation
- Backfill pattern (nullable → UPDATE → NOT NULL) chosen over default value to prevent silent null rows if any orphaned items existed
- `CREATE TABLE IF NOT EXISTS` used for Load and TenantIntegration because these tables were previously created via `prisma db push` (no SQL migration), so the migration must be safe to run on a database where they already exist
- All enum `CREATE TYPE` statements use `DO/EXCEPTION WHEN duplicate_object` blocks for the same reason — enums already exist in production
- FK constraints on Load use `DO/EXCEPTION` blocks too — constraints already exist in production on the db-push database

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript errors in expense-templates.ts and invoices.ts missing tenantId on child model mutations**

- **Found during:** Task 2 (schema.prisma update + prisma generate)
- **Issue:** Adding `tenantId` as required field to InvoiceItem and ExpenseTemplateItem caused TypeScript compilation errors in two server actions that create these records without providing tenantId. `npx tsc --noEmit` reported 3 errors across 2 files.
- **Fix:**
  - `expense-templates.ts`: Added `tenantId` to the `createMany` call in `createTemplate`
  - `invoices.ts`: Added `tenantId` to nested `create` in both `createInvoice` and `updateInvoice`; also added `const tenantId = await requireTenantId()` to `updateInvoice` which previously had no tenantId in scope
- **Files modified:** `src/app/(owner)/actions/expense-templates.ts`, `src/app/(owner)/actions/invoices.ts`
- **Verification:** `npx tsc --noEmit` exits with zero errors after fix
- **Committed in:** `472ed1a` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug from missing required field in mutations)
**Impact on plan:** The fix was a necessary consequence of making tenantId required — not a scope change. No new functionality added.

## Issues Encountered

None — plan executed smoothly. The TypeScript errors were anticipated by the plan's success criteria ("No new TypeScript errors") and resolved inline per deviation Rule 1.

## User Setup Required

None — no external service configuration required. The migration SQL will run automatically via `scripts/migrate.mjs` on the next deploy.

## Next Phase Readiness

- Migration SQL is ready to deploy — will run on next `npm run build` (via vercel.json buildCommand chain)
- All 5 tables now have complete RLS coverage
- Fresh environments (new Vercel preview deployments, local dev after `migrate.mjs`) will get Load and TenantIntegration tables from the migration
- Prisma Client types now include tenantId on InvoiceItem and ExpenseTemplateItem — any future code creating these records must provide tenantId

---
*Phase: 01-database-integrity-hardening*
*Completed: 2026-02-26*
