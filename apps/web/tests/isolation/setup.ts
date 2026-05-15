import { PrismaClient } from '../../src/generated/prisma/client';

/**
 * Test utilities for cross-tenant isolation tests.
 *
 * IMPORTANT: These tests MUST run against a real PostgreSQL instance with RLS policies applied.
 * RLS is a PostgreSQL feature - mocking it defeats the purpose.
 *
 * Setup requirements:
 * 1. PostgreSQL database running (DATABASE_URL must be set)
 * 2. Database migrations applied (npx prisma migrate deploy)
 * 3. RLS policies created (see migration files)
 *
 * When DATABASE_URL is not set, all exports are no-ops so the test file
 * can be imported without crashing (describe.skip handles the rest).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prisma: any = null;

if (process.env.DATABASE_URL) {
  // @ts-ignore - Prisma 7 type issue with constructor
  prisma = new PrismaClient();
}

/**
 * Create a test tenant with bypass_rls flag.
 * Used during test setup to create tenants without RLS blocking.
 */
export async function createTestTenant(name: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

    return tx.tenant.create({
      data: {
        name,
        timezone: 'UTC',
      },
    });
  });
}

/**
 * Create a test user for a specific tenant with bypass_rls flag.
 */
export async function createTestUser(
  tenantId: string,
  data: { clerkUserId: string; email: string; role?: 'OWNER' | 'MANAGER' | 'DRIVER' }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

    return tx.user.create({
      data: {
        tenantId,
        clerkUserId: data.clerkUserId,
        email: data.email,
        role: data.role || 'DRIVER',
      },
    });
  });
}

/**
 * Create a test Customer for a specific tenant with bypass_rls flag.
 * Customer is required as the FK for Load.
 */
export async function createTestCustomer(tenantId: string, companyName: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.customer.create({
      data: { tenantId, companyName },
    });
  });
}

/**
 * Create a test Load for a specific tenant with bypass_rls flag.
 * Requires a Customer FK (customerId).
 */
export async function createTestLoad(tenantId: string, customerId: string, loadNumber: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.load.create({
      data: {
        tenantId,
        loadNumber,
        customerId,
        origin: 'Origin City',
        destination: 'Destination City',
        pickupDate: new Date(),
        rate: 1000,
      },
    });
  });
}

/**
 * Create a test Truck for a specific tenant with bypass_rls flag.
 * VIN must be unique per (tenantId, vin) — callers provide a distinguishable VIN.
 */
export async function createTestTruck(tenantId: string, vin: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.truck.create({
      data: {
        tenantId,
        make: 'TestMake',
        model: 'TestModel',
        year: 2024,
        vin,
        licensePlate: vin.slice(0, 7),
        odometer: 0,
      },
    });
  });
}

/**
 * Create a test CarrierDriver for a specific tenant with bypass_rls flag.
 * CarrierDriver uses orgId (mapped from org_id) as the tenant FK column.
 */
export async function createTestCarrierDriver(tenantId: string, firstName: string, lastName: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.carrierDriver.create({
      data: { orgId: tenantId, firstName, lastName },
    });
  });
}

/**
 * Create a test CarrierClient for a specific tenant with bypass_rls flag.
 * CarrierClient uses orgId as the tenant FK column.
 */
export async function createTestCarrierClient(tenantId: string, name: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.carrierClient.create({
      data: { orgId: tenantId, name },
    });
  });
}

/**
 * Create a test CarrierFacility for a specific tenant with bypass_rls flag.
 * CarrierFacility uses orgId as the tenant FK column.
 */
export async function createTestCarrierFacility(tenantId: string, name: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.carrierFacility.create({
      data: { orgId: tenantId, name },
    });
  });
}

/**
 * Clean up all test data after suite completes.
 * Uses bypass_rls to remove data created during tests.
 * Deletes in dependency order (children first, then users, then tenants).
 */
export async function cleanupTestData() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

    // Delete dropdown test fixtures in dependency order
    await tx.load.deleteMany({ where: { loadNumber: { startsWith: 'TEST-LOAD-' } } });
    await tx.truck.deleteMany({ where: { vin: { startsWith: 'TESTVIN' } } });
    await tx.carrierDriver.deleteMany({ where: { firstName: 'TestDriver' } });
    await tx.carrierClient.deleteMany({ where: { name: { startsWith: 'TestClient ' } } });
    await tx.carrierFacility.deleteMany({ where: { name: { startsWith: 'TestFacility ' } } });
    await tx.customer.deleteMany({ where: { companyName: { startsWith: 'TestCustomer ' } } });

    // Delete in dependency order (users first, then tenants)
    await tx.user.deleteMany({
      where: {
        email: {
          contains: 'test-',
        },
      },
    });

    await tx.tenant.deleteMany({
      where: {
        name: {
          contains: 'Test Tenant',
        },
      },
    });
  });
}

/**
 * Disconnect Prisma client after tests complete.
 */
export async function disconnectPrisma() {
  await prisma.$disconnect();
}

export { prisma };
