---
phase: quick-413
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/.env.local
  - apps/web/scripts/audit/verify-app-user-role.ts
  - apps/web/scripts/audit/test-advisor-fix-isolation.ts
autonomous: false  # Has STOP gate for role state B/C confirmation

must_haves:
  truths:
    - "app_user Postgres role exists and can log in"
    - "DATABASE_URL_APP_USER resolves to a connection authenticated as app_user (no BYPASSRLS)"
    - "verify-app-user-role.ts proves current_user = app_user and rolbypassrls = false"
    - "verify-app-user-role.ts proves tenant context gates SELECT visibility (with context = rows, without = 0 rows)"
    - "test-advisor-fix-isolation.ts no longer skips — runs and passes"
    - "The pooled-connection-reuse test proves session GUC does not leak across pool acquires"
    - "Existing 17 DatabaseSecurity isolation tests run (not skip) and pass"
    - ".env.local remains gitignored; no password committed anywhere"
  artifacts:
    - path: "apps/web/.env.local"
      provides: "DATABASE_URL_APP_USER env var"
      contains: "DATABASE_URL_APP_USER="
    - path: "apps/web/scripts/audit/verify-app-user-role.ts"
      provides: "Role-identity and RLS-gating verification harness"
      min_lines: 60
    - path: "apps/web/scripts/audit/test-advisor-fix-isolation.ts"
      provides: "Two-tenant isolation harness + new pooled-reuse test"
      contains: "pooled"
  key_links:
    - from: "apps/web/scripts/audit/test-advisor-fix-isolation.ts"
      to: "DATABASE_URL_APP_USER"
      via: "process.env.DATABASE_URL_APP_USER (no longer skips)"
      pattern: "DATABASE_URL_APP_USER"
    - from: "verify-app-user-role.ts"
      to: "pg_roles"
      via: "SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user"
      pattern: "rolbypassrls"
---

<objective>
Wire DATABASE_URL_APP_USER into apps/web/.env.local so the existing isolation test harness and the 17 DatabaseSecurity tests actually run as the non-privileged app_user role (per Spec Section 2.4) instead of silently skipping. Then prove correctness with a small role-identity verifier and a new pooled-connection-reuse test that exercises the Quick-411 session-scope GUC deviation under realistic pool churn.

Purpose: Quick-410/411 shipped RLS hardening but our isolation tests never ran against a non-superuser, so they couldn't actually prove RLS. This closes that gap and produces evidence that policies hold under the connection pattern the app uses.

Output:
- DATABASE_URL_APP_USER added to apps/web/.env.local (gitignored, password redacted in every committed artifact)
- New verify-app-user-role.ts harness
- Pooled-reuse test appended to test-advisor-fix-isolation.ts
- All three harnesses pass: verify-app-user-role, test-advisor-fix-isolation, the 17 DatabaseSecurity tests
- A flag (not a fix) noting whether the production app connects as app_user or a more privileged role
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/413-wire-database-url-app-user-so-isolation-/413-CONTEXT.md

# Prior RLS work — needed to understand session-scope GUC deviation
@.planning/quick/410-apply-rls-fixes/410-SUMMARY.md
@.planning/quick/411-wire-set-config-tenant-context/411-SUMMARY.md
@.planning/quick/412-post-deployment-rls-verification/412-SUMMARY.md

# Spec — Section 2.4 (app_user role), 2.5 (set_config), 6.1/6.2 (isolation tests)
@docs/specs/workflow-engine.md

# Existing harness — must understand skip path before adding pooled-reuse test
@apps/web/scripts/audit/test-advisor-fix-isolation.ts

# Reference for memory of GUC pattern decision
# project_rls_guc_set_config_pattern.md — set_config FALSE for session scope (pooler safe)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Diagnose app_user role state via Supabase MCP</name>
  <files>(read-only — no file writes in this task)</files>
  <action>
    Before writing any code or env values, run a Supabase MCP query against pg_roles to classify the app_user role:

    SQL to execute:
      SELECT rolname, rolsuper, rolbypassrls, rolcanlogin, rolinherit
      FROM pg_roles
      WHERE rolname = 'app_user';

    Also verify whether app_user has been granted membership / privileges expected by the Prompt 2 migration (commit 1e9cd9a). Run:
      SELECT grantee, table_schema, table_name, privilege_type
      FROM information_schema.role_table_grants
      WHERE grantee = 'app_user'
      LIMIT 20;

    Classify the result into exactly ONE of three states and report it back as the first line of output:
      - STATE A: role exists AND rolcanlogin = true → proceed to Task 3 (skip Task 2)
      - STATE B: role exists AND rolcanlogin = false → STOP, hand off to Task 2
      - STATE C: role does not exist                  → STOP, hand off to Task 2

    Output for this task MUST include:
      1. The literal state letter (A, B, or C)
      2. The raw pg_roles row (or "no row" for C)
      3. A 1-line rationale for the classification

    Constraint: Do NOT create the role. Do NOT alter the role. Do NOT set a password. Do NOT write to .env.local in this task. This task is read-only diagnosis.
  </action>
  <verify>
    Output contains:
    - "STATE: A" or "STATE: B" or "STATE: C"
    - The actual pg_roles row contents (or explicit "no row found")
    - No INSERT/CREATE/ALTER statements were executed
  </verify>
  <done>
    Role state classified and reported. No writes performed. Next task chosen based on state letter.
  </done>
</task>

<task type="checkpoint:decision" gate="blocking">
  <name>Task 2 (CONDITIONAL — STATE B or C only): User confirmation to create/alter app_user</name>
  <decision>
    Approve the SQL to either CREATE the app_user role (STATE C) or ALTER it to allow login + set a password (STATE B).
  </decision>
  <context>
    Creating or altering a Postgres role is a security-permission change and must NOT be automated. Quick task spec mandates: surface exact SQL, STOP, wait for user confirmation, do not guess a password.

    This task is SKIPPED automatically if Task 1 reported STATE A.

    If STATE B (exists, NOLOGIN), the executor MUST output a copy-paste block for the Supabase SQL editor in this exact shape:

      -- STATE B: enable login on existing app_user role
      ALTER ROLE app_user LOGIN;
      ALTER ROLE app_user PASSWORD '<USER_CHOOSES_STRONG_PASSWORD>';
      -- Confirm not superuser, no BYPASSRLS (these should already be the case from Prompt 2):
      SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = 'app_user';

    If STATE C (does not exist), the executor MUST output:

      -- STATE C: create app_user with login, no superuser, no BYPASSRLS
      CREATE ROLE app_user LOGIN PASSWORD '<USER_CHOOSES_STRONG_PASSWORD>'
        NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE INHERIT;
      -- Re-apply the table grants per Prompt 2 migration (commit 1e9cd9a).
      -- The executor should locate the relevant GRANT statements in prisma/migrations/
      -- and surface them in this block so the user runs them in the same transaction.
      SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = 'app_user';

    The executor must:
    - Replace <USER_CHOOSES_STRONG_PASSWORD> placeholder text in the displayed block (do NOT generate one)
    - Tell the user to choose a strong password, run the SQL in the Supabase SQL editor, and reply with confirmation
    - Tell the user NOT to paste the password back into chat — only confirm the role now has LOGIN
    - STOP and wait. Do not proceed to Task 3.
  </context>
  <options>
    <option id="confirmed">
      <name>User ran the SQL and confirmed app_user can now log in</name>
      <pros>Unblocks remaining tasks; role is now usable as a low-privilege app role</pros>
      <cons>None — required path</cons>
    </option>
    <option id="cancel">
      <name>Cancel — do not proceed</name>
      <pros>No security change applied</pros>
      <cons>Isolation tests will continue to skip; quick task remains incomplete</cons>
    </option>
  </options>
  <resume-signal>Reply "confirmed" once the SQL is applied and `SELECT rolcanlogin FROM pg_roles WHERE rolname='app_user'` returns t; or "cancel" to abort.</resume-signal>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: User provides password for DATABASE_URL_APP_USER (manual — out-of-band)</name>
  <what-built>None yet — this task collects a secret the executor cannot generate or derive.</what-built>
  <how-to-verify>
    The executor needs the app_user password to construct DATABASE_URL_APP_USER. Per quick task constraint, the executor:
    - MUST NOT guess or generate the password
    - MUST NOT print the password in any committed artifact
    - MUST receive the password from the user via the chat thread only

    Instructions for the user:
      1. First, confirm .env.local is gitignored:
         git check-ignore apps/web/.env.local
         (Expected output: apps/web/.env.local — meaning it IS ignored)
      2. Paste the app_user password into chat. The executor will write it ONLY into apps/web/.env.local and will redact it in all summaries.
      3. The executor will also need to confirm the existing DATABASE_URL host/port/sslmode (Session Pooler per Quick-411). The executor will read DATABASE_URL from .env.local and reuse the same host/port/dbname/sslmode for DATABASE_URL_APP_USER.

    If STATE A was reported by Task 1 and the user has the existing app_user password documented elsewhere, paste it now. Otherwise paste the password just set in Task 2.
  </how-to-verify>
  <resume-signal>Paste the app_user password into chat (it will not be echoed back or logged). Or reply "cancel" to abort.</resume-signal>
</task>

<task type="auto">
  <name>Task 4: Confirm .env.local is gitignored and append DATABASE_URL_APP_USER</name>
  <files>apps/web/.env.local</files>
  <action>
    Pre-flight (MUST run and pass before writing):
      1. Run: git check-ignore apps/web/.env.local
         - If exit code != 0 (file not ignored), STOP and report. Do not write the secret.
      2. Read current apps/web/.env.local. Extract the DATABASE_URL value to mirror its host, port, database name, and sslmode for the new connection string. Specifically reuse the Session Pooler host/port that Quick-411 confirmed safe.

    Construct the new env line:
      DATABASE_URL_APP_USER="postgresql://app_user:<password-from-task-3>@<same-host-as-DATABASE_URL>:<same-port>/<same-dbname>?sslmode=<same-sslmode>&pgbouncer=true"

      - Match the existing pooler/port/host of DATABASE_URL exactly. Do NOT mix the Session Pooler host with the direct connection port (that combination triggered P2028 class errors).
      - Keep any other query params (e.g., connection_limit) consistent with DATABASE_URL.
      - URL-encode any special characters in the password.

    Append (do not overwrite) the new line to apps/web/.env.local. Add a brief comment immediately above it:
      # Used by test-advisor-fix-isolation.ts and verify-app-user-role.ts to exercise RLS as a non-BYPASSRLS role (Spec 2.4).

    Verify the file still parses by listing all KEY= lines (without values). Confirm DATABASE_URL_APP_USER appears.

    Do NOT print the full value of the line in your summary. Confirm by printing:
      DATABASE_URL_APP_USER=postgresql://app_user:***@<host>:<port>/<dbname>?... (REDACTED)
  </action>
  <verify>
    - `git check-ignore apps/web/.env.local` returns exit 0 with the path
    - `grep -c '^DATABASE_URL_APP_USER=' apps/web/.env.local` returns 1 (exactly one line)
    - The value uses the same host/port/dbname/sslmode as DATABASE_URL
    - No password text appears in any other file or in the task summary
  </verify>
  <done>
    .env.local contains exactly one DATABASE_URL_APP_USER line; .env.local is gitignored; password not committed or printed.
  </done>
</task>

<task type="auto">
  <name>Task 5: Write verify-app-user-role.ts</name>
  <files>apps/web/scripts/audit/verify-app-user-role.ts</files>
  <action>
    Create a tsx-runnable script that proves DATABASE_URL_APP_USER is wired correctly and the role is non-privileged. Use `pg` (already a transitive dep) directly — do NOT route through Prisma for this verifier, since the goal is to prove raw connection identity. Pattern: a Client with connectionString = process.env.DATABASE_URL_APP_USER.

    Assertions (each must pass; on failure, console.error the offending value and process.exit(1)):

      1. Connection: client.connect() succeeds.
         - If process.env.DATABASE_URL_APP_USER is undefined → exit 1 with a clear "not configured" message (no silent skip).

      2. Identity:
         - `SELECT current_user` returns 'app_user'.

      3. Privilege posture (mirrors Spec 2.4):
         - `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`
         - Assert rolsuper === false AND rolbypassrls === false.

      4. RLS gating WITH tenant context:
         - Choose one tenant_id from existing data:
             SELECT id FROM "Tenant" LIMIT 1;
           Stash as TID.
         - Set GUC: `SELECT set_config('app.current_tenant_id', $1, false)` with TID.
         - Pick one tenant-scoped table that has rows for TID. Prefer User (always seeded), fall back to Truck if User is empty.
             SELECT COUNT(*) FROM "User" WHERE "tenantId" = $1
           Stash as expected count. Then:
             SELECT COUNT(*) FROM "User"  -- relies on RLS + GUC to filter
           Assert this count equals expected count (> 0 ideally; if 0, log a warning but do not fail — the gate is "no leakage", not "data present").

      5. RLS gating WITHOUT tenant context:
         - Open a SECOND fresh client connection (must be a different physical connection — do not reuse client #1 since session GUC persists).
         - Without calling set_config, run:
             SELECT COUNT(*) FROM "User"
           Assert this returns exactly 0. If it returns > 0, this is a hard fail — RLS policies are not gating correctly.

      6. Cleanup: client.end() on both connections.

    Console output style: one line per assertion in the form `[PASS] <description>` or `[FAIL] <description> got=<value>`. On success print a final `verify-app-user-role.ts: all assertions passed` line.

    Do NOT import from apps/web/lib — keep this script standalone and minimal. The point is to verify the raw connection, not the app's wrappers.
  </action>
  <verify>
    cd apps/web && npx tsx --env-file=.env.local scripts/audit/verify-app-user-role.ts
    Expected: exit 0, "all assertions passed", with explicit [PASS] lines for current_user, rolbypassrls=false, with-context count > 0 (or warning), without-context count = 0.
  </verify>
  <done>
    Script exists, runs to exit 0, prints PASS for every assertion. Proves app_user is the connecting role and does not bypass RLS.
  </done>
</task>

<task type="auto">
  <name>Task 6: Add pooled-connection-reuse test to test-advisor-fix-isolation.ts</name>
  <files>apps/web/scripts/audit/test-advisor-fix-isolation.ts</files>
  <action>
    Read the current file first (it currently skips with exit 0 when DATABASE_URL_APP_USER is undefined — leave that guard in place but the harness should now actually run since the var is wired).

    Append a new test case named "pooled-connection-reuse" that exercises the Quick-411 deviation (session-scope FALSE in set_config) under pgBouncer churn. The structure:

      1. Create a small pg Pool (max: 2) using DATABASE_URL_APP_USER.

         import { Pool } from 'pg';
         const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP_USER, max: 2 });

      2. Acquire connection #1:
         const c1 = await pool.connect();

      3. On c1, set tenant A context:
         await c1.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT_A_ID]);

      4. Confirm c1 sees tenant A's rows:
         const { rows: a1 } = await c1.query('SELECT COUNT(*)::int AS c FROM "User"');
         assert a1[0].c > 0 (otherwise pick a different table that does have tenant A rows).

      5. RELEASE c1 back to the pool:
         c1.release();

      6. Force pool churn — acquire and release a couple more times to ensure the physical socket cycles:
         for (let i = 0; i < 3; i++) {
           const tmp = await pool.connect();
           tmp.release();
         }

      7. Acquire connection #2 WITHOUT setting any context:
         const c2 = await pool.connect();
         const { rows: a2 } = await c2.query('SELECT COUNT(*)::int AS c FROM "User"');

      8. ASSERT: a2[0].c === 0.
         - If > 0 and equal to tenant A's count → session GUC leaked across pool acquires. Hard fail, log loudly: "POOL LEAK: session GUC bled from connection #1 to connection #2 — Quick-411 session-scope assumption is broken under pool reuse."
         - If = 0 → PASS. This proves session-scope set_config does NOT leak across pool acquires under our session-pooler configuration.

      9. Cleanup: c2.release(); await pool.end();

    Wire this test into the harness's existing test runner so it counts toward pass/fail totals. Use the same logging style as existing tests in this file. Add a short header comment block above the new test explaining what it proves and citing project_rls_guc_set_config_pattern.md.

    Do NOT remove or weaken the existing 17 isolation test patterns — only append.
  </action>
  <verify>
    cd apps/web && npx tsx --env-file=.env.local scripts/audit/test-advisor-fix-isolation.ts
    Expected: no skip, test count increased by 1, all tests pass including "pooled-connection-reuse".
  </verify>
  <done>
    test-advisor-fix-isolation.ts has a new pooled-reuse test that hard-fails on GUC leak, runs cleanly, and passes against current config.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 7: Run all three harnesses and verify outputs</name>
  <what-built>DATABASE_URL_APP_USER wired; verify-app-user-role.ts created; pooled-reuse test added to test-advisor-fix-isolation.ts.</what-built>
  <how-to-verify>
    Run these three commands and paste output (the executor should run them and confirm; the user reviews the captured output):

    1. cd apps/web && npx tsx --env-file=.env.local scripts/audit/verify-app-user-role.ts
       Expected: exit 0; lines for [PASS] current_user=app_user, [PASS] rolbypassrls=false, [PASS] with-context > 0 (or warning), [PASS] without-context = 0.

    2. cd apps/web && npx tsx --env-file=.env.local scripts/audit/test-advisor-fix-isolation.ts
       Expected: exit 0; does NOT print the skip notice; runs all existing tests + the new pooled-reuse test; all pass.

    3. Run the existing 17 DatabaseSecurity isolation tests against DATABASE_URL_APP_USER. The executor must locate these (likely apps/web/tests or apps/web/__tests__ — grep for "DatabaseSecurity" or "isolation") and run them with the same --env-file=.env.local arrangement.
       Expected: tests RUN (not skip on missing env var) and pass. Confirm the pass count is 17.

    Resume-signal: confirm all three outputs look correct, or report which one failed and the error.
  </how-to-verify>
  <resume-signal>Reply "verified" if all three pass; or paste the failing output.</resume-signal>
</task>

<task type="auto">
  <name>Task 8: Flag — does production app connect as app_user?</name>
  <files>(read-only — surfacing a follow-up, not fixing it here)</files>
  <action>
    Grep the codebase to determine whether the production runtime actually connects as app_user per Spec Section 2.4, or as a more privileged role.

    Inspect:
      - apps/web/lib/prisma.ts (and any related pool initialization)
      - The connection string referenced by Prisma at runtime — is it DATABASE_URL (which today authenticates as ??? — likely the supabase postgres role) or a future DATABASE_URL_APP_USER?
      - prisma/schema.prisma datasource block

    Output a short flag in this exact shape (do NOT change any production code):

      ## Follow-up flag — Spec 2.4 compliance
      - Current production connection role: <name from `\du` or inferred from DATABASE_URL username>
      - Compliant with Spec 2.4 (must be app_user, no BYPASSRLS): YES / NO
      - If NO: short note on what would need to change (e.g., switch DATABASE_URL to authenticate as app_user; ensure migrations use a separate admin role)
      - Recommend: separate quick task to remediate; do NOT remediate here

    This is a documentation-only deliverable in the task summary. No code changes.
  </action>
  <verify>
    Final task summary includes the "Follow-up flag" block with a clear YES/NO and a one-line rationale.
  </verify>
  <done>
    Compliance posture documented in summary. No production connection logic was modified.
  </done>
</task>

</tasks>

<verification>
End-to-end gates:
- [ ] .env.local contains DATABASE_URL_APP_USER and remains gitignored
- [ ] No password text appears in any committed file, summary, or chat output
- [ ] verify-app-user-role.ts exists and exits 0 with all PASS lines
- [ ] test-advisor-fix-isolation.ts no longer prints the skip notice; new pooled-reuse test runs and passes
- [ ] All 17 existing DatabaseSecurity isolation tests run (not skip) and pass
- [ ] STATE A/B/C diagnostic was reported before any role mutation was attempted
- [ ] If STATE B or C: user confirmation was received before .env.local was written
- [ ] Follow-up flag documents whether production app connects as app_user (Spec 2.4)
</verification>

<success_criteria>
1. Step 2 diagnostic published — STATE A, B, or C, with the raw pg_roles row.
2. If B or C: exact SQL surfaced for the user, STOP gate honored, no auto-create/auto-alter.
3. If A (or after confirmation): DATABASE_URL_APP_USER appears in apps/web/.env.local; password redacted in every committed and printed artifact.
4. apps/web/scripts/audit/verify-app-user-role.ts exists and exits 0.
5. verify-app-user-role.ts output shows: current_user=app_user, rolbypassrls=false, with-context returns rows, without-context returns 0.
6. test-advisor-fix-isolation.ts runs (no skip) and passes — including the new pooled-connection-reuse test.
7. Existing 17 DatabaseSecurity isolation tests run (no skip) and pass.
8. Summary flags whether production connects as app_user per Spec 2.4 — YES or NO with rationale; no production logic was changed.
</success_criteria>

<output>
After completion, create `.planning/quick/413-wire-database-url-app-user-so-isolation-/413-SUMMARY.md` covering:
- Role state diagnostic (A/B/C) and the raw pg_roles row
- Whether STATE B/C SQL was needed and when the user confirmed
- DATABASE_URL_APP_USER wired (with password REDACTED in all references)
- verify-app-user-role.ts output (final lines only — all PASS)
- test-advisor-fix-isolation.ts output (test count, pass count, explicit confirmation pooled-reuse test passed)
- 17 DatabaseSecurity isolation tests — run + pass confirmation
- Follow-up flag: production role compliance with Spec 2.4 (YES/NO + 1-line rationale)
- Files modified (list) and files NOT touched (prisma.ts, schema.prisma, migrations — confirmed)
</output>
