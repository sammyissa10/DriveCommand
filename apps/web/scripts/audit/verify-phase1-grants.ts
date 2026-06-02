/**
 * verify-phase1-grants.ts
 *
 * Purpose: Confirm that every tenant-scoped FORCE-RLS table in the public
 * schema (excluding the Section 4.12 allowlist) has all four DML privileges
 * (SELECT, INSERT, UPDATE, DELETE) granted to app_user after migration
 * 20260602000001_phase1_grant_app_user_dml.
 *
 * GUARD-RAILS — READ-ONLY:
 *   Only SELECTs against pg_catalog and information_schema.
 *   No INSERT, UPDATE, DELETE, ALTER, CREATE, or DROP statements are
 *   executed anywhere in this file.
 *
 * Section 4.12 allowlist (excluded from all checks — not FORCE-RLS):
 *   _prisma_migrations, Plan, Promo, carrier_catalog_meta,
 *   NotificationTemplate, NotificationEmailConfig, grid_preference, grid_view
 *
 * Run from apps/web/:
 *   npx tsx --env-file=.env.local scripts/audit/verify-phase1-grants.ts
 */

import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// ---------------------------------------------------------------------------
// Connection — identical to app-user-grant-audit.ts
// ---------------------------------------------------------------------------

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

interface GrantRow {
  table_name: string;
  has_select: boolean;
  has_insert: boolean;
  has_update: boolean;
  has_delete: boolean;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== PHASE 1 GRANT VERIFICATION ===');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('');

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
    WHERE n.nspname              = 'public'
      AND c.relkind              = 'r'
      AND c.relrowsecurity       = true
      AND c.relforcerowsecurity  = true
      AND c.relname NOT IN (
        '_prisma_migrations',
        'Plan', 'Promo', 'carrier_catalog_meta',
        'NotificationTemplate', 'NotificationEmailConfig',
        'grid_preference', 'grid_view'
      )
    GROUP BY c.relname
    ORDER BY c.relname
  `);

  type AnnotatedRow = GrantRow & { missing_count: number; missing_privs: string[] };

  const annotated: AnnotatedRow[] = rows.map((r) => {
    const missing: string[] = [];
    if (!r.has_select) missing.push('SELECT');
    if (!r.has_insert) missing.push('INSERT');
    if (!r.has_update) missing.push('UPDATE');
    if (!r.has_delete) missing.push('DELETE');
    return { ...r, missing_count: missing.length, missing_privs: missing };
  });

  const passing = annotated.filter((r) => r.missing_count === 0);
  const failing  = annotated.filter((r) => r.missing_count > 0);

  console.log(`Total tenant-scoped tables checked (excluding Section 4.12 allowlist): ${annotated.length}`);
  console.log(`Tables with ALL four grants: ${passing.length}`);
  console.log(`Tables still missing at least one grant: ${failing.length}`);
  console.log('');

  if (failing.length > 0) {
    console.log('FAILING TABLES:');
    for (const r of failing) {
      console.log(`  ${r.table_name} — missing: ${r.missing_privs.join(', ')}`);
    }
    console.log('');
    console.log('FAIL — Phase 1 incomplete. Re-run migration or investigate grant gaps.');
    process.exit(1);
  }

  console.log('ALL GRANTS PRESENT — Phase 1 complete.');
}

main()
  .catch((err: unknown) => {
    console.error('FATAL:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
