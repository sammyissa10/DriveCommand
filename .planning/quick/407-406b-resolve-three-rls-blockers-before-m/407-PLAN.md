---
phase: quick-407
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/scripts/audit/406b-resolve-blockers.ts
  - apps/web/scripts/audit/406b-FINDINGS.md
autonomous: true
must_haves:
  truths:
    - "Script runs read-only against the live Supabase DB and surfaces evidence for all three RLS blockers (Tenant SELECT, public.User vs auth.users id relationship, JWT org_id claim)"
    - "Findings file at apps/web/scripts/audit/406b-FINDINGS.md contains three sections (Blocker A, B, C), each ending in a bolded RECOMMENDED ACTION with concrete CREATE POLICY SQL or path-specific guidance"
    - "Script emits a final GO/NO-GO verdict for proceeding to RLS migration design"
    - "Any failed query/grep is caught and reported as 'NOT DETERMINABLE' instead of crashing the script"
  artifacts:
    - path: "apps/web/scripts/audit/406b-resolve-blockers.ts"
      provides: "Read-only diagnostic script answering A/B/C blockers from quick-406"
      contains: "blockerA, blockerB, blockerC"
    - path: "apps/web/scripts/audit/406b-FINDINGS.md"
      provides: "Human-readable findings + recommended policy SQL for each blocker"
      contains: "RECOMMENDED ACTION"
  key_links:
    - from: "apps/web/scripts/audit/406b-resolve-blockers.ts"
      to: "Supabase DB (read-only)"
      via: "Supabase MCP execute_sql or @supabase/supabase-js (mirror pattern from deep-diagnostic-rls-fix.ts)"
      pattern: "execute_sql|createClient"
    - from: "apps/web/scripts/audit/406b-resolve-blockers.ts"
      to: "apps/web/scripts/audit/406b-FINDINGS.md"
      via: "fs.writeFileSync at end of run"
      pattern: "writeFileSync.*406b-FINDINGS\\.md"
---

<objective>
Resolve the three NO-GO blockers surfaced by quick-406's deep RLS diagnostic by gathering definitive DB + codebase evidence, then emitting a findings doc with concrete policy recommendations.

Purpose: Unblock the FORCE RLS migration design. Without this data we either ship broken policies (e.g. carrier tables silently 0-row because org_id is absent from JWT) or over-engineer them.

Output:
- apps/web/scripts/audit/406b-resolve-blockers.ts (read-only diagnostic)
- apps/web/scripts/audit/406b-FINDINGS.md (verdicts + recommended policy SQL)
- Stdout GO/NO-GO verdict from the script
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/scripts/audit/deep-diagnostic-rls-fix.ts
@apps/web/scripts/audit/405c-DEEP-DIAGNOSTIC.md
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write 406b-resolve-blockers.ts diagnostic script</name>
  <files>apps/web/scripts/audit/406b-resolve-blockers.ts</files>
  <action>
Create a TypeScript script that mirrors the structure of `apps/web/scripts/audit/deep-diagnostic-rls-fix.ts` (same imports, env loading, Supabase client pattern, section runner approach). The script must be READ-ONLY — no DDL, no DML — and must wrap every DB query and filesystem grep in try/catch that records "NOT DETERMINABLE: <reason>" rather than throwing.

Top-level structure:
- Three async functions: `blockerA_TenantReadPatterns()`, `blockerB_UserAuthIdRelationship()`, `blockerC_JwtOrgIdClaim()`
- Each returns `{ section: string; findings: string[]; recommendedAction: string; verdict: string }`
- A `main()` that runs all three, aggregates results, writes `apps/web/scripts/audit/406b-FINDINGS.md`, and prints a final GO/NO-GO line to stdout.

Tech choices:
- DB access: use the same Supabase service-role client pattern as deep-diagnostic-rls-fix.ts (load `.env.local`, `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, create client). For raw SQL use `supabase.rpc('exec_sql', ...)` ONLY IF that RPC already exists in deep-diagnostic-rls-fix.ts; otherwise execute via direct `pg` client or fall back to `supabase.from('pg_catalog.<view>').select()` where possible. Mirror exactly what the previous script did — do not invent a new pattern.
- Codebase grep: use Node `child_process.execSync('git grep -nI -- "<pattern>" apps/web/src packages')` wrapped in try/catch. If git grep returns non-zero (no matches), record "no matches" not a crash.
- File walking for SQL files: use `git grep` with `--include='*.sql'` equivalent (`-- '*.sql'` pathspec).

BLOCKER A — Tenant table read patterns:
1. Query `SELECT relname, seq_scan, idx_scan, n_live_tup FROM pg_stat_user_tables WHERE relname = 'Tenant'`
2. Query `SELECT proname, pg_get_functiondef(oid) AS body FROM pg_proc WHERE pg_get_functiondef(oid) ILIKE '%Tenant%' OR pg_get_functiondef(oid) ILIKE '%public."Tenant"%'` — for each row, extract proname and a ~200 char snippet around the first 'Tenant' match in body
3. `git grep -nI -- 'prisma.tenant.' apps/web/src packages` — list every file:line:snippet
4. `git grep -nIE -- 'FROM "Tenant"|FROM Tenant' apps/web/src packages` and the same with `-- '*.sql'` pathspec to catch raw SQL
5. For each access pattern collected, attempt to capture the WHERE clause from surrounding code (best-effort — read the file, grab 2 lines after the match). If not parseable, label "WHERE clause not parseable from grep".
6. Recommended action: emit a CREATE POLICY block recommending `CREATE POLICY tenant_select_own ON "Tenant" FOR SELECT USING (id = (auth.jwt() ->> 'tenant_id')::uuid)` IF all reads filter by tenant id, otherwise emit alternative (e.g. service-role-only read) with rationale.

BLOCKER B — public.User vs auth.users id relationship:
1. Query: `SELECT u.id AS user_id, au.id AS auth_id, u.id = au.id AS ids_match FROM public."User" u LEFT JOIN auth.users au ON au.email = u.email LIMIT 20` — record the count where ids_match is true vs false vs null
2. Query: `SELECT constraint_name, table_name, column_name, referenced_table_name, referenced_column_name FROM information_schema.referential_constraints rc JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name WHERE table_schema = 'public' AND table_name = 'User'` (use a join that returns the right cols — adapt if column names differ on this PG version; if it fails, fall back to `pg_constraint` query and record what worked)
3. Query: `SELECT tgname, tgrelid::regclass AS table_name, pg_get_triggerdef(oid) AS def FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal`
4. Verdict logic:
   - If all 20 rows show `ids_match = true` → verdict = `IDS_MATCH`, recommended policy `userId = auth.uid()`
   - If some/all rows show `ids_match = false` but a FK or trigger links the two → verdict = `IDS_DIFFER`, recommended policy uses JOIN (`userId IN (SELECT id FROM public."User" WHERE id = (SELECT id FROM auth.users WHERE id = auth.uid()))` or simpler depending on FK shape)
   - If no rows joined or no relationship found → verdict = `NO_RELATIONSHIP`, recommended action is "investigate User table provisioning before writing grid_view policy"
5. Emit recommended CREATE POLICY SQL for whichever verdict path triggered.

BLOCKER C — JWT org_id claim:
1. `git grep -nIE -- "auth\\.jwt\\(\\)|jwt\\(\\) ->>" apps/web/src packages` — list every policy/code reference
2. `git grep -nIE -- "setSession|signInWithPassword|createClient" apps/web/src packages` — list references where Supabase client is initialized or sessions are created (we want to see where claims could be set client-side)
3. `git grep -nIE -- "custom_claims|app_metadata|user_metadata|org_id" apps/web/src packages` — list every write/read
4. Query: `SELECT id, email, raw_app_meta_data, raw_user_meta_data FROM auth.users LIMIT 5` — for each row, check if `raw_app_meta_data ? 'org_id'` and `raw_user_meta_data ? 'org_id'`
5. Verdict logic:
   - All 5 rows have `org_id` in `raw_app_meta_data` → `JWT_ORG_ID_POPULATED`
   - Some have it, some don't → `JWT_ORG_ID_PARTIAL` (list which users are missing it)
   - None have it → `JWT_ORG_ID_MISSING` (FORCE RLS will break carrier table reads — recommended action: backfill org_id into app_metadata for all users before enabling FORCE RLS, OR rewrite carrier policies to use a different claim that IS present)
6. Emit recommended action with concrete next-step SQL/code snippet.

`main()` aggregation:
- Run all three blockers
- If all three verdicts are "safe to proceed" (IDS_MATCH or equivalent + JWT_ORG_ID_POPULATED + Tenant has consistent tenant_id filter) → print `RESULT: GO`
- Otherwise → print `RESULT: NO-GO` plus a one-line summary per blocker
- Write the full findings doc to `apps/web/scripts/audit/406b-FINDINGS.md` in markdown with three `## Blocker X — <name>` sections, each containing: findings (bulleted), verdict (one line), and `**RECOMMENDED ACTION:**` block (with fenced ```sql for policy SQL).

TypeScript strictness:
- Run under `tsx` (same as deep-diagnostic-rls-fix.ts — check how it's invoked there)
- No `any` in function signatures; use `unknown` + narrowing in catch blocks
- Avoid CommonJS `require` — use ES imports matching the existing script's style

Do NOT:
- Run any `CREATE`, `ALTER`, `DROP`, `INSERT`, `UPDATE`, `DELETE` statements
- Output more than LIMIT 5 rows from auth.users or LIMIT 20 from the User join (PII safety)
- Suggest a migration SQL beyond the recommended-policy CREATE POLICY snippets per blocker
- Re-read deep-diagnostic-rls-fix.ts more than once — pattern-match its structure
  </action>
  <verify>
1. File exists: `Test-Path apps/web/scripts/audit/406b-resolve-blockers.ts` returns True
2. Typecheck: `npx tsc --noEmit apps/web/scripts/audit/406b-resolve-blockers.ts` produces no errors (or run repo-wide `tsc --noEmit` and confirm no new errors in this file)
3. Static scan: file contains all three function names (`blockerA_TenantReadPatterns`, `blockerB_UserAuthIdRelationship`, `blockerC_JwtOrgIdClaim`) and a `writeFileSync` call targeting `406b-FINDINGS.md`
4. Search for forbidden ops: `grep -nE 'CREATE TABLE|ALTER TABLE|DROP|INSERT INTO|UPDATE |DELETE FROM' apps/web/scripts/audit/406b-resolve-blockers.ts` returns no matches inside SQL string literals (CREATE POLICY snippets that are EMITTED into the findings file as recommendations are OK — they are markdown content, not executed SQL)
  </verify>
  <done>
Script file exists, typechecks clean, contains three blocker functions and a findings writer, performs zero DDL/DML, and wraps every external call in try/catch with "NOT DETERMINABLE" fallback.
  </done>
</task>

<task type="auto">
  <name>Task 2: Run the script and verify 406b-FINDINGS.md is produced</name>
  <files>apps/web/scripts/audit/406b-FINDINGS.md</files>
  <action>
Execute the script and confirm it produces a complete findings document.

Steps:
1. From repo root, invoke the script the same way `deep-diagnostic-rls-fix.ts` is invoked (check that script's package.json entry or its shebang/header comment). Most likely:
   `npx tsx apps/web/scripts/audit/406b-resolve-blockers.ts`
2. Capture stdout — the final line MUST be `RESULT: GO` or `RESULT: NO-GO`.
3. Confirm `apps/web/scripts/audit/406b-FINDINGS.md` was written.
4. Read the findings file and verify:
   - It has three sections: `## Blocker A`, `## Blocker B`, `## Blocker C`
   - Each section ends with a `**RECOMMENDED ACTION:**` block
   - At least one section contains a fenced ```sql code block with a CREATE POLICY statement
   - No section is empty / no section says only "NOT DETERMINABLE" without a fallback recommended action
5. If any blocker came back NOT DETERMINABLE for ALL of its checks, manually augment that section's RECOMMENDED ACTION with a concrete "next investigation step" paragraph (e.g. "Run X manually in Supabase SQL editor and re-run this script"). Do not invent verdicts.

If the script fails to run (env vars missing, MCP unreachable, etc.):
- Do NOT modify .env.local or commit secrets
- Document the failure mode in 406b-FINDINGS.md under a `## Run Failure` section with the exact error
- Still produce best-effort findings using only the `git grep` codebase signals (which don't need DB access)
- Final stdout verdict in that case: `RESULT: NO-GO (DB unreachable — codebase-only signals captured)`

Do NOT:
- Hand-edit the findings file's primary content if the script ran successfully — only augment NOT DETERMINABLE sections with next-step guidance
- Apply any of the recommended CREATE POLICY statements — they are recommendations only
- Commit secrets, JWT tokens, or full raw_app_meta_data contents to the findings file (redact email beyond domain, never log JWT)
  </action>
  <verify>
1. `Test-Path apps/web/scripts/audit/406b-FINDINGS.md` returns True
2. File contains the three section headers (`## Blocker A`, `## Blocker B`, `## Blocker C`)
3. File contains at least one `**RECOMMENDED ACTION:**` per section (grep count >= 3)
4. File contains at least one ```sql fenced block
5. The script's stdout (capture it during the run) ends with a line matching `^RESULT: (GO|NO-GO)`
6. No PII leaks: grep the findings file for JWT-shaped strings (`eyJ[A-Za-z0-9_-]+`) — should be zero matches
  </verify>
  <done>
406b-FINDINGS.md exists with three populated blocker sections (each ending in a RECOMMENDED ACTION block), the script printed a clear GO or NO-GO verdict to stdout, no secrets leaked into the findings file, and any NOT DETERMINABLE sections have manual next-step augmentations.
  </done>
</task>

</tasks>

<verification>
Final check before declaring the quick task complete:

1. Both files exist on disk:
   - apps/web/scripts/audit/406b-resolve-blockers.ts
   - apps/web/scripts/audit/406b-FINDINGS.md
2. Repo typecheck still passes: `npx tsc --noEmit` from repo root produces no new errors attributable to the new script
3. Findings file answers all three blockers with verdicts + recommended actions
4. The script's final RESULT line is recorded (in the executor's summary or in the findings file's header)
5. No DDL/DML executed against the DB — verify by re-grepping the script for forbidden SQL keywords
6. No JWTs, service role keys, or full user metadata blobs leaked into the findings markdown
</verification>

<success_criteria>
Quick task 407 is done when:
- The diagnostic script exists, typechecks clean, and is fully read-only
- 406b-FINDINGS.md exists with three populated blocker sections, each ending in a bolded RECOMMENDED ACTION (with CREATE POLICY SQL where applicable)
- The script printed a definitive GO or NO-GO verdict
- The user has enough evidence to either (a) draft the FORCE RLS migration with confidence, or (b) identify the specific next investigation needed before drafting
</success_criteria>

<output>
After completion, create `.planning/quick/407-406b-resolve-three-rls-blockers-before-m/407-SUMMARY.md` with:
- Final GO/NO-GO verdict from the script
- One-line verdict per blocker (Tenant policy / User id relationship / JWT org_id)
- Link to apps/web/scripts/audit/406b-FINDINGS.md
- Any NOT DETERMINABLE sections that need follow-up investigation
</output>
