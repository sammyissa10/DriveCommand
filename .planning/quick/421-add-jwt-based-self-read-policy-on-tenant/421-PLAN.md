---
phase: quick-421
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/scripts/audit/421-tenant-jwt-self-read-policy.sql
  - apps/web/scripts/audit/421-tenant-jwt-self-read-policy-ROLLBACK.sql
  - .planning/quick/421-add-jwt-based-self-read-policy-on-tenant/421-SUMMARY.md
autonomous: true
no_commit: true
no_deploy: true

must_haves:
  truths:
    - "SQL forward file exists at apps/web/scripts/audit/421-tenant-jwt-self-read-policy.sql"
    - "SQL rollback file exists at apps/web/scripts/audit/421-tenant-jwt-self-read-policy-ROLLBACK.sql"
    - "Policy tenant_jwt_self_read exists on public.Tenant in the live Supabase DB"
    - "Policy applies FOR SELECT TO app_user using JWT app_metadata.tenantId"
    - "User is told exactly how to retry login and how to rollback if needed"
  artifacts:
    - path: "apps/web/scripts/audit/421-tenant-jwt-self-read-policy.sql"
      provides: "Forward SQL reference (CREATE POLICY + verify)"
      contains: "CREATE POLICY tenant_jwt_self_read"
    - path: "apps/web/scripts/audit/421-tenant-jwt-self-read-policy-ROLLBACK.sql"
      provides: "Rollback SQL reference (DROP POLICY)"
      contains: "DROP POLICY IF EXISTS tenant_jwt_self_read"
    - path: ".planning/quick/421-add-jwt-based-self-read-policy-on-tenant/421-SUMMARY.md"
      provides: "Outcome record (files, policy state, verification result)"
  key_links:
    - from: "Forward SQL file"
      to: "Supabase live DB"
      via: "Supabase MCP execute_sql tool"
      pattern: "CREATE POLICY tenant_jwt_self_read ON public.\"Tenant\""
    - from: "Login route (app_user role)"
      to: "public.Tenant row"
      via: "auth.jwt() -> app_metadata ->> tenantId"
      pattern: "id = \\(\\(auth\\.jwt\\(\\) -> 'app_metadata' ->> 'tenantId'\\)::uuid\\)"
---

<objective>
Add a SECOND RLS policy `tenant_jwt_self_read` on `public."Tenant"` that uses the JWT `app_metadata.tenantId` claim directly (no GUC dependency), so the login route — which runs under `app_user` BEFORE `set_config('app.current_tenant_id', ...)` has been called — can read its own Tenant row to validate the user's tenantId.

Purpose: Unblock Phase 2 local testing (DATABASE_URL=app_user) by resolving the chicken-and-egg between GUC-based RLS and the login entry point.

Output:
- Forward SQL reference file (apps/web/scripts/audit/421-tenant-jwt-self-read-policy.sql)
- Rollback SQL reference file (apps/web/scripts/audit/421-tenant-jwt-self-read-policy-ROLLBACK.sql)
- Policy applied to live Supabase DB via Supabase MCP
- SUMMARY.md recording outcome
- Clear user instructions printed for next-step verification + rollback path

Non-goals: no git commits, no deploys, no application code changes.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

# Background — why this policy is needed
The existing `tenant_self_read` policy on `public."Tenant"` uses `current_tenant_id()`, which reads a session GUC (`app.current_tenant_id`) that is set by `getTenantPrisma()` after login. During login itself, that GUC has not been set, so the existing policy returns NULL and the SELECT returns zero rows — even when the user's JWT carries the correct `app_metadata.tenantId`.

This plan adds a SECOND, complementary policy that uses the JWT claim directly. RLS combines multiple policies with OR, so existing tenant-scoped reads continue to work via the GUC-based policy for normal traffic, while login gets a working path via the JWT-based policy.

# Pool-leak context (Quick-413) — do NOT regress
GUC bleed across pool.connect()/release() on Supabase Session Pooler is a known issue. This change does NOT touch the GUC path. The new JWT-based policy is read-only, SELECT-only, scoped to `app_user`, and only matches when `auth.jwt() -> 'app_metadata' ->> 'tenantId'` equals `Tenant.id`. It cannot be exploited by a leaked GUC because it does not consult the GUC at all.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write forward + rollback SQL reference files</name>
  <files>
    apps/web/scripts/audit/421-tenant-jwt-self-read-policy.sql
    apps/web/scripts/audit/421-tenant-jwt-self-read-policy-ROLLBACK.sql
  </files>
  <action>
Create the forward SQL file at `apps/web/scripts/audit/421-tenant-jwt-self-read-policy.sql` with exactly:

```sql
BEGIN;

CREATE POLICY tenant_jwt_self_read ON public."Tenant"
  FOR SELECT TO app_user
  USING (id = ((auth.jwt() -> 'app_metadata' ->> 'tenantId')::uuid));

-- Verify policy exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'Tenant' AND policyname = 'tenant_jwt_self_read'
  ) THEN
    RAISE EXCEPTION 'tenant_jwt_self_read policy missing after CREATE';
  END IF;
END $$;

COMMIT;
```

Create the rollback file at `apps/web/scripts/audit/421-tenant-jwt-self-read-policy-ROLLBACK.sql` with exactly:

```sql
BEGIN;
DROP POLICY IF EXISTS tenant_jwt_self_read ON public."Tenant";
COMMIT;
```

These are REFERENCE files only — they will not be executed locally. They are kept in `scripts/audit/` to match the audit-script convention used by Quick-417/418/419 so the policy change is traceable in code review.

Do NOT git-add or commit these files. Just write them to disk.
  </action>
  <verify>
Both files exist on disk and contain the exact SQL bodies above. Run:
```
ls apps/web/scripts/audit/421-tenant-jwt-self-read-policy*.sql
```
Expected: both files listed.
  </verify>
  <done>
- apps/web/scripts/audit/421-tenant-jwt-self-read-policy.sql exists and contains the CREATE POLICY + verify DO block.
- apps/web/scripts/audit/421-tenant-jwt-self-read-policy-ROLLBACK.sql exists and contains the DROP POLICY statement.
- No git operations performed.
  </done>
</task>

<task type="auto">
  <name>Task 2: Apply policy to live Supabase DB via Supabase MCP and verify</name>
  <files>
    (none — DB-only change via Supabase MCP)
  </files>
  <action>
Use the Supabase MCP `execute_sql` tool to apply the policy directly. Do NOT use `apply_migration` — this is a non-migration, ad-hoc policy add (consistent with quick-task convention; the SQL reference file is the audit trail).

Step 2a — Apply the policy:
```sql
CREATE POLICY tenant_jwt_self_read ON public."Tenant"
  FOR SELECT TO app_user
  USING (id = ((auth.jwt() -> 'app_metadata' ->> 'tenantId')::uuid));
```

Step 2b — Verify the policy exists with the correct shape:
```sql
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE tablename = 'Tenant'
ORDER BY policyname;
```

Expected rows: at least `tenant_self_read` (pre-existing, GUC-based) AND `tenant_jwt_self_read` (new, JWT-based). The new row must show:
- cmd = SELECT
- roles contains `app_user`
- qual references `auth.jwt()` and `app_metadata` and `tenantId`

Error handling:
- If Step 2a fails with "policy ... already exists" — that is acceptable. Skip to Step 2b and confirm the row is present. Note in summary that policy already existed.
- If Step 2a fails for ANY other reason — immediately run the rollback via Supabase MCP `execute_sql`:
  ```sql
  DROP POLICY IF EXISTS tenant_jwt_self_read ON public."Tenant";
  ```
  Then report the original error verbatim and STOP. Do not proceed to Task 3 or Task 4.

Capture the verify-query output verbatim for inclusion in the SUMMARY (Task 4).
  </action>
  <verify>
The verify SELECT against `pg_policies` returns a row where:
- tablename = 'Tenant'
- policyname = 'tenant_jwt_self_read'
- cmd = 'SELECT'
- roles array includes 'app_user'
- qual contains 'app_metadata' and 'tenantId'
  </verify>
  <done>
- Policy `tenant_jwt_self_read` exists on `public."Tenant"` in the live Supabase DB.
- pg_policies output captured for SUMMARY.
- Pre-existing `tenant_self_read` policy still present (untouched).
- No code changes, no commits, no deploys.
  </done>
</task>

<task type="auto">
  <name>Task 3: Print user instructions for retry + rollback</name>
  <files>
    (none — text output only)
  </files>
  <action>
Print this exact block in the assistant's final text output (after Task 4's SUMMARY is written):

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

This block MUST appear verbatim in the final assistant response. No paraphrasing.
  </action>
  <verify>
Final assistant text response contains the block above verbatim, including both numbered list and rollback instructions.
  </verify>
  <done>
User has clear, copy-pasteable next steps and rollback path printed in the response.
  </done>
</task>

<task type="auto">
  <name>Task 4: Write 421-SUMMARY.md</name>
  <files>
    .planning/quick/421-add-jwt-based-self-read-policy-on-tenant/421-SUMMARY.md
  </files>
  <action>
Write `.planning/quick/421-add-jwt-based-self-read-policy-on-tenant/421-SUMMARY.md` documenting:

1. **What was done** — JWT-based self-read policy added to public."Tenant" to unblock login under app_user.

2. **Why** — Existing `tenant_self_read` uses `current_tenant_id()` (GUC), but login runs before the GUC is set. The new `tenant_jwt_self_read` reads `auth.jwt() -> 'app_metadata' ->> 'tenantId'` directly, so login can validate the Tenant row from the JWT alone.

3. **Files created (reference only, not committed)**:
   - `apps/web/scripts/audit/421-tenant-jwt-self-read-policy.sql`
   - `apps/web/scripts/audit/421-tenant-jwt-self-read-policy-ROLLBACK.sql`

4. **DB change applied** — Include the exact SQL that was executed via Supabase MCP and the verbatim output of the `pg_policies` verify query from Task 2b. Note whether the policy was created fresh or already existed.

5. **Security note** — The new policy is SELECT-only, scoped to `app_user`, and matches only when `Tenant.id` equals the JWT's `app_metadata.tenantId`. It does not use the GUC, so it is not affected by the Quick-413 pool-leak concern. It is strictly additive — RLS OR-combines policies, so existing tenant-scoped behavior is unchanged.

6. **Next steps** — Pasted user instructions block from Task 3 (browser reload + retry login + rollback path).

7. **No-commit / no-deploy** — Confirm: no git commit, no `vercel --prod`, no `git push`. This is a live-DB-only change for Phase 2 local testing.

Use markdown headings. Keep it concise (under ~80 lines).
  </action>
  <verify>
File exists at `.planning/quick/421-add-jwt-based-self-read-policy-on-tenant/421-SUMMARY.md` and contains all 7 sections above with the verbatim pg_policies output from Task 2.
  </verify>
  <done>
SUMMARY.md written and contains: what/why, files created, applied SQL, pg_policies verify output, security note, next steps, no-commit confirmation.
  </done>
</task>

</tasks>

<verification>
End-state checks (run after all tasks):

1. **Files on disk**:
   ```
   ls apps/web/scripts/audit/421-tenant-jwt-self-read-policy*.sql
   ls .planning/quick/421-add-jwt-based-self-read-policy-on-tenant/421-SUMMARY.md
   ```
   All three files present.

2. **DB policy applied** (via Supabase MCP execute_sql):
   ```sql
   SELECT policyname FROM pg_policies
   WHERE tablename = 'Tenant' AND policyname = 'tenant_jwt_self_read';
   ```
   Returns exactly one row.

3. **No git mutations**:
   ```
   git status --short
   ```
   Shows the 3 new files as untracked (??) — not staged, not committed.

4. **User instructions printed** in the final assistant response.
</verification>

<success_criteria>
- Both SQL reference files exist on disk with the exact content specified.
- `tenant_jwt_self_read` policy exists on `public."Tenant"` in live Supabase DB, scoped FOR SELECT TO app_user, using the JWT app_metadata.tenantId expression.
- pg_policies verify query output captured in SUMMARY.md.
- Pre-existing `tenant_self_read` policy is untouched (still present, still GUC-based).
- 421-SUMMARY.md written with all 7 sections.
- User instructions block printed verbatim in final response.
- No git commits, no `git push`, no `vercel --prod`.
</success_criteria>

<output>
After completion, the following must exist:
- `apps/web/scripts/audit/421-tenant-jwt-self-read-policy.sql` (reference, uncommitted)
- `apps/web/scripts/audit/421-tenant-jwt-self-read-policy-ROLLBACK.sql` (reference, uncommitted)
- `.planning/quick/421-add-jwt-based-self-read-policy-on-tenant/421-SUMMARY.md` (uncommitted)
- New RLS policy `tenant_jwt_self_read` on `public."Tenant"` in Supabase

And the assistant's final text response must contain the verbatim user-instructions block from Task 3.
</output>
