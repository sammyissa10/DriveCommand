/**
 * classify-uncertain-tables.ts
 *
 * Purpose: Classify three RLS-uncertain tables against
 * DatabaseSecurity_MultiTenant_Spec_v1.md Section 4.12 (platform-level vs
 * tenant-scoped). The Supabase advisor flagged these tables for missing RLS.
 * Plan and Promo are explicitly platform-level (RLS off intentional). These
 * three — carrier_catalog_meta, NotificationTemplate, NotificationEmailConfig —
 * need evidence-based verdicts before we apply (or skip) policies.
 *
 * GUARD-RAILS — this script performs NO writes:
 *   Only SELECTs against information_schema, pg_stat_user_tables, and pg_catalog.
 *   No INSERT, UPDATE, DELETE, ALTER, CREATE TABLE, CREATE POLICY, or DROP
 *   statements are executed anywhere in this file. Those terms appear only as
 *   markdown content inside string literals in the RECOMMENDED ACTION block at
 *   the bottom — they are never passed to $queryRaw or $executeRaw.
 *
 * Run from apps/web/:
 *   npx tsx --env-file=.env.local scripts/audit/classify-uncertain-tables.ts
 */

import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { execSync } from 'child_process';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Connection — match 406b-resolve-blockers.ts exactly
// ---------------------------------------------------------------------------

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

const TARGETS = [
  { snake: 'carrier_catalog_meta',    pascal: 'CarrierCatalogMeta' },
  { snake: 'NotificationTemplate',    pascal: 'NotificationTemplate' },
  { snake: 'NotificationEmailConfig', pascal: 'NotificationEmailConfig' },
] as const;

// Well-known tenant-scoped models — used for inbound FK heuristic
const TENANT_SCOPED_TABLES = new Set([
  'User', 'Truck', 'Driver', 'Route', 'Load', 'Tenant',
  'Notification', 'NotificationSubscriber', 'InAppNotification',
  'TenantNotificationSettings', 'NotificationSubscription',
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: string;
}

interface RowCountRow {
  row_count: number;
}

interface OutboundFkRow {
  constraint_name: string;
  column_name: string;
  foreign_schema: string;
  foreign_table: string;
  foreign_column: string;
}

interface InboundFkRow {
  source_table: string;
  source_column: string;
  constraint_name: string;
}

// ---------------------------------------------------------------------------
// Safe query wrapper
// ---------------------------------------------------------------------------

async function safeQuery<T>(
  label: string,
  sql: string,
  ...params: unknown[]
): Promise<{ rows: T[]; error: string | null }> {
  try {
    const rows = await prisma.$queryRawUnsafe<T[]>(sql, ...params);
    return { rows, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { rows: [], error: `NOT DETERMINABLE: ${label} — ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// Codebase grep helper (ripgrep via npx, non-zero exit = no matches)
// ---------------------------------------------------------------------------

function grepCodebase(needle: string): string[] {
  try {
    const out = execSync(
      `npx --no-install rg --no-heading --line-number --max-count 20 -F "${needle}" apps/web/src packages/`,
      {
        encoding: 'utf8',
        cwd: path.join(__dirname, '../../../..'),
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    return out.split('\n').filter(Boolean).slice(0, 20);
  } catch {
    // rg exits non-zero on no matches — that is not an error for us
    return [];
  }
}

// ---------------------------------------------------------------------------
// Verdict types
// ---------------------------------------------------------------------------

type Verdict =
  | 'PLATFORM_LEVEL_LEAVE_RLS_OFF'
  | 'PLATFORM_LEVEL_WITH_PERMISSIVE_POLICY'
  | 'TENANT_SCOPED_NEEDS_STANDARD_POLICIES';

// ---------------------------------------------------------------------------
// Per-table classification
// ---------------------------------------------------------------------------

async function classifyTable(target: { snake: string; pascal: string }): Promise<Verdict> {
  const sep = '='.repeat(60);
  console.log(`\n${sep}`);
  console.log(`TABLE: ${target.snake}`);
  console.log(sep);

  // ------------------------------------------------------------------
  // 1. COLUMN INVENTORY
  // ------------------------------------------------------------------
  const colResult = await safeQuery<ColumnRow>(
    `columns for ${target.snake}`,
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    target.snake,
  );

  const scopingRegex = /tenant|org|user|owner|customer|account/i;
  const scopingCandidates: string[] = [];

  console.log('\nCOLUMNS:');
  if (colResult.error) {
    console.log(`  ${colResult.error}`);
  } else if (colResult.rows.length === 0) {
    console.log('  (table not found in information_schema — may not exist in public schema)');
  } else {
    for (const col of colResult.rows) {
      console.log(`  ${col.column_name.padEnd(35)} ${col.data_type.padEnd(25)} nullable=${col.is_nullable}`);
      if (scopingRegex.test(col.column_name)) {
        scopingCandidates.push(col.column_name);
      }
    }
  }

  if (scopingCandidates.length > 0) {
    console.log(`\nSCOPING_CANDIDATES: [${scopingCandidates.join(', ')}]`);
  } else {
    console.log('\nSCOPING_CANDIDATES: none');
  }

  const hasScopingColumns = scopingCandidates.length > 0;

  // ------------------------------------------------------------------
  // 2. ROW COUNT
  // ------------------------------------------------------------------
  const countResult = await safeQuery<RowCountRow>(
    `row count for ${target.snake}`,
    `SELECT n_live_tup::int AS row_count
     FROM pg_stat_user_tables
     WHERE schemaname = 'public' AND relname = $1`,
    target.snake,
  );

  let rowCount = 0;
  if (countResult.error) {
    console.log(`\nROW_COUNT: ${countResult.error}`);
  } else if (countResult.rows.length === 0) {
    console.log('\nROW_COUNT: 0 (table empty or never analyzed)');
  } else {
    rowCount = countResult.rows[0].row_count;
    console.log(`\nROW_COUNT: ${rowCount}`);
  }

  // ------------------------------------------------------------------
  // 3. FK OUTBOUND (this table -> other tables)
  // ------------------------------------------------------------------
  const outboundResult = await safeQuery<OutboundFkRow>(
    `outbound FKs for ${target.snake}`,
    `SELECT
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
       AND tc.table_name      = $1`,
    target.snake,
  );

  let fksTenant = false;

  console.log('\nOUTBOUND_FKS:');
  if (outboundResult.error) {
    console.log(`  ${outboundResult.error}`);
  } else if (outboundResult.rows.length === 0) {
    console.log('  (none)');
  } else {
    for (const fk of outboundResult.rows) {
      console.log(`  OUTBOUND_FK: ${fk.column_name} -> ${fk.foreign_schema}.${fk.foreign_table}.${fk.foreign_column}`);
      if (fk.foreign_table === 'Tenant' || fk.foreign_table === 'tenant') {
        fksTenant = true;
      }
    }
  }

  // ------------------------------------------------------------------
  // 4. FK INBOUND (other tables -> this table)
  // ------------------------------------------------------------------
  const inboundResult = await safeQuery<InboundFkRow>(
    `inbound FKs for ${target.snake}`,
    `SELECT
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
       AND ccu.table_name     = $1`,
    target.snake,
  );

  let inboundFromTenantScoped = false;

  console.log('\nINBOUND_FKS:');
  if (inboundResult.error) {
    console.log(`  ${inboundResult.error}`);
  } else if (inboundResult.rows.length === 0) {
    console.log('  (none)');
  } else {
    for (const fk of inboundResult.rows) {
      console.log(`  INBOUND_FK: ${fk.source_table}.${fk.source_column} -> this`);
      if (TENANT_SCOPED_TABLES.has(fk.source_table)) {
        inboundFromTenantScoped = true;
      }
    }
  }

  // ------------------------------------------------------------------
  // 5. CODEBASE GREP
  // ------------------------------------------------------------------
  const snakeHits = grepCodebase(target.snake);
  console.log(`\nCODEBASE_USAGE (${target.snake}):`);
  if (snakeHits.length === 0) {
    console.log('  (no matches)');
  } else {
    for (const line of snakeHits) {
      console.log(`  USAGE: ${line.slice(0, 120)}`);
    }
  }

  // Only search pascal if it differs from snake
  if (target.pascal !== target.snake) {
    const pascalHits = grepCodebase(target.pascal);
    console.log(`\nCODEBASE_USAGE (${target.pascal}):`);
    if (pascalHits.length === 0) {
      console.log('  (no matches)');
    } else {
      for (const line of pascalHits) {
        console.log(`  USAGE: ${line.slice(0, 120)}`);
      }
    }
  } else {
    console.log(`\nCODEBASE_USAGE (${target.pascal}):`);
    console.log('  (same as snake_case search above — skipping duplicate)');
  }

  // ------------------------------------------------------------------
  // VERDICT LOGIC
  // ------------------------------------------------------------------
  let verdict: Verdict;
  let reasoning: string;

  if (hasScopingColumns || fksTenant) {
    verdict = 'TENANT_SCOPED_NEEDS_STANDARD_POLICIES';
    if (hasScopingColumns) {
      reasoning = `Scoping candidate column(s) found: [${scopingCandidates.join(', ')}] — table holds per-tenant data.`;
    } else {
      reasoning = 'Outbound FK to Tenant table detected — this table is directly tenant-scoped.';
    }
  } else if (rowCount > 0 && inboundFromTenantScoped) {
    verdict = 'PLATFORM_LEVEL_WITH_PERMISSIVE_POLICY';
    reasoning = 'No tenant column or Tenant FK, but row count > 0 and at least one tenant-scoped table references this table via FK — needs permissive USING (true) SELECT policy so tenant-scoped joins can pass through.';
  } else {
    verdict = 'PLATFORM_LEVEL_LEAVE_RLS_OFF';
    reasoning = 'No scoping column, no Tenant FK, no inbound FK from tenant-scoped tables (or table is empty) — pure platform-level reference data; RLS off is intentional.';
  }

  console.log(`\nVERDICT: ${verdict}`);
  console.log(`REASONING: ${reasoning}`);

  return verdict;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('classify-uncertain-tables.ts — RLS Table Classification Diagnostic');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('');
  console.log('Classifying three tables against DatabaseSecurity_MultiTenant_Spec_v1.md Section 4.12...');

  const verdicts: Record<string, Verdict> = {};

  for (const target of TARGETS) {
    verdicts[target.snake] = await classifyTable(target);
  }

  // ------------------------------------------------------------------
  // RECOMMENDED ACTION BLOCK
  // ------------------------------------------------------------------
  const sep = '='.repeat(60);
  console.log(`\n\n${sep}`);
  console.log('RECOMMENDED ACTION');
  console.log(sep);

  console.log(`carrier_catalog_meta     -> ${verdicts['carrier_catalog_meta']}`);
  console.log(`NotificationTemplate     -> ${verdicts['NotificationTemplate']}`);
  console.log(`NotificationEmailConfig  -> ${verdicts['NotificationEmailConfig']}`);

  console.log('\nNext step per verdict:');
  console.log('  PLATFORM_LEVEL_LEAVE_RLS_OFF            -> add to Section 4.12 explicit allowlist; no migration needed');
  console.log('  PLATFORM_LEVEL_WITH_PERMISSIVE_POLICY   -> ALTER TABLE ... ENABLE ROW LEVEL SECURITY;');
  console.log('                                              CREATE POLICY <table>_select_all FOR SELECT USING (true);');
  console.log('  TENANT_SCOPED_NEEDS_STANDARD_POLICIES   -> apply standard 4-policy template using');
  console.log("                                              (auth.jwt() -> 'app_metadata' ->> 'tenantId')::uuid");

  console.log(`\nFinished: ${new Date().toISOString()}`);
}

main()
  .catch((err: unknown) => {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
