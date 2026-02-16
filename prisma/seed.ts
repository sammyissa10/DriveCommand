/**
 * Main Seed Script
 *
 * Generates production-realistic dummy data for:
 * - Drivers (active users with DRIVER role)
 * - Trucks (with realistic specs and license plates)
 * - Routes (between real US cities with proper status)
 * - Driver Invitations (pending invitations)
 *
 * Usage:
 *   npm run seed                  # Idempotent - skips if data exists
 *   npm run seed -- --reset       # Clears all data and reseeds
 *   SEED_RESET=true npm run seed  # Same as --reset
 */

import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { faker } from '@faker-js/faker';

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create Prisma adapter for PostgreSQL
const adapter = new PrismaPg(pool);

// Initialize PrismaClient with adapter (Prisma 7 requirement)
const prisma = new PrismaClient({ adapter });

// Realistic truck makes/models
const TRUCK_MODELS = [
  { make: 'Freightliner', model: 'Cascadia', year: 2022 },
  { make: 'Peterbilt', model: '579', year: 2023 },
  { make: 'Kenworth', model: 'T680', year: 2021 },
  { make: 'Volvo', model: 'VNL 860', year: 2022 },
  { make: 'International', model: 'LT Series', year: 2021 },
  { make: 'Mack', model: 'Anthem', year: 2023 },
  { make: 'Western Star', model: '5700XE', year: 2022 },
  { make: 'Freightliner', model: 'Cascadia', year: 2021 },
];

// Realistic route pairs (major US cities)
const ROUTE_PAIRS = [
  { origin: 'Los Angeles, CA', destination: 'Phoenix, AZ' },
  { origin: 'Chicago, IL', destination: 'Detroit, MI' },
  { origin: 'Dallas, TX', destination: 'Houston, TX' },
  { origin: 'Atlanta, GA', destination: 'Miami, FL' },
  { origin: 'Seattle, WA', destination: 'Portland, OR' },
  { origin: 'Denver, CO', destination: 'Salt Lake City, UT' },
  { origin: 'New York, NY', destination: 'Boston, MA' },
  { origin: 'San Francisco, CA', destination: 'Sacramento, CA' },
];

/**
 * Generate a realistic US commercial vehicle license plate
 */
function generateLicensePlate(): string {
  const state = faker.location.state({ abbreviated: true });
  const number = faker.string.numeric(6);
  return `${state}${number}`;
}

/**
 * Generate a realistic VIN (simplified)
 */
function generateVIN(): string {
  return faker.string.alphanumeric(17).toUpperCase();
}

/**
 * Generate a realistic commercial driver's license number
 */
function generateLicenseNumber(): string {
  const state = faker.location.state({ abbreviated: true });
  const number = faker.string.alphanumeric(10).toUpperCase();
  return `${state}${number}`;
}

async function main() {
  console.log('🚛 DriveCommand Seed Script');
  console.log('============================\n');

  // Parse reset flag
  const shouldReset = process.env.SEED_RESET === 'true' || process.argv.includes('--reset');

  if (shouldReset) {
    console.log('⚠️  RESET MODE: Clearing all existing data...');

    // Delete in reverse dependency order (bypass RLS to see all records)
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const routeCount = await tx.route.deleteMany({});
      const invitationCount = await tx.driverInvitation.deleteMany({});
      const truckCount = await tx.truck.deleteMany({});
      // Don't delete all users - only delete DRIVER users (keep owners)
      const driverCount = await tx.user.deleteMany({
        where: { role: 'DRIVER' },
      });

      console.log(`   Deleted ${routeCount.count} routes`);
      console.log(`   Deleted ${invitationCount.count} driver invitations`);
      console.log(`   Deleted ${truckCount.count} trucks`);
      console.log(`   Deleted ${driverCount.count} drivers\n`);
    });
  }

  // Check for existing data (idempotent check)
  const existingTruckCount = await prisma.truck.count();

  if (existingTruckCount > 0 && !shouldReset) {
    console.log(`✅ Seed data already exists (${existingTruckCount} trucks found)`);
    console.log('   Run with --reset flag to clear and reseed\n');
    return;
  }

  // Fetch first active tenant
  const tenant = await prisma.tenant.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!tenant) {
    throw new Error(
      'No active tenant found. Sign up in the app first to create a tenant.'
    );
  }

  console.log(`📦 Seeding for tenant: ${tenant.name} (${tenant.id})\n`);

  // ===================================
  // 1. Create Drivers (active users)
  // ===================================
  console.log('👤 Creating drivers...');
  const driverData = [
    {
      firstName: 'Michael',
      lastName: 'Rodriguez',
      email: 'michael.rodriguez@drivecommand.demo',
      licenseNumber: generateLicenseNumber(),
    },
    {
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'sarah.johnson@drivecommand.demo',
      licenseNumber: generateLicenseNumber(),
    },
    {
      firstName: 'David',
      lastName: 'Chen',
      email: 'david.chen@drivecommand.demo',
      licenseNumber: generateLicenseNumber(),
    },
    {
      firstName: 'Jennifer',
      lastName: 'Williams',
      email: 'jennifer.williams@drivecommand.demo',
      licenseNumber: generateLicenseNumber(),
    },
    {
      firstName: 'Robert',
      lastName: 'Martinez',
      email: 'robert.martinez@drivecommand.demo',
      licenseNumber: generateLicenseNumber(),
    },
  ];

  const drivers = [];
  for (const data of driverData) {
    // Use RLS bypass to create driver users
    const driver = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.user.create({
        data: {
          tenantId: tenant.id,
          clerkUserId: `demo_driver_${faker.string.alphanumeric(16)}`, // Fake Clerk ID
          email: data.email,
          role: 'DRIVER',
          firstName: data.firstName,
          lastName: data.lastName,
          licenseNumber: data.licenseNumber,
          isActive: true,
        },
      });
    });
    drivers.push(driver);
  }
  console.log(`   ✅ Created ${drivers.length} drivers\n`);

  // ===================================
  // 2. Create Trucks
  // ===================================
  console.log('🚚 Creating trucks...');
  const trucks = [];

  for (const model of TRUCK_MODELS) {
    const truck = await prisma.truck.create({
      data: {
        tenantId: tenant.id,
        make: model.make,
        model: model.model,
        year: model.year,
        vin: generateVIN(),
        licensePlate: generateLicensePlate(),
        odometer: faker.number.int({ min: 50000, max: 250000 }),
      },
    });
    trucks.push(truck);
  }
  console.log(`   ✅ Created ${trucks.length} trucks\n`);

  // ===================================
  // 3. Create Routes
  // ===================================
  console.log('📍 Creating routes...');
  const routes = [];
  const now = new Date();

  for (let i = 0; i < ROUTE_PAIRS.length; i++) {
    const pair = ROUTE_PAIRS[i];
    const driver = drivers[i % drivers.length];
    const truck = trucks[i % trucks.length];

    // Create routes with different statuses
    let status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' = 'PLANNED';
    let completedAt: Date | undefined = undefined;

    if (i % 3 === 0) {
      // 1/3 completed
      status = 'COMPLETED';
      completedAt = faker.date.recent({ days: 7 });
    } else if (i % 3 === 1) {
      // 1/3 in progress
      status = 'IN_PROGRESS';
    }

    const scheduledDate =
      status === 'COMPLETED'
        ? faker.date.recent({ days: 10 })
        : faker.date.soon({ days: 14 });

    const route = await prisma.route.create({
      data: {
        tenantId: tenant.id,
        origin: pair.origin,
        destination: pair.destination,
        scheduledDate,
        driverId: driver.id,
        truckId: truck.id,
        status,
        completedAt,
        notes:
          i % 2 === 0
            ? `${faker.commerce.product()} delivery - ${faker.number.int({ min: 5, max: 45 })}K lbs`
            : undefined,
      },
    });
    routes.push(route);
  }
  console.log(`   ✅ Created ${routes.length} routes\n`);

  // ===================================
  // 4. Create Driver Invitations
  // ===================================
  console.log('📧 Creating driver invitations...');
  const invitations = [];

  const pendingInvitations = [
    {
      email: 'john.smith@example.com',
      firstName: 'John',
      lastName: 'Smith',
      licenseNumber: generateLicenseNumber(),
    },
    {
      email: 'maria.garcia@example.com',
      firstName: 'Maria',
      lastName: 'Garcia',
      licenseNumber: generateLicenseNumber(),
    },
  ];

  for (const data of pendingInvitations) {
    // Use RLS bypass to create invitations
    const invitation = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.driverInvitation.create({
        data: {
          tenantId: tenant.id,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          licenseNumber: data.licenseNumber,
          clerkInvitationId: `demo_invite_${faker.string.alphanumeric(24)}`, // Fake Clerk invitation ID
          status: 'PENDING',
          expiresAt: faker.date.future({ years: 0.1 }), // ~1 month
        },
      });
    });
    invitations.push(invitation);
  }
  console.log(`   ✅ Created ${invitations.length} pending invitations\n`);

  // ===================================
  // Summary
  // ===================================
  console.log('============================');
  console.log('✅ Seeding Complete!\n');
  console.log(`   Drivers:     ${drivers.length}`);
  console.log(`   Trucks:      ${trucks.length}`);
  console.log(`   Routes:      ${routes.length}`);
  console.log(`   Invitations: ${invitations.length}\n`);
  console.log('💡 To seed fleet intelligence data (GPS, safety, fuel), run:');
  console.log('   npm run seed:fleet\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
