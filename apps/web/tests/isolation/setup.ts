import { PrismaClient } from '../../src/generated/prisma/client';

/**
 * Test utilities for cross-tenant isolation tests.
 *
 * IMPORTANT: These tests MUST run against a real PostgreSQL instance with RLS policies applied.
 * RLS is a PostgreSQL feature - mocking it defeats the purpose.
 *
 * Setup requirements:
 * 1. PostgreSQL database running
 * 2. Database migrations applied (npx prisma migrate deploy)
 * 3. RLS policies created (see migration files)
 */

// @ts-ignore - Prisma 7 type issue with constructor
const prisma = new PrismaClient();

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
 * Clean up all test data after suite completes.
 * Uses bypass_rls to remove data created during tests.
 */
export async function cleanupTestData() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

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
