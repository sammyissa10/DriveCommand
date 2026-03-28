---
phase: quick-115
plan: "01"
subsystem: database-security
tags: [rls, prisma, supabase, security, migrations]
dependency_graph:
  requires: []
  provides: [rls-enabled-prisma-migrations, rls-enabled-tenant]
  affects: [supabase-security-advisor]
tech_stack:
  added: []
  patterns: [row-level-security, bypass-rls-policy]
key_files:
  created:
    - apps/web/prisma/migrations/20260328000001_enable_rls_prisma_migrations_and_tenant/migration.sql
  modified: []
decisions:
  - "_prisma_migrations gets no bypass_rls_policy — Prisma migration runner uses a direct DB connection (database owner), which bypasses RLS automatically without a policy"
  - "Tenant gets bypass_rls_policy only — no tenant_isolation_policy because Tenant is not tenant-scoped client data"
metrics:
  duration: "23s"
  completed: "2026-03-28"
  tasks_completed: 1
  files_changed: 1
---

# Quick-115: Enable RLS on _prisma_migrations and Tenant — Summary

**One-liner:** RLS enablement migration for `_prisma_migrations` (no policies) and `Tenant` (bypass_rls_policy only) to silence Supabase security advisor warnings on server-only tables.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create RLS migration for _prisma_migrations and Tenant | b8ba5d1 | apps/web/prisma/migrations/20260328000001_.../migration.sql |

## What Was Built

A single Prisma migration file that enables Row Level Security on two internal tables that were previously flagged by the Supabase security advisor:

**`_prisma_migrations`** — RLS enabled, no policies. The Prisma migration runner connects as the database owner via a direct connection (not the Supabase pooler), so it inherently bypasses RLS. No policy needed.

**`Tenant`** — RLS enabled, `bypass_rls_policy` only. All server-side Prisma queries set `app.bypass_rls = 'on'` in the connection context, which this policy permits. No `tenant_isolation_policy` is added because Tenant is not tenant-scoped data accessed by the Supabase client.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- [x] Migration file exists at `apps/web/prisma/migrations/20260328000001_enable_rls_prisma_migrations_and_tenant/migration.sql`
- [x] Contains `ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY`
- [x] Contains `ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY`
- [x] Contains `bypass_rls_policy` for Tenant only
- [x] No permissive policies on `_prisma_migrations`

## Next Step

Run `npx prisma migrate deploy` in `apps/web` to apply the migration to the Supabase database. The security advisor warnings for `_prisma_migrations` and `Tenant` will be resolved after the migration is applied.

## Self-Check: PASSED

- File exists: `apps/web/prisma/migrations/20260328000001_enable_rls_prisma_migrations_and_tenant/migration.sql` — FOUND
- Commit b8ba5d1 — FOUND
