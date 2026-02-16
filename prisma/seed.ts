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

      // Delete financial records first (they depend on routes)
      // Use raw SQL for robustness (handles model regeneration edge cases)
      const paymentCount = await tx.$executeRaw`DELETE FROM "RoutePayment"`;
      const expenseCount = await tx.$executeRaw`DELETE FROM "RouteExpense"`;
      const templateItemCount = await tx.$executeRaw`DELETE FROM "ExpenseTemplateItem"`;
      const templateCount = await tx.$executeRaw`DELETE FROM "ExpenseTemplate"`;
      const categoryCount = await tx.$executeRaw`DELETE FROM "ExpenseCategory"`;

      const routeCount = await tx.route.deleteMany({});
      const invitationCount = await tx.driverInvitation.deleteMany({});
      const truckCount = await tx.truck.deleteMany({});
      // Don't delete all users - only delete DRIVER users (keep owners)
      const driverCount = await tx.user.deleteMany({
        where: { role: 'DRIVER' },
      });

      console.log(`   Deleted ${paymentCount} route payments`);
      console.log(`   Deleted ${expenseCount} route expenses`);
      console.log(`   Deleted ${templateItemCount} expense template items`);
      console.log(`   Deleted ${templateCount} expense templates`);
      console.log(`   Deleted ${categoryCount} expense categories`);
      console.log(`   Deleted ${routeCount.count} routes`);
      console.log(`   Deleted ${invitationCount.count} driver invitations`);
      console.log(`   Deleted ${truckCount.count} trucks`);
      console.log(`   Deleted ${driverCount.count} drivers\n`);
    });
  }

  // Check for existing data (idempotent check, bypass RLS)
  const existingTruckCount = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.truck.count();
  });

  if (existingTruckCount > 0 && !shouldReset) {
    console.log(`✅ Seed data already exists (${existingTruckCount} trucks found)`);
    console.log('   Run with --reset flag to clear and reseed\n');
    return;
  }

  // Fetch or create tenant (bypass RLS for seed operations)
  let tenant = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.tenant.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  });

  if (!tenant) {
    console.log('📋 No tenant found — creating demo tenant and owner...');
    tenant = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      const t = await tx.tenant.create({
        data: {
          name: 'DriveCommand Demo',
          slug: 'drivecommand-demo',
          isActive: true,
        },
      });
      // Create an owner user for the tenant
      await tx.user.create({
        data: {
          tenantId: t.id,
          clerkUserId: `demo_owner_${faker.string.alphanumeric(16)}`,
          email: 'owner@drivecommand.demo',
          role: 'OWNER',
          firstName: 'Demo',
          lastName: 'Owner',
          isActive: true,
        },
      });
      return t;
    });
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
    const truck = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.truck.create({
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

    const route = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.route.create({
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
    });
    routes.push(route);
  }
  console.log(`   ✅ Created ${routes.length} routes\n`);

  // ===================================
  // 4. Create Financial Data
  // ===================================
  console.log('💰 Creating financial data...');

  // 4.1 Create system-default expense categories
  console.log('   Creating expense categories...');
  const categoryNames = ['Fuel', 'Driver Pay', 'Insurance', 'Tolls', 'Maintenance', 'Permits & Fees'];
  const categories = [];

  for (const name of categoryNames) {
    const category = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Use raw SQL to avoid Prisma client caching issues
      const result: any[] = await tx.$queryRaw`
        INSERT INTO "ExpenseCategory" ("tenantId", "name", "isSystemDefault", "createdAt", "updatedAt")
        VALUES (${tenant.id}::uuid, ${name}, true, NOW(), NOW())
        ON CONFLICT ("tenantId", "name") DO UPDATE SET "updatedAt" = NOW()
        RETURNING *
      `;
      return result[0];
    });
    categories.push(category);
  }
  console.log(`   ✅ Created ${categories.length} expense categories`);

  // 4.2 Create an expense template
  console.log('   Creating expense template...');
  const fuelCategory = categories.find((c) => c.name === 'Fuel')!;
  const driverPayCategory = categories.find((c) => c.name === 'Driver Pay')!;
  const insuranceCategory = categories.find((c) => c.name === 'Insurance')!;

  const template = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

    // Insert template using raw SQL
    const templateResult: any[] = await tx.$queryRaw`
      INSERT INTO "ExpenseTemplate" ("tenantId", "name", "createdAt", "updatedAt")
      VALUES (${tenant.id}::uuid, 'Standard Route', NOW(), NOW())
      ON CONFLICT ("tenantId", "name") DO UPDATE SET "updatedAt" = NOW()
      RETURNING *
    `;
    const templateId = templateResult[0].id;

    // Delete existing template items to avoid duplicates on re-run
    await tx.$executeRaw`DELETE FROM "ExpenseTemplateItem" WHERE "templateId" = ${templateId}::uuid`;

    // Insert template items
    await tx.$executeRaw`
      INSERT INTO "ExpenseTemplateItem" ("templateId", "categoryId", "amount", "description")
      VALUES
        (${templateId}::uuid, ${fuelCategory.id}::uuid, 250.00, 'Estimated fuel cost'),
        (${templateId}::uuid, ${driverPayCategory.id}::uuid, 400.00, 'Standard driver pay'),
        (${templateId}::uuid, ${insuranceCategory.id}::uuid, 75.00, 'Route insurance coverage')
    `;

    return templateResult[0];
  });
  console.log(`   ✅ Created expense template with 3 items`);

  // 4.3 Create route expenses (for completed routes only)
  console.log('   Creating route expenses...');
  const completedRoutes = routes.filter((r) => r.status === 'COMPLETED');
  const tollsCategory = categories.find((c) => c.name === 'Tolls')!;
  let expenseCount = 0;

  for (const route of completedRoutes) {
    // Each completed route gets 2-4 random expenses
    const numExpenses = faker.number.int({ min: 2, max: 4 });
    const expenseCategories = faker.helpers.arrayElements(
      [fuelCategory, driverPayCategory, tollsCategory, insuranceCategory],
      numExpenses
    );

    for (const category of expenseCategories) {
      let amount;
      let description;

      switch (category.name) {
        case 'Fuel':
          amount = faker.number.float({ min: 180, max: 350, fractionDigits: 2 });
          description = 'Fuel purchase';
          break;
        case 'Driver Pay':
          amount = faker.number.float({ min: 300, max: 500, fractionDigits: 2 });
          description = 'Driver compensation';
          break;
        case 'Tolls':
          amount = faker.number.float({ min: 15, max: 45, fractionDigits: 2 });
          description = 'Highway tolls';
          break;
        case 'Insurance':
          amount = faker.number.float({ min: 50, max: 100, fractionDigits: 2 });
          description = 'Route insurance';
          break;
        default:
          amount = faker.number.float({ min: 20, max: 100, fractionDigits: 2 });
          description = 'Miscellaneous expense';
      }

      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        const notes = faker.datatype.boolean() ? faker.lorem.sentence() : null;
        await tx.$executeRaw`
          INSERT INTO "RouteExpense" ("tenantId", "routeId", "categoryId", "amount", "description", "notes", "createdAt", "updatedAt")
          VALUES (${tenant.id}::uuid, ${route.id}::uuid, ${category.id}::uuid, ${amount}, ${description}, ${notes}, NOW(), NOW())
        `;
      });
      expenseCount++;
    }
  }
  console.log(`   ✅ Created ${expenseCount} route expenses`);

  // 4.4 Create route payments (for completed routes)
  console.log('   Creating route payments...');
  let paymentCount = 0;

  for (const route of completedRoutes) {
    // Each completed route gets 1 payment
    const amount = faker.number.float({ min: 800, max: 2500, fractionDigits: 2 });
    const status = faker.helpers.arrayElement(['PENDING', 'PAID'] as const);
    const paidAt = status === 'PAID' ? faker.date.recent({ days: 7 }) : null;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      const notes = faker.datatype.boolean() ? 'Payment processed' : null;
      await tx.$executeRaw`
        INSERT INTO "RoutePayment" ("tenantId", "routeId", "amount", "status", "paidAt", "notes", "createdAt", "updatedAt")
        VALUES (${tenant.id}::uuid, ${route.id}::uuid, ${amount}, ${status}::"PaymentStatus", ${paidAt}, ${notes}, NOW(), NOW())
      `;
    });
    paymentCount++;
  }
  console.log(`   ✅ Created ${paymentCount} route payments\n`);

  // ===================================
  // 5. Create Driver Invitations
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
  console.log(`   Drivers:           ${drivers.length}`);
  console.log(`   Trucks:            ${trucks.length}`);
  console.log(`   Routes:            ${routes.length}`);
  console.log(`   Expense Categories: ${categories.length}`);
  console.log(`   Expense Templates:  1`);
  console.log(`   Route Expenses:    ${expenseCount}`);
  console.log(`   Route Payments:    ${paymentCount}`);
  console.log(`   Invitations:       ${invitations.length}\n`);
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
