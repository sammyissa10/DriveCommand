---
phase: quick-207
plan: "01"
subsystem: db-tenant-isolation
tags: [security, p0, multi-tenant, prisma, rls]
dependency_graph:
  requires: []
  provides: [tenant-isolation-application-layer]
  affects: [all-tenant-scoped-api-routes, getTenantPrisma, createTenantClient]
tech_stack:
  added: []
  patterns: [prisma-extension-query-interception, application-layer-tenantId-injection]
key_files:
  created: []
  modified:
    - apps/web/src/lib/db/extensions/tenant-rls.ts
decisions:
  - "Application-layer tenantId injection chosen over RLS-only because Supabase postgres role has BYPASSRLS privilege defeating RLS entirely"
  - "findUnique/findUniqueOrThrow use post-query verification (cannot add tenantId to Prisma unique-where constraints)"
  - "set_config kept as defense-in-depth alongside primary application-layer enforcement"
  - "19 models without tenantId field placed in EXEMPT_MODELS set and passed through without injection"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-14"
  tasks_completed: 1
  files_modified: 1
---

# Quick-207: Fix Critical Multi-Tenant Breach — Rewrite withTenantRLS Summary

**One-liner:** Application-layer tenantId injection into all Prisma query args, replacing the broken RLS-only approach that was bypassed by Supabase's BYPASSRLS postgres role privilege.

## What Was Built

Rewrote `apps/web/src/lib/db/extensions/tenant-rls.ts` to enforce tenant isolation at the application layer inside the `withTenantRLS` Prisma extension. The old implementation relied solely on `set_config` + PostgreSQL RLS policies, which were silently bypassed because the Supabase `postgres` role (used by Prisma's connection pool) has the `BYPASSRLS` privilege — meaning every tenant could read every other tenant's data.

### Root Cause

The Supabase `postgres` role has `BYPASSRLS` set at the database level. Any query routed through a connection owned by this role ignores all RLS policies. Since Prisma's connection pool uses this role, the `set_config` + RLS approach provided zero isolation in practice.

### Fix

The `$allOperations` handler now:

1. **Checks `EXEMPT_MODELS`** — 19 models without a `tenantId` field pass through without injection (e.g., `Tenant`, `CarrierClient`, `PushToken`, etc.).

2. **Injects `tenantId` into query args** based on operation type:
   - **Reads** (`findMany`, `findFirst`, `findFirstOrThrow`, `count`, `aggregate`, `groupBy`): `args.where = { AND: [{ tenantId }, args.where] }`
   - **findUnique / findUniqueOrThrow**: Prisma requires unique-field-only `where` constraints, so we run the query and then verify `result.tenantId === tenantId`. Cross-tenant results return `null` or throw.
   - **create**: `args.data = { ...args.data, tenantId }`
   - **createMany / createManyAndReturn**: maps over array or spreads into object
   - **update / delete**: `args.where = { ...args.where, tenantId }`
   - **updateMany / deleteMany**: `args.where = { AND: [{ tenantId }, args.where] }`
   - **upsert**: injects into both `args.where` and `args.create`

3. **Keeps `set_config` as defense-in-depth** — every query still runs in a sequential transaction that sets `app.current_tenant_id`, in case future RLS policies are re-enabled.

### Zero-change caller surface

All callers use `createTenantClient(tenantId)` or `getTenantPrisma()` which call `prisma.$extends(withTenantRLS(tenantId))`. The function signature is unchanged. No other files were modified.

## Commits

| Hash | Message |
|------|---------|
| 3cb5038 | feat(quick-207): rewrite withTenantRLS to inject tenantId at application layer |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `apps/web/src/lib/db/extensions/tenant-rls.ts` — verified written and committed at 3cb5038
- TypeScript: `npx tsc --noEmit` passes with zero errors in src/ (3 pre-existing e2e test errors in Playwright spec files unrelated to this change)
- All 16 Prisma operation types handled (findMany, findFirst, findFirstOrThrow, findUnique, findUniqueOrThrow, count, aggregate, groupBy, create, createMany, createManyAndReturn, update, updateMany, upsert, delete, deleteMany)
- 19 EXEMPT_MODELS correctly defined
