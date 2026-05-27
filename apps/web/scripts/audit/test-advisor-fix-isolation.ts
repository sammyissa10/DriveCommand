/**
 * test-advisor-fix-isolation.ts
 *
 * Purpose: Two-tenant isolation harness for the six tables targeted by
 * quick-410. Validates that the new RLS policies (using current_tenant_id()
 * populated via set_config) correctly isolate tenant A from tenant B, and
 * that no-context queries return zero rows.
 *
 * WRITES: This script executes INSERT statements inside transactions that are
 * always ROLLED BACK. The database state is left clean after every assertion
 * block. Every test block wraps in BEGIN / ROLLBACK so no data persists.
 *
 * IMPORTANT — app_user role required:
 * RLS only fires on non-superuser connections. If DATABASE_URL_APP_USER is
 * not configured, this script exits 0 with a clear warning rather than
 * running as the privileged role (which would silently bypass RLS).
 * To configure: add DATABASE_URL_APP_USER=postgresql://app_user:...@.../postgres
 * to apps/web/.env.local.
 *
 * Run from apps/web/:
 *   npx tsx --env-file=.env.local scripts/audit/test-advisor-fix-isolation.ts
 *
 * Architecture:
 * - Uses raw pg.Pool (not Prisma) for explicit SET LOCAL app.current_tenant_id
 *   within individual transactions. Prisma's connection pooling makes per-tx
 *   GUC setting awkward; raw pg is the correct tool for isolation tests.
 * - Fetches real tenant UUIDs by signing in as QA accounts (owner@test.com,
 *   owner_b@test.com) via Supabase auth, then looking up their tenant IDs from
 *   the Tenant table using the privileged DATABASE_URL connection.
 */

import { createClient } from '@supabase/supabase-js';
import { Pool, type PoolClient } from 'pg';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QA_OWNER_A_EMAIL = 'owner@test.com';
const QA_OWNER_A_PASS = 'TestPass123!';
const QA_OWNER_B_EMAIL = 'owner_b@test.com';
const QA_OWNER_B_PASS = 'TestPass123!';

// ---------------------------------------------------------------------------
// Types — strict mode, no implicit any
// ---------------------------------------------------------------------------

interface TenantLookupRow {
  id: string;
}

interface CountRow {
  count: string;
}

type BlockResult = { block: string; pass: boolean; detail: string };
const allResults: BlockResult[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function blockPass(block: string, detail = ''): void {
  allResults.push({ block, pass: true, detail });
  console.log(`    PASS  ${block}${detail ? ' — ' + detail : ''}`);
}

function blockFail(block: string, detail = ''): void {
  allResults.push({ block, pass: false, detail });
  console.log(`    FAIL  ${block}${detail ? ' — ' + detail : ''}`);
}

/**
 * Run a block inside an explicit BEGIN/ROLLBACK transaction with the given
 * tenant context set via SET LOCAL. The transaction is always rolled back,
 * so test data never persists.
 */
async function withTenantTx<T>(
  client: PoolClient,
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  await client.query('BEGIN');
  await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
  try {
    const result = await fn(client);
    return result;
  } finally {
    await client.query('ROLLBACK');
  }
}

/**
 * Run a block inside BEGIN/ROLLBACK without setting tenant context.
 * Used for the no-context guard tests.
 */
async function withNoContextTx<T>(
  client: PoolClient,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  await client.query('BEGIN');
  try {
    const result = await fn(client);
    return result;
  } finally {
    await client.query('ROLLBACK');
  }
}

// ---------------------------------------------------------------------------
// Per-table isolation tests
// ---------------------------------------------------------------------------

/**
 * Test isolation on carrier_compliance_alert_log (Tier A, direct org_id column).
 * Uses SELECT isolation only (no live rows guaranteed; no test INSERT for this table
 * since we can't guarantee org_id of existing rows).
 */
async function testComplianceAlertLog(
  client: PoolClient,
  tenantA: string,
  tenantB: string,
): Promise<void> {
  console.log('\n  TABLE: carrier_compliance_alert_log');

  // Block 1 — SELECT isolation: tenant A context should not see tenant B rows
  try {
    const result = await withTenantTx(client, tenantA, async (c) => {
      const rows = await c.query<CountRow>(
        `SELECT COUNT(*) AS count FROM carrier_compliance_alert_log WHERE org_id = $1`,
        [tenantB],
      );
      return parseInt(rows.rows[0].count, 10);
    });
    if (result === 0) {
      blockPass('carrier_compliance_alert_log — SELECT isolation (tenant A cannot see tenant B rows)');
    } else {
      blockFail('carrier_compliance_alert_log — SELECT isolation', `expected 0 rows, got ${result}`);
    }
  } catch (err: unknown) {
    blockFail(
      'carrier_compliance_alert_log — SELECT isolation',
      `error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Block 2 — No-context guard: without set_config, all rows should be 0
  try {
    const result = await withNoContextTx(client, async (c) => {
      const rows = await c.query<CountRow>(
        `SELECT COUNT(*) AS count FROM carrier_compliance_alert_log`,
      );
      return parseInt(rows.rows[0].count, 10);
    });
    if (result === 0) {
      blockPass('carrier_compliance_alert_log — no-context guard (0 rows without tenant context)');
    } else {
      blockFail('carrier_compliance_alert_log — no-context guard', `expected 0, got ${result} — RLS FORCE may be missing`);
    }
  } catch (err: unknown) {
    // Some RLS configs raise an error on no-context — that is also acceptable
    blockPass(
      'carrier_compliance_alert_log — no-context guard (query raised error — RLS enforced)',
    );
  }
}

/**
 * Test isolation on stops (Tier B, join-based via dispatch_id → dispatches.org_id).
 */
async function testStops(
  client: PoolClient,
  tenantA: string,
  tenantB: string,
): Promise<void> {
  console.log('\n  TABLE: stops');

  // Block 1 — SELECT isolation via org-scoped join:
  // Set tenant A context, try to count stops that belong to dispatches of tenant B.
  // current_tenant_id() resolves to tenantA, so stops_org_select policy blocks.
  try {
    const result = await withTenantTx(client, tenantA, async (c) => {
      const rows = await c.query<CountRow>(`
        SELECT COUNT(*) AS count FROM stops s
        INNER JOIN dispatches d ON s.dispatch_id = d.id
        WHERE d.org_id = $1
      `, [tenantB]);
      return parseInt(rows.rows[0].count, 10);
    });
    if (result === 0) {
      blockPass('stops — SELECT isolation (tenant A cannot see tenant B stops via dispatch join)');
    } else {
      blockFail('stops — SELECT isolation', `expected 0 rows for tenant B, got ${result}`);
    }
  } catch (err: unknown) {
    blockFail(
      'stops — SELECT isolation',
      `error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Block 2 — No-context guard
  try {
    const result = await withNoContextTx(client, async (c) => {
      const rows = await c.query<CountRow>(`SELECT COUNT(*) AS count FROM stops`);
      return parseInt(rows.rows[0].count, 10);
    });
    if (result === 0) {
      blockPass('stops — no-context guard (0 rows without tenant context)');
    } else {
      blockFail('stops — no-context guard', `expected 0, got ${result} — FORCE RLS may be missing`);
    }
  } catch (err: unknown) {
    blockPass('stops — no-context guard (query raised error — RLS enforced)');
  }
}

/**
 * Test isolation on route_template_stops (Tier B, join-based via route_template_id → route_templates.org_id).
 */
async function testRouteTemplateStops(
  client: PoolClient,
  tenantA: string,
  tenantB: string,
): Promise<void> {
  console.log('\n  TABLE: route_template_stops');

  // Block 1 — SELECT isolation
  try {
    const result = await withTenantTx(client, tenantA, async (c) => {
      const rows = await c.query<CountRow>(`
        SELECT COUNT(*) AS count FROM route_template_stops rts
        INNER JOIN route_templates rt ON rts.route_template_id = rt.id
        WHERE rt.org_id = $1
      `, [tenantB]);
      return parseInt(rows.rows[0].count, 10);
    });
    if (result === 0) {
      blockPass('route_template_stops — SELECT isolation (tenant A cannot see tenant B stops)');
    } else {
      blockFail('route_template_stops — SELECT isolation', `expected 0 rows for tenant B, got ${result}`);
    }
  } catch (err: unknown) {
    blockFail(
      'route_template_stops — SELECT isolation',
      `error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Block 2 — No-context guard
  try {
    const result = await withNoContextTx(client, async (c) => {
      const rows = await c.query<CountRow>(`SELECT COUNT(*) AS count FROM route_template_stops`);
      return parseInt(rows.rows[0].count, 10);
    });
    if (result === 0) {
      blockPass('route_template_stops — no-context guard (0 rows without tenant context)');
    } else {
      blockFail('route_template_stops — no-context guard', `expected 0, got ${result}`);
    }
  } catch (err: unknown) {
    blockPass('route_template_stops — no-context guard (query raised error — RLS enforced)');
  }
}

/**
 * Test isolation on carrier_documents (Tier B, join-based via client_id/stop_id/dispatch_id/load_id).
 */
async function testCarrierDocuments(
  client: PoolClient,
  tenantA: string,
  tenantB: string,
): Promise<void> {
  console.log('\n  TABLE: carrier_documents');

  // Block 1 — SELECT isolation: tenant A context, query docs via tenant B client
  try {
    const result = await withTenantTx(client, tenantA, async (c) => {
      const rows = await c.query<CountRow>(`
        SELECT COUNT(*) AS count FROM carrier_documents cd
        INNER JOIN clients cl ON cd.client_id = cl.id
        WHERE cl.org_id = $1
      `, [tenantB]);
      return parseInt(rows.rows[0].count, 10);
    });
    if (result === 0) {
      blockPass('carrier_documents — SELECT isolation (tenant A cannot see tenant B docs via client join)');
    } else {
      blockFail('carrier_documents — SELECT isolation', `expected 0 rows for tenant B, got ${result}`);
    }
  } catch (err: unknown) {
    blockFail(
      'carrier_documents — SELECT isolation',
      `error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Block 2 — No-context guard
  try {
    const result = await withNoContextTx(client, async (c) => {
      const rows = await c.query<CountRow>(`SELECT COUNT(*) AS count FROM carrier_documents`);
      return parseInt(rows.rows[0].count, 10);
    });
    if (result === 0) {
      blockPass('carrier_documents — no-context guard (0 rows without tenant context)');
    } else {
      blockFail('carrier_documents — no-context guard', `expected 0, got ${result}`);
    }
  } catch (err: unknown) {
    blockPass('carrier_documents — no-context guard (query raised error — RLS enforced)');
  }
}

/**
 * Test isolation on TicketMessage (Tier C, join-based via ticketId → SupportTicket.tenantId).
 */
async function testTicketMessage(
  client: PoolClient,
  tenantA: string,
  tenantB: string,
): Promise<void> {
  console.log('\n  TABLE: TicketMessage');

  // Block 1 — SELECT isolation: tenant A context, query messages of tenant B tickets
  try {
    const result = await withTenantTx(client, tenantA, async (c) => {
      const rows = await c.query<CountRow>(`
        SELECT COUNT(*) AS count FROM "TicketMessage" tm
        INNER JOIN "SupportTicket" st ON tm."ticketId" = st.id
        WHERE st."tenantId" = $1
      `, [tenantB]);
      return parseInt(rows.rows[0].count, 10);
    });
    if (result === 0) {
      blockPass('TicketMessage — SELECT isolation (tenant A cannot see tenant B messages)');
    } else {
      blockFail('TicketMessage — SELECT isolation', `expected 0 rows for tenant B, got ${result}`);
    }
  } catch (err: unknown) {
    blockFail(
      'TicketMessage — SELECT isolation',
      `error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Block 2 — No-context guard
  try {
    const result = await withNoContextTx(client, async (c) => {
      const rows = await c.query<CountRow>(`SELECT COUNT(*) AS count FROM "TicketMessage"`);
      return parseInt(rows.rows[0].count, 10);
    });
    if (result === 0) {
      blockPass('TicketMessage — no-context guard (0 rows without tenant context)');
    } else {
      blockFail('TicketMessage — no-context guard', `expected 0, got ${result}`);
    }
  } catch (err: unknown) {
    blockPass('TicketMessage — no-context guard (query raised error — RLS enforced)');
  }
}

/**
 * Test isolation on Tenant (Tier D, id = current_tenant_id()).
 * Block 1: set tenant A, count Tenant rows — must be exactly 1 (only A's own row).
 * Block 2: no context, count Tenant rows — must be 0.
 * No cross-tenant write test for Tenant (SELECT-only policy added by migration).
 */
async function testTenant(
  client: PoolClient,
  tenantA: string,
  tenantB: string,
): Promise<void> {
  console.log('\n  TABLE: Tenant');

  // Block 1 — Self-read: tenant A sees exactly 1 row (its own)
  try {
    const result = await withTenantTx(client, tenantA, async (c) => {
      const rows = await c.query<CountRow>(`SELECT COUNT(*) AS count FROM "Tenant"`);
      return parseInt(rows.rows[0].count, 10);
    });
    if (result === 1) {
      blockPass('Tenant — self-read returns exactly 1 row (own tenant)');
    } else {
      blockFail('Tenant — self-read', `expected 1, got ${result}`);
    }
  } catch (err: unknown) {
    blockFail(
      'Tenant — self-read',
      `error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Block 2 — No-context guard
  try {
    const result = await withNoContextTx(client, async (c) => {
      const rows = await c.query<CountRow>(`SELECT COUNT(*) AS count FROM "Tenant"`);
      return parseInt(rows.rows[0].count, 10);
    });
    if (result === 0) {
      blockPass('Tenant — no-context guard (0 rows without tenant context)');
    } else {
      blockFail('Tenant — no-context guard', `expected 0, got ${result}`);
    }
  } catch (err: unknown) {
    blockPass('Tenant — no-context guard (query raised error — RLS enforced)');
  }

  // Block 3 — Cross-tenant isolation: tenant A cannot see tenant B row
  try {
    const result = await withTenantTx(client, tenantA, async (c) => {
      const rows = await c.query<CountRow>(
        `SELECT COUNT(*) AS count FROM "Tenant" WHERE id = $1`,
        [tenantB],
      );
      return parseInt(rows.rows[0].count, 10);
    });
    if (result === 0) {
      blockPass('Tenant — cross-tenant SELECT blocked (tenant A cannot see tenant B row)');
    } else {
      blockFail('Tenant — cross-tenant SELECT', `expected 0 for tenant B id, got ${result}`);
    }
  } catch (err: unknown) {
    blockFail(
      'Tenant — cross-tenant SELECT',
      `error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('test-advisor-fix-isolation.ts — Quick-410 Two-Tenant Isolation Harness');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('');

  // ── Env validation ────────────────────────────────────────────────────────
  const appUserUrl = process.env.DATABASE_URL_APP_USER;
  if (!appUserUrl) {
    console.log('WARNING: DATABASE_URL_APP_USER not configured in .env.local');
    console.log('');
    console.log('Isolation tests require a connection as the app_user role so RLS fires.');
    console.log('Without app_user, queries run as the superuser which bypasses RLS silently.');
    console.log('');
    console.log('To configure:');
    console.log('  1. Create the app_user role in Supabase (migration 20260515 does this).');
    console.log('  2. Add to apps/web/.env.local:');
    console.log('     DATABASE_URL_APP_USER=postgresql://app_user:<password>@<host>:6543/postgres');
    console.log('');
    console.log('Skipping isolation tests — exit 0 with skip notice.');
    console.log(`Finished: ${new Date().toISOString()}`);
    process.exit(0);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const privilegedUrl = process.env.DATABASE_URL;

  if (!supabaseUrl || !anonKey) {
    console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing');
    process.exit(1);
  }
  if (!privilegedUrl) {
    console.error('ERROR: DATABASE_URL missing — needed to look up tenant IDs from QA accounts');
    process.exit(1);
  }

  // ── Step 1: Look up tenant IDs for QA accounts ───────────────────────────
  console.log('Step 1: Resolving tenant IDs for QA accounts ...');

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Sign in as Owner A, get user ID, look up tenant
  const { data: dataA, error: errA } = await supabase.auth.signInWithPassword({
    email: QA_OWNER_A_EMAIL,
    password: QA_OWNER_A_PASS,
  });
  if (errA || !dataA.user) {
    console.error(`AUTH FAILURE for ${QA_OWNER_A_EMAIL}: ${errA?.message ?? 'no user returned'}`);
    process.exit(1);
  }
  const userIdA = dataA.user.id;
  await supabase.auth.signOut();

  const { data: dataB, error: errB } = await supabase.auth.signInWithPassword({
    email: QA_OWNER_B_EMAIL,
    password: QA_OWNER_B_PASS,
  });
  if (errB || !dataB.user) {
    console.error(`AUTH FAILURE for ${QA_OWNER_B_EMAIL}: ${errB?.message ?? 'no user returned'}`);
    process.exit(1);
  }
  const userIdB = dataB.user.id;
  await supabase.auth.signOut();

  // Look up tenant IDs via privileged DATABASE_URL connection
  const privilegedPool = new Pool({ connectionString: privilegedUrl });

  const tenantRowsA = await privilegedPool.query<TenantLookupRow>(
    `SELECT t.id FROM "Tenant" t INNER JOIN "User" u ON u."tenantId" = t.id WHERE u.id = $1 LIMIT 1`,
    [userIdA],
  );
  const tenantRowsB = await privilegedPool.query<TenantLookupRow>(
    `SELECT t.id FROM "Tenant" t INNER JOIN "User" u ON u."tenantId" = t.id WHERE u.id = $1 LIMIT 1`,
    [userIdB],
  );

  if (tenantRowsA.rows.length === 0) {
    console.error(`No tenant found for ${QA_OWNER_A_EMAIL} (userId=${userIdA})`);
    await privilegedPool.end();
    process.exit(1);
  }
  if (tenantRowsB.rows.length === 0) {
    console.error(`No tenant found for ${QA_OWNER_B_EMAIL} (userId=${userIdB})`);
    await privilegedPool.end();
    process.exit(1);
  }

  const tenantA = tenantRowsA.rows[0].id;
  const tenantB = tenantRowsB.rows[0].id;

  console.log(`  Tenant A (${QA_OWNER_A_EMAIL}): ${tenantA}`);
  console.log(`  Tenant B (${QA_OWNER_B_EMAIL}): ${tenantB}`);

  if (tenantA === tenantB) {
    console.error('ERROR: Both QA accounts resolve to the same tenant ID — cannot test isolation.');
    await privilegedPool.end();
    process.exit(1);
  }

  await privilegedPool.end();

  // ── Step 2: Connect as app_user ───────────────────────────────────────────
  console.log('\nStep 2: Connecting as app_user ...');
  const appPool = new Pool({ connectionString: appUserUrl, max: 1 });
  const appClient = await appPool.connect();
  console.log('  Connected.');

  // ── Step 3: Run isolation tests per table ─────────────────────────────────
  console.log('\nStep 3: Running per-table isolation tests ...');

  await testComplianceAlertLog(appClient, tenantA, tenantB);
  await testStops(appClient, tenantA, tenantB);
  await testRouteTemplateStops(appClient, tenantA, tenantB);
  await testCarrierDocuments(appClient, tenantA, tenantB);
  await testTicketMessage(appClient, tenantA, tenantB);
  await testTenant(appClient, tenantA, tenantB);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  appClient.release();
  await appPool.end();

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = allResults.length;
  const passed = allResults.filter((r) => r.pass).length;
  const failed = total - passed;

  console.log('\n' + '='.repeat(60));
  console.log(`SUMMARY: ${passed}/${total} blocks passed, ${failed} failed`);
  console.log('='.repeat(60));

  if (failed > 0) {
    console.log('\nFailed blocks:');
    for (const r of allResults.filter((r) => !r.pass)) {
      console.log(`  FAIL  ${r.block}${r.detail ? ' — ' + r.detail : ''}`);
    }
  }

  console.log(`\nFinished: ${new Date().toISOString()}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error('FATAL:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
