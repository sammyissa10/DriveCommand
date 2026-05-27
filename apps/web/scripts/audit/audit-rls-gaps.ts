/**
 * RLS Gap Audit Script
 *
 * Read-only diagnostic that surveys the public schema of the connected Postgres
 * database and reports three categories of Row-Level Security gaps:
 *
 *   Section 1 — Tables with RLS DISABLED (relrowsecurity = false)
 *   Section 2 — Tables with RLS enabled but FORCE RLS OFF (relforcerowsecurity = false)
 *   Section 3 — Tables with RLS enabled but ZERO policies
 *
 * Each row is annotated with:
 *   - TENANT_COL  — tenant-scoping column name, or '-' if none detected
 *   - ~ROWS       — approximate live row count from pg_stat_user_tables.n_live_tup
 *   - IN_PRISMA   — whether the table name appears in apps/web/prisma/schema.prisma
 *
 * Within each section, tables that have a tenant-scoping column are sorted first,
 * then tables without, both sub-groups alphabetical by table name.
 *
 * GUARD-RAILS — this script performs NO writes:
 *   - Only SELECTs against pg_catalog, information_schema, and pg_stat_user_tables
 *   - No INSERT, UPDATE, DELETE, ALTER, CREATE, or DROP statements anywhere
 *
 * Run from apps/web/:
 *   npx tsx --env-file=.env.local scripts/audit/audit-rls-gaps.ts
 */

import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Setup — mirror db-tenant-audit.ts exactly
// ---------------------------------------------------------------------------

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Row-shape interfaces (no `any` anywhere in DB data shapes)
// ---------------------------------------------------------------------------

interface TableMetaRow {
  table_name: string;
  rls_enabled: boolean;
  rls_forced: boolean;
  policy_count: number; // cast to ::int in SQL so Prisma gives us a number
  approx_row_count: number; // n_live_tup cast to ::int
}

interface TenantColRow {
  table_name: string;
  column_name: string;
}

// ---------------------------------------------------------------------------
// Prisma schema parse — build Set<string> of known table names
// ---------------------------------------------------------------------------

function buildPrismaTables(): Set<string> {
  const schemaPath = path.join(__dirname, '../../prisma/schema.prisma');
  let schemaText: string;
  try {
    schemaText = fs.readFileSync(schemaPath, 'utf8');
  } catch {
    console.warn(`[warn] Could not read schema.prisma at ${schemaPath} — IN_PRISMA will show '?'`);
    return new Set<string>();
  }

  const tables = new Set<string>();

  // Parse model blocks without the `s` (dotAll) flag (not available in ES2017 target).
  // Strategy: find each `model Foo {` header, then collect lines until the closing `}`.
  const lines = schemaText.split('\n');
  let currentModel: string | null = null;
  let braceDepth = 0;
  let bodyLines: string[] = [];

  for (const line of lines) {
    if (currentModel === null) {
      // Look for a model declaration line
      const modelMatch = /^\s*model\s+(\w+)\s*\{/.exec(line);
      if (modelMatch) {
        currentModel = modelMatch[1];
        braceDepth = 1;
        bodyLines = [line];
      }
    } else {
      bodyLines.push(line);
      for (const ch of line) {
        if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth--;
      }
      if (braceDepth <= 0) {
        // End of model block — check for @@map
        const body = bodyLines.join('\n');
        const mapMatch = /@@map\("([^"]+)"\)/.exec(body);
        if (mapMatch) {
          tables.add(mapMatch[1]);
        } else {
          tables.add(currentModel);
        }
        currentModel = null;
        braceDepth = 0;
        bodyLines = [];
      }
    }
  }

  return tables;
}

// ---------------------------------------------------------------------------
// Tenant column priority — mirrors db-tenant-audit.ts getTenantCol logic
// ---------------------------------------------------------------------------

/**
 * Given a Map of table_name → column_name (first-match wins based on priority),
 * return the best tenant column for a table or null.
 * Priority: tenant_id > tenantId > org_id
 */
function resolveTenantCol(
  tenantColsByTable: Map<string, string[]>,
  tableName: string,
): string | null {
  const cols = tenantColsByTable.get(tableName) ?? [];
  if (cols.includes('tenant_id')) return 'tenant_id';
  if (cols.includes('tenantId')) return 'tenantId';
  if (cols.includes('org_id')) return 'org_id';
  // fallback: return first match (handles any other ILIKE match)
  return cols[0] ?? null;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function padRight(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

function printSection(
  header: string,
  rows: TableMetaRow[],
  tenantColsByTable: Map<string, string[]>,
  prismaTables: Set<string>,
): void {
  console.log('');
  console.log(header);
  console.log('');

  if (rows.length === 0) {
    console.log('  (none)');
    return;
  }

  // Sort: tenant-scoped tables first, then non-scoped; each group alphabetical
  const sorted = [...rows].sort((a, b) => {
    const aHasTenant = resolveTenantCol(tenantColsByTable, a.table_name) !== null ? 0 : 1;
    const bHasTenant = resolveTenantCol(tenantColsByTable, b.table_name) !== null ? 0 : 1;
    if (aHasTenant !== bHasTenant) return aHasTenant - bHasTenant;
    return a.table_name.localeCompare(b.table_name);
  });

  // Column header
  const col1 = 'TABLE';
  const col2 = 'TENANT_COL';
  const col3 = '~ROWS';
  const col4 = 'IN_PRISMA';
  console.log(
    `  ${padRight(col1, 42)}${padRight(col2, 16)}${padRight(col3, 10)}${col4}`,
  );
  console.log(`  ${'-'.repeat(42)}${'-'.repeat(16)}${'-'.repeat(10)}${'-'.repeat(9)}`);

  for (const row of sorted) {
    const tenantCol = resolveTenantCol(tenantColsByTable, row.table_name) ?? '-';
    const approxRows = String(row.approx_row_count);
    const inPrisma =
      prismaTables.size === 0
        ? '?'
        : [...prismaTables].some(
            (t) => t.toLowerCase() === row.table_name.toLowerCase(),
          )
        ? 'yes'
        : 'no';

    console.log(
      `  ${padRight(row.table_name, 42)}${padRight(tenantCol, 16)}${padRight(approxRows, 10)}${inPrisma}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('RLS Gap Audit — starting...');

  // Step 1 — parse prisma schema for table name set
  const prismaTables = buildPrismaTables();
  console.log(`Prisma schema parsed: ${prismaTables.size} known table names.`);

  // Step 2 — single query: table metadata + RLS flags + policy counts + approx row count
  const metaRows: TableMetaRow[] = await prisma.$queryRawUnsafe(`
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
  `);

  console.log(`Found ${metaRows.length} tables in public schema.`);

  // Step 3 — tenant column query (ILIKE any of the known tenant column names)
  const tenantColRows: TenantColRow[] = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name ILIKE ANY (ARRAY['tenant_id','org_id','tenantid','tenantId'])
  `);

  // Build Map<tableName, string[]> to support priority resolution
  const tenantColsByTable = new Map<string, string[]>();
  for (const row of tenantColRows) {
    if (!tenantColsByTable.has(row.table_name)) {
      tenantColsByTable.set(row.table_name, []);
    }
    tenantColsByTable.get(row.table_name)!.push(row.column_name);
  }

  // Step 4 — categorize into three gap arrays
  // Note: a table can legitimately appear in multiple sections (e.g. both Section 2 and 3)
  const rlsDisabled: TableMetaRow[] = [];
  const rlsNotForced: TableMetaRow[] = [];
  const rlsNoPolicies: TableMetaRow[] = [];

  for (const row of metaRows) {
    if (!row.rls_enabled) {
      rlsDisabled.push(row);
    }
    if (row.rls_enabled && !row.rls_forced) {
      rlsNotForced.push(row);
    }
    if (row.rls_enabled && row.policy_count === 0) {
      rlsNoPolicies.push(row);
    }
  }

  // Step 5 — print three labeled sections
  printSection(
    '=== Section 1: Tables with RLS DISABLED (relrowsecurity = false) ===',
    rlsDisabled,
    tenantColsByTable,
    prismaTables,
  );

  printSection(
    '=== Section 2: Tables with RLS enabled but FORCE RLS OFF (relforcerowsecurity = false) ===',
    rlsNotForced,
    tenantColsByTable,
    prismaTables,
  );

  printSection(
    '=== Section 3: Tables with RLS enabled but ZERO policies ===',
    rlsNoPolicies,
    tenantColsByTable,
    prismaTables,
  );

  // Step 6 — summary line
  console.log('');
  console.log(
    `Summary: ${rlsDisabled.length} tables need RLS enabled, ${rlsNotForced.length} need FORCE RLS, ${rlsNoPolicies.length} have RLS but no policies`,
  );
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
