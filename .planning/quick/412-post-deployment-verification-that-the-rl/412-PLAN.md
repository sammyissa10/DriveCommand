---
phase: 412-post-deployment-verification-rls
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true

must_haves:
  truths:
    - "verify-advisor-fix.ts script reports its full check tally (e.g. 32/32) unchanged from Quick-410"
    - "audit-rls-gaps.ts current output shows only the expected Section 4.12 allowlist (Plan, Promo, carrier_catalog_meta, NotificationTemplate, NotificationEmailConfig) plus grid_preference and grid_view in 'RLS DISABLED'"
    - "carrier_compliance_alert_log, carrier_documents, route_template_stops, stops, TicketMessage, Tenant do NOT appear in 'RLS DISABLED' or force-off sections"
    - "With tenant context set: SELECT count from carrier_documents > 0, SELECT count from stops > 0, SELECT from Tenant returns exactly 1 matching row"
    - "Without tenant context: SELECT from carrier_documents returns 0 rows (FORCE RLS lockdown confirmed per spec Section 6.2)"
    - "tsc --noEmit in apps/web is still clean (no new type errors)"
    - "Final verdict line states HELD or DRIFTED with exact diff if drifted"
  artifacts: []
  key_links:
    - from: "verify-advisor-fix.ts"
      to: "live Supabase database"
      via: "tsx --env-file=.env.local"
      pattern: "scripts/audit/verify-advisor-fix\\.ts"
    - from: "audit-rls-gaps.ts"
      to: "live Supabase database"
      via: "tsx --env-file=.env.local"
      pattern: "scripts/audit/audit-rls-gaps\\.ts"
    - from: "Supabase MCP set_config('app.current_tenant_id', ...)"
      to: "RLS policies on carrier_documents, stops, Tenant"
      via: "session-scoped GUC"
      pattern: "set_config|current_setting.*app\\.current_tenant_id"
---

<objective>
Re-verify that the Quick-410/411 RLS advisor fix is still holding 24 hours after deployment. This is a read-only smoke check — no migrations, no policy edits, no schema changes. Confirm policies, FORCE RLS, allowlist boundaries, and tenant context resolution all behave per Section 6.2 of the spec.

Purpose: Catch any drift (manual policy edits, accidental ALTER TABLE, schema sync side-effects) before downstream features build on a broken foundation.
Output: A consolidated report (no files) with the five required deliverables: verify result, audit three-section output, four smoke-check counts, tsc clean, and HELD/DRIFTED verdict.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/410-quick-410/410-PLAN.md
@.planning/quick/411/411-PLAN.md
@apps/web/scripts/audit/verify-advisor-fix.ts
@apps/web/scripts/audit/audit-rls-gaps.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Re-run verify-advisor-fix.ts and audit-rls-gaps.ts, capture full output</name>
  <files>(none — read-only execution)</files>
  <action>
    Run both audit scripts and capture COMPLETE output verbatim. Do not summarize or paraphrase the script output — paste it.

    Commands (run from repo root, both inside apps/web):
    1. `cd apps/web && npx tsx --env-file=.env.local scripts/audit/verify-advisor-fix.ts`
       - Capture every line. Record the final pass/fail tally (e.g. "32/32 passed" or "31/32 — X failed").
       - If any check failed, list which one(s) failed and what the script reported.

    2. `cd apps/web && npx tsx --env-file=.env.local scripts/audit/audit-rls-gaps.ts`
       - Capture all three sections in full.
       - For the "RLS DISABLED" section, explicitly list the tables present.
       - Expected RLS DISABLED set: Plan, Promo, carrier_catalog_meta, NotificationTemplate, NotificationEmailConfig, grid_preference, grid_view (the Section 4.12 allowlist + the two grid prefs tables).
       - Flag immediately if ANY of these appear in RLS DISABLED or force-off: carrier_compliance_alert_log, carrier_documents, route_template_stops, stops, TicketMessage, Tenant.

    If a script errors out (missing env var, connection fail, etc.), record the exact error and STOP. Do not attempt to fix — this is read-only.

    Do NOT modify either script. Do NOT apply any migration. Do NOT run any psql or supabase commands beyond the two listed.
  </action>
  <verify>
    Both scripts ran to completion and full output is captured in the task report. The RLS DISABLED table list is explicit (not "expected tables" — actual names).
  </verify>
  <done>
    Two complete script outputs captured. Final tallies recorded. Any unexpected tables in RLS DISABLED are flagged explicitly with name + section.
  </done>
</task>

<task type="auto">
  <name>Task 2: Live smoke check via Supabase MCP — tenant context isolation</name>
  <files>(none — read-only SQL via MCP)</files>
  <action>
    Use the Supabase MCP `execute_sql` tool to run four read-only checks. Pick any one real tenant id from the Tenant table to use as the test tenant (query `SELECT id FROM "Tenant" LIMIT 1` first to grab a real UUID — do not invent one).

    Run the following SQL statements via Supabase MCP execute_sql, capturing the row count or returned data for each:

    1. WITH tenant context set:
       ```sql
       SELECT set_config('app.current_tenant_id', '<TENANT_UUID>', true);
       SELECT count(*) FROM carrier_documents;
       ```
       Expected: count > 0.

    2. WITH tenant context set (same session/statement):
       ```sql
       SELECT set_config('app.current_tenant_id', '<TENANT_UUID>', true);
       SELECT count(*) FROM stops;
       ```
       Expected: count > 0.

    3. WITH tenant context set:
       ```sql
       SELECT set_config('app.current_tenant_id', '<TENANT_UUID>', true);
       SELECT id, name FROM "Tenant";
       ```
       Expected: exactly 1 row returned, matching the test tenant id.

    4. WITHOUT tenant context (fresh statement, no set_config):
       ```sql
       SELECT count(*) FROM carrier_documents;
       ```
       Expected: count = 0 (FORCE RLS + no GUC = locked, per spec Section 6.2).

    Note: Supabase MCP execute_sql may not preserve session state between calls. If `set_config(..., true)` (local=true) does not persist within a single call, combine the set_config and the SELECT into one statement (semicolon-separated) so they execute in the same transaction. Verify the behavior matches expectation regardless.

    Record the exact count or row data returned for each of the four checks. If any return unexpected results (e.g. test 4 returns > 0 rows — that would mean FORCE RLS broke), flag explicitly with the actual vs expected.

    Do NOT INSERT, UPDATE, DELETE, or ALTER anything. SELECT and set_config only.
  </action>
  <verify>
    All four checks executed via Supabase MCP. Counts captured. Test 4 specifically confirms FORCE RLS lockdown (0 rows without context) — this is the critical isolation guarantee.
  </verify>
  <done>
    Four counts recorded. Tests 1-3 show non-zero / exactly-one-row results matching expectations. Test 4 returns 0 rows. Any deviation is flagged with actual values.
  </done>
</task>

<task type="auto">
  <name>Task 3: Confirm tsc clean in apps/web and write final verdict</name>
  <files>(none — read-only typecheck + report assembly)</files>
  <action>
    1. Run `cd apps/web && npx tsc --noEmit` and capture the result.
       - If clean: confirm "0 errors" in report.
       - If errors: list each error file:line:message. Do NOT fix them — report only.

    2. Assemble the final report as a single message back to the user with these five sections in order:

       **1. verify-advisor-fix.ts result**
       Full output or pass/fail tally with any failures itemized.

       **2. audit-rls-gaps.ts three-section output**
       The three sections verbatim, with the RLS DISABLED table list explicit.

       **3. Four smoke-check counts**
       - carrier_documents WITH context: <count>
       - stops WITH context: <count>
       - Tenant WITH context: <row count + matched id>
       - carrier_documents WITHOUT context: <count>

       **4. tsc clean confirmation**
       "0 errors" or list of errors.

       **5. One-line verdict**
       Either:
       - `VERDICT: HELD — all checks pass, no drift since Quick-410/411 deployment.`
       OR
       - `VERDICT: DRIFTED — <exact list of what changed, e.g. "carrier_documents now appears in RLS DISABLED" or "test 4 returned 5 rows instead of 0">.`

       If DRIFTED, do NOT propose a fix in this task. Just report. A follow-up Quick will handle remediation.
  </action>
  <verify>
    tsc result captured. Final report contains all five required sections in order. Verdict line is unambiguous (HELD or DRIFTED with specifics).
  </verify>
  <done>
    Five-section report delivered. Verdict line is a single explicit statement. No code or migration changes were made during this entire task.
  </done>
</task>

</tasks>

<verification>
- Two audit scripts re-ran with full output captured (Task 1)
- Four MCP SQL checks executed with counts recorded (Task 2)
- tsc --noEmit ran in apps/web with result recorded (Task 3)
- No files modified across the entire phase
- No migrations applied
- No policy edits
- Final HELD/DRIFTED verdict is single-line and unambiguous
</verification>

<success_criteria>
- All three tasks completed read-only (no writes, no migrations, no policy changes)
- Report includes: verify result, audit three-section output, four smoke counts, tsc result, one-line verdict
- If HELD: user has confirmation the Quick-410/411 fix held for 24h
- If DRIFTED: user has exact, specific delta to feed into a follow-up remediation Quick
</success_criteria>

<output>
After completion, return a single message to the user with the five-section report. No SUMMARY.md needed — this is a verification ticket, the report IS the deliverable.
</output>
