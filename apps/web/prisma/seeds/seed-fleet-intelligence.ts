/**
 * Fleet Intelligence Seed Script
 *
 * Generates 30 days of realistic GPS locations, safety events, and fuel records
 * for all trucks in the demo tenant.
 *
 * Usage:
 *   npm run seed:fleet                  # Idempotent - skips if data exists
 *   npm run seed:fleet -- --reset       # Clears all data and reseeds
 *   SEED_RESET=true npm run seed:fleet  # Same as --reset
 */

import { PrismaClient } from '@prisma/client';
import { seedGPSLocations } from './gps-locations.js';
import { seedSafetyEvents } from './safety-events.js';
import { seedFuelRecords } from './fuel-records.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🚛 Fleet Intelligence Seed Script');
  console.log('================================\n');

  // Parse reset flag
  const shouldReset = process.env.SEED_RESET === 'true' || process.argv.includes('--reset');

  if (shouldReset) {
    console.log('⚠️  RESET MODE: Clearing all existing fleet intelligence data...');

    // Delete in reverse dependency order
    // Use bypass_rls to see all records across tenants
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('request.jwt.claims', '{"app_metadata":{"bypass_rls":true}}', TRUE)`;

      const fuelCount = await tx.fuelRecord.deleteMany({});
      const safetyCount = await tx.safetyEvent.deleteMany({});
      const gpsCount = await tx.gPSLocation.deleteMany({});

      console.log(`   Deleted ${fuelCount.count} fuel records`);
      console.log(`   Deleted ${safetyCount.count} safety events`);
      console.log(`   Deleted ${gpsCount.count} GPS locations\n`);
    });
  }

  // Check for existing data (idempotent check)
  const existingGPSCount = await prisma.gPSLocation.count();

  if (existingGPSCount > 0 && !shouldReset) {
    console.log(`✅ Seed data already exists (${existingGPSCount} GPS records found)`);
    console.log('   Run with --reset flag to clear and reseed\n');
    return;
  }

  // Fetch demo tenant or first active tenant
  const tenant = await prisma.tenant.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!tenant) {
    throw new Error(
      'No active tenant found. Run the base app first and create a tenant.'
    );
  }

  console.log(`📦 Seeding for tenant: ${tenant.name} (${tenant.id})\n`);

  // Fetch trucks for this tenant
  const trucks = await prisma.truck.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, unitNumber: true, odometer: true },
  });

  if (trucks.length === 0) {
    throw new Error(
      `No trucks found for tenant ${tenant.name}. Create trucks before seeding fleet intelligence data.`
    );
  }

  console.log(`🚚 Found ${trucks.length} trucks\n`);

  // Seed GPS locations
  console.log('📍 Generating GPS trails along US interstate routes...');
  const gpsCount = await seedGPSLocations(tenant.id, trucks);
  console.log(`   ✅ Created ${gpsCount} GPS location records\n`);

  // Fetch generated GPS locations to link safety events to actual trail coordinates
  const gpsLocations = await prisma.gPSLocation.findMany({
    where: { tenantId: tenant.id },
    select: { truckId: true, latitude: true, longitude: true, timestamp: true },
  });

  // Seed safety events
  console.log('⚠️  Generating safety events linked to GPS trails...');
  const safetyCount = await seedSafetyEvents(tenant.id, trucks, gpsLocations);
  console.log(`   ✅ Created ${safetyCount} safety event records\n`);

  // Seed fuel records
  console.log('⛽ Generating fuel records with odometer progression...');
  const fuelCount = await seedFuelRecords(tenant.id, trucks);
  console.log(`   ✅ Created ${fuelCount} fuel records\n`);

  // Summary
  console.log('================================');
  console.log('✅ Seeding Complete!\n');
  console.log(`   GPS Locations:  ${gpsCount.toLocaleString()}`);
  console.log(`   Safety Events:  ${safetyCount.toLocaleString()}`);
  console.log(`   Fuel Records:   ${fuelCount.toLocaleString()}\n`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
