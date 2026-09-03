---
phase: quick-585
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true

files_modified:
  - apps/web/scripts/audit/rls-policy-replay.ts
  - apps/web/scripts/audit/rls-policy-drift.ts
  - apps/web/scripts/audit/rls-policy-baseline.json
  - apps/web/tests/security/rls-policy-replay.test.ts
  - apps/web/package.json
  - .github/workflows/rls-policy-drift.yml
  - docs/diagnostics/rls-policy-drift-detector.md

hard_constraints:
  - "READ-ONLY against the database. The script and every command run in this task issue SELECTs against pg_catalog only. NO CREATE POLICY, NO DROP POLICY, NO ALTER, NO migration run, NO `prisma db push`, NO `prisma migrate`, NO seed, NO `CREATE EXTENSION`."
  - "Do NOT rebuild, create or alter any RLS policy in this task. The 59 missing policies stay missing."
  - "Do NOT install pgaudit. Step 8 prices it; it does not enable it."
  - "Do NOT modify EXEMPT_MODELS, getTenantPrisma, lib/db/prisma.ts, or any application access path."
  - "Do NOT create a CI database credential or any secret. Report the gap."
  - "Nothing may be installed. pg, @types/pg, @prisma/adapter-pg, dotenv, tsx and vitest are already present in apps/web; use only those."
  - "The baseline is an explicit named list of fully-qualified `table.policy_name` entries that shrinks to empty. It is NEVER a tolerance number, a count threshold, a regex, or a suppression flag. The committed script must expose NO flag that writes or regenerates the baseline."
  - "If the replay cannot reproduce quick-584's numbers exactly (328 statements / 230 expected / 179 live / 59 missing across 13 tables / 3 tables at zero / 8 unexpected), STOP and report the divergence. Do NOT adjust the baseline, the parser or the floors to make the numbers match."
  - "Never print a connection string or password. Mask as ***."
  - "Commit atomically. Do NOT push."

must_haves:
  truths:
    - "Running `npm run audit:rls-policy-drift` from apps/web parses the migration corpus, replays CREATE/DROP POLICY in migration order, queries live pg_policy, and prints a two-directional diff plus a machine-readable JSON summary"
    - "The run against production reports 328 statements parsed, 230 expected, 179 live, 59 missing policies across 13 tables (3 of them at zero live policies), and 8 unexpected live policies on document_import* tables"
    - "With the committed baseline in place the check exits 0; removing any single entry from the baseline's missing list makes it exit non-zero and name that policy"
    - "A baseline entry that is NOT actually missing live is reported as a stale baseline entry and fails the check - this is what forces the file to shrink as policies are rebuilt"
    - "Tables with RLS enabled and zero policies, and tables with FORCE RLS and zero policies, are reported as two separate failure classes"
    - "The script issues no DDL and no DML - grep of the file finds no CREATE/DROP/ALTER/INSERT/UPDATE/DELETE statement text against the database"
    - "A workflow runs the check on every push to master, and emits a GitHub notice rather than failing the build when no read-only database secret is configured"
    - "A reader is told, in the script header, that Postgres stores no policy creation timestamp and that this replay diff is therefore the only available detector"
  artifacts:
    - path: "apps/web/scripts/audit/rls-policy-replay.ts"
      provides: "Pure, DB-free parse + replay + diff + baseline-application + zero-policy classification"
      exports: ["parsePolicyStatements", "replayPolicyStatements", "diffPolicySets", "applyBaseline", "classifyZeroPolicyTables"]
      min_lines: 150
    - path: "apps/web/scripts/audit/rls-policy-drift.ts"
      provides: "Runner - loads migrations from disk, queries pg_policy/pg_class read-only, prints human diff + JSON, sets exit code"
      min_lines: 180
    - path: "apps/web/scripts/audit/rls-policy-baseline.json"
      provides: "The explicit shrinking baseline - 59 known-missing, 8 known-unexpected, plus known zero-policy tables, each with a quick-584 reference"
      contains: "quick-584"
    - path: "apps/web/tests/security/rls-policy-replay.test.ts"
      provides: "Vitest coverage of the parser anchor, replay ordering, baseline subtraction and stale-entry detection, including the real migration corpus with a length floor"
      min_lines: 100
    - path: ".github/workflows/rls-policy-drift.yml"
      provides: "push-to-master trigger, credential presence check, skip-with-notice when absent"
    - path: "docs/diagnostics/rls-policy-drift-detector.md"
      provides: "What the detector catches, the sample production run, the CI credential-gap finding, and the pgaudit availability + log-volume assessment"
      min_lines: 80
  key_links:
    - from: "apps/web/scripts/audit/rls-policy-drift.ts"
      to: "apps/web/scripts/audit/rls-policy-replay.ts"
      via: "import of the pure replay/diff functions"
      pattern: "from '\\./rls-policy-replay'"
    - from: "apps/web/scripts/audit/rls-policy-drift.ts"
      to: "apps/web/scripts/audit/rls-policy-baseline.json"
      via: "readFileSync + JSON.parse, passed into applyBaseline"
      pattern: "rls-policy-baseline\\.json"
    - from: "apps/web/package.json"
      to: "apps/web/scripts/audit/rls-policy-drift.ts"
      via: "npm script audit:rls-policy-drift"
      pattern: "audit:rls-policy-drift"
    - from: ".github/workflows/rls-policy-drift.yml"
      to: "apps/web/package.json"
      via: "npm run audit:rls-policy-drift on push to master"
      pattern: "audit:rls-policy-drift"
    - from: "docs/diagnostics/rls-policy-drift-detector.md"
      to: "docs/diagnostics/rls-policy-drop-forensics.md"
      via: "explicit link - this detector is item 1 of that report's 'Monitoring that would catch a recurrence'"
      pattern: "rls-policy-drop-forensics"
---

<objective>
Build the detector that would have caught quick-584's silent loss of 59 RLS policies the day
after it happened, and record today's shortfall as an explicit, shrinking baseline.

Purpose: quick-584 established that 59 policies across 13 carrier tables are missing relative
to what the repo's migrations create, that the mechanism cannot be determined from surviving
evidence, and — critically — that **Postgres stores no policy creation timestamp**, so a
migration-replay diff against live `pg_policy` is the only detector available. Nothing is
dropping policies now, but there is no detector, so a recurrence would again go unnoticed for
months. This must exist before any policy is rebuilt.

Output: a committed replay/diff script with Vitest coverage, an explicit 67-entry baseline,
an npm entry point, a push-to-master workflow that skips-with-notice when no DB credential
exists, and a diagnostics report carrying the sample production run, the CI credential-gap
finding, and the pgaudit cost assessment.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Read before writing any code:
@docs/diagnostics/rls-policy-drop-forensics.md
@apps/web/scripts/_bootstrap-env.ts
@apps/web/scripts/audit/app-user-grant-audit.ts
@.github/workflows/ci.yml
</context>

<research_findings>
All of the following is already established. Do NOT re-derive it. Build on it.

**quick-584's authoritative numbers** (forensics §5):
- 328 CREATE/DROP POLICY statements parsed across all migrations
- 230 policies expected after replay in migration order
- 179 policies live
- 51 net → **59 missing** within carrier scope, offset by **8 unexpected** live policies on
  four `document_import*` tables. (230 − 59 + 8 = 179. That arithmetic is the reproduction
  check.)
- Missing by table (expected/live/missing): `carrier_expenses` 8/2/6 · `stops` 6/**0**/6 ·
  `carrier_drivers` 7/2/5 · `driver_pay_records` 7/2/5 · `loads` 7/2/5 ·
  `carrier_documents` 4/**0**/4 · `carrier_trucks` 6/2/4 · `clients` 6/2/4 ·
  `contracts` 6/2/4 · `dispatches` 6/2/4 · `facilities` 6/2/4 ·
  `route_template_stops` 4/**0**/4 · `route_templates` 6/2/4 = **59 across 13 tables, 3 at zero**
- The exact missing policy names are in the forensics §5 code block, per table.
- Source migrations of the missing set: `20260404100013_carrier_rls_policies` (48 missing,
  0 surviving), `20260527000001_quick410_advisor_rls_fix` (11 missing, 0 surviving),
  `20260515000001_db_security_standardization` (0 missing, 20 surviving).

**Counting raw CREATEs is wrong.** `20260515000001_db_security_standardization` contains a
balanced 46 DROP / 46 CREATE, so a naive CREATE count produces 46 phantom discrepancies.
Replay in migration order is mandatory.

**Migration corpus:** 141 directories under `apps/web/prisma/migrations/`, each with
`migration.sql`. Migration order is lexicographic directory name (timestamp prefix).

**The parser anchor is load-bearing and produces the 328.** A raw grep for
`(CREATE|DROP)\s+POLICY` across the corpus returns **330** occurrences. The two extras are
inside a `DO $$ … EXECUTE format('CREATE POLICY …')` block in
`20260802120000_document_import_phase1/migration.sql` (lines 336 and 344) — those lines begin
with a single-quote, not with the keyword. Anchoring the match to the start of a line
(optional leading whitespace, then `CREATE`/`DROP`) excludes exactly those two and yields 328.
**That exclusion is also what produces the 8 "unexpected" live policies on the four
document_import* tables** — the DO block really did create them, the anchored replay does not
see them, and quick-584 counted them as unexpected. Preserve the anchor exactly. "Improving"
the parser to evaluate dynamic SQL changes every number and breaks the reproduction.

**Postgres stores no policy creation timestamp.** `pg_policy` has no timestamp column; there
is no `pg_stat_last_ddl`. quick-584 used OID ordering as a labelled-circumstantial proxy only.

**pgaudit (step 8) — availability already checked, read-only, do NOT re-run the availability
query.** On project `oqdhberkghtnszrkdvfm`, `pg_available_extensions` reports pgaudit
`default_version = 17.1`, `installed_version = null`. It **is available on this plan** and is
already in `shared_preload_libraries`; it is simply not installed. `pg_stat_statements` 1.11
IS installed with `track_utility = on`. Postgres 17.6.1.084, region us-west-1. What remains
for step 8 is pricing the **log volume** of `pgaudit.log = 'ddl'`.

**CI reality — already surveyed, do NOT re-derive.** `.github/workflows/` has exactly four
files: `ci.yml` (pull_request to master/develop only — no push trigger; runs tsc, vitest with
a **dummy** `DATABASE_URL: postgresql://ci:ci@localhost:5432/ci`, and `npm run audit:raw-prisma`;
no secrets), `deploy-web.yml` (push to master; VERCEL_* and SUPABASE_* secrets),
`doc-drift.yml` (pull_request), `playwright.yml` (push + PR; base URL and TEST_* logins).
**No workflow has any database URL secret.** `SUPABASE_SERVICE_ROLE_KEY` is a PostgREST/API
key, not a Postgres connection string, so it cannot drive a `pg` connection to `pg_catalog`.
The credential gap is real.

**Conventions:**
- Audit scripts live flat in `apps/web/scripts/audit/`. Precedents: `app-user-grant-audit.ts`,
  `audit-rls-gaps.ts` — read-only, `new Pool({connectionString: process.env.DATABASE_URL})` +
  `PrismaPg` adapter + `PrismaClient` + `$queryRawUnsafe` against `pg_catalog`, long header
  comment with a `GUARD-RAILS — read-only:` block and a `Run from apps/web/:` line.
- `apps/web/scripts/_bootstrap-env.ts` must be imported **first** by any script touching
  Prisma. It loads three env files, repoints `DATABASE_URL` at `DIRECT_URL` (pooler 6543 is
  unreachable from a dev machine; DIRECT_URL is 5432), raises `PG_CONNECT_TIMEOUT_MS` to 30s,
  and throws if neither URL is set.
- `apps/web/tsconfig.json` includes `**/*.ts`, so `scripts/**` IS type-checked. Exclude list
  is `node_modules`, `prisma/seeds`, `src/legacy`.
- `apps/web/vitest.config.ts` `include` covers `tests/**/*.test.ts` and `src/**` — **not**
  `scripts/**`. A test file under `tests/security/` that imports from `../../scripts/audit/…`
  works fine; `include` governs discovery, not imports.
- Identifiers mix PascalCase (`"Truck"`, `"User"`) and snake_case (`stops`). Join on
  `pg_class.oid`; never `::regclass` on a literal.
- Supabase MCP `execute_sql` returns only the LAST statement's result — one SELECT per call.
</research_findings>

<tasks>

<task type="auto">
  <name>Task 1: Pure replay + diff library and its Vitest coverage</name>
  <files>
apps/web/scripts/audit/rls-policy-replay.ts
apps/web/tests/security/rls-policy-replay.test.ts
  </files>
  <action>
Create `apps/web/scripts/audit/rls-policy-replay.ts` — pure, no database, no `process.exit`,
no console output. It takes migration file **contents** as input (the runner does the disk
read), so every function is directly testable.

Header comment, following `app-user-grant-audit.ts`'s style, must state:
- What this exists to catch: silent removal of RLS policies from the live database, as found
  by **quick-584** (59 policies across 13 carrier tables, mechanism undetermined, discovered
  ~3 months after the fact because the only surface that recorded it — `log_statement='ddl'` —
  has ~24h retention).
- Plainly: **Postgres stores no policy creation timestamp.** `pg_policy` has no timestamp
  column and there is no `pg_stat_last_ddl`. A replay of the repo's migrations diffed against
  live `pg_policy` is therefore **the only available detector**.
- A `GUARD-RAILS — read-only` block: this module never touches a database at all.

Types (exported):
```ts
export interface PolicyRef { table: string; policy: string }        // normalised, unquoted
export type PolicyKey = string;                                      // `${table}.${policy}`
export interface PolicyStatement {
  kind: 'CREATE' | 'DROP';
  migration: string;            // directory name
  table: string;
  policy: string;
  ifExists: boolean;
}
```

Exported functions:

1. `parsePolicyStatements(migration: string, sql: string): PolicyStatement[]`
   - **Normalise CRLF first**: `sql.replace(/\r\n/g, '\n')`. This repo has `core.autocrlf=true`
     and no `.gitattributes`, so migration.sql is CRLF in the working tree and LF in the index.
     Without this the captured policy/table names carry a trailing `\r` and every key mismatches.
   - Match with a **line-anchored, multiline, case-insensitive** regex: optional leading
     whitespace, then `CREATE POLICY` or `DROP POLICY [IF EXISTS]`, then the policy name, then
     `ON`, then the table name. Policy and table names may be bare or double-quoted; strip the
     quotes but do **not** lowercase (identifiers are case-sensitive in this schema).
   - The line anchor is load-bearing — see research findings. Add an inline comment saying so,
     naming `20260802120000_document_import_phase1` lines 336/344 and the 330-vs-328 count.
   - Ignore an `ALTER POLICY` if any appears (record nothing; note it in a comment).

2. `replayPolicyStatements(files: Array<{ migration: string; sql: string }>): { statements: PolicyStatement[]; expected: Set<PolicyKey> }`
   - Caller supplies files already sorted by migration directory name; the function asserts
     sortedness and throws if not (it must never silently replay out of order).
   - Walk statements in order: CREATE adds the key, DROP deletes it. `DROP … IF EXISTS` on an
     absent key is a no-op, not an error.
   - This ordering is the whole point — `20260515000001_db_security_standardization` has a
     balanced 46 DROP / 46 CREATE, and a raw CREATE count produces 46 phantom discrepancies.
     Say so in a comment.

3. `diffPolicySets(expected: Set<PolicyKey>, live: Set<PolicyKey>): { missing: PolicyKey[]; unexpected: PolicyKey[] }`
   - `missing` = expected − live (a migration creates it, the database does not have it).
   - `unexpected` = live − expected (the database has it, no migration creates it — a policy
     added by hand is as much a drift signal as one removed).
   - Both sorted ascending for stable output.

4. `applyBaseline(diff, baseline): { newMissing: PolicyKey[]; newUnexpected: PolicyKey[]; staleMissing: PolicyKey[]; staleUnexpected: PolicyKey[] }`
   - `newMissing` = missing − baseline.missing → **failure**.
   - `newUnexpected` = unexpected − baseline.unexpected → **failure**.
   - `staleMissing` = baseline.missing entries that are NOT missing live → **failure**
     ("stale baseline entry — this policy has been rebuilt; delete this line from the baseline").
   - `staleUnexpected` likewise.
   - The stale rule is what makes the baseline a shrinking list rather than a suppression
     mechanism: as policies are rebuilt the check fails until the entry is deleted. Comment it.

5. `classifyZeroPolicyTables(rows: Array<{ table: string; rlsEnabled: boolean; rlsForced: boolean; policyCount: number }>): { forcedZero: string[]; enabledZero: string[] }`
   - `forcedZero` — FORCE RLS and zero policies. Separate, more severe class: quick-582
     established this is how `carrier_documents` was invisible to a grant-only audit.
   - `enabledZero` — RLS enabled, NOT forced, zero policies.
   - A table appears in exactly one class (FORCE implies enabled; the severe class wins).
   - Both classes are baselined by the same explicit-list + stale-entry rule as the policy
     lists, via a `zeroPolicyForced` / `zeroPolicyEnabled` section — reuse `applyBaseline`'s
     shape or a small generic set-diff helper; do not duplicate the logic four times.

6. `INTEGRITY_FLOORS` — exported constants with a comment explaining why a floor exists at
   all: a parser that silently matches nothing reports "everything is missing" (or, with an
   empty live set, "everything is fine"), and both look like a working check. Floors:
   `MIN_STATEMENTS = 300`, `MIN_EXPECTED_POLICIES = 200`, `MIN_MIGRATION_FILES = 130`.
   Export a `assertCorpusIntegrity()` that throws a named error when a floor is breached.

Then create `apps/web/tests/security/rls-policy-replay.test.ts` (Vitest — no new framework):
- Parser: a CRLF fixture string parses identically to its LF twin (assert the parsed policy
  and table names contain no `\r`).
- Parser anchor: a string containing `        'CREATE POLICY tenant_isolation_policy ON %I …'`
  (the quoted, dynamic form) yields **zero** statements, while the same text unquoted at line
  start yields one. This is the regression test for the 330-vs-328 boundary.
- Parser: quoted (`"Tag"`) and bare (`carrier_drivers`) identifiers both parse, quotes stripped.
- Replay: a balanced DROP-then-CREATE pair across two migrations leaves the key present exactly
  once; a CREATE in migration A followed by a DROP in migration B leaves it absent; the reverse
  order leaves it present. Assert `replayPolicyStatements` throws on unsorted input.
- Diff: both directions, with a case where each is non-empty.
- Baseline: an entry in the baseline that is still missing suppresses it; an entry that is no
  longer missing surfaces as `staleMissing`; a missing policy absent from the baseline surfaces
  as `newMissing`.
- Zero-policy classification: forced+zero lands only in `forcedZero`; enabled-not-forced+zero
  only in `enabledZero`; a table with policies lands in neither.
- **Real corpus test** (the guard that actually protects the numbers): read every
  `apps/web/prisma/migrations/*/migration.sql` from disk, sort by directory name, run the
  replay, and assert — per this repo's rule that a source-reading guard needs BOTH a
  "was it actually found" assertion AND a length floor — that at least 130 migration files were
  read, that exactly **328** statements parsed, and that **230** policies are expected. Hard-code
  those two numbers with a comment naming quick-584 as their source. Normalise CRLF on read.
  If a future migration legitimately changes them, that test failing is the intended prompt to
  update both the numbers and the baseline together.
  </action>
  <verify>
From `apps/web/`:
- `npx vitest run tests/security/rls-policy-replay.test.ts` — read the `Test Files … | Tests …`
  summary line and confirm a non-zero test count. (`--reporter=basic` does not exist in vitest 4
  and exits 0 having run zero tests; do not use it.)
- The real-corpus test must report 328 statements and 230 expected. **If it does not, STOP** —
  do not tune the parser to reach the number. Report the divergence with the actual counts and
  the first ten statements that differ from expectation.
  </verify>
  <done>
`rls-policy-replay.ts` exists, is DB-free, and its Vitest suite passes with the real corpus
producing exactly 328 statements and 230 expected policies.
  </done>
</task>

<task type="auto">
  <name>Task 2: The runner script, the production run, and the explicit 67-entry baseline</name>
  <files>
apps/web/scripts/audit/rls-policy-drift.ts
apps/web/scripts/audit/rls-policy-baseline.json
apps/web/package.json
  </files>
  <action>
Create `apps/web/scripts/audit/rls-policy-drift.ts`.

Structure, mirroring `app-user-grant-audit.ts`:
- `import '../_bootstrap-env';` **first line of the file**, before any Prisma import.
- Then `PrismaClient` from `../../src/generated/prisma/client`, `PrismaPg`, `Pool`.
- `new Pool({ connectionString: process.env.DATABASE_URL })` + `PrismaPg` + `PrismaClient`.

Header comment must carry, in this order:
1. Title and one-line purpose.
2. **What this exists to catch**, referencing **quick-584** by name: 59 RLS policies across 13
   carrier tables vanished from production between 2026-05-28 and 2026-08-24; the mechanism is
   undetermined; the only surface that recorded it (`log_statement='ddl'`) has ~24h retention
   and the loss was found ~3 months later. Ten of the thirteen tables were re-covered by a
   later standardization migration so the loss was invisible; three were left with **zero**
   policies.
3. **Postgres stores no policy creation timestamp** — `pg_policy` has no timestamp column and
   there is no `pg_stat_last_ddl` — so replaying the repo's migrations and diffing against live
   `pg_policy` is the only available detector. Point at
   `docs/diagnostics/rls-policy-drop-forensics.md` §5 and §6.
4. `GUARD-RAILS — read-only:` only SELECTs against `pg_catalog`; no DDL, no DML; never prints a
   connection string.
5. `Run from apps/web/:` `npm run audit:rls-policy-drift` (and the `--json` variant).

Behaviour:
- Read the migration corpus: `readdirSync('prisma/migrations')` resolved relative to the script
  file (not cwd), keep directories containing `migration.sql`, sort by directory name
  ascending, read each with `readFileSync(..., 'utf8')`. Call `assertCorpusIntegrity`.
- Replay → `expected` set.
- Query live policies (one `$queryRawUnsafe`, joining on `pg_class.oid` — never `::regclass`
  on a literal, this schema mixes PascalCase and snake_case):
  `SELECT c.relname AS table_name, p.polname AS policy_name FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' ORDER BY 1, 2`
- Query RLS/force/policy-count per table (second query):
  `SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced, COUNT(p.oid)::int AS policy_count FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_policy p ON p.polrelid = c.oid WHERE n.nspname = 'public' AND c.relkind = 'r' GROUP BY 1,2,3 ORDER BY 1`
- Load `rls-policy-baseline.json` with `readFileSync` + `JSON.parse` (resolved relative to the
  script file). Do **not** `import` the JSON — that would depend on `resolveJsonModule`.
- Apply the baseline; classify zero-policy tables and apply the baseline to those too.

Output:
- **Human-readable diff** by default: counts block (migration files, statements parsed,
  expected, live, missing, unexpected), then MISSING grouped by table with expected/live/missing
  per table, then UNEXPECTED, then the two zero-policy classes, then a BASELINE block stating
  how many entries the baseline suppressed and listing any stale entries with the instruction
  to delete that line.
- **`--json` flag** prints only a machine-readable object and nothing else:
  `{ generatedAt, migrationFiles, statementsParsed, expectedCount, liveCount, missing[], unexpected[], missingByTable{}, zeroPolicyForced[], zeroPolicyEnabled[], baseline: { suppressedMissing, suppressedUnexpected, staleMissing[], staleUnexpected[] }, newMissing[], newUnexpected[], exitCode }`.
- No flag writes, regenerates or relaxes the baseline. There is no `--write-baseline`, no
  `--ignore`, no `--allow`. Say so in the header.

Exit codes:
- `0` — no drift beyond the baseline.
- `1` — drift: any `newMissing`, `newUnexpected`, stale baseline entry, or un-baselined
  zero-policy table.
- `2` — operational failure: cannot connect, corpus integrity floor breached, baseline file
  unreadable or malformed. A `2` must never be mistaken for a clean run; print a distinct
  `OPERATIONAL FAILURE` banner.
Wrap in `main().catch(...).finally(async () => { await prisma.$disconnect(); await pool.end(); })`
like the precedent, but preserve the intended exit code rather than always exiting 1.

Then add to `apps/web/package.json` scripts, in the style of `audit:raw-prisma`:
`"audit:rls-policy-drift": "tsx scripts/audit/rls-policy-drift.ts"`

**Then produce the baseline, in this order — this is the reproduction gate:**
1. Create `rls-policy-baseline.json` as an empty-lists skeleton so the script can run.
2. Run `npm run audit:rls-policy-drift -- --json` from `apps/web/` against production
   (read-only; `_bootstrap-env` repoints at `DIRECT_URL`). Capture the full output.
3. **Confirm it reports exactly: 328 statements parsed · 230 expected · 179 live · 59 missing
   across 13 tables · 3 of those tables at 0 live policies · 8 unexpected.** Confirm the
   arithmetic 230 − 59 + 8 = 179. Cross-check the per-table missing counts against the table in
   `docs/diagnostics/rls-policy-drop-forensics.md` §5, and cross-check the generated policy
   names against that section's code block.
   **If any of it diverges, STOP and report the divergence.** Do not edit the baseline, the
   parser, the floors or the hard-coded test numbers to make it match.
4. Populate the baseline from the run's own JSON output (regenerate, do not retype) as an
   explicit named list. Shape:
```json
{
  "$comment": "Explicit, SHRINKING baseline. NOT a tolerance and NOT a suppression flag. Every entry is a fully-qualified table.policy_name known-bad state recorded by quick-584. As a policy is rebuilt its entry MUST be deleted or the check fails with 'stale baseline entry'. When every list is empty, DELETE THIS FILE and remove the baseline load from rls-policy-drift.ts.",
  "reference": "docs/diagnostics/rls-policy-drop-forensics.md (quick-584)",
  "recordedAt": "2026-09-03",
  "missing": { "$why": "…59 policies removed from production between 2026-05-28 and 2026-08-24, mechanism undetermined (quick-584). Rebuilding them is out of scope for quick-585.", "entries": ["carrier_documents.carrier_documents_insert", "…"] },
  "unexpected": { "$why": "…8 policies on four document_import* tables created by a DO/EXECUTE format() block that the line-anchored parser deliberately does not see (quick-584 §5). Not drift; a known parser boundary.", "entries": ["document_imports.tenant_isolation_policy", "…"] },
  "zeroPolicyForced": { "$why": "…", "entries": [] },
  "zeroPolicyEnabled": { "$why": "…", "entries": [] }
}
```
   The `missing` list must hold all **59**; `unexpected` all **8**. Expect
   `stops`, `carrier_documents` and `route_template_stops` in one of the zero-policy classes —
   populate from the actual run, and note that `_prisma_migrations` is RLS-enabled with zero
   policies and NOT forced by deliberate design (`20260328000001_enable_rls_prisma_migrations_and_tenant`),
   so it belongs in `zeroPolicyEnabled` with that stated reason. **If a table appears in a
   zero-policy class that is not one of those four, do NOT silently baseline it — report it.**
5. Re-run without `--json`. Confirm exit code **0** and that the human output states how many
   baseline entries were suppressed.
6. **Prove the baseline is not a rubber stamp:** temporarily delete one entry from
   `missing.entries`, re-run, confirm exit **1** naming that exact policy; restore it. Then
   temporarily add a fabricated entry (e.g. `clients.definitely_not_a_real_policy`), re-run,
   confirm exit **1** reporting it as a **stale baseline entry**; remove it. Record both
   observed outputs for the summary.
  </action>
  <verify>
- `npm run audit:rls-policy-drift` from `apps/web/` exits 0 with the committed baseline.
- The `--json` run reports 328 / 230 / 179 / 59 missing / 13 tables / 3 at zero / 8 unexpected.
- The deleted-entry probe exits 1 naming the policy; the fabricated-entry probe exits 1 as a
  stale baseline entry.
- `grep -inE '\b(create|drop|alter)\s+(policy|table|index)|\b(insert|update|delete)\s+(into|from)\b' apps/web/scripts/audit/rls-policy-drift.ts` returns only matches inside comments/strings that
  describe the parser's regex — no executed statement. Confirm by reading each hit.
- Type-check with an injected probe: add `const __probe: number = 'y';` to
  `apps/web/scripts/audit/rls-policy-drift.ts`, run `npx tsc --noEmit` from `apps/web/`,
  confirm tsc reports **that** error at **that** file and line, then delete the probe and re-run
  to a clean 0. A clean run without the probe is untrustworthy on its own — a parse error
  anywhere in the program (including `.next/dev/types/validator.ts` or an untracked half-written
  file) silently suppresses all semantic checking. If the only errors are syntax errors or are
  in files you did not touch, delete `apps/web/.next/dev/types/validator.ts` and
  `apps/web/tsconfig.tsbuildinfo` and re-run. Delete any probe file you created.
  </verify>
  <done>
The runner exists, is read-only, and against production reproduces quick-584 exactly; the
baseline holds all 59 missing and 8 unexpected entries plus the zero-policy classes; the check
exits 0 with the baseline and 1 under both tamper probes; tsc is clean under a verified gate.
  </done>
</task>

<task type="auto">
  <name>Task 3: CI wiring, the credential-gap finding, and the pgaudit cost assessment</name>
  <files>
.github/workflows/rls-policy-drift.yml
docs/diagnostics/rls-policy-drift-detector.md
  </files>
  <action>
**A. Create `.github/workflows/rls-policy-drift.yml`** — a new workflow, not an edit to
`ci.yml`. `ci.yml` triggers only on `pull_request`; adding a push trigger there would change
the semantics of the whole existing CI job. This one is scoped to the drift check.

```yaml
name: RLS Policy Drift
on:
  push:
    branches: [master]
  workflow_dispatch:
```
Job steps: checkout, setup-node 20 with npm cache, `npm ci`, then:
- A `Check for read-only database credential` step with `id: cred` that reads
  `${{ secrets.RLS_AUDIT_DATABASE_URL }}` **into an env var** (never interpolated into the
  shell body) and writes `present=true|false` to `$GITHUB_OUTPUT`. Reading the secret via `env:`
  rather than inline keeps it out of the command line and out of the log.
- `RLS policy drift check` — `if: steps.cred.outputs.present == 'true'`,
  `working-directory: apps/web`, `run: npm run audit:rls-policy-drift`, with
  `env: DATABASE_URL: ${{ secrets.RLS_AUDIT_DATABASE_URL }}`. Do **not** set `DIRECT_URL` —
  `_bootstrap-env` only repoints `DATABASE_URL` when `DIRECT_URL` is present, so leaving it
  unset makes the secret the connection used, unmodified.
- `Credential absent — check skipped` — `if: steps.cred.outputs.present != 'true'`, emits
  `::notice::` explaining that `RLS_AUDIT_DATABASE_URL` is not configured, that the drift check
  therefore did not run, and pointing at `docs/diagnostics/rls-policy-drift-detector.md`.
  It must **exit 0** — the build does not fail for a missing credential, per the brief.
Add a comment block at the top of the file stating that the credential does not exist today,
that quick-585 deliberately did not create one, and that the check is inert until a read-only
secret is added.

**B. Create `docs/diagnostics/rls-policy-drift-detector.md`.** Sections:

1. **What this detector exists to catch** — quick-584's finding in two paragraphs. Link
   `docs/diagnostics/rls-policy-drop-forensics.md` and state that this is item 1 of that
   report's "Monitoring that would catch a recurrence". State plainly that Postgres records no
   policy creation timestamp, so a replay diff is the only detector available.

2. **How it works** — parse, replay in migration order, diff both directions, subtract the
   baseline. State that counting raw CREATEs is wrong and why (the balanced 46 DROP / 46 CREATE
   in `20260515000001_db_security_standardization` → 46 phantom discrepancies). State the
   line-anchor rule and the 330-vs-328 boundary.

3. **The baseline is a shrinking list, not a threshold** — the stale-entry rule, and the
   instruction that when every list is empty the file is deleted along with the loader.

4. **Sample run against production (2026-09-03)** — paste the actual human-readable output and
   the `--json` summary from Task 2, with any connection string masked as `***`. Include both
   tamper-probe outputs (deleted entry → exit 1; fabricated entry → stale baseline entry).

5. **CI credential gap — finding** — report, do not assume:
   - `.github/workflows/` has exactly four workflows. Name each, its trigger, and its secrets.
   - **No workflow has any database URL secret.** The only `DATABASE_URL` in CI is the dummy
     `postgresql://ci:ci@localhost:5432/ci` in `ci.yml`, used because vitest needs the variable
     set even for mocked tests.
   - `SUPABASE_SERVICE_ROLE_KEY` (present in `deploy-web.yml`) is a PostgREST/API key, **not** a
     Postgres connection string, so it cannot drive a `pg` connection to `pg_catalog`.
   - Conclusion: a **new** read-only secret is required — `RLS_AUDIT_DATABASE_URL`, a connection
     string for a role with `SELECT` on `pg_catalog` and nothing else (`pg_policy` and `pg_class`
     are world-readable to any role that can connect, so no extra grant is needed). Note the
     network constraint: it must be the **direct** 5432 host, not the 6543 pooler, matching what
     `_bootstrap-env` does locally.
   - State explicitly that quick-585 **did not create this credential**, per the brief, and that
     the workflow skips with a notice until it exists.

6. **pgaudit — availability and cost** (do NOT install):
   - Availability: already established read-only —
     `pg_available_extensions` reports pgaudit `default_version 17.1`, `installed_version null`
     on project `oqdhberkghtnszrkdvfm` (Postgres 17.6.1.084). It is in `shared_preload_libraries`
     already, so `CREATE EXTENSION pgaudit` + `pgaudit.log = 'ddl'` is the whole change.
     **It is available on this plan.** Do not re-run the availability query.
   - Cost: price the **log volume** of `pgaudit.log = 'ddl'`. Read-only inputs, one SELECT per
     MCP call (`execute_sql` returns only the last statement's result):
     (a) `pg_stat_statements` utility-statement rows — how many DDL statements have executed
     since `stats_reset` (2026-08-24) and over what elapsed period, to derive a DDL/day rate;
     (b) the current Supabase log retention on this plan.
     Report: estimated DDL statements/day, an order-of-magnitude bytes/day figure with the
     assumption stated (a pgaudit DDL log line is roughly a few hundred bytes plus the statement
     text), and — the decisive point — that retention, not volume, is the binding constraint,
     because quick-584's loss was found ~3 months after the fact and pgaudit writes to the same
     Postgres log whose retention already expired. Note that `log_statement='ddl'` is **already
     on** and already captured these statements; pgaudit adds object-level attribution, not
     durability. Therefore pgaudit is worth having **only in combination with** a log drain or a
     durable sink. Present it as a priced option; make no decision and install nothing.
   - Also note, as the durable alternative already identified in the forensics report's
     monitoring list: an event trigger on `sql_drop` recording `DROP POLICY` into a table
     survives log rotation entirely. Out of scope here (it is DDL).

7. **What this task deliberately did not do** — rebuild any policy, install pgaudit, create a
   credential, or touch any access path.

**C.** Add a line to `.planning/STATE.md` for quick-585 following the existing row convention
in that file.
  </action>
  <verify>
- `.github/workflows/rls-policy-drift.yml` parses as YAML
  (`npx --yes js-yaml .github/workflows/rls-policy-drift.yml` or `node -e` with a YAML read; if
  no parser is available, verify by careful reading and by matching the indentation style of
  `ci.yml`).
- `grep -n "audit:rls-policy-drift" .github/workflows/rls-policy-drift.yml apps/web/package.json`
  returns a hit in both.
- The workflow contains no literal credential and no `secrets.` interpolation inside a `run:`
  command body (only inside `env:`).
- `docs/diagnostics/rls-policy-drift-detector.md` contains the string
  `rls-policy-drop-forensics`, a masked (`***`) sample run, the four workflow names, and both
  the pgaudit availability and volume figures.
- Full suite, measured with the same reporter before and after, run AFTER the last edit and with
  no files being edited during the run: `npx vitest run` from `apps/web/`. Read the
  `Test Files … | Tests …` summary line. Report the before and after counts; the delta should be
  exactly the new tests from Task 1. If a cold run flakes on a real-DB test with a 30s timeout,
  re-run warm and report both numbers separately rather than treating it as a regression.
  </verify>
  <done>
The workflow runs on push to master and skips with a notice when the secret is absent; the
diagnostics report carries the sample production run, the four-workflow credential-gap finding
naming `RLS_AUDIT_DATABASE_URL` as the required new secret, and the pgaudit availability plus
priced log-volume assessment; STATE.md has a quick-585 row.
  </done>
</task>

</tasks>

<verification>
- `npm run audit:rls-policy-drift` from `apps/web/` exits 0 with the committed baseline and
  reports 328 statements / 230 expected / 179 live / 59 missing / 13 tables / 3 at zero /
  8 unexpected.
- The script performs zero DDL and zero DML — verified by reading every regex/keyword hit in the
  file.
- Removing any one baseline entry fails the check naming that policy; adding a fabricated entry
  fails as a stale baseline entry.
- `npx tsc --noEmit` from `apps/web/` is clean, with the gate proven live by an injected
  `const __probe: number = 'y';` that tsc reported and that was then deleted.
- `npx vitest run` from `apps/web/` shows the pre-task test count plus exactly the new tests, no
  regressions.
- No policy was created, altered or dropped; no migration was run; pgaudit was not installed; no
  secret was created; `EXEMPT_MODELS`, `getTenantPrisma` and `lib/db/prisma.ts` are untouched
  (`git diff --stat` proves it).
</verification>

<success_criteria>
1. `apps/web/scripts/audit/rls-policy-replay.ts` — pure, DB-free, line-anchored parser
   preserving the 328-statement boundary, ordered replay, two-directional diff, baseline
   application with stale-entry detection, zero-policy classification into two classes,
   integrity floors.
2. `apps/web/tests/security/rls-policy-replay.test.ts` — Vitest, no new framework; covers the
   parser anchor, CRLF, replay ordering, both diff directions, baseline suppression and stale
   entries, zero-policy classes, and the real corpus with both a "was it found" assertion and a
   length floor.
3. `apps/web/scripts/audit/rls-policy-drift.ts` — read-only runner with the required header
   (what it catches, quick-584 reference, "Postgres stores no policy creation timestamp"),
   human diff plus `--json`, exit 0/1/2, no baseline-writing flag.
4. `apps/web/scripts/audit/rls-policy-baseline.json` — 59 missing + 8 unexpected + the
   zero-policy classes, each list explicit and named, each with a `$why` referencing quick-584,
   and a `$comment` instructing deletion of the file when empty.
5. `.github/workflows/rls-policy-drift.yml` — push to master, skip-with-notice when
   `RLS_AUDIT_DATABASE_URL` is absent, build does not fail for the missing credential.
6. `apps/web/package.json` — `audit:rls-policy-drift` entry point.
7. `docs/diagnostics/rls-policy-drift-detector.md` — sample production run (masked), the CI
   credential-gap finding, the pgaudit availability + priced log volume, and the explicit list of
   what was deliberately not done.
8. One atomic commit. **Do NOT push.**
</success_criteria>

<output>
After completion, create
`.planning/quick/585-ci-policy-count-assertion-detect-silent-/585-SUMMARY.md`.

It must state:
- The exact production run numbers, and confirmation that they match quick-584 (or, if not, the
  full divergence report and the fact that execution stopped).
- The baseline's entry counts per list.
- Both tamper-probe outputs.
- The CI credential-gap finding in one paragraph, naming `RLS_AUDIT_DATABASE_URL` and stating
  that no credential was created.
- The pgaudit availability answer and the priced log volume, with the retention-not-volume
  conclusion.
- The tsc probe result and the before/after vitest counts with the reporter used.
- Anything reported rather than fixed.
</output>
