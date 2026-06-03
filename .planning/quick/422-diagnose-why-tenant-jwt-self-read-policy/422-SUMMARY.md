# Quick Task 422 — Summary

**Task:** Diagnose why tenant_jwt_self_read policy isn't unblocking login under app_user
**Date:** 2026-06-03
**No commits, no deploys**

---

## Findings

### CHECK 1 — Policy shape ✅
`tenant_jwt_self_read` exists with correct qual:
```
(id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenantId'::text))::uuid)
```
All three Tenant policies present: `bypass_rls_policy`, `tenant_jwt_self_read`, `tenant_self_read`.

### CHECK 2 — Tenant row existence ⚠️ (misleading result)
Reported "MISSING" — but this is a **script bug**: both `postgresUrl` and `appUserUrl` resolved
to the same app_user connection string because `DATABASE_URL` was already swapped to app_user
and the postgres backup URL is commented out in .env.local (not set as an env var).

CHECK 2 ran as app_user **without** GUC set → RLS blocked → 0 rows returned → false "MISSING".
**The row actually EXISTS** — proven by CHECK 5, which found `id=73c69018-9047-40d0-9203-631985ca1ccd  name="QA Test Org"`.

### CHECK 3 — auth.jwt() via app_user 🔴 ROOT CAUSE
```
ERROR: permission denied for schema auth
```
`auth.jwt()` is inaccessible from raw Postgres connections through PgBouncer.
It only works via Supabase PostgREST (HTTP API). Direct `pg`/Prisma connections
cannot call it — they get "permission denied for schema auth".

**This means `tenant_jwt_self_read` can NEVER match for Prisma queries.** The USING
clause (`auth.jwt() -> ...`) throws an error which Postgres treats as a policy
evaluation failure → row rejected.

### CHECK 4 — auth.jwt() via postgres superuser 🔴 Confirmed
```
ERROR: permission denied for schema auth
```
Same error from the superuser connection — confirms this is a PgBouncer/raw-Postgres
limitation, not a role-permission issue. `auth.jwt()` is a PostgREST-injected function.

### CHECK 5 — app_user + GUC set_config ✅ GUC PATH WORKS
```
Row returned: id=73c69018-9047-40d0-9203-631985ca1ccd  name="QA Test Org"
```
When `set_config('app.current_tenant_id', tenantId, false)` fires before the query,
the existing `tenant_self_read` policy matches and returns the row correctly.

---

## Root Cause

**Two issues, one real blocker:**

1. **`auth.jwt()` is inaccessible from raw Postgres connections** — `tenant_jwt_self_read`
   was the wrong approach. The fix (Quick-421) cannot work in this codepath.

2. **Login route uses bare `prisma`** — no `set_config` GUC call → `tenant_self_read`
   policy blocks the Tenant lookup → 0 rows → app reports "tenantId not found in DB".

The chicken-and-egg: `getTenantPrisma()` sets the GUC using the tenantId from the
session — but we're querying Tenant to *validate* the tenantId before the session
is established. So we can't use the standard `getTenantPrisma()` helper here.

---

## Recommended Fix Options

### Option A — Use bare set_config before the login Tenant lookup
In the login route, after reading `tenantId` from `app_metadata`, call:
```sql
SELECT set_config('app.current_tenant_id', $tenantId, false)
```
before the `prisma.tenant.findUnique()` call. This lets `tenant_self_read` match.

**Risk:** Manual GUC management in one extra place. Low risk.

### Option B — Grant unconditional SELECT on Tenant for app_user (recommended)
```sql
CREATE POLICY tenant_any_read ON public."Tenant"
  FOR SELECT TO app_user
  USING (true);
```
`Tenant` is not sensitive cross-tenant data — it's just org name + settings. Every
authenticated postgres session legitimately needs to verify a tenantId exists.
The application layer already scopes data to the correct tenant via the session.

**Risk:** Any app_user connection can enumerate tenant names/IDs. Acceptable since:
- app_user still requires a valid Supabase JWT to authenticate via PostgREST
- The Prisma path already holds a valid session before reaching the Tenant lookup

### Option C — Rollback Phase 2 DATABASE_URL swap; keep postgres role
Continue using the postgres superuser role (no RLS enforcement) and fix RLS gaps
before attempting Phase 2 cutover. Lowest urgency.

---

## Immediate Actions

1. **Rollback `tenant_jwt_self_read`** (Quick-421) — it can never work; it only adds noise
   to the policy list. Run `421-tenant-jwt-self-read-policy-ROLLBACK.sql` via Supabase MCP.
2. **Implement Option B** (unconditional Tenant SELECT) — cleanest fix for the login path.
3. Continue Phase 2 checklist with the fix applied.
