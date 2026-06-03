---
quick_task: 422
description: "Diagnose why tenant_jwt_self_read policy isn't unblocking login under app_user — 5-check read-only diagnostic script"
no_commit: true
no_deploy: true
mode: quick
---

# Quick Task 422 — Plan

## Goal

Find the root cause of login failure under app_user Phase 2 test, despite tenant_jwt_self_read policy existing. Candidate causes: auth.jwt() returns NULL via Prisma connection; row missing from Tenant table; GUC-based path already works.

## Tasks

### Task 1 — Write diagnostic script
- **File:** `apps/web/scripts/audit/422-diagnose-tenant-policy.ts`
- **Content:** 5-check TypeScript script using pg (direct Postgres) connections:
  1. CHECK 1 — pg_policies for all Tenant policies (verify shape)
  2. CHECK 2 — Tenant row existence for 73c69018-9047-40d0-9203-631985ca1ccd (bypass RLS via postgres)
  3. CHECK 3 — auth.jwt() via app_user connection (expect NULL — Prisma is raw Postgres, no Supabase JWT)
  4. CHECK 4 — auth.jwt() via postgres superuser connection (compare)
  5. CHECK 5 — app_user SELECT from Tenant when GUC set_config fires first (tests tenant_self_read path)

### Task 2 — Run the script and capture output
- Run: `npx tsx apps/web/scripts/audit/422-diagnose-tenant-policy.ts`
- Report full console output with all 5 check verdicts

### Task 3 — Print final verdict and recommended next step

### Task 4 — Write 422-SUMMARY.md
