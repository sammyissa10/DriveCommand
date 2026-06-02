---
phase: quick-419
plan: 419
subsystem: database-security
tags: [grants, rls, app_user, security, additive]
dependency_graph:
  requires: [quick-414, quick-410]
  provides: [app_user-dml-grants-phase1]
  affects: [database-security, future-phase2-cutover]
tech_stack:
  added: []
  patterns: [supabase-mcp-apply-migration, pg-direct-execute]
key_files:
  created:
    - apps/web/prisma/migrations/20260602000001_phase1_grant_app_user_dml/migration.sql
    - apps/web/prisma/migrations/20260602000001_phase1_grant_app_user_dml/rollback.sql
    - apps/web/scripts/audit/verify-phase1-grants.ts
  modified: []
decisions:
  - Applied migration via direct pg Client using DIRECT_URL (Supabase CLI migration history was out of sync; MCP apply_migration not available as a registered tool in this agent context)
  - 51 target tables in total (49 fully missing + 2 partial: Tenant missing INSERT/UPDATE/DELETE, audit_log missing UPDATE/DELETE)
  - Migration is additive and transactional — DO $$ self-validation block rolls back if any gap remains post-apply
metrics:
  duration: ~20min
  completed: 2026-06-02
  tasks: 2
  files: 3
---

# Quick-419 Phase 1: Grant app_user DML on tenant-scoped tables Summary

Grant app_user SELECT/INSERT/UPDATE/DELETE on all 83 tenant-scoped FORCE-RLS tables in the public schema, closing 51 grant gaps (49 CRITICAL + 2 partial), making the DB ready for a future Phase 2 DATABASE_URL cutover to app_user without changing application behavior.

## Live Audit Results (2026-06-02, pre-migration)

- Total FORCE-RLS tables found: 83
- Tables with ALL four grants: 32
- Tables with at least one gap: 51
  - 49 CRITICAL: missing all 4 grants (SELECT, INSERT, UPDATE, DELETE)
  - Tenant: missing INSERT, UPDATE, DELETE (SELECT existed from Quick-410)
  - audit_log: missing UPDATE, DELETE (SELECT + INSERT existed)

## Section 4.12 Allowlist Exclusions

None of the allowlist tables appeared in the audit (not FORCE-RLS):
- `_prisma_migrations` — excluded by audit query
- `Plan`, `Promo`, `carrier_catalog_meta`, `NotificationTemplate`, `NotificationEmailConfig`, `grid_preference`, `grid_view` — not FORCE-RLS, zero rows in audit results

Zero GRANT statements target any allowlist table.

## Migration Applied

- **Name:** `20260602000001_phase1_grant_app_user_dml`
- **Applied:** 2026-06-02T23:19 UTC
- **Method:** Direct pg Client execute against Supabase production DB using DIRECT_URL
  - Note: Supabase CLI was blocked by migration history mismatch (remote versions not in local). Used direct pg execution as fallback per pattern established in Quick-418. Supabase MCP `apply_migration` was not available as a registered tool in this agent context.
- **Self-validation:** DO $$ block confirmed 0 remaining gaps post-apply

## Verification Results

### verify-phase1-grants.ts
```
Total tenant-scoped tables checked (excluding Section 4.12 allowlist): 83
Tables with ALL four grants: 83
Tables still missing at least one grant: 0
ALL GRANTS PRESENT — Phase 1 complete.
```
Exit code: 0

### app-user-grant-audit.ts (re-run)
```
Tables with ALL four grants: 83
Tables with at least one missing: 0
ACTION LIST: (none — all grants are in place)
```

### Isolation Regression Test (test-advisor-fix-isolation.ts)
Result: 14/15 passing — PASS
- 1 known failure: pooled-reuse pool leak (Quick-411/413 documented deviation, expected)

### TypeScript Baseline
Error count: 38 (vs 35 documented baseline)
- 0 errors in any file touched by this task
- 3-error delta is pre-existing (see feedback_tsc_baseline_errors.md — framer-motion, nuqs, d3-geo missing @types; .next/types/validator.ts cache artifact)
- No regression introduced by this task

### Production Smoke
```
curl -sI https://drivecommand.app/
HTTP/1.1 307 Temporary Redirect → /sign-in
```
Expected behavior (auth gate). Production is healthy, no 5xx.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as specified.

### Method Deviation: Migration Apply

**Found during:** Task 2

**Issue:** Supabase CLI (`supabase db push`) rejected execution because remote migration versions not present in local migrations directory — migration history mismatch from earlier manual Supabase MCP applies.

**Fix:** Applied migration via direct pg Client using `DIRECT_URL` (PostgreSQL direct connection, not pooler). This matches the approach used in Quick-418 for the same issue.

**Impact:** None — migration applied successfully, confirmed by verify script.

## Files Created

- `apps/web/prisma/migrations/20260602000001_phase1_grant_app_user_dml/migration.sql` — Single-transaction GRANT migration with DO $$ self-validation
- `apps/web/prisma/migrations/20260602000001_phase1_grant_app_user_dml/rollback.sql` — Symmetric REVOKE rollback
- `apps/web/scripts/audit/verify-phase1-grants.ts` — Read-only verification script

## Files NOT Touched (Scope Discipline)

- `apps/web/prisma/schema.prisma` — unchanged
- `apps/web/src/lib/db/prisma.ts` — unchanged
- `.env.local` / `DATABASE_URL` — unchanged
- Any application source file, API route, or server action — unchanged

## Next Step

Phase 2 (separate quick task): Flip `DATABASE_URL` in production to `DATABASE_URL_APP_USER` so the application connects as `app_user` with FORCE-RLS enforced. Do NOT chain here.

## Self-Check: PASSED
