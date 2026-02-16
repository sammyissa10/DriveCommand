---
phase: 16-route-finance-foundation
plan: 01
subsystem: route-finance
tags:
  - database
  - schema
  - migration
  - rls
  - seed
dependency_graph:
  requires: []
  provides:
    - RouteExpense model
    - ExpenseCategory model
    - ExpenseTemplate model
    - ExpenseTemplateItem model
    - RoutePayment model
    - PaymentStatus enum
    - Route.version field (optimistic locking)
    - Route.startOdometer/endOdometer fields
    - Tenant.profitMarginThreshold field
  affects:
    - All route finance features depend on these models
tech_stack:
  added:
    - Prisma schema models for financial tracking
    - PostgreSQL RLS policies for tenant isolation
  patterns:
    - Soft delete pattern (deletedAt on RouteExpense and RoutePayment)
    - Optimistic locking pattern (version field on Route)
    - System defaults pattern (isSystemDefault on ExpenseCategory)
    - Decimal.js for all money calculations
key_files:
  created:
    - prisma/migrations/20260216223252_add_route_finance_models/migration.sql
    - prisma/migrations/migration_lock.toml
  modified:
    - prisma/schema.prisma
    - prisma/seed.ts
decisions:
  - Used Decimal(10,2) for all money amounts matching existing FuelRecord pattern
  - Used Decimal(5,2) for profitMarginThreshold since it's a percentage (0-100)
  - Applied RLS tenant_isolation_policy to all financial tables with tenantId
  - ExpenseTemplateItem does not have RLS directly (inherits through ExpenseTemplate)
  - Used raw SQL for financial seed data to avoid tsx Prisma client caching issues
  - Seed script is idempotent using upsert pattern for categories and template
metrics:
  duration: "7m 50s"
  tasks_completed: 2
  files_modified: 4
  commits: 2
  completed_date: "2026-02-16"
---

# Phase 16 Plan 01: Database Foundation for Route Finance

**One-liner:** Created complete database schema for route financial tracking with RouteExpense, ExpenseCategory, ExpenseTemplate, ExpenseTemplateItem, and RoutePayment models, plus RLS policies and production-realistic seed data.

## Summary

Established the foundational database layer for all route finance features. Created 5 new models (RouteExpense, ExpenseCategory, ExpenseTemplate, ExpenseTemplateItem, RoutePayment) with tenant-scoped RLS policies, added PaymentStatus enum, extended Route model with version/odometer fields for optimistic locking and cost-per-mile calculations, and added profitMarginThreshold to Tenant model. Seeded system-default expense categories, a reusable expense template, and sample expenses/payments for development.

## What Was Built

### Database Models

1. **PaymentStatus enum** - PENDING, PAID
2. **ExpenseCategory** - System-default and custom categories (Fuel, Driver Pay, Insurance, Tolls, Maintenance, Permits & Fees)
3. **RouteExpense** - Individual expense entries with soft delete (deletedAt), linked to category and route
4. **ExpenseTemplate** - Reusable expense templates with name
5. **ExpenseTemplateItem** - Individual items within templates (category, amount, description)
6. **RoutePayment** - Payment records with status (PENDING/PAID), paidAt timestamp, soft delete

### Model Extensions

1. **Route model**:
   - `version` (Int, default 1) - optimistic locking for concurrent edits
   - `startOdometer` (Int?) - start mileage for cost-per-mile
   - `endOdometer` (Int?) - end mileage for cost-per-mile
   - Relations: `expenses RouteExpense[]`, `payments RoutePayment[]`

2. **Tenant model**:
   - `profitMarginThreshold` (Decimal, default 10, Decimal(5,2)) - configurable alert threshold percentage
   - Relations: `expenseCategories`, `expenseTemplates`, `routeExpenses`, `routePayments`

### Security (RLS Policies)

Applied Row-Level Security to all financial tables:
- `tenant_isolation_policy` - restricts access to current tenant's data via `current_tenant_id()`
- `bypass_rls_policy` - allows system operations when `app.bypass_rls = 'on'`

Tables with RLS:
- ExpenseCategory
- RouteExpense
- ExpenseTemplate
- RoutePayment

Note: ExpenseTemplateItem inherits tenant isolation through its parent ExpenseTemplate (no direct RLS needed).

### Seed Data

Production-realistic financial seed data:
- 6 system-default expense categories
- 1 expense template ("Standard Route") with 3 items
- 7 route expenses across completed routes (realistic amounts: Fuel $180-350, Driver Pay $300-500, Tolls $15-45, Insurance $50-100)
- 3 route payments with mixed statuses (PENDING/PAID)

Seed script is idempotent and uses bypass_rls for insertion.

## Technical Decisions

1. **Decimal precision**:
   - Money amounts: `Decimal(10,2)` - supports up to $99,999,999.99
   - Profit margin: `Decimal(5,2)` - supports 0.00% to 999.99%
   - Matches existing FuelRecord pattern for consistency

2. **Soft delete pattern**:
   - RouteExpense and RoutePayment use `deletedAt` timestamp
   - Preserves audit trail for tax/compliance requirements
   - Query pattern: `WHERE deletedAt IS NULL` to exclude deleted records

3. **Optimistic locking**:
   - Route.version field prevents concurrent edit race conditions
   - Update pattern: `WHERE version = expectedVersion`, then increment version
   - Failure = stale data, requires refetch and retry

4. **System defaults**:
   - ExpenseCategory.isSystemDefault flag marks built-in categories
   - System categories cannot be deleted/modified by users
   - Ensures consistent expense categorization across tenants

5. **Raw SQL for seed data**:
   - Used `$queryRaw` and `$executeRaw` for financial seeding
   - Avoids tsx Prisma client caching issues during development
   - Idempotent using `ON CONFLICT ... DO UPDATE` pattern

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Created .env file for seed script**
- **Found during:** Task 2
- **Issue:** Seed script failed with ECONNREFUSED to localhost:5432 because DATABASE_URL was not loaded from .env.local
- **Fix:** Copied .env.local to .env to ensure dotenv/config imports work correctly
- **Files modified:** .env (not committed - contains secrets)
- **Commit:** N/A (file not tracked)

**2. [Rule 3 - Blocking Issue] Used raw SQL for financial seed data**
- **Found during:** Task 2
- **Issue:** tsx was caching the old Prisma client without new financial models, causing "Cannot read properties of undefined" errors
- **Fix:** Replaced Prisma ORM calls with raw SQL queries (`$queryRaw`, `$executeRaw`) for financial data seeding
- **Files modified:** prisma/seed.ts
- **Commit:** 77c6181

## Verification Results

All verification checks passed:

1. ✅ `npx prisma validate` - Schema is valid
2. ✅ `npx prisma migrate status` - All 10 migrations applied, database up to date
3. ✅ `npx prisma generate` - Client generated successfully with new types
4. ✅ `npm run seed` - Seed completes without errors, creates financial data
5. ✅ RLS policies exist on all financial tables (verified via migration SQL)

Sample seed output:
```
   Expense Categories: 6
   Expense Templates:  1
   Route Expenses:    7
   Route Payments:    3
```

## Self-Check: PASSED

### Files Created

```bash
✅ FOUND: prisma/migrations/20260216223252_add_route_finance_models/migration.sql
✅ FOUND: prisma/migrations/migration_lock.toml
```

### Files Modified

```bash
✅ FOUND: prisma/schema.prisma (contains "model RouteExpense")
✅ FOUND: prisma/seed.ts (contains "ExpenseCategory", "RoutePayment")
```

### Commits

```bash
✅ FOUND: 5127a71 (feat(16-01): add financial models to Prisma schema)
✅ FOUND: 77c6181 (feat(16-01): add financial seed data)
```

### Database Verification

```bash
✅ Migration 20260216223252_add_route_finance_models applied
✅ Database schema up to date
✅ Seed data created (verified by re-run idempotency check)
```

## Next Steps

This plan provides the database foundation for:
- **Plan 02**: API routes for expense and payment CRUD operations
- **Plan 03**: UI components for expense tracking and templates
- **Plan 04**: Profit calculation engine using Decimal.js
- **Plan 05**: Financial reporting and analytics

All subsequent finance features depend on these models existing.

## Notes

- The .env file was created by copying .env.local but is not committed (contains secrets)
- tsx caching issue was worked around with raw SQL - future fresh runs will use Prisma ORM normally
- Migration 20260216223252 includes comprehensive RLS policies matching existing project patterns
- Seed script uses bypass_rls and is safe to run multiple times (upserts)
- All money calculations use Decimal type to prevent floating-point precision errors
