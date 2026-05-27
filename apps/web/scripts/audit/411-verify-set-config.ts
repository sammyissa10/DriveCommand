/**
 * quick-411 verification: prove that after firing the same set_config
 * statement getTenantPrisma() now fires, the SQL function current_tenant_id()
 * returns the seeded tenantId UUID.
 *
 * Run with: npx tsx scripts/audit/411-verify-set-config.ts
 * Requires: DATABASE_URL or DIRECT_URL set in .env.local (or the environment).
 *
 * Expected output when current_tenant_id() function exists (post quick-410):
 *   [411-verify] connecting...
 *   [411-verify] picked tenant <uuid> (<slug>)
 *   [411-verify] BEFORE set_config: current_tenant_id() => null
 *   [411-verify] firing SELECT set_config('app.current_tenant_id', <uuid>, false)
 *   [411-verify] AFTER set_config:  current_tenant_id() => <uuid>
 *   [411-verify] MATCH — GUC wiring works end-to-end.
 *
 * Expected output when current_tenant_id() function does NOT yet exist (pre quick-410):
 *   [411-verify] connecting...
 *   [411-verify] picked tenant <uuid> (<slug>)
 *   [411-verify] current_tenant_id() SQL function not found — quick-410 has not run yet.
 *   [411-verify] Skipping GUC assertion. Set-config call will be tested via raw GUC read instead.
 *   [411-verify] raw GUC value after set_config => <uuid>
 *   [411-verify] raw GUC matches. quick-411 wiring is correct; current_tenant_id() will work once quick-410 lands.
 *
 * Exit code: 0 on success, 1 on any mismatch or error.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { setDefaultResultOrder } from 'dns';

// Force IPv4 to match production behaviour (Vercel iad1 can't reach Supabase via IPv6)
setDefaultResultOrder('ipv4first');

// Load .env.local first (takes priority), then .env as fallback
config({ path: resolve(__dirname, '../../.env.local') });
config({ path: resolve(__dirname, '../../.env') });

import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Use DIRECT_URL for script context (bypasses pgbouncer ?pgbouncer=true param
// which can cause connection issues in standalone scripts). Falls back to
// DATABASE_URL if DIRECT_URL is not set. Match the connection approach used by
// other audit scripts in this directory (classify-uncertain-tables.ts, etc.).
const connectionString =
  process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error('[411-verify] FAILED: Neither DIRECT_URL nor DATABASE_URL is set in the environment.');
  process.exit(1);
}

// Create a standalone pool + client for this script (same pattern as other audit scripts).
// Using max:1 to mirror production topology.
const pool = new Pool({ connectionString, max: 1 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('[411-verify] connecting...');

  // Pick any real tenant so we have a real UUID. Use bare prisma (no tenant scoping).
  const tenant = await prisma.$queryRaw<Array<{ id: string; slug: string }>>`
    SELECT id, slug FROM "Tenant" LIMIT 1
  `;
  if (!tenant.length) {
    throw new Error('No tenants in database — cannot verify.');
  }
  const tenantId = tenant[0].id;
  const slug = tenant[0].slug;
  console.log(`[411-verify] picked tenant ${tenantId} (${slug})`);

  // Pre-check: does current_tenant_id() SQL function exist yet?
  // It is created in quick-410's migration. If it does not exist, fall back to
  // a raw GUC read via current_setting() which is always available.
  const fnExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = 'current_tenant_id'
    ) AS exists
  `;
  if (!fnExists[0]?.exists) {
    console.warn('[411-verify] current_tenant_id() SQL function not found — quick-410 has not run yet.');
    console.warn('[411-verify] Skipping GUC assertion. Set-config call will be tested via raw GUC read instead.');
    // Fallback: fire set_config and read back via current_setting() instead.
    await prisma.$executeRawUnsafe(
      "SELECT set_config('app.current_tenant_id', $1, false)",
      tenantId
    );
    const guc = await prisma.$queryRaw<Array<{ v: string }>>`
      SELECT current_setting('app.current_tenant_id', true) AS v
    `;
    console.log(`[411-verify] raw GUC value after set_config => ${guc[0]?.v}`);
    if (guc[0]?.v !== tenantId) {
      throw new Error(`MISMATCH — raw GUC expected ${tenantId}, got ${guc[0]?.v}`);
    }
    console.log('[411-verify] raw GUC matches. quick-411 wiring is correct; current_tenant_id() will work once quick-410 lands.');
    return;
  }

  // 1. Confirm current_tenant_id() returns NULL before we set anything on this connection.
  //    The pool 'connect' handler from Task 1 sets it to '' which current_tenant_id()
  //    converts to NULL via NULLIF — so this should print null, not the empty string.
  const before = await prisma.$queryRaw<Array<{ ctid: string | null }>>`
    SELECT current_tenant_id()::text AS ctid
  `;
  console.log(`[411-verify] BEFORE set_config: current_tenant_id() => ${before[0]?.ctid ?? 'null'}`);

  // 2. Fire the EXACT same statement getTenantPrisma() now fires.
  console.log(`[411-verify] firing SELECT set_config('app.current_tenant_id', ${tenantId}, false)`);
  await prisma.$executeRawUnsafe(
    "SELECT set_config('app.current_tenant_id', $1, false)",
    tenantId
  );

  // 3. Read current_tenant_id() back — must equal tenantId.
  const after = await prisma.$queryRaw<Array<{ ctid: string | null }>>`
    SELECT current_tenant_id()::text AS ctid
  `;
  const actual = after[0]?.ctid ?? null;
  console.log(`[411-verify] AFTER set_config:  current_tenant_id() => ${actual ?? 'null'}`);

  if (actual !== tenantId) {
    throw new Error(
      `MISMATCH — expected current_tenant_id() to return ${tenantId}, got ${actual}`
    );
  }

  console.log('[411-verify] MATCH — GUC wiring works end-to-end.');
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[411-verify] FAILED:', err?.message ?? err);
    if (err?.code) console.error('[411-verify] code:', err.code);
    if (err?.meta) console.error('[411-verify] meta:', JSON.stringify(err.meta));
    await pool.end().catch(() => {});
    process.exit(1);
  });
