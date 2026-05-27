---
phase: quick-406
plan: 406
subsystem: database/rls
tags: [rls, security, diagnostic, postgres, supabase]
dependency_graph:
  requires: [quick-402, quick-405]
  provides: [rls-prerequisite-analysis]
  affects: [upcoming advisor RLS fix migration]
tech_stack:
  added: []
  patterns: [safeQuery wrapper, dual-output emit/buf pattern, pg catalog queries with explicit casts]
key_files:
  created:
    - apps/web/scripts/audit/deep-diagnostic-rls-fix.ts
  modified: []
decisions:
  - "current_setting() in TicketMessage policy flagged as NEEDS REVIEW — it is the bypass_rls_policy, not a tenant isolation issue, but must be documented before forcing RLS"
  - "grid_view.userId → public.User.id (not auth.users) means auth.uid() policy would fail — requires custom policy using tenantId or a join to User"
  - "grid_preference.userId has no FK constraint — needs manual schema verification before writing policy"
  - "Tier 4 tables use jwt() and uid() from auth schema — different pattern from current_tenant_id() standard; forcing RLS will interact with existing policies"
  - "current_tenant_id() is SECURITY INVOKER (not DEFINER) — caller context matters when it runs inside policy expressions"
  - "NotificationEmailConfig confirmed SAFE AS GLOBAL_LOOKUP — no tenant/user/owner columns, singleton row design"
metrics:
  duration: "~5 minutes"
  completed: "2026-05-27T16:31:00Z"
  tasks_completed: 1
  files_created: 1
---

# Phase quick-406: Deep Diagnostic — RLS Fix Migration Prerequisites Summary

Read-only five-section PostgreSQL catalog diagnostic that answers the four open dependency questions for the upcoming Supabase advisor RLS remediation migration, with a GO/NO-GO summary written to both console and markdown.

## Script

**File:** `apps/web/scripts/audit/deep-diagnostic-rls-fix.ts`

**Run command (from apps/web/):**
```
npx tsx --env-file=.env.local scripts/audit/deep-diagnostic-rls-fix.ts
```

**Markdown output:** `apps/web/scripts/audit/405c-DEEP-DIAGNOSTIC.md`

## GO / NO-GO Summary (from run on 2026-05-27)

```
1. **RISKY — VERIFY POLICIES**
2. **TENANT FORCE RLS UNSAFE**
3. **carrier_documents: FORCE RLS NEEDS REVIEW — POLICY CALLS uid, jwt**
4. **route_template_stops: FORCE RLS NEEDS REVIEW — POLICY CALLS jwt**
5. **stops: FORCE RLS NEEDS REVIEW — POLICY CALLS jwt, uid**
6. **TicketMessage: FORCE RLS NEEDS REVIEW — POLICY CALLS current_setting**
7. **grid_preference: MANUAL VERIFICATION NEEDED — userId has no FK**
8. **grid_view: AUTH.UID() POLICY WILL FAIL — userId references public.User.id**
9. **SAFE TO TREAT AS GLOBAL_LOOKUP**

**FINAL RECOMMENDATION: NO-GO — address flagged items before writing migration**
```

## Items Requiring Resolution Before Migration

**1. current_tenant_id() is SECURITY INVOKER (not DEFINER)**
The function reads `app.current_tenant_id` from session settings. It is SECURITY INVOKER, meaning it runs as the calling user's role. The Tenant table's only policy (`bypass_rls_policy`) does NOT reference `current_tenant_id()` at all — it uses `app.bypass_rls` instead. The migration author must decide what tenant isolation policy to add to Tenant before FORCE ROW LEVEL SECURITY is enabled.

**2. Tenant table has no tenant-isolation policy**
The single policy on Tenant is a bypass gate (`current_setting('app.bypass_rls') = 'on'`). There is no row-visibility policy scoping tenants to their own row. Adding FORCE RLS without a SELECT policy would lock out all data access on Tenant.

**3. Tier 4 tables use a different RLS idiom**
`carrier_documents`, `route_template_stops`, and `stops` use `auth.jwt() ->> 'org_id'` and `auth.uid()` patterns — not `current_tenant_id()`. These are a different (older) auth schema. Adding FORCE RLS is safe IF the existing policies cover all commands. The migration author should verify there are no uncovered command types (ALL vs explicit SELECT/INSERT/UPDATE/DELETE).

**4. TicketMessage FORCE RLS verdict**
The `current_setting` call in TicketMessage's policy is the `bypass_rls_policy` — not a tenant isolation concern. The `tenant_isolation_policy` on that table DOES reference `current_tenant_id()`. The NEEDS REVIEW flag is technically noise from the bypass policy, but the migration author should confirm this before proceeding.

**5. grid_preference.userId has no FK**
The column exists and is uuid/NOT NULL, but there is no database-level FK constraint enforcing it. An `auth.uid()` policy will still work at runtime (auth.uid() returns the current auth user UUID), but the lack of FK means there is no referential integrity guarantee.

**6. grid_view.userId references public.User (not auth.users)**
An `auth.uid()` policy (`WHERE userId = auth.uid()`) will work at runtime only if `public.User.id` values are the same UUIDs as `auth.users.id`, which is true for Supabase-based user creation. But the FK points to `public.User`, not `auth.users` directly — the migration author must confirm this alignment and write the policy accordingly, or add a join through `public.User`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Prisma deserialization of pg catalog types**
- **Found during:** Task 1 execution
- **Issue:** `pg_proc.provolatile` is PostgreSQL `char` type and `pg_policies.roles` is `name[]` — both crash Prisma's `$queryRawUnsafe` deserializer with "Failed to deserialize column of type 'char'/'Unknown'"
- **Fix:** Added `::text` cast to `provolatile` and `::text[]` cast to `roles` in the SQL queries
- **Files modified:** `apps/web/scripts/audit/deep-diagnostic-rls-fix.ts`
- **Commit:** 36335863 (included in the task commit)

## Self-Check

- [x] `apps/web/scripts/audit/deep-diagnostic-rls-fix.ts` — FOUND
- [x] `apps/web/scripts/audit/405c-DEEP-DIAGNOSTIC.md` — FOUND (written at runtime, not committed)
- [x] Commit 36335863 — FOUND
- [x] Five `## Section N` headers in console output — CONFIRMED
- [x] `## GO / NO-GO SUMMARY` in console output — CONFIRMED
- [x] `**FINAL RECOMMENDATION:**` line present — CONFIRMED
- [x] Zero DDL/DML in script — CONFIRMED (only comment mentions DROP/CREATE)
- [x] Zero `any` types — CONFIRMED

## Self-Check: PASSED
