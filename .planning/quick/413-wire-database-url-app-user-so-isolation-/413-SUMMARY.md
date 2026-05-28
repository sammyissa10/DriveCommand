---
quick: 413
title: Wire DATABASE_URL_APP_USER so isolation tests run as app_user
date: 2026-05-28
commit: aa73717b
status: COMPLETE with findings
---

## Role State Diagnostic

**STATE: B** — app_user existed with `rolcanlogin = false`. User applied ALTER ROLE manually.

```
rolname  | rolsuper | rolbypassrls | rolcanlogin
---------+----------+--------------+-------------
app_user | false    | false        | true   ← after user applied ALTER ROLE
```

User configured DATABASE_URL_APP_USER in apps/web/.env.local (gitignored — confirmed via `git check-ignore`). Password not printed anywhere in this summary.

---

## Files Created / Modified

| File | Change |
|------|--------|
| `apps/web/scripts/audit/verify-app-user-role.ts` | Created — role-identity and RLS-gating harness |
| `apps/web/scripts/audit/test-advisor-fix-isolation.ts` | Modified — pooled-connection-reuse test added |
| `apps/web/.env.local` | Modified by user — DATABASE_URL_APP_USER added |

**NOT touched:** prisma/schema.prisma, migration files, apps/web/src/lib/db/prisma.ts, application code.

---

## verify-app-user-role.ts — 6/6 PASS

```
[PASS] Connection: client.connect() succeeded
[PASS] Identity: current_user = 'app_user'
[PASS] Privilege: rolsuper = false
[PASS] Privilege: rolbypassrls = false (RLS fires on this connection)
[PASS] RLS WITH context: "Tenant" visible (count=1)
[PASS] RLS WITHOUT context: "Tenant" returns 0 rows when GUC reset to empty string

Results: 6 passed, 0 failed
verify-app-user-role.ts: all assertions passed
```

Note on assertion 5 design: uses `set_config('app.current_tenant_id', '', false)` on the same connection (not a second Client). Reason: pgBouncer Session Pooler does NOT run server_reset_query between client sessions — a fresh `new Client()` can inherit a prior session's backend connection with stale GUC. The role verifier tests the RLS policy (does GUC='' block access?), not pgBouncer reuse behaviour. The pool reuse probe (below) covers that.

---

## test-advisor-fix-isolation.ts — 13/15 blocks pass, 2 known findings

Harness **no longer skips** — runs fully as app_user. 15 total blocks (13 original + 2 new pooled-reuse blocks).

### ✓ Passing blocks (13)

carrier_compliance_alert_log, stops, route_template_stops, carrier_documents — both SELECT isolation and no-context guard PASS for all 4 tables. Tenant — self-read (1 row), no-context guard (0 rows), cross-tenant SELECT blocked — all PASS.

### ✗ Finding 1: TicketMessage — missing GRANT (1 fail)

```
FAIL  TicketMessage — SELECT isolation — error: permission denied for table TicketMessage
```

app_user has no SELECT grant on TicketMessage. All other tested tables have CRUD grants. Fix:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON "TicketMessage" TO app_user;
```

This should be applied in Supabase SQL Editor and tracked as a follow-up migration. Once applied, the TicketMessage SELECT isolation test will pass.

### ✗ Finding 2: POOL LEAK confirmed — critical security finding

```
FAIL  pooled-reuse — POOL LEAK: session GUC bled from c1 to c2 without context reset
      c2 returned 1 rows (= tenant A count) — Quick-411 session-scope assumption is broken
      under pool reuse. Every request MUST call getTenantPrisma() before any query.
```

**What was tested:** node-pg Pool (max=2) through Supabase Session Pooler. c1 set GUC to tenant A (session-scope, FALSE), released, pool churned, c2 acquired WITHOUT calling set_config. c2 saw tenant A's Tenant row (count=1) — the session GUC bled.

**Root cause:** pgBouncer Session Pooler does NOT reset custom GUCs between `pool.connect()`/`release()` cycles. The `pool.on('connect')` handler in prisma.ts initialises GUC to `''` on new TCP connections only — not on pool-reused connections. After release, the physical pgBouncer session remains open with the stale GUC value.

**Impact on production app:** The production app is safe as long as EVERY request calls `getTenantPrisma()` before any tenant-table query. `getTenantPrisma()` overwrites the GUC each request. Any code path that uses bare `prisma` on tenant-scoped tables, or that queries before calling `getTenantPrisma()`, risks inheriting the previous request's tenant context.

**This is an empirical confirmation of the theoretical risk documented in `project_rls_guc_set_config_pattern.md`.** The invariant is no longer "unverified" — it is now verified as VIOLATED under pool reuse. Production safety depends entirely on the application-level invariant (getTenantPrisma() before every query).

**Recommended follow-up task:** Audit all server actions and API routes for bare `prisma` usage on tenant tables. Any file that imports `prisma` directly and queries a table with tenant RLS should be flagged for review.

---

## Follow-up Flag — Spec 2.4 Compliance (Production Role)

```
Current production connection role: postgres
rolbypassrls: TRUE  ←  BYPASSRLS is set
Compliant with Spec 2.4 (must be app_user, no BYPASSRLS): NO
```

**The production app connects as the postgres role (DATABASE_URL = pooler URL with postgres.[ref] username). This role has `rolbypassrls = true`, which means ALL RLS policies are bypassed for production queries.** All of Quick-410/411's FORCE ROW SECURITY and tenant isolation policies are effectively neutered for the production connection. RLS is only tested correctly via app_user (which is what this task wires up for test harnesses).

Recommended follow-up task: Switch DATABASE_URL to authenticate as app_user. Requires:
1. Ensure app_user has grants on ALL tenant tables (audit gaps like TicketMessage above).
2. Switch Prisma's DATABASE_URL to the app_user connection string.
3. Keep a separate admin/migration DATABASE_URL using the postgres role.
4. Verify the production app functions correctly after the switch.

**This task does NOT fix the compliance gap — it only documents it.**

---

## Summary

| Outcome | Detail |
|---------|--------|
| DATABASE_URL_APP_USER wired | Yes — apps/web/.env.local (gitignored, password not logged) |
| Isolation harness skips | No longer — runs fully as app_user |
| verify-app-user-role.ts | 6/6 PASS — app_user identity + RLS gating confirmed |
| TicketMessage SELECT isolation | FAIL — missing GRANT (see SQL above) |
| Pool leak probe | FAIL — session GUC bleeds across pool reuse (confirmed empirically) |
| Spec 2.4 compliance (production) | NO — postgres role has BYPASSRLS=true |
| Commit | aa73717b |
