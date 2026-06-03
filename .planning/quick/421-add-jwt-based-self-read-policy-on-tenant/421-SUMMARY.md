---
phase: quick-421
plan: 01
subsystem: database/rls
tags: [rls, supabase, app_user, jwt, tenant, login]
no_commit: true
no_deploy: true
completed: 2026-06-02
---

# Quick-421: Add JWT-Based Self-Read Policy on Tenant — Summary

**One-liner:** Added `tenant_jwt_self_read` SELECT policy on `public."Tenant"` for `app_user`, reading `auth.jwt() -> app_metadata ->> tenantId` directly so the login route can validate the Tenant row before the GUC is set.

---

## What Was Done

Added a second RLS policy `tenant_jwt_self_read` on `public."Tenant"` that uses the JWT `app_metadata.tenantId` claim directly, rather than the `current_tenant_id()` GUC function used by the existing `tenant_self_read` policy.

This unblocks Phase 2 local testing (DATABASE_URL=app_user) where the login route hits `public."Tenant"` before `getTenantPrisma()` has called `set_config('app.current_tenant_id', ...)`.

---

## Why This Was Needed

The existing `tenant_self_read` policy uses `current_tenant_id()`, which reads the session GUC `app.current_tenant_id`. During login, that GUC has not been set yet — so `current_tenant_id()` returns NULL and the SELECT returns zero rows, even when the user's JWT carries the correct `app_metadata.tenantId`. Result: login fails under `app_user` with a "Tenant not found" error.

RLS combines multiple policies with OR, so adding a JWT-based policy gives login a working read path without touching or removing the GUC-based policy used by all other tenant-scoped traffic.

---

## Files Created (Reference Only — Not Committed)

| File | Purpose |
|------|---------|
| `apps/web/scripts/audit/421-tenant-jwt-self-read-policy.sql` | Forward SQL: CREATE POLICY + DO block verify |
| `apps/web/scripts/audit/421-tenant-jwt-self-read-policy-ROLLBACK.sql` | Rollback SQL: DROP POLICY IF EXISTS |

These are audit trail files matching the convention from Quick-417/418/419. They were written to disk only — no `git add`, no commit.

---

## DB Change Applied

**SQL executed via pg client (postgres direct connection):**

```sql
CREATE POLICY tenant_jwt_self_read ON public."Tenant"
  FOR SELECT TO app_user
  USING (id = ((auth.jwt() -> 'app_metadata' ->> 'tenantId')::uuid));
```

**Result:** Policy already existed (created in a prior session) — `CREATE POLICY` returned "already exists". Skipped to verification.

---

## pg_policies Verify Output

```json
[
  {
    "policyname": "bypass_rls_policy",
    "cmd": "ALL",
    "roles": "{public}",
    "qual": "(current_setting('app.bypass_rls'::text, true) = 'on'::text)"
  },
  {
    "policyname": "tenant_jwt_self_read",
    "cmd": "SELECT",
    "roles": "{app_user}",
    "qual": "(id = (((auth.jwt() -> 'app_metadata'::text) ->> 'tenantId'::text))::uuid)"
  },
  {
    "policyname": "tenant_self_read",
    "cmd": "SELECT",
    "roles": "{public}",
    "qual": "(id = current_tenant_id())"
  }
]
```

Confirmed:
- `tenant_jwt_self_read` — cmd=SELECT, roles={app_user}, qual references `auth.jwt()` and `app_metadata` and `tenantId`. CORRECT.
- `tenant_self_read` — still present, still GUC-based. UNTOUCHED.
- `bypass_rls_policy` — still present. UNTOUCHED.

---

## Security Note

The new policy is:
- **SELECT-only** — cannot be used to write, update, or delete.
- **Scoped to `app_user`** — only the restricted DB role can invoke it; the postgres superuser bypasses RLS entirely.
- **Match-only on JWT claim** — `Tenant.id` must equal `auth.jwt() -> 'app_metadata' ->> 'tenantId'`. A user cannot read another tenant's row through this policy.
- **GUC-independent** — not affected by the Quick-413 pool-leak concern. The existing GUC-based `tenant_self_read` is unchanged; this policy is strictly additive.

---

## Next Steps

```
Policy applied. Now in your browser:
  1. Hard reload the local app (Ctrl+Shift+R)
  2. Try logging in as owner@test.com / TestPass123! again
  3. If login succeeds, continue through the Phase 2 checklist
  4. Report what happens

TO ROLLBACK THIS POLICY if needed:
  Run apps/web/scripts/audit/421-tenant-jwt-self-read-policy-ROLLBACK.sql
  via Supabase MCP execute_sql
```

---

## No-Commit / No-Deploy Confirmation

- No `git add` — files are untracked (`??` in `git status`)
- No `git commit` — zero new commits
- No `git push` — nothing pushed to GitHub
- No `vercel --prod` — no deployment triggered
- Change is live-DB-only, applied directly for Phase 2 local testing purposes
