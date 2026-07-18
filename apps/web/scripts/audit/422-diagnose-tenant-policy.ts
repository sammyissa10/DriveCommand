/**
 * 422-diagnose-tenant-policy.ts
 *
 * Purpose: Diagnose why tenant_jwt_self_read policy isn't unblocking
 *          login under app_user (Phase 2 local test).
 *
 * 5-check read-only diagnostic — no DDL, no DML, no code changes.
 *
 * Run from repo root:
 *   npx tsx --env-file=apps/web/.env.local apps/web/scripts/audit/422-diagnose-tenant-policy.ts
 */

import { Pool } from 'pg';

const TARGET_TENANT_ID = '73c69018-9047-40d0-9203-631985ca1ccd';

const appUserUrl  = process.env.DATABASE_URL_APP_USER;
const postgresUrl = (() => {
  // The original superuser URL is stored in .env.local as DATABASE_URL_APP_USER
  // and the backup line. We reconstruct it from env:
  return process.env.DATABASE_URL_POSTGRES_BACKUP ?? process.env.DATABASE_URL;
})();

if (!appUserUrl) {
  console.error('❌ DATABASE_URL_APP_USER not set in env');
  process.exit(1);
}
if (!postgresUrl) {
  console.error('❌ No postgres URL found in env');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sep(title: string) {
  console.log('\n' + '='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

async function withPool<T>(url: string, label: string, fn: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// CHECK 1 — All policies on public."Tenant"
// ---------------------------------------------------------------------------

async function check1(pool: Pool) {
  sep('CHECK 1 — pg_policies for public."Tenant"');
  const { rows } = await pool.query(`
    SELECT policyname, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'Tenant'
    ORDER BY policyname
  `);
  if (rows.length === 0) {
    console.log('⚠️  No policies found on public."Tenant"');
  } else {
    for (const r of rows) {
      console.log(`\n  Policy:     ${r.policyname}`);
      console.log(`  Command:    ${r.cmd}`);
      console.log(`  Roles:      ${JSON.stringify(r.roles)}`);
      console.log(`  USING:      ${r.qual}`);
      console.log(`  WITH CHECK: ${r.with_check ?? '(none)'}`);
    }
  }

  const jwtPolicy = rows.find(r => r.policyname === 'tenant_jwt_self_read');
  if (jwtPolicy) {
    console.log('\n✅ VERDICT: tenant_jwt_self_read exists with qual:', jwtPolicy.qual);
  } else {
    console.log('\n❌ VERDICT: tenant_jwt_self_read NOT FOUND on Tenant table');
  }
  return rows;
}

// ---------------------------------------------------------------------------
// CHECK 2 — Does the tenant row exist? (bypass RLS via postgres superuser)
// ---------------------------------------------------------------------------

async function check2(pool: Pool) {
  sep('CHECK 2 — Tenant row existence (postgres superuser, bypass RLS)');
  const { rows } = await pool.query(
    `SELECT id, name FROM public."Tenant" WHERE id = $1`,
    [TARGET_TENANT_ID]
  );
  if (rows.length > 0) {
    console.log(`✅ VERDICT: Tenant row EXISTS — id=${rows[0].id}  name="${rows[0].name}"`);
  } else {
    console.log(`❌ VERDICT: Tenant row MISSING for id=${TARGET_TENANT_ID}`);
  }
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// CHECK 3 — auth.jwt() via app_user (raw Postgres — no Supabase JWT context)
// ---------------------------------------------------------------------------

async function check3(pool: Pool) {
  sep('CHECK 3 — auth.jwt() via app_user (expects NULL — raw Postgres connection)');
  try {
    const { rows } = await pool.query(`
      SELECT
        auth.jwt()                                          AS jwt_raw,
        auth.jwt() -> 'app_metadata'                       AS app_metadata,
        auth.jwt() -> 'app_metadata' ->> 'tenantId'       AS tenant_id_claim,
        (auth.jwt() -> 'app_metadata' ->> 'tenantId')::uuid AS tenant_id_uuid
    `);
    const r = rows[0];
    console.log('  auth.jwt() raw:        ', r.jwt_raw);
    console.log('  app_metadata:          ', r.app_metadata);
    console.log('  tenantId claim:        ', r.tenant_id_claim);
    console.log('  tenantId as uuid:      ', r.tenant_id_uuid);

    if (r.jwt_raw === null) {
      console.log('\n🔴 VERDICT: auth.jwt() returns NULL via raw Postgres connection.');
      console.log('   → The tenant_jwt_self_read USING clause evaluates to NULL (not TRUE).');
      console.log('   → RLS rejects every row. Policy CANNOT match via Prisma/pg connections.');
      console.log('   → auth.jwt() only works via Supabase PostgREST (HTTP API), NOT raw TCP Postgres.');
    } else {
      console.log('\n✅ VERDICT: auth.jwt() returned a value — unexpected. Inspect above.');
    }
    return r.jwt_raw;
  } catch (err: any) {
    console.log('  ERROR:', err.message);
    console.log('\n🔴 VERDICT: auth.jwt() threw an error via app_user — likely not accessible.');
    return null;
  }
}

// ---------------------------------------------------------------------------
// CHECK 4 — auth.jwt() via postgres superuser (compare)
// ---------------------------------------------------------------------------

async function check4(pool: Pool) {
  sep('CHECK 4 — auth.jwt() via postgres superuser (compare)');
  try {
    const { rows } = await pool.query(`SELECT auth.jwt() AS jwt_raw`);
    const r = rows[0];
    console.log('  auth.jwt() raw:', r.jwt_raw);
    if (r.jwt_raw === null) {
      console.log('\n✅ VERDICT: Also NULL via postgres superuser — confirms auth.jwt() is');
      console.log('   a Supabase PostgREST/HTTP feature, not available on raw Postgres connections.');
    } else {
      console.log('\n⚠️  VERDICT: Non-null via superuser — unexpected. Inspect above.');
    }
    return r.jwt_raw;
  } catch (err: any) {
    console.log('  ERROR:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// CHECK 5 — app_user SELECT from Tenant when GUC set_config fires first
// ---------------------------------------------------------------------------

async function check5(pool: Pool) {
  sep('CHECK 5 — app_user + set_config GUC → tenant_self_read path');
  const client = await pool.connect();
  try {
    // Set the GUC exactly as getTenantPrisma() does, then query Tenant
    await client.query(
      `SELECT set_config('app.current_tenant_id', $1, false)`,
      [TARGET_TENANT_ID]
    );
    const { rows } = await client.query(
      `SELECT id, name FROM public."Tenant" WHERE id = $1`,
      [TARGET_TENANT_ID]
    );
    console.log('  GUC set to:', TARGET_TENANT_ID);
    if (rows.length > 0) {
      console.log(`\n✅ VERDICT: GUC path WORKS — tenant_self_read policy matched.`);
      console.log(`   Row returned: id=${rows[0].id}  name="${rows[0].name}"`);
      console.log(`   → The fix is NOT a new policy. It's calling getTenantPrisma() during login`);
      console.log(`     so the GUC is set before the Tenant lookup happens.`);
    } else {
      console.log(`\n❌ VERDICT: GUC path ALSO FAILS — no row returned even with GUC set.`);
      console.log(`   This would indicate a different RLS or grant problem.`);
    }
    return rows.length > 0;
  } catch (err: any) {
    console.log('  ERROR:', err.message);
    console.log('\n❌ VERDICT: GUC path threw an error:', err.message);
    return false;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('422-diagnose-tenant-policy.ts — Phase 2 Login Failure Diagnostic');
  console.log('Target tenantId:', TARGET_TENANT_ID);
  console.log('app_user URL:   ', appUserUrl!.replace(/:([^:@]+)@/, ':***@'));
  console.log('postgres URL:   ', postgresUrl!.replace(/:([^:@]+)@/, ':***@'));

  // CHECK 1 & CHECK 2 use the postgres superuser connection (bypass RLS)
  await withPool(postgresUrl!, 'postgres', async (pgPool) => {
    await check1(pgPool);
    await check2(pgPool);
    await check4(pgPool);
  });

  // CHECK 3 & CHECK 5 use the app_user connection
  await withPool(appUserUrl!, 'app_user', async (appPool) => {
    await check3(appPool);
    await check5(appPool);
  });

  sep('FINAL VERDICT SUMMARY');
  console.log(`
  Expected root cause (based on how Supabase + raw Postgres work):

  auth.jwt() returns NULL on raw Postgres connections (CHECK 3 = NULL).
  The tenant_jwt_self_read policy USING clause evaluates NULL → row is rejected by RLS.
  The JWT-based policy approach cannot work with Prisma + pg connections.

  The GUC-based path (CHECK 5) likely works correctly once set_config fires.
  The real fix: ensure getTenantPrisma() is called during the login Tenant lookup,
  OR grant app_user an unconditional SELECT on Tenant (since Tenant rows are
  not sensitive cross-tenant data — every authenticated user legitimately needs
  to read their own tenant row to validate login).

  RECOMMENDED NEXT STEP:
  → Option A (simplest): Add a permissive SELECT policy on Tenant for app_user
    that matches by the GUC (already exists as tenant_self_read) AND ensure
    the login route calls getTenantPrisma() instead of bare prisma for the
    Tenant lookup, so the GUC is set before the query runs.
  → Option B: Grant app_user unconditional SELECT on Tenant (no RLS filter),
    since Tenant is not a cross-tenant-isolation risk — each user can only see
    their own tenant via the application layer anyway.
  `);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
