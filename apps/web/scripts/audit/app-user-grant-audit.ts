/**
 * app_user DML Grant Audit
 *
 * Read-only diagnostic that checks whether the `app_user` Postgres role has
 * been granted all four DML privileges (SELECT, INSERT, UPDATE, DELETE) on
 * every tenant-scoped table in the public schema.
 *
 * "Tenant-scoped" is defined as: relrowsecurity = true AND relforcerowsecurity = true.
 * This matches every table the Quick-410 migration was meant to protect.
 *
 * Output:
 *   - Per-table grid: table_name | HAS_SEL | HAS_INS | HAS_UPD | HAS_DEL | MISSING
 *   - Sorted by MISSING count DESC (worst offenders first)
 *   - Summary block with action list
 *   - CRITICAL flag for tables missing all four grants (production bypass via postgres role)
 *
 * GUARD-RAILS — read-only:
 *   - Only SELECTs against pg_catalog and information_schema
 *   - No GRANT, no DDL, no DML
 *
 * Run from apps/web/:
 *   npx tsx --env-file=.env.local scripts/audit/app-user-grant-audit.ts
 */

import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// ---------------------------------------------------------------------------
// Connection — mirror audit-rls-gaps.ts exactly
// ---------------------------------------------------------------------------

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Row-shape interfaces
// ---------------------------------------------------------------------------

interface GrantRow {
  table_name: string;
  has_select: boolean;
  has_insert: boolean;
  has_update: boolean;
  has_delete: boolean;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function padRight(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

function padLeft(s: string, width: number): string {
  return s.length >= width ? s : ' '.repeat(width - s.length) + s;
}

function bool(v: boolean): string {
  return v ? 'YES' : ' NO';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('app_user DML Grant Audit — starting...');
  console.log('');

  // Single query: tenant-scoped tables LEFT JOINed against role_table_grants
  // bool_or collapses multiple privilege rows per table into one boolean per privilege type.
  // COALESCE handles the LEFT JOIN case (no rows = NULL → false).
  const rows: GrantRow[] = await prisma.$queryRawUnsafe(`
    SELECT
      c.relname                                                         AS table_name,
      COALESCE(bool_or(g.privilege_type = 'SELECT'), false)            AS has_select,
      COALESCE(bool_or(g.privilege_type = 'INSERT'), false)            AS has_insert,
      COALESCE(bool_or(g.privilege_type = 'UPDATE'), false)            AS has_update,
      COALESCE(bool_or(g.privilege_type = 'DELETE'), false)            AS has_delete
    FROM pg_class c
    JOIN pg_namespace n
      ON n.oid = c.relnamespace
    LEFT JOIN information_schema.role_table_grants g
      ON  g.table_schema   = 'public'
      AND g.table_name     = c.relname
      AND g.grantee        = 'app_user'
      AND g.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    WHERE n.nspname          = 'public'
      AND c.relkind          = 'r'
      AND c.relrowsecurity   = true
      AND c.relforcerowsecurity = true
      AND c.relname         != '_prisma_migrations'
    GROUP BY c.relname
    ORDER BY c.relname
  `);

  console.log(`Tenant-scoped tables found (FORCE RLS = true): ${rows.length}`);
  console.log('');

  // Annotate with missing count, then sort by missing_count DESC, table_name ASC
  type AnnotatedRow = GrantRow & { missing_count: number };
  const annotated: AnnotatedRow[] = rows.map((r) => ({
    ...r,
    missing_count:
      (r.has_select ? 0 : 1) +
      (r.has_insert ? 0 : 1) +
      (r.has_update ? 0 : 1) +
      (r.has_delete ? 0 : 1),
  }));

  annotated.sort((a, b) => {
    if (b.missing_count !== a.missing_count) return b.missing_count - a.missing_count;
    return a.table_name.localeCompare(b.table_name);
  });

  // ---------------------------------------------------------------------------
  // Main grid
  // ---------------------------------------------------------------------------

  const COL_TABLE   = 44;
  const COL_PRIV    = 10;
  const COL_MISSING  = 8;

  const header =
    padRight('TABLE', COL_TABLE) +
    padRight('HAS_SEL', COL_PRIV) +
    padRight('HAS_INS', COL_PRIV) +
    padRight('HAS_UPD', COL_PRIV) +
    padRight('HAS_DEL', COL_PRIV) +
    padLeft('MISSING', COL_MISSING);

  const divider = '-'.repeat(header.length);

  console.log(header);
  console.log(divider);

  for (const r of annotated) {
    const missingLabel =
      r.missing_count === 4
        ? '*** 4 ***'
        : r.missing_count === 0
        ? '    0    '
        : String(r.missing_count);

    const line =
      padRight(r.table_name, COL_TABLE) +
      padRight(bool(r.has_select), COL_PRIV) +
      padRight(bool(r.has_insert), COL_PRIV) +
      padRight(bool(r.has_update), COL_PRIV) +
      padRight(bool(r.has_delete), COL_PRIV) +
      padLeft(missingLabel, COL_MISSING);

    console.log(line);
  }

  console.log(divider);
  console.log('');

  // ---------------------------------------------------------------------------
  // Summary statistics
  // ---------------------------------------------------------------------------

  const totalChecked   = annotated.length;
  const totalComplete  = annotated.filter((r) => r.missing_count === 0).length;
  const totalIncomplete = annotated.filter((r) => r.missing_count > 0).length;
  const critical       = annotated.filter((r) => r.missing_count === 4);

  console.log('=== SUMMARY ===');
  console.log('');
  console.log(`  Total tenant-scoped tables checked : ${totalChecked}`);
  console.log(`  Tables with ALL four grants        : ${totalComplete}`);
  console.log(`  Tables with at least one missing   : ${totalIncomplete}`);
  console.log('');

  // Action list
  const actionList = annotated.filter((r) => r.missing_count > 0);
  if (actionList.length === 0) {
    console.log('  ACTION LIST: (none — all grants are in place)');
  } else {
    console.log('  ACTION LIST — tables missing at least one grant:');
    console.log('');
    for (const r of actionList) {
      const missing: string[] = [];
      if (!r.has_select) missing.push('SELECT');
      if (!r.has_insert) missing.push('INSERT');
      if (!r.has_update) missing.push('UPDATE');
      if (!r.has_delete) missing.push('DELETE');
      const severity = r.missing_count === 4 ? ' [CRITICAL]' : '';
      console.log(`    ${r.table_name}${severity}`);
      console.log(`      Missing: ${missing.join(', ')}`);
    }
  }

  console.log('');

  // CRITICAL block
  if (critical.length > 0) {
    console.log('');
    console.log('=== CRITICAL — app_user has ZERO grants on these tables ===');
    console.log('');
    console.log('  Under FORCE RLS, app_user cannot read or write these tables.');
    console.log('  Any query using DATABASE_URL_APP_USER currently fails or falls back');
    console.log('  to the postgres superuser role, silently bypassing tenant isolation.');
    console.log('');
    for (const r of critical) {
      console.log(`    *** ${r.table_name}`);
    }
    console.log('');
    console.log(`  ${critical.length} CRITICAL table(s) require immediate GRANT remediation.`);
  } else {
    console.log('  No CRITICAL tables (all tables have at least one grant).');
  }

  console.log('');
  console.log('Audit complete.');
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
