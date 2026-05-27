---
phase: quick-409
plan: 409
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/scripts/audit/classify-uncertain-tables.ts
autonomous: true

must_haves:
  truths:
    - "Script classifies all three uncertain tables (carrier_catalog_meta, NotificationTemplate, NotificationEmailConfig)"
    - "Each table receives exactly one verdict from the three allowed values"
    - "Script is read-only (no INSERT/UPDATE/DELETE/ALTER/CREATE/DROP statements)"
    - "Script runs cleanly via npx tsx and produces a RECOMMENDED ACTION block"
    - "Connection pattern matches existing audit scripts (PrismaPg adapter + pg.Pool + DATABASE_URL)"
    - "Full console output is pasted back by the executor"
    - "tsc --noEmit passes after creation"
  artifacts:
    - path: "apps/web/scripts/audit/classify-uncertain-tables.ts"
      provides: "Read-only diagnostic that classifies three uncertain tables for RLS treatment"
      contains: "carrier_catalog_meta, NotificationTemplate, NotificationEmailConfig"
  key_links:
    - from: "apps/web/scripts/audit/classify-uncertain-tables.ts"
      to: "information_schema.columns + pg_stat_user_tables + information_schema.referential_constraints"
      via: "prisma.$queryRaw via PrismaPg adapter"
      pattern: "information_schema|pg_stat_user_tables"
    - from: "apps/web/scripts/audit/classify-uncertain-tables.ts"
      to: "apps/web/src + packages/"
      via: "ripgrep/grep child_process for table name occurrences (PascalCase + snake_case)"
      pattern: "execSync|grep|rg"
---

<objective>
Create a read-only diagnostic script that classifies three RLS-uncertain tables against the DatabaseSecurity_MultiTenant_Spec_v1.md Section 4.12 platform-level vs tenant-scoped distinction.

Purpose: The Supabase advisor flagged tables for missing RLS. Plan and Promo are explicitly platform-level (RLS off intentional). Three other flagged tables — carrier_catalog_meta, NotificationTemplate, NotificationEmailConfig — need a verdict before we apply policies. This script gathers the evidence (column inventory, row counts, FK direction, codebase usage) and emits a verdict per table.

Output: apps/web/scripts/audit/classify-uncertain-tables.ts plus its console output for the user.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/scripts/audit/audit-rls-gaps.ts
@apps/web/scripts/audit/406b-resolve-blockers.ts
@apps/web/scripts/audit/407b-verify-jwt-claim-key.ts
@docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create classify-uncertain-tables.ts diagnostic script</name>
  <files>apps/web/scripts/audit/classify-uncertain-tables.ts</files>
  <action>
Create a new read-only diagnostic script at apps/web/scripts/audit/classify-uncertain-tables.ts.

CONNECTION PATTERN — MATCH EXACTLY (copy from apps/web/scripts/audit/406b-resolve-blockers.ts):
```ts
import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { execSync } from 'child_process';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
```

Header docblock must include:
- Purpose statement (classify three uncertain RLS tables per DatabaseSecurity_MultiTenant_Spec_v1.md Section 4.12)
- GUARD-RAILS notice: only SELECTs against information_schema, pg_stat_user_tables, pg_catalog; no INSERT/UPDATE/DELETE/ALTER/CREATE/DROP anywhere
- Run instruction: `npx tsx --env-file=.env.local scripts/audit/classify-uncertain-tables.ts` (run from apps/web/)

TARGET TABLES (declare as const array):
```ts
const TARGETS = [
  { snake: 'carrier_catalog_meta',    pascal: 'CarrierCatalogMeta' },
  { snake: 'NotificationTemplate',    pascal: 'NotificationTemplate' },
  { snake: 'NotificationEmailConfig', pascal: 'NotificationEmailConfig' },
] as const;
```
Note: NotificationTemplate and NotificationEmailConfig are PascalCase in the DB (Prisma default). Use the `snake` field as the actual table name passed to information_schema queries; use both `snake` and `pascal` when grepping the codebase.

PER-TABLE INVESTIGATION (loop over TARGETS, one section per table):

1. COLUMN INVENTORY — query information_schema.columns:
   ```sql
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = $1
   ORDER BY ordinal_position
   ```
   For each column, test name against regex /tenant|org|user|owner|customer|account/i (case-insensitive).
   Collect a list of "scoping candidate" columns. If non-empty -> tenant-scoping signal present.
   Print the full column list (name + type + nullable) AND a separate line "SCOPING_CANDIDATES: [...]" or "SCOPING_CANDIDATES: none".

2. ROW COUNT — query pg_stat_user_tables.n_live_tup:
   ```sql
   SELECT n_live_tup::int AS row_count
   FROM pg_stat_user_tables
   WHERE schemaname = 'public' AND relname = $1
   ```
   Print "ROW_COUNT: <n>" (or "ROW_COUNT: 0 (table empty or never analyzed)").

3. FK OUTBOUND — query information_schema.referential_constraints + key_column_usage:
   ```sql
   SELECT
     tc.constraint_name,
     kcu.column_name,
     ccu.table_schema AS foreign_schema,
     ccu.table_name   AS foreign_table,
     ccu.column_name  AS foreign_column
   FROM information_schema.table_constraints tc
   JOIN information_schema.key_column_usage kcu
     ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema    = kcu.table_schema
   JOIN information_schema.constraint_column_usage ccu
     ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema    = tc.table_schema
   WHERE tc.constraint_type = 'FOREIGN KEY'
     AND tc.table_schema    = 'public'
     AND tc.table_name      = $1
   ```
   Print each FK as "OUTBOUND_FK: <col> -> <foreign_schema>.<foreign_table>.<foreign_column>".
   Set a boolean fksTenant = any outbound FK whose foreign_table = 'Tenant'.

4. FK INBOUND — same join but with ccu.table_name = $1 (find FKs pointing AT this table):
   ```sql
   SELECT
     tc.table_name   AS source_table,
     kcu.column_name AS source_column,
     tc.constraint_name
   FROM information_schema.table_constraints tc
   JOIN information_schema.key_column_usage kcu
     ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema    = kcu.table_schema
   JOIN information_schema.constraint_column_usage ccu
     ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema    = tc.table_schema
   WHERE tc.constraint_type = 'FOREIGN KEY'
     AND tc.table_schema    = 'public'
     AND ccu.table_name     = $1
   ```
   Print each inbound FK as "INBOUND_FK: <source_table>.<source_column> -> this".

5. CODEBASE GREP — use execSync to run ripgrep (or fall back to grep if rg missing):
   ```ts
   function grepCodebase(needle: string): string[] {
     try {
       const out = execSync(
         `npx --no-install rg --no-heading --line-number --max-count 20 -F "${needle}" apps/web/src packages/`,
         { encoding: 'utf8', cwd: path.join(__dirname, '../../../..'), stdio: ['ignore', 'pipe', 'ignore'] }
       );
       return out.split('\n').filter(Boolean).slice(0, 20);
     } catch {
       return []; // rg exits non-zero on no matches
     }
   }
   ```
   Search for BOTH `target.snake` and `target.pascal` (skip dedupe if they happen to equal — only carrier_catalog_meta has a different pascal form). For each hit print "USAGE: <file>:<line>: <one-line-snippet>" (snippet trimmed to ~120 chars). Cap total output at 20 lines per term.

VERDICT LOGIC (after the 5 evidence gathers, decide):
- Default starting point: assume PLATFORM_LEVEL_LEAVE_RLS_OFF.
- If SCOPING_CANDIDATES non-empty OR fksTenant is true -> TENANT_SCOPED_NEEDS_STANDARD_POLICIES.
- Else if ROW_COUNT > 0 AND inbound FKs from tenant-scoped tables exist (heuristic: any inbound FK source_table whose name is one of the well-known tenant-scoped Prisma models — User, Truck, Driver, Route, Load, Tenant, Notification, NotificationSubscriber) -> PLATFORM_LEVEL_WITH_PERMISSIVE_POLICY (read-only reference data that tenant-scoped rows reference; needs a permissive `USING (true)` policy so RLS-on-tenant-tables can still join through).
- Else -> PLATFORM_LEVEL_LEAVE_RLS_OFF.

Print per table:
```
============================================================
TABLE: <name>
============================================================
COLUMNS:
  <col>  <type>  <nullable>
  ...
SCOPING_CANDIDATES: [...] | none
ROW_COUNT: <n>
OUTBOUND_FKS:
  <col> -> <foreign_schema>.<foreign_table>.<foreign_column>
  (none)
INBOUND_FKS:
  <source_table>.<source_column> -> this
  (none)
CODEBASE_USAGE (<snake>):
  <file>:<line>: <snippet>
  ...
CODEBASE_USAGE (<pascal>):
  <file>:<line>: <snippet>
  ...
VERDICT: <one of three>
REASONING: <one sentence explaining which signal drove the verdict>
```

FINAL RECOMMENDED ACTION BLOCK at end of script (after the loop):
```
============================================================
RECOMMENDED ACTION
============================================================
carrier_catalog_meta     -> <VERDICT>
NotificationTemplate     -> <VERDICT>
NotificationEmailConfig  -> <VERDICT>

Next step per verdict:
  PLATFORM_LEVEL_LEAVE_RLS_OFF       -> add to Section 4.12 explicit allowlist; no migration
  PLATFORM_LEVEL_WITH_PERMISSIVE_POLICY -> ALTER TABLE ... ENABLE ROW LEVEL SECURITY; CREATE POLICY ... FOR SELECT USING (true)
  TENANT_SCOPED_NEEDS_STANDARD_POLICIES -> apply standard 4-policy template using (auth.jwt() -> 'app_metadata' ->> 'tenantId')::uuid
```

CLEANUP:
- `await prisma.$disconnect()` and `await pool.end()` in a finally block.
- Wrap main() in try/catch; on error print and process.exit(1).
- Use console.log only (this script does NOT need to write a findings .md — orchestrator's task description explicitly asks for console output to be pasted back).

GUARDRAILS — verify before finishing:
- grep your own file for: INSERT, UPDATE, DELETE, ALTER, CREATE TABLE, CREATE POLICY, DROP — none should appear in executed SQL strings (only as markdown content inside the RECOMMENDED ACTION block string is allowed).
- All `prisma.$queryRaw` and `prisma.$queryRawUnsafe` calls must be SELECTs only.

Do NOT modify schema.prisma. Do NOT create migrations. Do NOT write any .md files.
  </action>
  <verify>
1. File exists: `apps/web/scripts/audit/classify-uncertain-tables.ts`
2. Run from apps/web/: `cd apps/web ; npx tsx --env-file=.env.local scripts/audit/classify-uncertain-tables.ts` — exits 0 and prints sections for all three tables plus the RECOMMENDED ACTION block.
3. TypeScript clean: `cd apps/web ; npx tsc --noEmit` — no errors introduced by the new file.
4. Re-grep the new file: `Grep "INSERT|UPDATE|DELETE|ALTER|DROP" apps/web/scripts/audit/classify-uncertain-tables.ts` — confirm any matches are inside string literals destined for the RECOMMENDED ACTION block, never inside `$queryRaw`/`$executeRaw` calls.
5. Paste the full console output of step 2 back to the user in the SUMMARY.
  </verify>
  <done>
- apps/web/scripts/audit/classify-uncertain-tables.ts exists, compiles, and is read-only.
- Running it prints column inventories, row counts, both FK directions, codebase usage, and a verdict per table for carrier_catalog_meta, NotificationTemplate, NotificationEmailConfig.
- Final RECOMMENDED ACTION block lists all three tables with verdicts from the allowed set {PLATFORM_LEVEL_LEAVE_RLS_OFF, PLATFORM_LEVEL_WITH_PERMISSIVE_POLICY, TENANT_SCOPED_NEEDS_STANDARD_POLICIES}.
- Full console output is included in the executor's SUMMARY.
- `npx tsc --noEmit` from apps/web is clean.
  </done>
</task>

</tasks>

<verification>
- Script file exists at the specified path.
- `npx tsx --env-file=.env.local scripts/audit/classify-uncertain-tables.ts` (run from apps/web/) exits 0.
- Output contains exactly three TABLE sections (one per target) plus one RECOMMENDED ACTION block.
- Each TABLE section contains: COLUMNS, SCOPING_CANDIDATES, ROW_COUNT, OUTBOUND_FKS, INBOUND_FKS, CODEBASE_USAGE (snake), CODEBASE_USAGE (pascal), VERDICT, REASONING.
- `npx tsc --noEmit` from apps/web/ is clean.
- No write SQL (INSERT/UPDATE/DELETE/ALTER/CREATE/DROP) is executed.
</verification>

<success_criteria>
- All three tables classified with a single verdict each from the allowed set.
- Console output captured in SUMMARY for user review (this is the deliverable — the user uses it to decide the next migration).
- Script remains as a reusable diagnostic in apps/web/scripts/audit/ following the same pattern as audit-rls-gaps.ts and 406b-resolve-blockers.ts.
</success_criteria>

<output>
After completion, create `.planning/quick/409-classify-three-uncertain-tables-against-/409-SUMMARY.md` with:
- Path to created script
- Full console output from running the script
- The three verdicts in a single line each
- Confirmation that `tsc --noEmit` is clean
- Any anomalies (e.g., empty table, rg unavailable and grep fallback used, unexpected FK direction)
</output>
