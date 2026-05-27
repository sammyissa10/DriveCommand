/**
 * inspect-rls-fix-targets.ts
 *
 * Read-only diagnostic that inspects column shapes, ownership columns, existing
 * RLS policies, outgoing foreign keys, and approximate row counts for the 13
 * tables targeted by the upcoming RLS remediation migration.
 *
 * Output sections (per table):
 *   A — Column list (name / data_type / nullable)
 *   B — Ownership column detection (flagged from known ownership column names)
 *   C — Existing RLS policies from pg_policies
 *   D — Outgoing foreign keys from information_schema
 *   E — Approximate row count from pg_stat_user_tables
 *
 * Final section:
 *   Recommendation Summary — classifies each table as:
 *     TENANT_SCOPED | USER_OWNED | GLOBAL_LOOKUP | UNKNOWN
 *   with detected ownership column for each.
 *
 * GUARD-RAILS — this script performs NO writes:
 *   Only SELECTs against information_schema, pg_catalog, pg_policies,
 *   and pg_stat_user_tables — no INSERT, UPDATE, DELETE, ALTER, CREATE,
 *   or DROP statements anywhere in this file.
 *
 * Run from apps/web/:
 *   npx tsx --env-file=.env.local scripts/audit/inspect-rls-fix-targets.ts
 */

import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// ---------------------------------------------------------------------------
// Setup — identical to audit-rls-gaps.ts
// ---------------------------------------------------------------------------

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Target table list — ordered as specified, const tuple (preserves order)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Ownership column names to flag
// ---------------------------------------------------------------------------

const OWNERSHIP_COLUMN_NAMES = [
  'tenant_id', 'org_id', 'tenantId', 'tenantid',
  'user_id', 'userId', 'userid',
  'owner_id', 'ownerId', 'ownerid',
  'created_by', 'createdBy', 'createdby',
] as const;

// ---------------------------------------------------------------------------
// Row-shape interfaces (no `any` anywhere in DB data shapes)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Display helpers — same pattern as audit-rls-gaps.ts
// ---------------------------------------------------------------------------

function padRight(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

// ---------------------------------------------------------------------------
// Classification logic
// ---------------------------------------------------------------------------

type Classification = 'TENANT_SCOPED' | 'USER_OWNED' | 'GLOBAL_LOOKUP' | 'UNKNOWN';

// Tables that are global lookups by definition (no per-tenant scoping needed)
const GLOBAL_LOOKUP_TABLES: ReadonlySet<string> = new Set(['Plan', 'Promo', 'Tenant']);

function classifyTable(
  tableName: string,
  ownershipCols: string[],
): { classification: Classification; ownershipCol: string } {
  const lowerCols = ownershipCols.map((c) => c.toLowerCase());

  // Tenant-scoped: any tenant-identifying column present
  for (const col of ownershipCols) {
    const lower = col.toLowerCase();
    if (lower === 'tenant_id' || lower === 'org_id' || lower === 'tenantid') {
      return { classification: 'TENANT_SCOPED', ownershipCol: col };
    }
  }

  // User-owned: any user/owner/created-by column present
  for (const col of ownershipCols) {
    const lower = col.toLowerCase();
    if (
      lower === 'user_id' ||
      lower === 'userid' ||
      lower === 'owner_id' ||
      lower === 'ownerid' ||
      lower === 'created_by' ||
      lower === 'createdby'
    ) {
      return { classification: 'USER_OWNED', ownershipCol: col };
    }
  }

  // Suppress unused variable warning for lowerCols in non-tenant/user paths
  void lowerCols;

  // Manual override: known global lookup tables
  if (GLOBAL_LOOKUP_TABLES.has(tableName)) {
    return { classification: 'GLOBAL_LOOKUP', ownershipCol: '-' };
  }

  return { classification: 'UNKNOWN', ownershipCol: '-' };
}

// ---------------------------------------------------------------------------
// Per-table inspection
// ---------------------------------------------------------------------------

async function inspectTable(
  tableName: string,
  index: number,
): Promise<{ table: string; classification: Classification; ownershipCol: string }> {
  console.log('');
  console.log(`=== ${index}/13: ${tableName} ===`);

  // ---- A: Columns ----
  console.log('');
  console.log('  [A] Columns:');

  const columnSql = `
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `;
  const columns = await prisma.$queryRawUnsafe<ColumnRow[]>(columnSql, tableName);

  if (columns.length === 0) {
    console.log('    (table not found in public schema)');
  } else {
    console.log(
      `    ${padRight('COLUMN', 36)}${padRight('DATA_TYPE', 24)}NULLABLE`,
    );
    console.log(`    ${'-'.repeat(36)}${'-'.repeat(24)}${'-'.repeat(8)}`);
    for (const col of columns) {
      console.log(
        `    ${padRight(col.column_name, 36)}${padRight(col.data_type, 24)}${col.is_nullable}`,
      );
    }
  }

  // ---- B: Ownership detection (derived from column list already fetched) ----
  console.log('');
  console.log('  [B] Ownership columns detected:');

  const ownershipCols = columns
    .map((c) => c.column_name)
    .filter((name) =>
      (OWNERSHIP_COLUMN_NAMES as ReadonlyArray<string>).includes(name),
    );

  if (ownershipCols.length === 0) {
    console.log('    (none detected)');
  } else {
    console.log(`    ${ownershipCols.join(', ')}`);
  }

  // ---- C: Existing policies ----
  console.log('');
  console.log('  [C] Existing RLS policies:');

  const policySql = `
    SELECT policyname, cmd, qual
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = $1
  `;
  const policies = await prisma.$queryRawUnsafe<PolicyRow[]>(policySql, tableName);

  if (policies.length === 0) {
    console.log('    (no policies)');
  } else {
    for (const p of policies) {
      const qualDisplay = p.qual !== null ? p.qual : 'NULL';
      console.log(`    ${p.policyname} [${p.cmd}] qual=${qualDisplay}`);
    }
  }

  // ---- D: Outgoing FKs ----
  console.log('');
  console.log('  [D] Outgoing foreign keys:');

  const fkSql = `
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
  `;
  const fks = await prisma.$queryRawUnsafe<ForeignKeyRow[]>(fkSql, tableName);

  if (fks.length === 0) {
    console.log('    (no outgoing FKs)');
  } else {
    for (const fk of fks) {
      console.log(`    ${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    }
  }

  // ---- E: Row count ----
  console.log('');
  console.log('  [E] Row count:');

  const rowCountSql = `
    SELECT COALESCE(n_live_tup, 0)::int AS approx_row_count
    FROM pg_stat_user_tables
    WHERE schemaname = 'public' AND relname = $1
  `;
  const rowCountResult = await prisma.$queryRawUnsafe<RowCountRow[]>(rowCountSql, tableName);
  const approxRows = rowCountResult.length > 0 ? rowCountResult[0].approx_row_count : 0;
  console.log(`    Approx rows: ${approxRows}`);

  // Classify based on detected ownership columns
  const { classification, ownershipCol } = classifyTable(tableName, ownershipCols);

  return { table: tableName, classification, ownershipCol };
}

// ---------------------------------------------------------------------------
// Summary table printer
// ---------------------------------------------------------------------------

function printSummaryTable(
  summary: Array<{
    table: string;
    classification: Classification;
    ownershipCol: string;
  }>,
): void {
  console.log('');
  console.log('=== Recommendation Summary ===');
  console.log('');

  const col1Header = 'TABLE';
  const col2Header = 'CLASSIFICATION';
  const col3Header = 'OWNERSHIP COL';
  const w1 = 29;
  const w2 = 17;

  console.log(
    `${padRight(col1Header, w1)}| ${padRight(col2Header, w2)}| ${col3Header}`,
  );
  console.log(`${'-'.repeat(w1)}|${'-'.repeat(w2 + 1)}|${'-'.repeat(19)}`);

  for (const row of summary) {
    const ownershipDisplay = row.ownershipCol || '-';
    console.log(
      `${padRight(row.table, w1)}| ${padRight(row.classification, w2)}| ${ownershipDisplay}`,
    );
  }

  console.log('');
  const tenantCount = summary.filter((r) => r.classification === 'TENANT_SCOPED').length;
  const userCount = summary.filter((r) => r.classification === 'USER_OWNED').length;
  const globalCount = summary.filter((r) => r.classification === 'GLOBAL_LOOKUP').length;
  const unknownCount = summary.filter((r) => r.classification === 'UNKNOWN').length;
  console.log(
    `Classifications: ${tenantCount} TENANT_SCOPED, ${userCount} USER_OWNED, ${globalCount} GLOBAL_LOOKUP, ${unknownCount} UNKNOWN`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('RLS Fix Target Inspection — starting...');
  console.log(`Inspecting ${TARGET_TABLES.length} tables sequentially.`);

  const summary: Array<{
    table: string;
    classification: Classification;
    ownershipCol: string;
  }> = [];

  for (let i = 0; i < TARGET_TABLES.length; i++) {
    const tableName = TARGET_TABLES[i];
    const result = await inspectTable(tableName, i + 1);
    summary.push(result);
  }

  printSummaryTable(summary);
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
