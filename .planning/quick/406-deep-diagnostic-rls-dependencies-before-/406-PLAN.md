---
phase: quick-406
plan: 406
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/scripts/audit/deep-diagnostic-rls-fix.ts
  - apps/web/scripts/audit/405c-DEEP-DIAGNOSTIC.md
autonomous: true

must_haves:
  truths:
    - "Running `npx tsx --env-file=.env.local scripts/audit/deep-diagnostic-rls-fix.ts` from apps/web prints five labeled diagnostic sections plus a GO/NO-GO summary to the console"
    - "The same five-section content is written to apps/web/scripts/audit/405c-DEEP-DIAGNOSTIC.md in markdown format with ## headers and **bold** verdict lines"
    - "Section 1 reports current_tenant_id() prosrc, provolatile, prosecdef, owner role, plus all public-schema functions whose body references 'tenant_id', with a SAFE/RISKY verdict"
    - "Section 2 prints every pg_policies row for Tenant (policyname, roles, cmd, permissive, qual, with_check) plus existing pg_roles that match the policy roles, with a TENANT FORCE RLS SAFE/UNSAFE verdict"
    - "Section 3 prints every pg_policies row for carrier_documents, route_template_stops, stops, TicketMessage and lists functions called inside each policy's qual/with_check expressions, with a per-table FORCE RLS LIKELY SAFE / NEEDS REVIEW verdict"
    - "Section 4 reports grid_preference.userId and grid_view.userId column shape (data_type, udt_name, is_nullable) and the FK target table.column (if any), with a per-table AUTH.UID() WILL WORK / WILL FAIL / MANUAL VERIFICATION verdict"
    - "Section 5 lists every NotificationEmailConfig column (name, data_type, is_nullable, default), highlights any column whose name contains tenant/org/user/owner/account/company/customer, with a SAFE TO TREAT AS GLOBAL_LOOKUP / RECLASSIFY verdict"
    - "The script performs zero writes — only SELECT against pg_proc, pg_namespace, pg_policies, pg_roles, information_schema; failed queries are caught and reported as NOT FOUND rather than crashing"
  artifacts:
    - path: "apps/web/scripts/audit/deep-diagnostic-rls-fix.ts"
      provides: "Read-only deep diagnostic script answering four RLS dependency questions"
      contains: "current_tenant_id"
    - path: "apps/web/scripts/audit/405c-DEEP-DIAGNOSTIC.md"
      provides: "Markdown mirror of the five sections + GO/NO-GO summary"
      contains: "GO / NO-GO SUMMARY"
  key_links:
    - from: "apps/web/scripts/audit/deep-diagnostic-rls-fix.ts"
      to: "pg_proc / pg_policies / information_schema"
      via: "prisma.$queryRawUnsafe via PrismaPg + pg Pool"
      pattern: "\\$queryRawUnsafe"
    - from: "apps/web/scripts/audit/deep-diagnostic-rls-fix.ts"
      to: "apps/web/scripts/audit/405c-DEEP-DIAGNOSTIC.md"
      via: "fs.writeFileSync of accumulated markdown buffer"
      pattern: "writeFileSync"
---

<objective>
Build a read-only deep diagnostic script that answers four specific dependency questions before designing the Supabase advisor RLS fix migration. The output drives the GO/NO-GO call on (a) forcing RLS on Tenant, (b) forcing RLS on Tier 4 tables with existing policies, (c) writing auth.uid() policies for grid_preference / grid_view, and (d) treating NotificationEmailConfig as a global lookup.

Purpose: Replaces guesswork with catalog truth. quick-402 found the gaps, quick-405 classified the targets, and quick-406 verifies the assumptions the upcoming fix migration is built on. The script must be safe to re-run any time — pure SELECTs against system catalogs.

Output:
- apps/web/scripts/audit/deep-diagnostic-rls-fix.ts (the script)
- apps/web/scripts/audit/405c-DEEP-DIAGNOSTIC.md (markdown mirror)
- Console output of the five sections + final GO/NO-GO summary
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/scripts/audit/audit-rls-gaps.ts
@apps/web/scripts/audit/inspect-rls-fix-targets.ts
@.planning/quick/405-inspect-column-shapes-of-13-rls-fix-targ/405-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create deep-diagnostic-rls-fix.ts with all five sections + GO/NO-GO summary</name>
  <files>apps/web/scripts/audit/deep-diagnostic-rls-fix.ts</files>
  <action>
Create `apps/web/scripts/audit/deep-diagnostic-rls-fix.ts`. Match the connection boilerplate and code style of `apps/web/scripts/audit/inspect-rls-fix-targets.ts` EXACTLY (same imports, same Pool + PrismaPg + PrismaClient construction, same prisma.$queryRawUnsafe call shape, same TypeScript strict-mode discipline — zero `any` types, explicit row interfaces for every catalog query).

Top-of-file JSDoc must declare: read-only, no DDL/DML, run command `npx tsx --env-file=.env.local scripts/audit/deep-diagnostic-rls-fix.ts`, and the five sections.

Imports (exactly):
```typescript
import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
```

Setup (exactly):
```typescript
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
```

Implement a dual-output helper: `function emit(line: string, buf: string[]): void` that does `console.log(line)` and `buf.push(line)`. Every diagnostic line in every section goes through `emit()` so the markdown buffer and the console stay in sync.

Implement a `safeQuery<T>(label: string, sql: string, buf: string[]): Promise<T[]>` helper that wraps `prisma.$queryRawUnsafe<T[]>(sql)` in try/catch. On error, emit a `NOT FOUND: ${label} — ${err.message}` line and return `[]` so the script never crashes mid-section.

Define explicit row interfaces — one per query shape — at the top of the file (no `any`). Examples:
```typescript
interface ProcRow { proname: string; prosrc: string; provolatile: string; prosecdef: boolean; owner: string; }
interface PolicyRow { policyname: string; roles: string[]; cmd: string; permissive: string; qual: string | null; with_check: string | null; }
interface RoleRow { rolname: string; }
interface ColumnRow { column_name: string; data_type: string; udt_name: string; is_nullable: string; column_default: string | null; }
interface FKRow { column_name: string; foreign_schema: string; foreign_table: string; foreign_column: string; }
interface TenantRefRow { proname: string; prosrc: string; }
```

Add a small verdict tracker:
```typescript
const verdicts: string[] = [];
function recordVerdict(line: string, buf: string[]): void { emit(line, buf); verdicts.push(line); }
```
Every verdict line is emitted with `recordVerdict` so the final GO/NO-GO summary can re-print them in one block.

---

SECTION 1 — current_tenant_id() function definition
- Header: `=== SECTION 1: current_tenant_id() function definition ===` (console) and `## Section 1 — current_tenant_id() function definition` (markdown buffer uses `## ` prefix in addition to the same content; simplest implementation: keep one emit stream and prefix markdown headers everywhere. To avoid drift, write markdown-shaped text and let console show it raw — `## Section 1 — ...` reads fine in both. Use this approach.)
- Query 1 — function definition:
```sql
SELECT p.proname,
       p.prosrc,
       p.provolatile,
       p.prosecdef,
       r.rolname AS owner
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE n.nspname = 'public' AND p.proname = 'current_tenant_id';
```
- If row returned: emit a fenced code block containing `prosrc` (the function body), and a small markdown table for provolatile / prosecdef / owner. Interpret prosecdef: `true → SECURITY DEFINER`, `false → SECURITY INVOKER`.
- If zero rows: emit `NOT FOUND: current_tenant_id() does not exist in public schema`.
- Query 2 — every public-schema function whose body references the string `tenant_id`:
```sql
SELECT p.proname, p.prosrc
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosrc ILIKE '%tenant_id%'
ORDER BY p.proname;
```
- Emit each match as a row in a markdown table (proname column only, then a fenced code block per function with first ~15 lines of prosrc — truncate long bodies with `… [truncated]`).
- Verdict (via `recordVerdict`):
  - `**SAFE TO FORCE RLS ON TENANT**` if `prosecdef === true`
  - `**RISKY — VERIFY POLICIES**` if `prosecdef === false` OR function not found

---

SECTION 2 — Tenant table existing policies (full SQL)
- Header: `## Section 2 — Tenant table existing policies`
- Query:
```sql
SELECT policyname, roles, cmd, permissive, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'Tenant'
ORDER BY policyname;
```
- For each policy, emit a sub-section `### Policy: <policyname>` and a markdown table of roles / cmd / permissive, then two fenced code blocks for `qual` (USING) and `with_check` (WITH CHECK). If either is NULL, emit `(none)`.
- Then for each unique role across all policies, query:
```sql
SELECT rolname FROM pg_roles WHERE rolname = ANY($1);
```
Pass the unique roles array via `prisma.$queryRawUnsafe<RoleRow[]>(sql, uniqueRoles)`. Emit a "Postgres roles that match the policy roles" markdown table.
- Verdict: scan all policies' qual + with_check strings (concatenated, lowercased).
  - If any policy text contains `current_tenant_id()` OR (the policy is permissive AND the cmd allows SELECT for an app role) → `**TENANT FORCE RLS SAFE**`
  - Otherwise → `**TENANT FORCE RLS UNSAFE**`
- If zero policies returned → `**TENANT FORCE RLS UNSAFE — no policies on Tenant**`

---

SECTION 3 — Existing policies on Tier 4 tables
- Header: `## Section 3 — Tier 4 table policies (carrier_documents, route_template_stops, stops, TicketMessage)`
- For each tablename in `['carrier_documents', 'route_template_stops', 'stops', 'TicketMessage']`:
  - Emit `### Table: <name>`
  - Run the same pg_policies query as Section 2 (parameterized on tablename).
  - For each policy emit its full SQL (policyname / roles / cmd / qual / with_check) exactly as in Section 2.
  - Parse functions called in any policy's qual or with_check: simple regex `/([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g`. Concatenate qual + ' ' + with_check across all policies for the table. Build a Set of matches. Filter out SQL keywords: `IN`, `AND`, `OR`, `NOT`, `EXISTS`, `ANY`, `ALL`, `SELECT`, `WHERE`, `FROM`, `JOIN`, `ON`, `IS`, `NULL`, `TRUE`, `FALSE`, `CASE`, `WHEN`, `THEN`, `ELSE`, `END`, `COALESCE`, `CAST`. (Use a const Set; compare case-insensitively.)
  - Emit the remaining function names as a markdown bullet list under "Functions called in policy expressions".
  - Per-table verdict: if the function set is a subset of `{ 'current_tenant_id' }` (or empty) AND every policy qual/with_check only contains that function call or simple comparisons → `**<table>: FORCE RLS LIKELY SAFE — POLICY USES STANDARD PATTERN**`. Otherwise → `**<table>: FORCE RLS NEEDS REVIEW — POLICY CALLS [<comma_separated_functions>]**`.
  - If zero policies on the table → `**<table>: FORCE RLS NEEDS REVIEW — no policies on table**` (Tier 4 tables are expected to have policies; absence is itself a finding).

---

SECTION 4 — userId column resolution for grid_preference and grid_view
- Header: `## Section 4 — userId FK resolution for grid_preference and grid_view`
- For each tablename in `['grid_preference', 'grid_view']`:
  - Emit `### Table: <name>`
  - Query column shape:
```sql
SELECT column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'userId';
```
  - Query FK target:
```sql
SELECT kcu.column_name,
       ccu.table_schema AS foreign_schema,
       ccu.table_name   AS foreign_table,
       ccu.column_name  AS foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name = $1
  AND kcu.column_name = 'userId';
```
  - Emit a markdown table for the column shape, then a fenced text line `<table>.userId references <foreign_schema>.<foreign_table>.<foreign_column>` (or `(no FK)` if zero rows).
  - Verdict:
    - If foreign_schema = `auth` AND foreign_table = `users` AND foreign_column = `id` → `**<table>: AUTH.UID() POLICY WILL WORK**`
    - Else if FK exists but to a different target → `**<table>: AUTH.UID() POLICY WILL FAIL — userId references <foreign_schema>.<foreign_table>.<foreign_column>**`
    - Else (no FK) → `**<table>: MANUAL VERIFICATION NEEDED — userId has no FK**`

---

SECTION 5 — NotificationEmailConfig full column inventory
- Header: `## Section 5 — NotificationEmailConfig column inventory`
- Query:
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'NotificationEmailConfig'
ORDER BY ordinal_position;
```
- Flag any column whose name (lowercased) contains any of: `tenant`, `org`, `user`, `owner`, `account`, `company`, `customer`. Use:
```typescript
const FLAG_TOKENS = ['tenant','org','user','owner','account','company','customer'] as const;
```
- Emit a markdown table with columns: Name | Data Type | Nullable | Default | Flagged. Flagged column rows must show `YES (matches: <tokens>)` in the Flagged column; unflagged rows show `-`.
- Verdict:
  - If zero flagged columns → `**SAFE TO TREAT AS GLOBAL_LOOKUP**`
  - Else → `**RECLASSIFY — FLAGGED COLUMNS: <comma_separated_column_names>**`
- If zero columns returned at all → `**NOT FOUND — NotificationEmailConfig table missing**` and skip the verdict logic.

---

GO / NO-GO SUMMARY (final block):
- Header: `## GO / NO-GO SUMMARY`
- Re-emit every line in `verdicts[]` as a bullet list.
- Then emit a final recommendation line based on this rule:
  - If ALL verdicts contain `SAFE` or `WILL WORK` or `LIKELY SAFE` (and none contain `UNSAFE`, `RISKY`, `WILL FAIL`, `NEEDS REVIEW`, `RECLASSIFY`, `MANUAL VERIFICATION`) → `**FINAL RECOMMENDATION: GO — proceed with advisor fix migration as designed**`
  - Otherwise → `**FINAL RECOMMENDATION: NO-GO — address flagged items before writing migration**` followed by a short bullet list of which items need attention (re-print the offending verdict lines).

---

Markdown file write (at the very end of main, AFTER all sections and the GO/NO-GO summary have been emitted):
```typescript
const outPath = path.join(__dirname, '405c-DEEP-DIAGNOSTIC.md');
fs.writeFileSync(outPath, buf.join('\n') + '\n', 'utf8');
console.log('');
console.log(`Wrote markdown report to: ${outPath}`);
```
Use a single `const buf: string[] = []` declared in main() and threaded into every section function. Top of buf should have a title line: `# Deep Diagnostic — RLS Fix Migration Prerequisites` and a generated-at line: `Generated: ${new Date().toISOString()}`.

Main function structure:
```typescript
async function main(): Promise<void> {
  const buf: string[] = [];
  emit('# Deep Diagnostic — RLS Fix Migration Prerequisites', buf);
  emit(`Generated: ${new Date().toISOString()}`, buf);
  emit('', buf);

  await section1(buf);
  await section2(buf);
  await section3(buf);
  await section4(buf);
  await section5(buf);
  await summary(buf);

  const outPath = path.join(__dirname, '405c-DEEP-DIAGNOSTIC.md');
  fs.writeFileSync(outPath, buf.join('\n') + '\n', 'utf8');
  emit('', buf);
  console.log(`Wrote markdown report to: ${outPath}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
```

GUARD-RAILS — verify in code review before commit:
- Zero `any` types (use the explicit row interfaces).
- Zero DDL or DML — only SELECT statements in every $queryRawUnsafe call. (Add a top-of-file comment block restating this, same as inspect-rls-fix-targets.ts.)
- Every $queryRawUnsafe is wrapped via safeQuery() so a single missing object never crashes the run.
- Parameterized queries use the second argument to $queryRawUnsafe (positional `$1`) — never string-concatenate user input. (All inputs here are hard-coded table/role names, but use the parameter form for any value that varies by iteration.)
- No `process.env.DATABASE_URL` fallback — if the env var is missing, pg.Pool will error, which is the correct behavior.
  </action>
  <verify>
From `apps/web/`:
```
npx tsc --noEmit scripts/audit/deep-diagnostic-rls-fix.ts
npx tsx --env-file=.env.local scripts/audit/deep-diagnostic-rls-fix.ts
```
Expectations:
1. tsc passes with zero errors (strict mode, no `any`).
2. The script runs to completion without throwing.
3. Console prints five `## Section N — ...` headers in order.
4. Console ends with `## GO / NO-GO SUMMARY` block followed by `**FINAL RECOMMENDATION: ...**` and `Wrote markdown report to: .../405c-DEEP-DIAGNOSTIC.md`.
5. `apps/web/scripts/audit/405c-DEEP-DIAGNOSTIC.md` exists and contains all five `## Section` headers + the GO/NO-GO summary.
6. Grep the script for forbidden tokens — none must match:
   - `INSERT INTO`, `UPDATE `, `DELETE FROM`, `ALTER `, `CREATE `, `DROP `, `TRUNCATE ` (case-insensitive)
   - `: any`, `<any>`, ` as any`
  </verify>
  <done>
- `apps/web/scripts/audit/deep-diagnostic-rls-fix.ts` exists, compiles under strict TypeScript, and runs to completion against the live Supabase database.
- `apps/web/scripts/audit/405c-DEEP-DIAGNOSTIC.md` is generated with the five sections + GO/NO-GO summary.
- Every verdict line is present in both the console output and the markdown file.
- The script contains no DDL/DML and no `any` types.
  </done>
</task>

</tasks>

<verification>
1. From `apps/web/`, run `npx tsc --noEmit scripts/audit/deep-diagnostic-rls-fix.ts` — must exit 0.
2. From `apps/web/`, run `npx tsx --env-file=.env.local scripts/audit/deep-diagnostic-rls-fix.ts` — must exit 0, print five sections and a final GO/NO-GO summary, and write `405c-DEEP-DIAGNOSTIC.md`.
3. Open `405c-DEEP-DIAGNOSTIC.md` — confirm it contains `## Section 1`, `## Section 2`, `## Section 3`, `## Section 4`, `## Section 5`, `## GO / NO-GO SUMMARY`, and a `**FINAL RECOMMENDATION: ...**` line.
4. Search the script source for `INSERT |UPDATE |DELETE |ALTER |CREATE |DROP |TRUNCATE ` (case-insensitive) — zero hits.
5. Search the script source for `: any`, `<any>`, ` as any` — zero hits.
6. Re-running the script must produce the same structural output (idempotent, read-only).
</verification>

<success_criteria>
- Script file created at `apps/web/scripts/audit/deep-diagnostic-rls-fix.ts`.
- Markdown report written to `apps/web/scripts/audit/405c-DEEP-DIAGNOSTIC.md` on every run.
- Five labeled sections plus a final GO/NO-GO summary appear in both console and markdown, in order.
- Each verdict line follows the exact wording specified in `must_haves.truths` so downstream readers (and the migration planner) can grep for them.
- Read-only: zero DDL/DML, no `any` types, errors are caught and reported per-query rather than crashing the run.
- Connection boilerplate matches `inspect-rls-fix-targets.ts` exactly (PrismaClient + PrismaPg + Pool).
</success_criteria>

<output>
After completion, create `.planning/quick/406-deep-diagnostic-rls-dependencies-before-/406-SUMMARY.md` summarizing:
- The script file path and run command.
- The markdown output file path.
- A copy of the GO/NO-GO summary block emitted by the run (capture from console).
- Any verdicts that came back as NO-GO so the next task (designing the advisor fix migration) starts with a clear list of items to resolve.
</output>
