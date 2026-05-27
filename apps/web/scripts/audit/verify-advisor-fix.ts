/**
 * verify-advisor-fix.ts
 *
 * Purpose: Confirm that the six tables targeted by quick-410 have the
 * spec-mandated RLS shape after migration 20260527000001_quick410_advisor_rls_fix
 * is applied. Queries pg_class, pg_policies, pg_indexes, and
 * information_schema.role_table_grants to validate:
 *   1. relrowsecurity = TRUE on all six tables
 *   2. relforcerowsecurity = TRUE on all six tables
 *   3. Tier A: tenant_isolation_policy + bypass_rls_policy + org_id index on carrier_compliance_alert_log
 *   4. Tier B: all tenant-isolation policies reference current_tenant_id() (not auth.jwt())
 *   5. Tier C: TicketMessage has at least one policy referencing current_tenant_id()
 *   6. Tier D: Tenant has tenant_self_read + bypass_rls_policy still present
 *   7. app_user has correct DML grants on each target
 *
 * GUARD-RAILS — this script performs NO writes:
 *   Only SELECTs against pg_class, pg_namespace, pg_policies, pg_indexes,
 *   and information_schema.role_table_grants.
 *   No INSERT, UPDATE, DELETE, ALTER, CREATE, or DROP statements are
 *   executed anywhere in this file (those words appear only in comments or
 *   string literals describing what this script verifies — never in SQL
 *   passed to $queryRaw or $queryRawUnsafe).
 *
 * Run from apps/web/:
 *   npx tsx --env-file=.env.local scripts/audit/verify-advisor-fix.ts
 */

import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Types — strict mode, no implicit any
// ---------------------------------------------------------------------------

interface RLSRow {
  tablename: string;
  rowsecurity: boolean;
  forcerowsecurity: boolean;
}

interface PolicyRow {
  tablename: string;
  policyname: string;
  qual: string | null;
  with_check: string | null;
}

interface IndexRow {
  indexname: string;
  tablename: string;
}

interface GrantRow {
  table_name: string;
  privilege_type: string;
  grantee: string;
}

// ---------------------------------------------------------------------------
// Result tracking
// ---------------------------------------------------------------------------

type CheckResult = { name: string; pass: boolean; detail: string };
const results: CheckResult[] = [];

function pass(name: string, detail = ''): void {
  results.push({ name, pass: true, detail });
  console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
}

function fail(name: string, detail = ''): void {
  results.push({ name, pass: false, detail });
  console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('verify-advisor-fix.ts — Quick-410 RLS Verification Diagnostic');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('');
  console.log('Verifying six tables against spec migration 20260527000001_quick410_advisor_rls_fix ...');
  console.log('');

  const TARGET_TABLES = [
    'carrier_compliance_alert_log',
    'carrier_documents',
    'route_template_stops',
    'stops',
    'TicketMessage',
    'Tenant',
  ] as const;

  // ── 1. RLS enabled and forced on all six tables ──────────────────────────
  console.log('=== CHECK 1: relrowsecurity + relforcerowsecurity ===');

  const rlsRows = await prisma.$queryRaw<RLSRow[]>`
    SELECT
      c.relname AS tablename,
      c.relrowsecurity AS rowsecurity,
      c.relforcerowsecurity AS forcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = ANY(ARRAY[
        'carrier_compliance_alert_log','carrier_documents',
        'route_template_stops','stops','TicketMessage','Tenant'
      ])
    ORDER BY c.relname
  `;

  const rlsMap = new Map<string, RLSRow>(rlsRows.map((r) => [r.tablename, r]));

  for (const t of TARGET_TABLES) {
    const row = rlsMap.get(t);
    if (!row) {
      fail(`${t} — table exists in pg_class`, 'table not found');
      continue;
    }
    if (row.rowsecurity) {
      pass(`${t} — relrowsecurity = TRUE`);
    } else {
      fail(`${t} — relrowsecurity`, 'FALSE (RLS not enabled)');
    }
    if (row.forcerowsecurity) {
      pass(`${t} — relforcerowsecurity = TRUE`);
    } else {
      fail(`${t} — relforcerowsecurity`, 'FALSE (FORCE RLS missing)');
    }
  }

  // ── 2. Load all policies for target tables ───────────────────────────────
  console.log('\n=== CHECK 2: Policy content validation ===');

  const policyRows = await prisma.$queryRaw<PolicyRow[]>`
    SELECT
      tablename,
      policyname,
      qual,
      with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(ARRAY[
        'carrier_compliance_alert_log','carrier_documents',
        'route_template_stops','stops','TicketMessage','Tenant'
      ])
    ORDER BY tablename, policyname
  `;

  // Build a quick lookup: table → policyname → PolicyRow
  const policyMap = new Map<string, Map<string, PolicyRow>>();
  for (const p of policyRows) {
    if (!policyMap.has(p.tablename)) policyMap.set(p.tablename, new Map());
    policyMap.get(p.tablename)!.set(p.policyname, p);
  }

  // Helper: check a policy's qual contains a required substring
  function policyQualContains(table: string, policyname: string, needle: string): boolean {
    const p = policyMap.get(table)?.get(policyname);
    if (!p) return false;
    const text = (p.qual ?? '') + (p.with_check ?? '');
    return text.includes(needle);
  }

  // Helper: check policy exists
  function policyExists(table: string, policyname: string): boolean {
    return policyMap.get(table)?.has(policyname) ?? false;
  }

  // ── 2a. Tier A — carrier_compliance_alert_log ────────────────────────────
  const compTable = 'carrier_compliance_alert_log';

  if (policyExists(compTable, 'tenant_isolation_policy')) {
    pass(`${compTable} — tenant_isolation_policy exists`);
  } else {
    fail(`${compTable} — tenant_isolation_policy`, 'policy missing');
  }

  if (policyQualContains(compTable, 'tenant_isolation_policy', 'current_tenant_id')) {
    pass(`${compTable} — tenant_isolation_policy references current_tenant_id()`);
  } else {
    fail(`${compTable} — tenant_isolation_policy references current_tenant_id()`, 'not found in qual');
  }

  if (
    !policyQualContains(compTable, 'tenant_isolation_policy', "auth.jwt() ->> 'org_id'") &&
    !policyQualContains(compTable, 'tenant_isolation_policy', 'auth.jwt()')
  ) {
    pass(`${compTable} — tenant_isolation_policy does NOT reference auth.jwt()`);
  } else {
    fail(`${compTable} — tenant_isolation_policy still references auth.jwt()`, 'broken JWT claim found');
  }

  if (policyExists(compTable, 'bypass_rls_policy')) {
    pass(`${compTable} — bypass_rls_policy exists`);
  } else {
    fail(`${compTable} — bypass_rls_policy`, 'policy missing');
  }

  // ── 2b. Tier B tables — carrier_documents, route_template_stops, stops ───
  const tierBTables = ['carrier_documents', 'route_template_stops', 'stops'] as const;

  for (const t of tierBTables) {
    // All policies for this table must NOT reference the broken auth.jwt() ->> 'org_id' claim
    const tablePolicies = policyMap.get(t) ?? new Map<string, PolicyRow>();
    let hasBrokenClaim = false;
    let hasCurrentTenantId = false;

    for (const [, p] of tablePolicies) {
      const text = (p.qual ?? '') + (p.with_check ?? '');
      if (text.includes("auth.jwt() ->> 'org_id'")) {
        hasBrokenClaim = true;
      }
      if (text.includes('current_tenant_id')) {
        hasCurrentTenantId = true;
      }
    }

    if (!hasBrokenClaim) {
      pass(`${t} — no policies reference broken auth.jwt() ->> 'org_id' claim`);
    } else {
      fail(`${t} — still has policies with auth.jwt() ->> 'org_id'`, 'broken claim not replaced');
    }

    if (hasCurrentTenantId) {
      pass(`${t} — at least one policy references current_tenant_id()`);
    } else {
      fail(`${t} — no policy references current_tenant_id()`, 'tenant scoping may be broken');
    }
  }

  // ── 2c. Tier C — TicketMessage ────────────────────────────────────────────
  const ticketTable = 'TicketMessage';
  const ticketPolicies = policyMap.get(ticketTable) ?? new Map<string, PolicyRow>();
  let ticketHasCurrentTenantId = false;

  for (const [, p] of ticketPolicies) {
    const text = (p.qual ?? '') + (p.with_check ?? '');
    if (text.includes('current_tenant_id')) {
      ticketHasCurrentTenantId = true;
    }
  }

  if (ticketHasCurrentTenantId) {
    pass(`${ticketTable} — existing policy references current_tenant_id() (untouched)`);
  } else {
    fail(`${ticketTable} — no policy references current_tenant_id()`, 'existing isolation policy may be missing');
  }

  // ── 2d. Tier D — Tenant ───────────────────────────────────────────────────
  const tenantTable = 'Tenant';

  if (policyExists(tenantTable, 'tenant_self_read')) {
    pass(`${tenantTable} — tenant_self_read policy exists`);
  } else {
    fail(`${tenantTable} — tenant_self_read`, 'policy missing');
  }

  if (policyQualContains(tenantTable, 'tenant_self_read', 'current_tenant_id')) {
    pass(`${tenantTable} — tenant_self_read references current_tenant_id()`);
  } else {
    fail(`${tenantTable} — tenant_self_read references current_tenant_id()`, 'not found in qual');
  }

  // Regression guard: bypass_rls_policy must still exist on Tenant
  if (policyExists(tenantTable, 'bypass_rls_policy')) {
    pass(`${tenantTable} — bypass_rls_policy still present (regression guard)`);
  } else {
    fail(`${tenantTable} — bypass_rls_policy`, 'MISSING — regression: bypass policy was dropped');
  }

  // ── 3. Indexes ────────────────────────────────────────────────────────────
  console.log('\n=== CHECK 3: Required indexes ===');

  const indexRows = await prisma.$queryRaw<IndexRow[]>`
    SELECT indexname, tablename
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_carrier_compliance_alert_log_org_id'
  `;

  if (indexRows.length > 0) {
    pass('idx_carrier_compliance_alert_log_org_id exists');
  } else {
    fail('idx_carrier_compliance_alert_log_org_id', 'index missing');
  }

  // ── 4. app_user grants ────────────────────────────────────────────────────
  console.log('\n=== CHECK 4: app_user DML grants ===');

  const grantRows = await prisma.$queryRaw<GrantRow[]>`
    SELECT table_name, privilege_type, grantee
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee = 'app_user'
      AND table_name = ANY(ARRAY[
        'carrier_compliance_alert_log','carrier_documents',
        'route_template_stops','stops','Tenant'
      ])
    ORDER BY table_name, privilege_type
  `;

  // Build grant map: table → Set<privilege>
  const grantMap = new Map<string, Set<string>>();
  for (const g of grantRows) {
    if (!grantMap.has(g.table_name)) grantMap.set(g.table_name, new Set());
    grantMap.get(g.table_name)!.add(g.privilege_type.toUpperCase());
  }

  // Full DML tables (all four operations)
  const fullDmlTables = [
    'carrier_compliance_alert_log',
    'carrier_documents',
    'route_template_stops',
    'stops',
  ] as const;

  for (const t of fullDmlTables) {
    const grants = grantMap.get(t) ?? new Set<string>();
    const required = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
    const missing = required.filter((p) => !grants.has(p));
    if (missing.length === 0) {
      pass(`${t} — app_user has SELECT/INSERT/UPDATE/DELETE`);
    } else {
      fail(`${t} — app_user grants`, `missing: ${missing.join(', ')}`);
    }
  }

  // Tenant: SELECT only
  const tenantGrants = grantMap.get('Tenant') ?? new Set<string>();
  if (tenantGrants.has('SELECT')) {
    pass('Tenant — app_user has SELECT');
  } else {
    fail('Tenant — app_user SELECT grant', 'missing');
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = total - passed;

  console.log('\n' + '='.repeat(60));
  console.log(`SUMMARY: ${passed}/${total} checks passed, ${failed} failed`);
  console.log('='.repeat(60));

  if (failed > 0) {
    console.log('\nFailed checks:');
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`  FAIL  ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
    }
  }

  console.log(`\nFinished: ${new Date().toISOString()}`);

  await prisma.$disconnect();
  await pool.end();

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error('FATAL:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
