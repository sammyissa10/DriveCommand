---
phase: quick-415
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/scripts/audit/diagnose-trip-column-drift.ts
autonomous: true

must_haves:
  truths:
    - "Script outputs the list of Trip fields declared in schema.prisma"
    - "Script outputs the list of Trip table columns present in the production DB (queries both 'Trip' and 'trip' table names)"
    - "Script outputs a diff: columns in schema but missing from DB, and columns in DB but missing from schema"
    - "Script scans prisma/migrations/ and reports which migration files (if any) reference the missing columns"
    - "Script prints a clear remediation recommendation (e.g., 'create a baseline migration for X,Y,Z' or 'apply pending migration <file>')"
    - "Script is read-only — performs no DDL or DML against the database and does not edit schema.prisma or migration files"
  artifacts:
    - path: "apps/web/scripts/audit/diagnose-trip-column-drift.ts"
      provides: "Read-only diagnostic for Trip model vs live DB drift, with migration scan and remediation output"
      min_lines: 120
  key_links:
    - from: "apps/web/scripts/audit/diagnose-trip-column-drift.ts"
      to: "process.env.DATABASE_URL"
      via: "pg Pool + PrismaPg adapter (existing project pattern)"
      pattern: "new Pool\\(\\{ connectionString: process\\.env\\.DATABASE_URL"
    - from: "apps/web/scripts/audit/diagnose-trip-column-drift.ts"
      to: "apps/web/prisma/schema.prisma"
      via: "fs.readFileSync + regex parse of `model Trip { ... }` block"
      pattern: "model Trip \\{"
    - from: "apps/web/scripts/audit/diagnose-trip-column-drift.ts"
      to: "apps/web/prisma/migrations/"
      via: "fs scan of migration.sql files, grep for missing column names"
      pattern: "ALTER TABLE.*ADD COLUMN|CREATE TABLE.*Trip"
---

<objective>
Build a read-only diagnostic script that explains the production P2022 "column does not exist" error on the Trip model by comparing the Prisma schema against the live database and the migrations history.

Purpose: Identify the exact column(s) that drifted, prove whether a migration exists for them, and recommend the minimal safe remediation — without touching schema, migrations, or runtime code.

Output: `apps/web/scripts/audit/diagnose-trip-column-drift.ts` — runnable via `npx tsx --env-file=.env.local scripts/audit/diagnose-trip-column-drift.ts` from `apps/web`. Console report sectioned: schema fields, DB columns, diff, migration scan, recommendation.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

# Existing audit-script connection + adapter pattern to follow
@apps/web/scripts/audit/db-tenant-audit.ts

# Source of truth for Trip model fields (note Trip uses @map snake_case → physical table is "trip" via @@map)
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build Trip column drift diagnostic script</name>
  <files>apps/web/scripts/audit/diagnose-trip-column-drift.ts</files>
  <action>
Create a read-only diagnostic TypeScript script following the existing pattern in `apps/web/scripts/audit/db-tenant-audit.ts` (pg Pool + PrismaPg adapter + PrismaClient from `../../src/generated/prisma/client`).

The script must produce a sectioned console report:

**SECTION 1 — Schema parse**
- Read `apps/web/prisma/schema.prisma` via `fs.readFileSync`.
- Locate the `model Trip { ... }` block (regex or line scan from `^model Trip ` to the next `^}`).
- Extract each field line. For every field, capture:
  - Prisma field name (first token)
  - Prisma type (second token)
  - Physical column name — if the field has `@map("xxx")`, use `xxx`; otherwise use the Prisma field name verbatim.
  - Skip relation fields (lines whose type references another model with no `@db.` / no scalar) and skip lines starting with `@@`.
- Also detect the table name: look for `@@map("xxx")` inside the model block. If present, the physical table name is `xxx`; otherwise default to `Trip` (Prisma's default is the model name as-is, PascalCase).
- Print: detected table name, total field count, and the list of physical column names.

**SECTION 2 — Live DB columns**
- Query `information_schema.columns` for the Trip table. Try BOTH candidate names so the script works regardless of casing convention:
  - The detected `@@map` name (if any)
  - `"Trip"` (PascalCase — Prisma default when no @@map)
  - `"trip"` (lowercase — common Postgres folding)
- Use `$queryRawUnsafe` with parameterized table_name. For each candidate, run:
  ```sql
  SELECT column_name, data_type, udt_name, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = $1
  ORDER BY ordinal_position;
  ```
- Report which candidate(s) returned rows. If multiple match, list all (drift is more serious then).
- Print the live column list for the matched table.

**SECTION 3 — Diff**
- Compute and print two sets:
  - `MISSING_IN_DB` = schema physical columns NOT in live DB (these are what cause P2022)
  - `EXTRA_IN_DB` = live DB columns NOT in schema (orphans / never removed)
- Format both as bulleted lists with column name + Prisma type (for missing) or DB data_type (for extras).
- If `MISSING_IN_DB` is empty, print "NO DRIFT — schema matches DB" and exit recommendation as such.

**SECTION 4 — Migration scan**
- Read every `migration.sql` file under `apps/web/prisma/migrations/**/migration.sql` (use `fs.readdirSync` + recursive walk OR `fs.readdirSync` of `prisma/migrations` and look for `migration.sql` per subdir).
- For each `MISSING_IN_DB` column, grep the file contents (case-insensitive) for the column name AND for `ALTER TABLE`/`ADD COLUMN`/`CREATE TABLE` patterns mentioning the Trip table.
- Print a table: `column_name | migration_dir | line_match` for every hit. If a column has zero hits, print `<column>: NO MIGRATION FOUND` — this means it was added to schema.prisma without a migration ever being authored, which is the most likely root cause of the production P2022.

**SECTION 5 — Recommendation**
- Branch on results:
  - If `MISSING_IN_DB` is empty → "No drift detected. The P2022 may originate from a stale `@prisma/client` build in production — run `prisma generate` and redeploy."
  - If `MISSING_IN_DB` non-empty AND every missing column has migration hits → "Pending migrations exist but were not applied to production. Recommended fix: run `prisma migrate deploy` against the production DATABASE_URL. Migration files involved: <list dirs>."
  - If `MISSING_IN_DB` non-empty AND any missing column has NO migration hits → "Schema drift without source-controlled migration. Recommended fix: author a new migration via `prisma migrate dev --name add_trip_<cols> --create-only`, review the generated SQL, then `prisma migrate deploy` to production. Columns needing a new migration: <list>."
  - If `EXTRA_IN_DB` non-empty → append a warning: "DB has columns not in schema — investigate before any destructive remediation."

**Constraints (enforce in code + comments):**
- ZERO DDL/DML: only `SELECT` from `information_schema`. No `prisma.$executeRaw`, no `ALTER`, no `INSERT`/`UPDATE`/`DELETE`.
- Do NOT modify `schema.prisma`, files under `prisma/migrations/`, or any application source.
- Use `process.env.DATABASE_URL` via the existing `pg Pool` + `PrismaPg` adapter pattern from `db-tenant-audit.ts`. Do NOT introduce a new DB connection library.
- Wrap the main flow in `try/finally` and always `await prisma.$disconnect()` + `await pool.end()`.
- Exit code 0 on success even when drift is found (this is a diagnostic, not a CI gate). Exit code 1 only on script errors (failed query, file read failure, etc.).
- Top-of-file JSDoc-style comment mirrors the style of `db-tenant-audit.ts`: purpose, run command (`npx tsx --env-file=.env.local scripts/audit/diagnose-trip-column-drift.ts` from `apps/web`), and explicit "READ-ONLY — performs no DDL/DML" disclaimer.

**Why this approach (avoid alternatives):**
- Do NOT use `prisma db pull` to compare — it mutates `schema.prisma`. We need pure read-only.
- Do NOT use `prisma migrate status` alone — it tells you applied vs pending, but does not show physical column diff; we need both views.
  </action>
  <verify>
From `apps/web`:
1. `npx tsc --noEmit scripts/audit/diagnose-trip-column-drift.ts` — must compile clean (no new TS errors beyond the baseline 35).
2. `npx tsx --env-file=.env.local scripts/audit/diagnose-trip-column-drift.ts` — must run without throwing and print all 5 sections.
3. Re-run with the DB connection unplugged (rename `.env.local` temporarily) — script must fail fast with a clear error message, NOT a stack trace from the middle of the report.
4. `git status` — only the new file appears; `schema.prisma`, `prisma/migrations/`, and all application source are unchanged.
  </verify>
  <done>
- File `apps/web/scripts/audit/diagnose-trip-column-drift.ts` exists, ≥120 lines, with all 5 sections and the top-of-file read-only disclaimer.
- Running the script against production `DATABASE_URL` prints: schema field count, live DB column count, MISSING_IN_DB list, EXTRA_IN_DB list, per-column migration-file hits, and a single concrete remediation recommendation matching one of the four documented branches.
- Zero changes to `schema.prisma`, `prisma/migrations/`, or any file outside `apps/web/scripts/audit/`.
- TypeScript compiles with no new errors over baseline.
  </done>
</task>

</tasks>

<verification>
- `git status` shows exactly one new file: `apps/web/scripts/audit/diagnose-trip-column-drift.ts`.
- Running the script against the production DB prints all five sections and ends with a specific recommendation (one of the four branches).
- Schema, migrations, and application code are untouched.
- TypeScript baseline preserved.
</verification>

<success_criteria>
- Diagnostic script committed and runnable in one command from `apps/web`.
- Output unambiguously identifies (a) which Trip column(s) the production DB is missing, (b) whether a migration exists for them, and (c) the next safe action — without any change to production state.
</success_criteria>

<output>
After completion, create `.planning/quick/415-diagnose-trip-model-column-drift-causing/415-SUMMARY.md` documenting:
- The actual drift found when the script was run (columns missing, columns extra)
- Which migration files (if any) contained the missing columns
- The recommendation branch the script landed on
- Exact next-step command for remediation (deferred — not executed in this quick task)
</output>
