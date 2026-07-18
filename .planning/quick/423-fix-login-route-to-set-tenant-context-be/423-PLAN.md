---
phase: quick-423
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/auth/login/route.ts
autonomous: true

must_haves:
  truths:
    - "Login route sets app.current_tenant_id before querying Tenant table"
    - "Under app_user DATABASE_URL, tenant_self_read policy matches the row and login succeeds"
    - "Quick-421's tenant_jwt_self_read policy is dropped from the database (dead code removed)"
    - "tenant-not-found 403 path still returns when tenantId is genuinely missing"
    - "No new policies added to Tenant; tenant_self_read and bypass_rls_policy unchanged"
  artifacts:
    - path: "apps/web/src/app/api/auth/login/route.ts"
      provides: "Login route with GUC set before Tenant.findUnique"
      contains: "set_config('app.current_tenant_id'"
    - path: "apps/web/scripts/audit/421-tenant-jwt-self-read-policy-ROLLBACK.sql"
      provides: "Rollback SQL to drop tenant_jwt_self_read policy (already exists, just executed)"
      contains: "DROP POLICY IF EXISTS tenant_jwt_self_read"
  key_links:
    - from: "apps/web/src/app/api/auth/login/route.ts"
      to: "Postgres GUC app.current_tenant_id"
      via: "prisma.$transaction with set_config + Tenant.findUnique in same tx"
      pattern: "set_config\\('app.current_tenant_id'"
    - from: "Tenant RLS policy tenant_self_read"
      to: "current_setting('app.current_tenant_id')"
      via: "policy USING clause reading session/tx-scoped GUC"
      pattern: "current_setting"
---

<objective>
Fix the login route so it sets the `app.current_tenant_id` Postgres GUC BEFORE running `prisma.tenant.findUnique()`. Under Phase 2 (DATABASE_URL pointing at app_user), the `tenant_self_read` RLS policy on Tenant only returns the row when `current_setting('app.current_tenant_id')` matches `id`. Without the GUC, the query returns zero rows and login fails with a bogus "Account not found" 403.

Also drop the dead `tenant_jwt_self_read` policy added in Quick-421 — it uses `auth.jwt()` which is inaccessible from raw Postgres/PgBouncer connections, so it can never match.

Purpose: Unblock Phase 2 (app_user cutover) of the RLS isolation harness without weakening the Tenant table's RLS surface. Surgical, minimal change — no policy refactors, no new `USING (true)` escape hatches.

Output:
- Updated `apps/web/src/app/api/auth/login/route.ts` that wraps the Tenant lookup in a transaction with the tenant GUC set first.
- `tenant_jwt_self_read` policy dropped from the live database via the existing rollback SQL.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/app/api/auth/login/route.ts
@apps/web/src/lib/context/tenant-context.ts
@apps/web/scripts/audit/421-tenant-jwt-self-read-policy-ROLLBACK.sql

# Background context (from Quick-422 diagnosis)
# - Under app_user, `prisma.tenant.findUnique({ where: { id: tenantId } })` returns null
#   because tenant_self_read policy checks current_setting('app.current_tenant_id') which is unset.
# - When wrapped in a tx that runs `set_config('app.current_tenant_id', $1, TRUE)` first,
#   the same query returns the row. Quick-422 confirmed this empirically.
# - The `tenantRawQuery` helper in tenant-context.ts already demonstrates the exact pattern.
# - Quick-421 attempted a JWT-based fallback policy (`tenant_jwt_self_read`) but `auth.jwt()`
#   returns NULL on raw Postgres connections, so the policy is dead code.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wrap Tenant.findUnique in tenant-scoped transaction</name>
  <files>apps/web/src/app/api/auth/login/route.ts</files>
  <action>
Modify ONLY the `if (appMeta.tenantId && !appMeta.isSystemAdmin)` block (lines 68-83 in current file) so the `prisma.tenant.findUnique` call runs inside a `prisma.$transaction` that first sets the `app.current_tenant_id` GUC at transaction scope.

Reference the exact pattern already used by `tenantRawQuery` in `apps/web/src/lib/context/tenant-context.ts` (lines 73-79) and the OWNER activation check already present in this same file (lines 142-148) which uses the same `prisma.$transaction(async (tx) => { await tx.$executeRaw\`SELECT set_config(...)\`; return tx.MODEL.findUnique(...) }, TX_OPTIONS)` shape.

Required change (surgical, no other edits):

```ts
// BEFORE (current, broken under app_user):
const tenant = await prisma.tenant.findUnique({
  where: { id: appMeta.tenantId as string },
  select: { isActive: true },
});

// AFTER (fixed):
const tenant = await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${appMeta.tenantId as string}, TRUE)`;
  return tx.tenant.findUnique({
    where: { id: appMeta.tenantId as string },
    select: { isActive: true },
  });
}, TX_OPTIONS);
```

Rules:
- Use TRUE (transaction scope), NOT false (session scope). The session-scope path leaks across pooled connections per the Quick-413 finding documented in project memory.
- `TX_OPTIONS` is already imported from `@/lib/db/prisma` on line 6 — do NOT re-import.
- Use parameterized interpolation with the tagged-template `$executeRaw` (NOT `$executeRawUnsafe`) — matches the OWNER activation block's style and avoids SQL injection.
- Do NOT touch the rest of the route. Specifically:
  - Do NOT change the dbUser lookup (it queries User table by id, RLS-allowlisted via user_self_read or similar — out of scope).
  - Do NOT change the rate-limit, signInWithPassword, suspended-tenant signOut, or deactivated-user flows.
  - Do NOT change the OWNER activation block (lines 140-159) — already correct.
  - Do NOT refactor logger calls, response shapes, or redirect logic.
- Keep the existing 403 "Account not found. Please contact support." error path for `if (!tenant)` intact — same condition, same error response.
- Preserve the existing suspended-tenant flow for `if (!tenant.isActive)` exactly as written.

After the edit, run `cd apps/web; npx tsc --noEmit` and confirm zero NEW errors introduced (baseline of 35 pre-existing errors per project memory is acceptable; only flag regressions in route.ts or its imports).
  </action>
  <verify>
1. Read the edited file and confirm the Tenant lookup is wrapped in `prisma.$transaction` with `set_config('app.current_tenant_id', ..., TRUE)` running before `tx.tenant.findUnique`.
2. Run `cd apps/web; npx tsc --noEmit 2>&1 | grep -E "src/app/api/auth/login/route.ts"` — must return no new errors for this file.
3. Visually confirm no other lines in route.ts changed (use `git diff apps/web/src/app/api/auth/login/route.ts` and verify the diff is localized to the Tenant lookup block + nothing else).
  </verify>
  <done>
- `apps/web/src/app/api/auth/login/route.ts` contains a `prisma.$transaction` that sets `app.current_tenant_id` via tagged `$executeRaw` before calling `tx.tenant.findUnique`.
- Transaction uses `TX_OPTIONS` and tx-scope (TRUE) for `set_config`.
- No other code in the route is modified.
- `tsc --noEmit` shows no new errors attributable to this change.
  </done>
</task>

<task type="auto">
  <name>Task 2: Drop dead tenant_jwt_self_read policy from database</name>
  <files>apps/web/scripts/audit/421-tenant-jwt-self-read-policy-ROLLBACK.sql</files>
  <action>
Execute the existing rollback SQL at `apps/web/scripts/audit/421-tenant-jwt-self-read-policy-ROLLBACK.sql` against the live Supabase database to drop the dead `tenant_jwt_self_read` policy on the Tenant table. The file is already written (3 lines: BEGIN; DROP POLICY IF EXISTS tenant_jwt_self_read ON public."Tenant"; COMMIT;).

Execution method — use the Supabase MCP `apply_migration` tool (or equivalent SQL execution path) with this exact migration name and body:

- Migration name: `quick_423_rollback_tenant_jwt_self_read`
- SQL body (copy verbatim from the .sql file):
  ```
  DROP POLICY IF EXISTS tenant_jwt_self_read ON public."Tenant";
  ```
  (The Supabase apply_migration wrapper manages its own transaction, so omit BEGIN/COMMIT from the apply_migration payload.)

After applying, verify the policy is gone:

```sql
SELECT policyname FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'Tenant'
ORDER BY policyname;
```

Expected result: `tenant_self_read`, `bypass_rls_policy` (and any pre-existing Tenant policies) — but NOT `tenant_jwt_self_read`.

Do NOT:
- Modify, recreate, or replace tenant_self_read.
- Modify bypass_rls_policy.
- Add any new policy with `USING (true)` or `USING (auth.jwt() ...)`.
- Touch any other table's policies.
- Run a Prisma migration (this is an out-of-band RLS rollback, not a schema change).
- Edit the .sql file itself — it stays in scripts/audit/ as the audit trail of what was executed.
  </action>
  <verify>
1. Run via Supabase MCP `execute_sql`:
   ```sql
   SELECT policyname FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'Tenant'
   ORDER BY policyname;
   ```
   Confirm `tenant_jwt_self_read` is NOT in the result set.
2. Confirm `tenant_self_read` IS still in the result set (untouched).
3. Confirm `bypass_rls_policy` IS still in the result set (untouched).
  </verify>
  <done>
- `tenant_jwt_self_read` policy no longer exists on the Tenant table in the Supabase database.
- `tenant_self_read` and `bypass_rls_policy` policies remain intact and unmodified.
- Rollback SQL file at `apps/web/scripts/audit/421-tenant-jwt-self-read-policy-ROLLBACK.sql` is unmodified (kept as audit trail).
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Verify login succeeds under app_user DATABASE_URL</name>
  <what-built>
- Login route now sets `app.current_tenant_id` GUC inside a transaction before querying the Tenant table.
- Dead `tenant_jwt_self_read` policy dropped from the database.
- No other policy or code changes.
  </what-built>
  <how-to-verify>
1. Ensure your local `apps/web/.env.local` `DATABASE_URL` is pointing at the **app_user** role (Phase 2 cutover URL from Quick-420). If it's still on the postgres superuser, swap it now per the Quick-420 checklist.

2. Restart the local dev server:
   ```
   cd apps/web
   npm run dev
   ```

3. Open `http://localhost:3000/login` in a browser.

4. Log in as a non-sysadmin OWNER user (any existing tenant owner account works). Use the Quick-422 test user if you set one up, otherwise any seeded OWNER from a tenant whose `isActive = true`.

5. Expected results:
   - [ ] Login returns 200 (not 403, not 500).
   - [ ] Browser redirects to either `/carrier/dashboard` (if activated) or `/onboarding/welcome` (if owner not activated).
   - [ ] Server logs do NOT contain the line `"Login: tenantId in app_metadata not found in DB"`.
   - [ ] You can navigate to a few tenant-scoped pages (e.g., `/owner/loads`, `/owner/drivers`) and data renders correctly (proves getTenantPrisma() RLS path still works alongside the login fix).

6. Negative test (optional, recommended):
   - Log out, then attempt to log in as a sysadmin — confirm sysadmin path (which skips the Tenant lookup entirely) still works and redirects to `/admin-dashboard`.

7. Confirm no regression for the existing tenant-not-found error path:
   - This is hard to test without a fake user, so spot-check the diff one more time: the `if (!tenant)` 403 branch is still present and unchanged.

If any step fails, paste the server log line + browser network response and we'll diagnose before committing.
  </how-to-verify>
  <resume-signal>Type "approved" once login works on app_user, or paste failing output.</resume-signal>
</task>

</tasks>

<verification>
- `git diff apps/web/src/app/api/auth/login/route.ts` shows ONLY the Tenant lookup wrapped in a `prisma.$transaction` with `set_config('app.current_tenant_id', ..., TRUE)`. No other lines changed.
- Supabase `pg_policies` query confirms `tenant_jwt_self_read` is absent from Tenant, and `tenant_self_read` + `bypass_rls_policy` remain.
- Manual login against a local dev server using app_user `DATABASE_URL` succeeds for an OWNER user and redirects correctly.
- `tsc --noEmit` shows no new errors in `apps/web/src/app/api/auth/login/route.ts`.
</verification>

<success_criteria>
- Phase 2 (app_user DATABASE_URL) login no longer 403s with "Account not found."
- The fix is surgical: one tx wrap in the login route + one DROP POLICY in the database. Nothing else.
- The tenant_self_read policy and Tenant RLS surface are unchanged — no new escape hatches.
- The dead tenant_jwt_self_read policy is removed.
- Per task constraints: NO commit, NO push, NO deploy. Changes stay local for Phase 2 testing only.
</success_criteria>

<output>
After completion, create `.planning/quick/423-fix-login-route-to-set-tenant-context-be/423-SUMMARY.md` documenting:
- Exact diff applied to login/route.ts (before/after snippet)
- Confirmation that tenant_jwt_self_read policy was dropped (with pg_policies result before/after)
- Result of local login test under app_user DATABASE_URL
- Reminder: changes are uncommitted; commit + push are explicitly excluded from this quick task.
</output>
