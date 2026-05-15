/**
 * DB Tenant Audit Script
 *
 * Read-only audit of every table in the public schema.
 * Checks tenant-scoping, RLS state, audit columns, timestamp types, and indexes.
 * Writes the report to docs/audits/db-tenant-audit.md.
 *
 * Part of DatabaseSecurity_MultiTenant_Spec_v1.md — Prompt 1 (inventory).
 *
 * Run from apps/web:
 *   npx tsx --env-file=.env.local scripts/audit/db-tenant-audit.ts
 *
 * No DML executed — only SELECT from information_schema and pg_catalog.
 *
 * Note: this codebase uses mixed column naming conventions:
 * - Original Prisma models use camelCase column names (tenantId, createdAt, updatedAt, etc.)
 * - Carrier/newer models use snake_case (org_id, created_at, updated_at, etc.)
 * Both conventions are detected correctly.
 */

import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Setup — use PgAdapter as required by Prisma 7
// ---------------------------------------------------------------------------

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Row types returned by $queryRawUnsafe
// ---------------------------------------------------------------------------

interface TableRow {
  table_name: string;
}

interface ColumnRow {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
}

interface RlsRow {
  table_name: string;
  rls_enabled: boolean;
  rls_forced: boolean;
}

interface PolicyRow {
  schemaname: string;
  tablename: string;
  policyname: string;
}

interface IndexRow {
  table_name: string;
  index_name: string;
  columns: string; // comma-separated string from array_to_string(array_agg(...))
}

// ---------------------------------------------------------------------------
// Helpers: column name variants (camelCase + snake_case both accepted)
// ---------------------------------------------------------------------------

/** Returns true if the column set contains any of the provided column names. */
function hasAny(cols: Set<string>, ...names: string[]): boolean {
  return names.some((n) => cols.has(n));
}

/**
 * Determine which tenant column variant exists: 'tenantId' (camelCase),
 * 'tenant_id' (snake_case), 'org_id' (carrier tables), or null.
 */
function getTenantCol(cols: Set<string>): string | null {
  if (cols.has('tenant_id')) return 'tenant_id';
  if (cols.has('tenantId')) return 'tenantId';
  if (cols.has('org_id')) return 'org_id';
  return null;
}

/**
 * Determine the created_at column variant.
 * Returns the actual column name present, or null.
 */
function getCreatedAtCol(cols: Set<string>): string | null {
  if (cols.has('created_at')) return 'created_at';
  if (cols.has('createdAt')) return 'createdAt';
  return null;
}

/**
 * Determine the deleted_at column variant.
 */
function getDeletedAtCol(cols: Set<string>): string | null {
  if (cols.has('deleted_at')) return 'deleted_at';
  if (cols.has('deletedAt')) return 'deletedAt';
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('DB Tenant Audit — starting...');

  // Step 1 — all public-schema tables
  const tableRows: TableRow[] = await prisma.$queryRawUnsafe(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const allTables = tableRows.map((r) => r.table_name);
  console.log(`Found ${allTables.length} tables.`);

  // Step 2 — all columns for every public table (one query)
  const columnRows: ColumnRow[] = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, column_name
  `);

  // Build maps
  const columnsByTable = new Map<string, Set<string>>();
  const columnTypesMap = new Map<string, Map<string, { data_type: string; udt_name: string }>>();

  for (const row of columnRows) {
    if (!columnsByTable.has(row.table_name)) {
      columnsByTable.set(row.table_name, new Set());
      columnTypesMap.set(row.table_name, new Map());
    }
    columnsByTable.get(row.table_name)!.add(row.column_name);
    columnTypesMap.get(row.table_name)!.set(row.column_name, {
      data_type: row.data_type,
      udt_name: row.udt_name,
    });
  }

  // Step 3 — RLS flags from pg_class (one query)
  const rlsRows: RlsRow[] = await prisma.$queryRawUnsafe(`
    SELECT
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  `);

  const rlsMap = new Map<string, { rlsEnabled: boolean; rlsForced: boolean }>();
  for (const row of rlsRows) {
    rlsMap.set(row.table_name, {
      rlsEnabled: row.rls_enabled,
      rlsForced: row.rls_forced,
    });
  }

  // Step 4 — RLS policies from pg_policies (one query)
  const policyRows: PolicyRow[] = await prisma.$queryRawUnsafe(`
    SELECT
      schemaname,
      tablename,
      policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  `);

  const policiesByTable = new Map<string, Set<string>>();
  for (const row of policyRows) {
    if (!policiesByTable.has(row.tablename)) {
      policiesByTable.set(row.tablename, new Set());
    }
    policiesByTable.get(row.tablename)!.add(row.policyname);
  }

  // Step 5 — indexes from pg_catalog (one query)
  // Use array_to_string to avoid Prisma driver adapter deserialization issue with PG arrays
  const indexRows: IndexRow[] = await prisma.$queryRawUnsafe(`
    SELECT
      t.relname AS table_name,
      ix.relname AS index_name,
      array_to_string(array_agg(a.attname ORDER BY k.ordering), ',') AS columns
    FROM pg_class t
    JOIN pg_index i ON i.indrelid = t.oid
    JOIN pg_class ix ON ix.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ordering) ON true
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
    WHERE n.nspname = 'public' AND t.relkind = 'r'
    GROUP BY t.relname, ix.relname
    ORDER BY t.relname, ix.relname
  `);

  const indexesByTable = new Map<string, Array<{ indexName: string; columns: string[] }>>();
  for (const row of indexRows) {
    if (!indexesByTable.has(row.table_name)) {
      indexesByTable.set(row.table_name, []);
    }
    // columns is comma-separated from array_to_string(array_agg(...), ',')
    const cols = row.columns
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    indexesByTable.get(row.table_name)!.push({ indexName: row.index_name, columns: cols });
  }

  // ---------------------------------------------------------------------------
  // Step 6 — per-table analysis
  // ---------------------------------------------------------------------------

  // First pass: determine direct tenant-scoped tables (camelCase OR snake_case OR org_id)
  const directlyScopedTables = new Set<string>();
  for (const table of allTables) {
    const cols = columnsByTable.get(table) ?? new Set();
    if (getTenantCol(cols) !== null) {
      directlyScopedTables.add(table);
    }
  }

  interface TableAudit {
    tableName: string;
    hasTenantId: boolean;
    isTenantScoped: boolean;
    reachableViaFk: boolean; // true if scoped via FK, not direct
    hasRlsEnabled: boolean;
    hasRlsForced: boolean;
    hasTenantIsolationPolicy: boolean;
    hasBypassRlsPolicy: boolean;
    hasCreatedAt: boolean;
    hasCreatedBy: boolean;
    hasUpdatedAt: boolean;
    hasUpdatedBy: boolean;
    hasDeletedAt: boolean;
    hasDeletedBy: boolean;
    timestampWithoutTz: string[]; // column names with udt_name='timestamp'
    missingIndexes: string[]; // description of missing required indexes
  }

  const audits: TableAudit[] = [];

  for (const table of allTables) {
    const cols = columnsByTable.get(table) ?? new Set();
    const colTypes = columnTypesMap.get(table) ?? new Map();
    const rls = rlsMap.get(table) ?? { rlsEnabled: false, rlsForced: false };
    const policies = policiesByTable.get(table) ?? new Set();
    const indexes = indexesByTable.get(table) ?? [];

    // Tenant ID: detect both camelCase (tenantId) and snake_case (tenant_id) and carrier (org_id)
    const tenantCol = getTenantCol(cols);
    const hasTenantId = tenantCol !== null;

    // Tenant scoping: direct or via FK heuristic
    let reachableViaFk = false;
    if (!hasTenantId) {
      // Check if any column name is <parentTable>_id or <parentTable>Id where parentTable
      // is in the directly-scoped set (snake_case suffix check)
      for (const col of cols) {
        if (col.endsWith('_id')) {
          const parentCandidate = col.slice(0, col.length - 3);
          if (directlyScopedTables.has(parentCandidate)) {
            reachableViaFk = true;
            break;
          }
        }
        // camelCase FK check: e.g. tenantId already caught above; but for other FKs
        if (col.endsWith('Id') && col.length > 2) {
          // e.g. routeId → route, loadId → load, etc.
          const parentCandidate = col.slice(0, col.length - 2);
          // Capitalised match: e.g. 'Route', 'Load'
          const capitalised =
            parentCandidate.charAt(0).toUpperCase() + parentCandidate.slice(1);
          if (
            directlyScopedTables.has(parentCandidate) ||
            directlyScopedTables.has(capitalised)
          ) {
            reachableViaFk = true;
            break;
          }
        }
      }
    }

    const isTenantScoped = hasTenantId || reachableViaFk;

    // RLS
    const hasRlsEnabled = rls.rlsEnabled;
    const hasRlsForced = rls.rlsForced;

    // Policies
    let hasTenantIsolationPolicy = false;
    let hasBypassRlsPolicy = false;
    for (const pname of policies) {
      if (pname.toLowerCase().includes('tenant_isolation')) hasTenantIsolationPolicy = true;
      if (pname.toLowerCase().includes('bypass_rls')) hasBypassRlsPolicy = true;
    }

    // Audit columns — check both camelCase and snake_case variants
    const hasCreatedAt = hasAny(cols, 'created_at', 'createdAt');
    const hasCreatedBy = hasAny(cols, 'created_by', 'createdBy', 'createdById');
    const hasUpdatedAt = hasAny(cols, 'updated_at', 'updatedAt');
    const hasUpdatedBy = hasAny(cols, 'updated_by', 'updatedBy', 'updatedById');
    const hasDeletedAt = hasAny(cols, 'deleted_at', 'deletedAt');
    const hasDeletedBy = hasAny(cols, 'deleted_by', 'deletedBy', 'deletedById');

    // Non-TIMESTAMPTZ timestamp columns (udt_name='timestamp' means WITHOUT timezone)
    const timestampWithoutTz: string[] = [];
    for (const [colName, typeInfo] of colTypes) {
      if (typeInfo.udt_name === 'timestamp') {
        timestampWithoutTz.push(colName);
      }
    }

    // Missing indexes — only for tenant-scoped tables that have a direct tenant column
    const missingIndexes: string[] = [];
    if (isTenantScoped && tenantCol) {
      const createdAtCol = getCreatedAtCol(cols);
      const deletedAtCol = getDeletedAtCol(cols);

      // Check for single-column (tenant_id / tenantId / org_id) index
      const hasSingleTenantIdx = indexes.some(
        (idx) => idx.columns.length === 1 && idx.columns[0] === tenantCol,
      );
      if (!hasSingleTenantIdx) {
        missingIndexes.push(`(${tenantCol})`);
      }

      // Check for (tenant_col, deleted_at) — only if deleted_at/deletedAt exists
      if (deletedAtCol) {
        const hasTenantDeletedAtIdx = indexes.some((idx) => {
          const c = idx.columns;
          return c.includes(tenantCol) && c.includes(deletedAtCol);
        });
        if (!hasTenantDeletedAtIdx) {
          missingIndexes.push(`(${tenantCol}, ${deletedAtCol})`);
        }
      }

      // Check for (tenant_col, created_at) — only if created_at/createdAt exists
      if (createdAtCol) {
        const hasTenantCreatedAtIdx = indexes.some((idx) => {
          const c = idx.columns;
          return c.includes(tenantCol) && c.includes(createdAtCol);
        });
        if (!hasTenantCreatedAtIdx) {
          missingIndexes.push(`(${tenantCol}, ${createdAtCol} DESC)`);
        }
      }
    }

    audits.push({
      tableName: table,
      hasTenantId,
      isTenantScoped,
      reachableViaFk,
      hasRlsEnabled,
      hasRlsForced,
      hasTenantIsolationPolicy,
      hasBypassRlsPolicy,
      hasCreatedAt,
      hasCreatedBy,
      hasUpdatedAt,
      hasUpdatedBy,
      hasDeletedAt,
      hasDeletedBy,
      timestampWithoutTz,
      missingIndexes,
    });
  }

  // Sort alphabetically
  audits.sort((a, b) => a.tableName.localeCompare(b.tableName));

  // ---------------------------------------------------------------------------
  // Step 7 — Findings summary
  // ---------------------------------------------------------------------------

  const totalTables = audits.length;
  const tenantScopedAudits = audits.filter((a) => a.isTenantScoped);
  const directScoped = tenantScopedAudits.filter((a) => a.hasTenantId);
  const fkScoped = tenantScopedAudits.filter((a) => !a.hasTenantId && a.reachableViaFk);

  const missingRlsEnabled = audits.filter((a) => a.isTenantScoped && !a.hasRlsEnabled);
  const missingRlsForced = audits.filter((a) => a.isTenantScoped && !a.hasRlsForced);
  const missingTenantIsolationPolicy = audits.filter(
    (a) => a.isTenantScoped && !a.hasTenantIsolationPolicy,
  );
  const missingBypassRlsPolicy = audits.filter((a) => a.isTenantScoped && !a.hasBypassRlsPolicy);

  const missingCreatedBy = audits.filter((a) => a.isTenantScoped && !a.hasCreatedBy);
  const missingUpdatedBy = audits.filter((a) => a.isTenantScoped && !a.hasUpdatedBy);
  const missingDeletedAt = audits.filter((a) => a.isTenantScoped && !a.hasDeletedAt);
  const missingDeletedBy = audits.filter((a) => a.isTenantScoped && !a.hasDeletedBy);

  // Non-TIMESTAMPTZ columns across all tables
  const nonTzColumns: string[] = [];
  const nonTzTableSet = new Set<string>();
  for (const a of audits) {
    for (const col of a.timestampWithoutTz) {
      nonTzColumns.push(`${a.tableName}.${col}`);
      nonTzTableSet.add(a.tableName);
    }
  }

  // Index gaps
  const tablesWithMissingIndexes = audits.filter((a) => a.missingIndexes.length > 0);
  const totalIndexGaps = audits.reduce((sum, a) => sum + a.missingIndexes.length, 0);

  // ---------------------------------------------------------------------------
  // Step 8 — Render Markdown
  // ---------------------------------------------------------------------------

  const yn = (v: boolean) => (v ? 'Y' : 'N');
  const isoDate = new Date().toISOString().split('T')[0];

  const lines: string[] = [];

  lines.push(`# DB Tenant Audit — ${isoDate}`);
  lines.push('');
  lines.push('Generated by `scripts/audit/db-tenant-audit.ts`. Read-only. Re-run to refresh.');
  lines.push('');
  lines.push('## Findings Summary');
  lines.push('');
  lines.push(`- **Total tables:** ${totalTables}`);
  lines.push(
    `- **Tenant-scoped tables:** ${tenantScopedAudits.length} (direct tenant_id/org_id: ${directScoped.length}, reachable via FK: ${fkScoped.length})`,
  );
  lines.push(
    `- **Missing RLS enabled:** ${missingRlsEnabled.length} tables${missingRlsEnabled.length > 0 ? ' — ' + missingRlsEnabled.map((a) => a.tableName).join(', ') : ''}`,
  );
  lines.push(
    `- **Missing RLS forced:** ${missingRlsForced.length} tables${missingRlsForced.length > 0 ? ' — ' + missingRlsForced.map((a) => a.tableName).join(', ') : ''}`,
  );
  lines.push(
    `- **Missing tenant_isolation_policy:** ${missingTenantIsolationPolicy.length} tables${missingTenantIsolationPolicy.length > 0 ? ' — ' + missingTenantIsolationPolicy.map((a) => a.tableName).join(', ') : ''}`,
  );
  lines.push(
    `- **Missing bypass_rls_policy:** ${missingBypassRlsPolicy.length} tables${missingBypassRlsPolicy.length > 0 ? ' — ' + missingBypassRlsPolicy.map((a) => a.tableName).join(', ') : ''}`,
  );
  lines.push(`- **Missing created_by:** ${missingCreatedBy.length} tables`);
  lines.push(`- **Missing updated_by:** ${missingUpdatedBy.length} tables`);
  lines.push(`- **Missing deleted_at:** ${missingDeletedAt.length} tables`);
  lines.push(`- **Missing deleted_by:** ${missingDeletedBy.length} tables`);
  lines.push(
    `- **Non-TIMESTAMPTZ timestamp columns:** ${nonTzColumns.length} columns across ${nonTzTableSet.size} tables${nonTzColumns.length > 0 ? ' — ' + nonTzColumns.join(', ') : ''}`,
  );
  lines.push(
    `- **Missing indexes:** ${totalIndexGaps} index gaps across ${tablesWithMissingIndexes.length} tables`,
  );
  lines.push('');

  lines.push('## Table Audit');
  lines.push('');
  lines.push(
    '| table_name | is_tenant_scoped | has_tenant_id | has_rls_enabled | has_rls_forced | has_tenant_isolation_policy | has_bypass_rls_policy | has_created_at | has_created_by | has_updated_at | has_updated_by | has_deleted_at | has_deleted_by | timestamp_column_types | missing_indexes |',
  );
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');

  for (const a of audits) {
    const timestampCols =
      a.timestampWithoutTz.length > 0 ? a.timestampWithoutTz.join(', ') : '-';
    const missingIdx = a.missingIndexes.length > 0 ? a.missingIndexes.join(', ') : '-';

    lines.push(
      `| ${a.tableName} | ${yn(a.isTenantScoped)} | ${yn(a.hasTenantId)} | ${yn(a.hasRlsEnabled)} | ${yn(a.hasRlsForced)} | ${yn(a.hasTenantIsolationPolicy)} | ${yn(a.hasBypassRlsPolicy)} | ${yn(a.hasCreatedAt)} | ${yn(a.hasCreatedBy)} | ${yn(a.hasUpdatedAt)} | ${yn(a.hasUpdatedBy)} | ${yn(a.hasDeletedAt)} | ${yn(a.hasDeletedBy)} | ${timestampCols} | ${missingIdx} |`,
    );
  }

  lines.push('');

  const markdown = lines.join('\n');

  // Write to docs/audits/db-tenant-audit.md (relative to project root)
  // When run from apps/web, process.cwd() = .../apps/web
  // So ../../docs/audits puts us at the project root docs/audits
  const outPath = path.resolve(process.cwd(), '../../docs/audits/db-tenant-audit.md');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, markdown, 'utf8');

  console.log(`Report written to: ${outPath}`);
  console.log('');
  console.log('=== Findings Summary ===');
  console.log(`Total tables: ${totalTables}`);
  console.log(
    `Tenant-scoped: ${tenantScopedAudits.length} (direct: ${directScoped.length}, FK: ${fkScoped.length})`,
  );
  console.log(`Missing RLS enabled: ${missingRlsEnabled.length}`);
  console.log(`Missing RLS forced: ${missingRlsForced.length}`);
  console.log(`Missing tenant_isolation_policy: ${missingTenantIsolationPolicy.length}`);
  console.log(`Missing bypass_rls_policy: ${missingBypassRlsPolicy.length}`);
  console.log(`Non-TIMESTAMPTZ columns: ${nonTzColumns.length} across ${nonTzTableSet.size} tables`);
  console.log(
    `Missing index gaps: ${totalIndexGaps} across ${tablesWithMissingIndexes.length} tables`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
