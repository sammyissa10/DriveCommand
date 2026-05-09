/**
 * QA seed script: create two test tenants with users, carrier drivers, trucks,
 * facilities, and clients for reproducible carrier operations testing.
 *
 * Idempotent — safe to run multiple times. Records that already exist are
 * skipped; new records are created. A summary is printed at the end.
 *
 * Run with (from apps/web):
 *   npx tsx --env-file=.env.local scripts/seed-qa-accounts.ts
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

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

let created = 0;
let skipped = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Upsert a Tenant by slug. Returns the tenant id.
 */
async function upsertTenant(name: string, slug: string): Promise<string> {
  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (existing) {
    console.log(`SKIP — already exists: Tenant "${name}" (${existing.id})`);
    skipped++;
    return existing.id;
  }
  const tenant = await prisma.tenant.create({ data: { name, slug } });
  console.log(`CREATED: Tenant "${name}" (${tenant.id})`);
  created++;
  return tenant.id;
}

/**
 * Create a Supabase Auth user, or look up the existing one.
 * Returns the Auth UUID.
 */
async function ensureAuthUser(
  email: string,
  password: string,
  appMetadata: Record<string, unknown>
): Promise<string> {
  // Attempt to create
  const { data: createData, error: createError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: appMetadata,
    });

  if (!createError) {
    console.log(`CREATED: Auth user ${email} (${createData.user.id})`);
    created++;
    return createData.user.id;
  }

  // If user already exists, look them up
  if (createError.message.toLowerCase().includes('already')) {
    const { data: listData, error: listError } =
      await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw new Error(`listUsers failed: ${listError.message}`);

    const existing = listData.users.find((u) => u.email === email);
    if (!existing) {
      throw new Error(
        `Auth user ${email} already exists but could not be found via listUsers`
      );
    }

    // Update app_metadata to ensure it's correct
    await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      app_metadata: appMetadata,
    });

    console.log(`SKIP — already exists: Auth user ${email} (${existing.id})`);
    skipped++;
    return existing.id;
  }

  throw new Error(`createUser(${email}) failed: ${createError.message}`);
}

/**
 * Ensure a DB User record exists. Returns the user id.
 */
async function ensureDbUser(
  authId: string,
  tenantId: string,
  email: string,
  role: 'OWNER' | 'MANAGER' | 'DRIVER',
  firstName?: string,
  lastName?: string
): Promise<string> {
  const existing = await prisma.user.findFirst({
    where: { email, tenantId },
  });
  if (existing) {
    console.log(`SKIP — already exists: DB User ${email} (${existing.id})`);
    skipped++;
    return existing.id;
  }
  const user = await prisma.user.create({
    data: {
      id: authId,
      tenantId,
      email,
      role,
      firstName,
      lastName,
      isActive: true,
    },
  });
  console.log(`CREATED: DB User ${email} (${user.id})`);
  created++;
  return user.id;
}

// ---------------------------------------------------------------------------
// Tenant 1 — "QA Test Org"
// ---------------------------------------------------------------------------

async function seedTenant1(): Promise<void> {
  console.log('\n--- Tenant 1: QA Test Org ---');

  // 1. Upsert tenant
  const tenantId = await upsertTenant('QA Test Org', 'qa-test-org');

  // 2. Auth users
  const ownerAuthId = await ensureAuthUser('owner@test.com', 'TestPass123!', {
    role: 'OWNER',
    tenantId,
  });
  const managerAuthId = await ensureAuthUser(
    'manager@test.com',
    'TestPass123!',
    { role: 'MANAGER', tenantId }
  );
  const driverAuthId = await ensureAuthUser('driver@test.com', 'TestPass123!', {
    role: 'DRIVER',
    tenantId,
  });

  // 3. DB User records
  await ensureDbUser(ownerAuthId, tenantId, 'owner@test.com', 'OWNER', 'QA', 'Owner');
  await ensureDbUser(
    managerAuthId,
    tenantId,
    'manager@test.com',
    'MANAGER',
    'QA',
    'Manager'
  );
  const driverUserId = await ensureDbUser(
    driverAuthId,
    tenantId,
    'driver@test.com',
    'DRIVER',
    'QA',
    'Driver'
  );

  // 4. CarrierDriver linked to driver@test.com
  const existingDriver = await prisma.carrierDriver.findUnique({
    where: { userId: driverUserId },
  });
  if (existingDriver) {
    console.log(
      `SKIP — already exists: CarrierDriver for driver@test.com (${existingDriver.id})`
    );
    skipped++;
  } else {
    const cdlExpiry = new Date();
    cdlExpiry.setFullYear(cdlExpiry.getFullYear() + 2);

    const driver = await prisma.carrierDriver.create({
      data: {
        orgId: tenantId,
        userId: driverUserId,
        firstName: 'QA',
        lastName: 'Driver',
        email: 'driver@test.com',
        cdlClass: 'A',
        cdlExpiry,
        payModel: 'per_mile',
        payRate: '0.52',
        status: 'active',
      },
    });
    console.log(`CREATED: CarrierDriver for driver@test.com (${driver.id})`);
    created++;
  }

  // 5. CarrierTruck
  const existingTruck = await prisma.carrierTruck.findFirst({
    where: { unitNumber: 'UNIT-QA-01', orgId: tenantId },
  });
  if (existingTruck) {
    console.log(
      `SKIP — already exists: CarrierTruck UNIT-QA-01 (${existingTruck.id})`
    );
    skipped++;
  } else {
    const truck = await prisma.carrierTruck.create({
      data: {
        orgId: tenantId,
        vehicleId: `VH-${new Date().getFullYear()}-QA001`,
        unitNumber: 'UNIT-QA-01',
        displayName: 'QA Truck 01',
        truckType: 'semi',
        year: 2022,
        make: 'Kenworth',
        model: 'T680',
        status: 'active',
      },
    });
    console.log(`CREATED: CarrierTruck UNIT-QA-01 (${truck.id})`);
    created++;
  }

  // 6. CarrierFacility — shipper
  const existingShipper = await prisma.carrierFacility.findFirst({
    where: { name: 'QA Shipper Facility', orgId: tenantId },
  });
  if (existingShipper) {
    console.log(
      `SKIP — already exists: CarrierFacility "QA Shipper Facility" (${existingShipper.id})`
    );
    skipped++;
  } else {
    const shipper = await prisma.carrierFacility.create({
      data: {
        orgId: tenantId,
        name: 'QA Shipper Facility',
        facilityType: 'shipper',
        addressLine1: '100 Shipper Lane',
        city: 'Chicago',
        state: 'IL',
        zip: '60601',
      },
    });
    console.log(
      `CREATED: CarrierFacility "QA Shipper Facility" (${shipper.id})`
    );
    created++;
  }

  // 7. CarrierFacility — receiver
  const existingReceiver = await prisma.carrierFacility.findFirst({
    where: { name: 'QA Receiver Facility', orgId: tenantId },
  });
  if (existingReceiver) {
    console.log(
      `SKIP — already exists: CarrierFacility "QA Receiver Facility" (${existingReceiver.id})`
    );
    skipped++;
  } else {
    const receiver = await prisma.carrierFacility.create({
      data: {
        orgId: tenantId,
        name: 'QA Receiver Facility',
        facilityType: 'receiver',
        addressLine1: '200 Receiver Ave',
        city: 'Indianapolis',
        state: 'IN',
        zip: '46201',
      },
    });
    console.log(
      `CREATED: CarrierFacility "QA Receiver Facility" (${receiver.id})`
    );
    created++;
  }
}

// ---------------------------------------------------------------------------
// Tenant 2 — "QA Test Org B"
// ---------------------------------------------------------------------------

async function seedTenant2(): Promise<void> {
  console.log('\n--- Tenant 2: QA Test Org B ---');

  // 1. Upsert tenant
  const tenantId = await upsertTenant('QA Test Org B', 'qa-test-org-b');

  // 2. Auth user
  const ownerAuthId = await ensureAuthUser(
    'owner_b@test.com',
    'TestPass123!',
    { role: 'OWNER', tenantId }
  );

  // 3. DB User record
  await ensureDbUser(
    ownerAuthId,
    tenantId,
    'owner_b@test.com',
    'OWNER',
    'QA',
    'Owner B'
  );

  // 4. CarrierClient
  const existingClient = await prisma.carrierClient.findFirst({
    where: { name: 'QA Test Client Co', orgId: tenantId },
  });
  if (existingClient) {
    console.log(
      `SKIP — already exists: CarrierClient "QA Test Client Co" (${existingClient.id})`
    );
    skipped++;
  } else {
    const client = await prisma.carrierClient.create({
      data: {
        orgId: tenantId,
        name: 'QA Test Client Co',
        addressLine1: '500 Client Blvd',
        city: 'Dallas',
        state: 'TX',
        zip: '75201',
        status: 'active',
      },
    });
    console.log(
      `CREATED: CarrierClient "QA Test Client Co" (${client.id})`
    );
    created++;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== seed-qa-accounts ===');

  await seedTenant1();
  await seedTenant2();

  console.log(`\n=== Summary ===`);
  console.log(`  Created: ${created}`);
  console.log(`  Skipped: ${skipped}`);
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
