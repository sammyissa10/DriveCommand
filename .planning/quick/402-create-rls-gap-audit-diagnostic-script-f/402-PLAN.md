---
phase: quick-402
plan: 402
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/scripts/audit/audit-rls-gaps.ts
autonomous: true

must_haves:
  truths:
    - "Running `npx tsx --env-file=.env.local scripts/audit/audit-rls-gaps.ts` from apps/web prints three labeled sections to stdout"
    - "Section 1 lists every public-schema table with relrowsecurity=false"
    - "Section 2 lists every public-schema table with relrowsecurity=true AND relforcerowsecurity=false"
    - "Section 3 lists every public-schema table with RLS enabled but zero matching rows in pg_policies"
    - "Each listed table shows tenant column (or '-'), approx row count from pg_stat_user_tables.n_live_tup, and whether the table appears in apps/web/prisma/schema.prisma"
    - "Within each section, tables that have a tenant-scoping column are printed before tables that do not"
    - "Final summary line reports counts: 'X tables need RLS enabled, Y need FORCE RLS, Z have RLS but no policies'"
    - "Script performs no writes — only SELECTs from pg_catalog, information_schema, and pg_stat_user_tables"
  artifacts:
    - path: "apps/web/scripts/audit/audit-rls-gaps.ts"
      provides: "Read-only RLS gap audit diagnostic"
      contains: "pg_class"
  key_links:
    - from: "apps/web/scripts/audit/audit-rls-gaps.ts"
      to: "process.env.DATABASE_URL"
      via: "new Pool({ connectionString: ... })"
      pattern: "DATABASE_URL"
    - from: "apps/web/scripts/audit/audit-rls-gaps.ts"
      to: "apps/web/prisma/schema.prisma"
      via: "fs.readFileSync at startup, regex match on `model <Name>` blocks → @@map names"
      pattern: "schema.prisma"
---

<objective>
Create a read-only TypeScript diagnostic script at `apps/web/scripts/audit/audit-rls-gaps.ts` that surveys the public schema of the connected Postgres database and reports three categories of RLS gaps: (1) tables with RLS disabled, (2) tables with RLS enabled but FORCE RLS off, (3) tables with RLS enabled but zero policies. The script annotates each row with a tenant-scoping column, approximate row count, and whether the table is declared in `prisma/schema.prisma`.

Purpose: Give the user a single command to find every public-schema table that is missing tenant-isolation enforcement, before planning the actual RLS remediation work.

Output: A new file `apps/web/scripts/audit/audit-rls-gaps.ts`. No application code, schema, or migration files are touched.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Existing script patterns to mirror — same directory, same imports, same env-loading approach
@apps/web/scripts/audit/db-tenant-audit.ts
@apps/web/scripts/cleanup-test-tenants.ts

# Schema file the script will inspect to mark "in-Prisma vs not-in-Prisma" tables
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement audit-rls-gaps.ts diagnostic</name>
  <files>apps/web/scripts/audit/audit-rls-gaps.ts</files>
  <action>
Create a new file `apps/web/scripts/audit/audit-rls-gaps.ts`. Mirror the existing pattern in `apps/web/scripts/audit/db-tenant-audit.ts` (same directory, same Prisma+pg adapter setup, same `$queryRawUnsafe` usage) so it integrates cleanly with the audit scripts folder.

REQUIRED IMPLEMENTATION:

1. Header doc-comment explains the script is read-only, executes only SELECTs against pg_catalog / information_schema / pg_stat_user_tables, and is run via `npx tsx --env-file=.env.local scripts/audit/audit-rls-gaps.ts` from `apps/web`.

2. Imports (copy pattern from db-tenant-audit.ts):
   ```ts
   import { PrismaClient } from '../../src/generated/prisma/client';
   import { PrismaPg } from '@prisma/adapter-pg';
   import { Pool } from 'pg';
   import * as fs from 'fs';
   import * as path from 'path';
   ```

3. Setup pool/adapter/prisma exactly as db-tenant-audit.ts (lines 31-33):
   ```ts
   const pool = new Pool({ connectionString: process.env.DATABASE_URL });
   const adapter = new PrismaPg(pool);
   const prisma = new PrismaClient({ adapter });
   ```

4. Define strict row-shape interfaces (NO `any` in data shapes). Suggested set:
   ```ts
   interface TableMetaRow {
     table_name: string;
     rls_enabled: boolean;
     rls_forced: boolean;
     policy_count: number;       // bigint comes back as bigint/number — cast in SQL with ::int
     approx_row_count: number;   // n_live_tup, same handling
   }
   interface TenantColRow {
     table_name: string;
     column_name: string;
   }
   ```

5. Read prisma schema once at startup to build a `Set<string>` of @@map names (or model names where no @@map). Logic:
   - Read `apps/web/prisma/schema.prisma` via `fs.readFileSync(path.join(__dirname, '../../prisma/schema.prisma'), 'utf8')`
   - For every `model X { ... }` block, scan its body for an `@@map("name")` directive. If found, use that name; otherwise use the model name lowercased? NO — Prisma defaults to the model name as-is. Use the model name exactly as written (Prisma's default table name = model name unless @@map overrides).
   - Store all collected table names in a `Set<string>` called `prismaTables`.
   - The match function used to flag a table as "in Prisma" must be case-insensitive (compare with `.toLowerCase()` both sides) because Prisma model names are PascalCase but Postgres may have quoted-case identifiers either way.

6. ONE main query that returns table metadata + RLS flags + policy counts in a single round-trip:
   ```sql
   SELECT
     c.relname AS table_name,
     c.relrowsecurity AS rls_enabled,
     c.relforcerowsecurity AS rls_forced,
     COALESCE((
       SELECT COUNT(*)::int
       FROM pg_policies p
       WHERE p.schemaname = 'public' AND p.tablename = c.relname
     ), 0) AS policy_count,
     COALESCE(s.n_live_tup, 0)::int AS approx_row_count
   FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   LEFT JOIN pg_stat_user_tables s
     ON s.schemaname = n.nspname AND s.relname = c.relname
   WHERE n.nspname = 'public'
     AND c.relkind = 'r'
   ORDER BY c.relname
   ```

7. ONE tenant-column query (case-insensitive match on the listed names) returning `(table_name, column_name)` pairs:
   ```sql
   SELECT table_name, column_name
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND column_name ILIKE ANY (ARRAY['tenant_id','org_id','tenantid','tenantId'])
   ```
   Use the result to build a `Map<string, string>` of table_name → first matching tenant column. (If a table has both `tenantId` and `org_id`, prefer `tenantId` then `tenant_id` then `org_id` — same priority order as db-tenant-audit.ts `getTenantCol`.)

8. Categorize tables into THREE arrays:
   - `rlsDisabled` — `rls_enabled === false`
   - `rlsNotForced` — `rls_enabled === true && rls_forced === false`
   - `rlsNoPolicies` — `rls_enabled === true && policy_count === 0`
   (Note: a table can appear in BOTH `rlsNotForced` AND `rlsNoPolicies` — that's intentional, each section reports its own concern.)

9. Within each array, sort so that tables WITH a tenant column come first, then tables without. Secondary sort: alphabetical by table_name.

10. Print three labeled sections. Each section header line + a fixed-width text table with columns: `TABLE`, `TENANT_COL`, `~ROWS`, `IN_PRISMA`. Use simple padding (e.g., `name.padEnd(40)`) — do NOT depend on a table-printing library.

   Section labels exactly:
   ```
   === Section 1: Tables with RLS DISABLED (relrowsecurity = false) ===
   === Section 2: Tables with RLS enabled but FORCE RLS OFF (relforcerowsecurity = false) ===
   === Section 3: Tables with RLS enabled but ZERO policies ===
   ```

   In each section, print "(none)" if the array is empty.

11. After all three sections, print a single summary line:
   ```
   Summary: <N1> tables need RLS enabled, <N2> need FORCE RLS, <N3> have RLS but no policies
   ```

12. Finally `await prisma.$disconnect()` in a `finally` block so the script exits cleanly (mirror end of db-tenant-audit.ts).

13. Standard `main().catch((err) => { console.error(err); process.exit(1); })` runner at the bottom.

EXPLICIT NON-GOALS / GUARD-RAILS:
- DO NOT add INSERT/UPDATE/DELETE/CREATE/ALTER/DROP anywhere — not even in comments as examples.
- DO NOT use `any` in any interface or function signature touching DB row data. Use `unknown` + a type guard if absolutely needed; otherwise typed interfaces as shown.
- DO NOT modify `apps/web/prisma/schema.prisma`, any migration file, or any source file outside `apps/web/scripts/audit/`.
- DO NOT write report files to disk. Output is stdout only (this differs from db-tenant-audit.ts, which writes a markdown report — we want a quick console diagnostic).
- DO NOT install new npm packages. Everything above uses dependencies already in `apps/web/package.json` (`pg`, `@prisma/adapter-pg`, the generated PrismaClient).
- DO NOT add a `package.json` script entry — the task spec says the user runs it via the explicit `npx tsx` command.
  </action>
  <verify>
From `apps/web/`:

1. TypeScript compiles clean for the new file:
   `npx tsc --noEmit scripts/audit/audit-rls-gaps.ts`
   (If a project-wide tsc is more appropriate per existing scripts, run `npx tsc --noEmit` from `apps/web/` and confirm no NEW errors are introduced.)

2. Execute the script (read-only):
   `npx tsx --env-file=.env.local scripts/audit/audit-rls-gaps.ts`

3. Confirm the output contains all three section headers verbatim:
   - `=== Section 1: Tables with RLS DISABLED`
   - `=== Section 2: Tables with RLS enabled but FORCE RLS OFF`
   - `=== Section 3: Tables with RLS enabled but ZERO policies`

4. Confirm the final line starts with `Summary:` and contains three integers.

5. Confirm a known tenant-scoped table (e.g. `Truck`, `Driver`, or `Load` — whichever appears in any gap section) is printed at the top of its section with a non-empty `TENANT_COL` value.

6. Spot-check that `IN_PRISMA` shows `yes` for known Prisma-managed tables (e.g. `Truck`) and would show `no` for any orphan public-schema table not in `schema.prisma`.

7. Confirm no rows were modified — re-run the script and verify identical output.
  </verify>
  <done>
- File `apps/web/scripts/audit/audit-rls-gaps.ts` exists.
- Running `npx tsx --env-file=.env.local scripts/audit/audit-rls-gaps.ts` from `apps/web/` prints three labeled sections plus a one-line summary.
- All listed tables include tenant column, approximate row count, and IN_PRISMA flag.
- Tenant-scoped tables are sorted to the top of each section.
- TypeScript `tsc --noEmit` succeeds with no new errors.
- No file outside `apps/web/scripts/audit/audit-rls-gaps.ts` is modified.
  </done>
</task>

</tasks>

<verification>
1. `ls apps/web/scripts/audit/audit-rls-gaps.ts` shows the file exists.
2. `git status` shows only `apps/web/scripts/audit/audit-rls-gaps.ts` as added — no other files modified.
3. `grep -niE 'INSERT|UPDATE |DELETE |ALTER |CREATE |DROP ' apps/web/scripts/audit/audit-rls-gaps.ts` returns no matches inside SQL strings (matches inside comments/doc-strings are fine if any, but the script must contain no executable DML/DDL).
4. `grep -n ': any' apps/web/scripts/audit/audit-rls-gaps.ts` returns no matches on row/data shapes.
5. From `apps/web/`: `npx tsc --noEmit` passes with no new errors introduced by this file.
6. From `apps/web/`: `npx tsx --env-file=.env.local scripts/audit/audit-rls-gaps.ts` runs to completion, exits 0, and prints all three section headers plus the summary line.
</verification>

<success_criteria>
- User can run a single command (`npx tsx --env-file=.env.local scripts/audit/audit-rls-gaps.ts` from `apps/web/`) and see a categorized list of every public-schema RLS gap, with tenant-scoping hints, approximate row counts, and Prisma-ownership flags.
- The script is read-only, type-safe (no `any` on DB data shapes), and follows the existing audit script pattern at `apps/web/scripts/audit/db-tenant-audit.ts`.
- No application code, schema, migration, or other script is altered.
</success_criteria>

<output>
After completion, create `.planning/quick/402-create-rls-gap-audit-diagnostic-script-f/402-SUMMARY.md` documenting:
- File created and exact relative path.
- The three SQL queries used (main metadata, tenant columns, prisma schema parse approach).
- A snippet of actual script output from a real run (sanitized of any sensitive table contents — table names are fine).
- Any tables found in each of the three gap categories, so the user has the immediate answer to "what's missing RLS today?"
</output>
