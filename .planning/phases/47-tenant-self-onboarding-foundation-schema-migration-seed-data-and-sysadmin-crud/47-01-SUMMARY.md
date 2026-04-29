---
phase: 47-tenant-self-onboarding-foundation-schema-migration-seed-data-and-sysadmin-crud
plan: "01"
subsystem: database
tags: [prisma, postgresql, rls, migrations, enums, multi-tenant]

# Dependency graph
requires:
  - phase: 46-workflow-engine-5-polish-analytics
    provides: last schema state — DispatchOverrideAudit, PlaybookTrigger as final models
provides:
  - migration.sql with all Phase 47 DDL (6 enums, 9 new tables, Tenant extensions, isSample columns)
  - schema.prisma updated with all new Prisma models and enums
  - Generated Prisma client with FleetSizeBucket, TenantStatus, SubscriptionStatus, AutomationScope, AutomationRunStatus, ProvisioningPhase types
affects:
  - 47-02 (seed data uses Plan/Promo tables)
  - 47-03 (sysadmin CRUD uses Plan, Subscription, ActivationProgress)
  - future phases using Tenant.status, Tenant.fleetSizeBucket, isSample filtering

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent RLS policy creation using DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$ pattern"
    - "NULL backfill before ALTER COLUMN SET NOT NULL for safe zero-downtime column promotions"
    - "Plan/Promo without RLS (platform-level tables readable by all tenants)"
    - "AutomationRule partial RLS: SYSTEM scope bypasses tenant check (scope = 'SYSTEM' OR tenantId = current_tenant_id())"

key-files:
  created:
    - apps/web/prisma/migrations/20260429000001_tenant_self_onboarding/migration.sql
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/generated/prisma/index.d.ts
    - apps/web/src/generated/prisma/index.js
    - apps/web/src/generated/prisma/edge.js
    - apps/web/src/generated/prisma/index-browser.js
    - apps/web/src/generated/prisma/schema.prisma
    - apps/web/src/generated/prisma/package.json
    - apps/web/src/lib/db/repositories/tenant.repository.ts

key-decisions:
  - "Plan and Promo tables have no RLS — they are platform-level and intentionally readable by all tenants"
  - "AutomationRule uses partial RLS: rows with scope=SYSTEM are visible to all tenants; scope=TENANT rows are tenant-isolated"
  - "slug made NOT NULL with gen_random_uuid()::text backfill for existing NULL values"
  - "stripeProductId, stripeCouponId, stripeCustomerId, stripeSubscriptionId are nullable TEXT with no defaults"
  - "isSample columns added to Truck, User, Customer, Load with default false for clean sample data sweep later"

patterns-established:
  - "Phase 47 tables use same RLS two-policy pattern (tenant_isolation_policy + bypass_rls_policy) as existing tenant tables"
  - "TenantProvisioningRepository.provisionTenant generates slug via name-based slug + UUID suffix"

# Metrics
duration: 12min
completed: 2026-04-29
---

# Phase 47 Plan 01: Tenant Self-Onboarding Foundation — Schema Migration Summary

**Raw SQL DDL migration adding 6 enums, 9 new tables (Plan/Promo/Subscription/ActivationProgress/AutomationRule/AutomationRun/AppEvent/TenantMetricsDaily/TenantHealthScore), Tenant extensions (slug NOT NULL, 6 new columns), and isSample on 4 domain tables — all idempotent, with RLS on 7 tenant-scoped tables**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-29T01:51:00Z
- **Completed:** 2026-04-29T02:03:41Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Migration file written with all 13 DDL sections: 6 enums (idempotent DO-EXCEPTION), Tenant column extensions (slug backfill + NOT NULL promotion), isSample on 4 domain tables, 9 new tables with all indexes and FK constraints, and 7 tables with dual RLS policies
- schema.prisma updated with all 6 new enums, Tenant model extended (slug non-nullable + 6 new fields + 7 reverse relations), isSample on Truck/User/Customer/Load, and 9 new model blocks appended
- `npx prisma generate` succeeds and `npx tsc --noEmit` passes with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Write DDL migration** - `ab26ee7` (feat)
2. **Task 2: Update prisma/schema.prisma** - `9d1e0f7` (feat)

## Files Created/Modified

- `apps/web/prisma/migrations/20260429000001_tenant_self_onboarding/migration.sql` - Full DDL migration (486 lines, 13 sections)
- `apps/web/prisma/schema.prisma` - 6 new enums, 9 new models, Tenant extended, isSample on 4 models
- `apps/web/src/lib/db/repositories/tenant.repository.ts` - Auto-fixed: slug generation added to provisionTenant
- `apps/web/src/generated/prisma/` - Regenerated Prisma client (7 files updated)

## Decisions Made

- Plan and Promo have no RLS because they are platform-level configuration tables written only by SysAdmin and readable by any authenticated user
- AutomationRule has partial RLS (`scope = 'SYSTEM' OR "tenantId" = current_tenant_id()`) so system-wide rules are visible to all tenants without bypass
- slug promoted from nullable to NOT NULL using a backfill of `gen_random_uuid()::text` for any existing NULL values
- All Stripe fields (stripeProductId, stripeCouponId, stripeCustomerId, stripeSubscriptionId) are nullable TEXT with no defaults and no writes in this phase

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing slug in TenantProvisioningRepository.provisionTenant**
- **Found during:** Task 2 (schema.prisma update — after making slug NOT NULL, tsc --noEmit caught the error)
- **Issue:** `provisionTenant` created Tenant with no slug field. Once slug became NOT NULL in the Prisma schema, TypeScript reported a type error: "Property 'slug' is missing in type ... but required in type TenantCreateInput"
- **Fix:** Added `generateSlug()` helper (name-based kebab-case + 8-char UUID suffix) and passed `slug: generateSlug(data.companyName)` in the create call
- **Files modified:** `apps/web/src/lib/db/repositories/tenant.repository.ts`
- **Verification:** `npx tsc --noEmit` exits 0 with no errors
- **Committed in:** `9d1e0f7` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Required fix — slug NOT NULL promotion would have broken tenant provisioning without it. No scope creep.

## Issues Encountered

None beyond the auto-fixed slug bug above.

## User Setup Required

None - this plan creates schema artifacts only. The migration will be applied to the live database via the existing `migrate.mjs` hook on the next deployment.

## Next Phase Readiness

- All Phase 47 database tables exist in schema and migration — ready for seed data (47-02) and sysadmin CRUD (47-03)
- Plan/Promo/Subscription/ActivationProgress models available in Prisma client for immediate use
- AutomationRule/AutomationRun tables ready for automation engine work in later plans
- AppEvent/TenantMetricsDaily/TenantHealthScore telemetry tables ready

---
*Phase: 47-tenant-self-onboarding-foundation-schema-migration-seed-data-and-sysadmin-crud*
*Completed: 2026-04-29*
