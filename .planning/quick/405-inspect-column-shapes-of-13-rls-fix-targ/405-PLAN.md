---
phase: quick-405
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/scripts/audit/inspect-rls-fix-targets.ts
autonomous: true

must_haves:
  truths:
    - "Running the script from apps/web/ prints column shapes, ownership flags, existing policies, FK targets, and approx row counts for all 13 RLS-fix-target tables in the specified order"
    - "Script executes only SELECT queries against information_schema, pg_catalog, and pg_stat_user_tables — no DDL/DML anywhere"
    - "Each table's five queries run sequentially (not in parallel) to avoid spamming the connection pool"
    - "Final recommendation summary table classifies each of the 13 tables as TENANT_SCOPED | USER_OWNED | GLOBAL_LOOKUP | UNKNOWN with detected ownership column"
    - "No `any` types appear in DB row shape interfaces"
  artifacts:
    - path: "apps/web/scripts/audit/inspect-rls-fix-targets.ts"
      provides: "Read-only RLS-fix-target inspection diagnostic"
      min_lines: 200
      contains: "inspect-rls-fix-targets"
  key_links:
    - from: "apps/web/scripts/audit/inspect-rls-fix-targets.ts"
      to: "Postgres public schema"
      via: "PrismaClient with PrismaPg adapter over pg.Pool"
      pattern: "new PrismaClient\\(\\{ adapter \\}\\)"
    - from: "apps/web/scripts/audit/inspect-rls-fix-targets.ts"
      to: "information_schema + pg_catalog + pg_policies + pg_stat_user_tables"
      via: "prisma.$queryRawUnsafe with parameterized table name"
      pattern: "\\$queryRawUnsafe"
---

<objective>
Create a single read-only TypeScript diagnostic script that inspects column shapes, ownership columns, existing RLS policies, outgoing FKs, and approximate row counts for the 13 tables targeted by upcoming RLS remediation. The output must be sufficient to design correct RLS policies (tenant-scoped vs user-owned vs global lookup) without further DB introspection.

Purpose: Provide the schema-level evidence needed to author the next migration that backfills RLS policies across these 13 tables. Match the existing audit-rls-gaps.ts script style exactly so the next dev pair (or future Claude) can read both scripts as a coherent set.

Output: `apps/web/scripts/audit/inspect-rls-fix-targets.ts`
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Pattern to mirror — connection setup, row-shape interfaces, queryRawUnsafe usage, padRight/printSection helpers, no-`any` strictness
@apps/web/scripts/audit/audit-rls-gaps.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create inspect-rls-fix-targets.ts diagnostic script</name>
  <files>apps/web/scripts/audit/inspect-rls-fix-targets.ts</files>
  <action>
Create a new file at `apps/web/scripts/audit/inspect-rls-fix-targets.ts` that mirrors the structure and conventions of `apps/web/scripts/audit/audit-rls-gaps.ts` exactly.

**1. File header comment block** — match the audit-rls-gaps.ts header style. State:
- Purpose: inspect column shapes + existing policies + FKs + row counts for the 13 RLS-fix-target tables
- Output sections: per-table report (5 subsections) + final classification summary table
- GUARD-RAILS: only SELECTs against information_schema, pg_catalog, pg_policies, pg_stat_user_tables — no INSERT/UPDATE/DELETE/ALTER/CREATE/DROP anywhere
- Run command: `npx tsx --env-file=.env.local scripts/audit/inspect-rls-fix-targets.ts` from `apps/web/`

**2. Connection setup** — identical to audit-rls-gaps.ts lines 27-39:
```ts
import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
```

**3. Target table list** — declare as a `const` tuple (preserves order, no `any`):
```ts
const TARGET_TABLES = [
  'carrier_compliance_alert_log',
  'carrier_documents',
  'route_template_stops',
  'stops',
  'TicketMessage',
  'grid_preference',
  'grid_view',
  'carrier_catalog_meta',
  'NotificationEmailConfig',
  'NotificationTemplate',
  'Plan',
  'Promo',
  'Tenant',
] as const;
```

**4. Ownership column list** — declare known ownership column names to flag:
```ts
const OWNERSHIP_COLUMN_NAMES = [
  'tenant_id', 'org_id', 'tenantId', 'tenantid',
  'user_id', 'userId', 'userid',
  'owner_id', 'ownerId', 'ownerid',
  'created_by', 'createdBy', 'createdby',
] as const;
```

**5. Row-shape interfaces** — typed, no `any` anywhere in DB row shapes:
```ts
interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: string; // 'YES' | 'NO' from information_schema
}

interface PolicyRow {
  policyname: string;
  cmd: string;
  qual: string | null;
}

interface ForeignKeyRow {
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
}

interface RowCountRow {
  approx_row_count: number;
}
```

**6. Per-table inspection function** — `async function inspectTable(tableName: string): Promise<void>` that runs FIVE queries SEQUENTIALLY (no Promise.all) and prints results inline:

   **Query A — columns:**
   ```sql
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = $1
   ORDER BY ordinal_position
   ```
   Print as a 3-column padded table.

   **Query B — ownership detection:** filter the column list (already fetched in A) for any name in `OWNERSHIP_COLUMN_NAMES`. Print flagged column names on one line, or `(none detected)`.

   **Query C — existing policies:**
   ```sql
   SELECT policyname, cmd, qual
   FROM pg_policies
   WHERE schemaname = 'public' AND tablename = $1
   ```
   Print each policy as: `<name> [<cmd>] qual=<qual or NULL>`. If empty, print `(no policies)`.

   **Query D — outgoing FKs:**
   ```sql
   SELECT
     kcu.column_name,
     ccu.table_name AS foreign_table_name,
     ccu.column_name AS foreign_column_name
   FROM information_schema.table_constraints tc
   JOIN information_schema.key_column_usage kcu
     ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
   JOIN information_schema.referential_constraints rc
     ON tc.constraint_name = rc.constraint_name
     AND tc.table_schema = rc.constraint_schema
   JOIN information_schema.constraint_column_usage ccu
     ON rc.unique_constraint_name = ccu.constraint_name
     AND rc.unique_constraint_schema = ccu.constraint_schema
   WHERE tc.constraint_type = 'FOREIGN KEY'
     AND tc.table_schema = 'public'
     AND tc.table_name = $1
   ORDER BY kcu.column_name
   ```
   Print each FK as: `<col> -> <foreign_table>.<foreign_col>`. If empty, print `(no outgoing FKs)`.

   **Query E — row count:**
   ```sql
   SELECT COALESCE(n_live_tup, 0)::int AS approx_row_count
   FROM pg_stat_user_tables
   WHERE schemaname = 'public' AND relname = $1
   ```
   Print as `Approx rows: <n>`. Handle empty result (table not in pg_stat) as `Approx rows: 0`.

   Use `prisma.$queryRawUnsafe<T[]>(sql, tableName)` for each query — parameterized via the second arg so the table name is safely bound. Important: pg_class/pg_stat tables use `relname` (case-sensitive match for quoted names like `TicketMessage`, `NotificationEmailConfig`, `Plan`, `Promo`, `Tenant`). Pass the table name verbatim from `TARGET_TABLES`.

   Section header for each table: `=== <N>/13: <table_name> ===` followed by 5 labeled subsections.

**7. Classification logic** — helper `classifyTable(tableName: string, ownershipCols: string[]): 'TENANT_SCOPED' | 'USER_OWNED' | 'GLOBAL_LOOKUP' | 'UNKNOWN'`:
- If `ownershipCols` contains any of `tenant_id`, `org_id`, `tenantId`, `tenantid` → `TENANT_SCOPED` (also record the detected ownership col)
- Else if contains any of `user_id`, `userId`, `userid`, `owner_id`, `ownerId`, `ownerid`, `created_by`, `createdBy`, `createdby` → `USER_OWNED`
- Else, manual override based on table name for known global lookups: `Plan`, `Promo` → `GLOBAL_LOOKUP`; `Tenant` → `GLOBAL_LOOKUP` (the tenant root itself is not tenant-scoped — it IS the tenant)
- Else → `UNKNOWN`

**8. Main flow:**
```ts
async function main(): Promise<void> {
  console.log('RLS Fix Target Inspection — starting...');
  console.log(`Inspecting ${TARGET_TABLES.length} tables sequentially.`);

  const summary: Array<{
    table: string;
    classification: 'TENANT_SCOPED' | 'USER_OWNED' | 'GLOBAL_LOOKUP' | 'UNKNOWN';
    ownershipCol: string;
  }> = [];

  for (let i = 0; i < TARGET_TABLES.length; i++) {
    const tableName = TARGET_TABLES[i];
    const result = await inspectTable(tableName, i + 1);
    summary.push(result);
  }

  printSummaryTable(summary);
}
```

Have `inspectTable` return `{ table, classification, ownershipCol }` so `main` can aggregate the summary.

**9. Summary table printer** — `printSummaryTable(summary)` prints:
```
=== Recommendation Summary ===

TABLE                        | CLASSIFICATION   | OWNERSHIP COL
-----------------------------|------------------|-------------------
carrier_compliance_alert_log | TENANT_SCOPED    | org_id
...
```
Use the same `padRight` helper pattern as audit-rls-gaps.ts. Widths: 29 / 17 / 19. Display `-` for empty ownership col.

**10. Bottom of file** — identical wiring to audit-rls-gaps.ts lines 293-301:
```ts
main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
```

**Constraints — re-read before finishing:**
- ZERO `any` in DB row shapes (interfaces declared above must be used in every `$queryRawUnsafe<T[]>(...)` call)
- ZERO DDL/DML statements — only SELECT
- Queries run sequentially via `for...of` or indexed for loop with `await` — NEVER `Promise.all`
- Single new file — do not edit any other file
- Use `$queryRawUnsafe(sql, tableName)` with parameter binding, not string interpolation, to prevent SQL injection even though the input is a hardcoded const
- TypeScript strict mode compatible — no implicit any, no unused vars
  </action>
  <verify>
From the repo root:

1. File exists at the expected path:
   ```powershell
   Test-Path apps/web/scripts/audit/inspect-rls-fix-targets.ts
   ```
   Must return `True`.

2. TypeScript compiles cleanly:
   ```powershell
   cd apps/web; npx tsc --noEmit
   ```
   Must exit 0 with no new errors attributable to the new file.

3. Static guard-rail check — confirm zero write statements:
   ```powershell
   Select-String -Path apps/web/scripts/audit/inspect-rls-fix-targets.ts -Pattern '\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b' -CaseSensitive
   ```
   Must return no matches (or only matches inside comments — manually verify).

4. Static guard-rail check — confirm no `any` in row shape interfaces:
   ```powershell
   Select-String -Path apps/web/scripts/audit/inspect-rls-fix-targets.ts -Pattern ':\s*any\b'
   ```
   Must return no matches.

5. Run the script against the live DB:
   ```powershell
   cd apps/web; npx tsx --env-file=.env.local scripts/audit/inspect-rls-fix-targets.ts
   ```
   Expected:
   - Prints `RLS Fix Target Inspection — starting...`
   - Prints 13 numbered sections (`=== 1/13: carrier_compliance_alert_log ===` through `=== 13/13: Tenant ===`) in the exact order specified
   - Each section shows columns, ownership flags, policies, FKs, row count
   - Final `=== Recommendation Summary ===` table with 13 rows
   - Exit code 0
   - No unhandled rejections
  </verify>
  <done>
- File `apps/web/scripts/audit/inspect-rls-fix-targets.ts` exists, >= 200 lines
- `npx tsc --noEmit` passes for apps/web
- Running the script prints per-table reports for all 13 tables in the specified order plus a final classification summary table
- Static grep confirms no DDL/DML keywords and no `: any` in row shape interfaces
- Script structure mirrors `audit-rls-gaps.ts` (same connection setup, row-shape interfaces, padRight helper, .finally cleanup)
  </done>
</task>

</tasks>

<verification>
End-to-end verification:

1. `Test-Path apps/web/scripts/audit/inspect-rls-fix-targets.ts` → True
2. `cd apps/web; npx tsc --noEmit` → exit 0
3. `Select-String` checks for DDL keywords and `: any` → no matches
4. `cd apps/web; npx tsx --env-file=.env.local scripts/audit/inspect-rls-fix-targets.ts` → exits 0 with 13 table reports + summary table

The script must be useful — i.e. its output must let a human (or next Claude) classify each table without re-querying the DB. The summary table is the decision-quality gate.
</verification>

<success_criteria>
- Single new file created at the exact path
- All 13 tables inspected in the exact order: carrier_compliance_alert_log, carrier_documents, route_template_stops, stops, TicketMessage, grid_preference, grid_view, carrier_catalog_meta, NotificationEmailConfig, NotificationTemplate, Plan, Promo, Tenant
- Per-table output includes: column list, ownership column flags, existing policies, outgoing FKs, approx row count
- Final summary table classifies each table as TENANT_SCOPED | USER_OWNED | GLOBAL_LOOKUP | UNKNOWN with detected ownership column
- TypeScript strict mode passes (no `any` in DB row shapes)
- Read-only: no DDL/DML statements anywhere in the file
- Queries run sequentially per table (no Promise.all)
- Script runs end-to-end against the live DB and exits 0
</success_criteria>

<output>
After completion, create `.planning/quick/405-inspect-column-shapes-of-13-rls-fix-targ/405-SUMMARY.md` documenting:
- The file created and final line count
- A copy of the classification summary table from the script's output (the key deliverable)
- Any surprises encountered (e.g. tables with unexpected ownership columns, tables with existing policies that weren't flagged in the prior audit)
- Recommended next step: design the migration that backfills RLS policies based on the classifications
</output>
