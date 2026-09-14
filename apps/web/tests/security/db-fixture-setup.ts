/**
 * Database fixture helpers for the three DB-backed security suites in this
 * directory: `audit-log-isolation`, `carrier-driver-pii`, `restricted-documents`.
 *
 * HISTORY — quick-598. This file was `tests/isolation/setup.ts`. That directory
 * held ten "cross-tenant isolation" tests which were deleted because they had
 * NEVER EXECUTED: both files failed at import under Prisma 7 (a bare
 * `new PrismaClient()`), so under CI's `DATABASE_URL` the suite reported
 * "no tests" — not a pass, not a skip. The helper survives because these three
 * security suites are its only other consumers and their claims (append-only
 * `audit_log`, CDL encryption + PII audit, restricted-document access) are not
 * covered anywhere else.
 *
 * TWO THINGS ARE FIXED HERE RATHER THAN CARRIED OVER:
 *
 * 1. THE CONSTRUCTOR. Prisma 7 requires an adapter. The old
 *    `new PrismaClient()` threw on every construction, which is why three
 *    suites in this directory have been red in CI for as long as the dummy
 *    `DATABASE_URL` has been set.
 *
 * 2. THE PRODUCTION-WRITE HAZARD, which is the serious one.
 *    `createTestTenant()` WRITES a tenant row into whatever `DATABASE_URL`
 *    names. `scripts/_bootstrap-env.ts:53-55` sets `DATABASE_URL = DIRECT_URL`
 *    unconditionally, and `.env`, `.env.local` and `apps/web/.env.local` ALL
 *    point `DIRECT_URL` at PRODUCTION. The only thing that ever stood between
 *    this file and tenants written into the production database was a
 *    constructor that happened not to compile. Fixing the constructor without
 *    also closing that would ARM it, so the production project ref is now a
 *    hard refusal at module load.
 *
 * The `describe.skip`-when-`DATABASE_URL`-is-absent pattern in the three
 * consumers is NOT endorsed by this file — it is the shape that let ten tests
 * report nothing for months. It is left alone only because changing it is a
 * different task. The staging-backed replacement that does fail rather than
 * skip is `apps/web/tests-db/rls-isolation/`.
 */

import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

/** Supabase project ref of PRODUCTION. Never a test target. */
const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prisma: any = null;

const DATABASE_URL = process.env.DATABASE_URL;

if (DATABASE_URL) {
  if (DATABASE_URL.includes(PRODUCTION_REF)) {
    throw new Error(
      `tests/security/db-fixture-setup.ts REFUSING TO RUN — DATABASE_URL names the ` +
        `PRODUCTION project (${PRODUCTION_REF}). These helpers CREATE tenants, users and ` +
        `documents. Point DATABASE_URL at a disposable database before running this suite.`
    );
  }

  const pool = new Pool({ connectionString: DATABASE_URL });
  prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
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
 * Clean up all test data after suite completes.
 * Uses bypass_rls to remove data created during tests.
 * Deletes in dependency order (children first, then users, then tenants).
 */
export async function cleanupTestData() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

    // Fixture rows these suites (or the code under test) may have created.
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
  await prisma?.$disconnect();
}

export { prisma };
