/**
 * Cleanup script: delete QA test tenants whose names start with "FI-Test-" or "MT-Test-"
 *
 * Deletes all associated carrier ops data in FK-safe order, removes Supabase Auth
 * users, and deletes the tenant record itself.
 *
 * Run with (from apps/web):
 *   npx tsx scripts/cleanup-test-tenants.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const CARRIER_DOCS_BUCKET = 'carrier-documents';
const ALLOWED_PREFIXES = ['FI-Test-', 'MT-Test-'];

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

function isTestTenant(name: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => name.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

async function deleteStorageFiles(filePaths: string[]): Promise<void> {
  if (filePaths.length === 0) return;

  const BATCH = 1000;
  for (let i = 0; i < filePaths.length; i += BATCH) {
    const batch = filePaths.slice(i, i + BATCH);
    const { error } = await supabaseAdmin.storage
      .from(CARRIER_DOCS_BUCKET)
      .remove(batch);
    if (error) {
      console.error(`    Storage remove error (batch ${i / BATCH + 1}):`, error.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Per-tenant deletion
// ---------------------------------------------------------------------------

async function deleteTenant(tenantId: string, tenantName: string): Promise<void> {
  console.log(`\nDeleting tenant: "${tenantName}" (${tenantId})`);

  // -------------------------------------------------------------------------
  // a. driver_pay_records
  // -------------------------------------------------------------------------
  try {
    const { count } = await prisma.driverPayRecord.deleteMany({
      where: { orgId: tenantId },
    });
    console.log(`  a. driver_pay_records deleted: ${count}`);
  } catch (err: any) {
    console.error(`  a. driver_pay_records FAILED:`, err.message);
  }

  // -------------------------------------------------------------------------
  // b. carrier_expenses
  // -------------------------------------------------------------------------
  try {
    const { count } = await prisma.carrierExpense.deleteMany({
      where: { orgId: tenantId },
    });
    console.log(`  b. carrier_expenses deleted: ${count}`);
  } catch (err: any) {
    console.error(`  b. carrier_expenses FAILED:`, err.message);
  }

  // -------------------------------------------------------------------------
  // c. carrier_documents (DB + Storage)
  // -------------------------------------------------------------------------
  try {
    // Collect file paths before deleting DB records
    const docs = await prisma.$queryRaw<Array<{ id: string; file_url: string }>>`
      SELECT id, file_url
      FROM carrier_documents
      WHERE
        (parent_type = 'stop' AND parent_id IN (
          SELECT id FROM stops
          WHERE dispatch_id IN (SELECT id FROM dispatches WHERE org_id = ${tenantId}::uuid)
        ))
        OR (parent_type = 'load' AND parent_id IN (
          SELECT id FROM loads WHERE org_id = ${tenantId}::uuid
        ))
        OR (parent_type = 'dispatch' AND parent_id IN (
          SELECT id FROM dispatches WHERE org_id = ${tenantId}::uuid
        ))
    `;

    const filePaths = docs.map((d) => d.file_url);

    // Delete from Supabase Storage
    await deleteStorageFiles(filePaths);
    console.log(`  c. carrier_documents storage files deleted: ${filePaths.length}`);

    // Delete DB records
    const deleted = await prisma.$executeRaw`
      DELETE FROM carrier_documents
      WHERE
        (parent_type = 'stop' AND parent_id IN (
          SELECT id FROM stops
          WHERE dispatch_id IN (SELECT id FROM dispatches WHERE org_id = ${tenantId}::uuid)
        ))
        OR (parent_type = 'load' AND parent_id IN (
          SELECT id FROM loads WHERE org_id = ${tenantId}::uuid
        ))
        OR (parent_type = 'dispatch' AND parent_id IN (
          SELECT id FROM dispatches WHERE org_id = ${tenantId}::uuid
        ))
    `;
    console.log(`  c. carrier_documents DB records deleted: ${deleted}`);
  } catch (err: any) {
    console.error(`  c. carrier_documents FAILED:`, err.message);
  }

  // -------------------------------------------------------------------------
  // d. stops (carrier_stops)
  // -------------------------------------------------------------------------
  try {
    const deleted = await prisma.$executeRaw`
      DELETE FROM stops
      WHERE dispatch_id IN (
        SELECT id FROM dispatches WHERE org_id = ${tenantId}::uuid
      )
    `;
    console.log(`  d. stops deleted: ${deleted}`);
  } catch (err: any) {
    console.error(`  d. stops FAILED:`, err.message);
  }

  // -------------------------------------------------------------------------
  // e. loads (carrier_loads)
  // -------------------------------------------------------------------------
  try {
    const { count } = await prisma.carrierLoad.deleteMany({
      where: { orgId: tenantId },
    });
    console.log(`  e. loads deleted: ${count}`);
  } catch (err: any) {
    console.error(`  e. loads FAILED:`, err.message);
  }

  // -------------------------------------------------------------------------
  // f. dispatches
  // -------------------------------------------------------------------------
  try {
    const { count } = await prisma.trip.deleteMany({
      where: { orgId: tenantId },
    });
    console.log(`  f. dispatches deleted: ${count}`);
  } catch (err: any) {
    console.error(`  f. dispatches FAILED:`, err.message);
  }

  // -------------------------------------------------------------------------
  // g. route_template_stops
  // -------------------------------------------------------------------------
  try {
    const deleted = await prisma.$executeRaw`
      DELETE FROM route_template_stops
      WHERE route_template_id IN (
        SELECT id FROM route_templates WHERE org_id = ${tenantId}::uuid
      )
    `;
    console.log(`  g. route_template_stops deleted: ${deleted}`);
  } catch (err: any) {
    console.error(`  g. route_template_stops FAILED:`, err.message);
  }

  // -------------------------------------------------------------------------
  // h. route_templates
  // -------------------------------------------------------------------------
  try {
    const { count } = await prisma.routeTemplate.deleteMany({
      where: { orgId: tenantId },
    });
    console.log(`  h. route_templates deleted: ${count}`);
  } catch (err: any) {
    console.error(`  h. route_templates FAILED:`, err.message);
  }

  // -------------------------------------------------------------------------
  // i. contracts
  // -------------------------------------------------------------------------
  try {
    const { count } = await prisma.carrierContract.deleteMany({
      where: { orgId: tenantId },
    });
    console.log(`  i. contracts deleted: ${count}`);
  } catch (err: any) {
    console.error(`  i. contracts FAILED:`, err.message);
  }

  // -------------------------------------------------------------------------
  // j. clients
  // -------------------------------------------------------------------------
  try {
    const { count } = await prisma.carrierClient.deleteMany({
      where: { orgId: tenantId },
    });
    console.log(`  j. clients deleted: ${count}`);
  } catch (err: any) {
    console.error(`  j. clients FAILED:`, err.message);
  }

  // -------------------------------------------------------------------------
  // k. facilities
  // -------------------------------------------------------------------------
  try {
    const { count } = await prisma.carrierFacility.deleteMany({
      where: { orgId: tenantId },
    });
    console.log(`  k. facilities deleted: ${count}`);
  } catch (err: any) {
    console.error(`  k. facilities FAILED:`, err.message);
  }

  // -------------------------------------------------------------------------
  // l. carrier_trucks
  // -------------------------------------------------------------------------
  try {
    const { count } = await prisma.carrierTruck.deleteMany({
      where: { orgId: tenantId },
    });
    console.log(`  l. carrier_trucks deleted: ${count}`);
  } catch (err: any) {
    console.error(`  l. carrier_trucks FAILED:`, err.message);
  }

  // -------------------------------------------------------------------------
  // m. carrier_drivers
  // -------------------------------------------------------------------------
  try {
    const { count } = await prisma.carrierDriver.deleteMany({
      where: { orgId: tenantId },
    });
    console.log(`  m. carrier_drivers deleted: ${count}`);
  } catch (err: any) {
    console.error(`  m. carrier_drivers FAILED:`, err.message);
  }

  // -------------------------------------------------------------------------
  // n. Users (DB + Supabase Auth)
  // -------------------------------------------------------------------------
  try {
    const users = await prisma.user.findMany({
      where: { tenantId },
      select: { id: true, email: true },
    });

    let authDeleted = 0;
    let authFailed = 0;

    for (const user of users) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
      if (error) {
        // User may not exist in Auth (e.g. invited but never confirmed) — treat as non-fatal
        console.warn(`    Auth delete skipped for ${user.email} (${user.id}): ${error.message}`);
        authFailed++;
      } else {
        authDeleted++;
      }
    }

    const { count } = await prisma.user.deleteMany({ where: { tenantId } });
    console.log(
      `  n. users deleted: ${count} DB records, ${authDeleted} Auth users removed` +
        (authFailed > 0 ? `, ${authFailed} Auth deletes skipped` : '')
    );
  } catch (err: any) {
    console.error(`  n. users FAILED:`, err.message);
  }

  // -------------------------------------------------------------------------
  // o. Tenant record
  // -------------------------------------------------------------------------
  try {
    await prisma.tenant.delete({ where: { id: tenantId } });
    console.log(`  o. Tenant record deleted ✓`);
  } catch (err: any) {
    console.error(`  o. Tenant record FAILED:`, err.message);
    console.error(
      `     The tenant still exists — fix remaining FK references and re-run.`
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== cleanup-test-tenants ===');
  console.log(`Looking for tenants starting with: ${ALLOWED_PREFIXES.join(', ')}\n`);

  const allTenants = await prisma.tenant.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const testTenants = allTenants.filter((t) => isTestTenant(t.name));

  if (testTenants.length === 0) {
    console.log('No matching test tenants found. Nothing to do.');
    return;
  }

  console.log(`Found ${testTenants.length} test tenant(s):`);
  for (const t of testTenants) {
    console.log(`  - "${t.name}" (${t.id})`);
  }

  let deleted = 0;
  let skipped = 0;

  for (const tenant of testTenants) {
    // Explicit guard — belt-and-suspenders check before any destructive work
    if (!isTestTenant(tenant.name)) {
      console.warn(`\nSKIPPED: "${tenant.name}" does not match allowed prefixes — no-op.`);
      skipped++;
      continue;
    }

    try {
      await deleteTenant(tenant.id, tenant.name);
      deleted++;
    } catch (err: any) {
      console.error(`\nUnexpected error processing tenant "${tenant.name}":`, err.message);
      skipped++;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`  Tenants processed: ${deleted}`);
  console.log(`  Tenants skipped:   ${skipped}`);
  console.log('Done.');
}

main().finally(async () => {
  await prisma.$disconnect();
  await pool.end();
});
