import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { withTenantRLS } from '@/lib/db/extensions/tenant-rls';
import {
  prisma,
  createTestTenant,
  createTestUser,
  cleanupTestData,
  disconnectPrisma,
} from './setup';

/**
 * Cross-Tenant Isolation Tests
 *
 * These tests verify that PostgreSQL RLS policies correctly enforce tenant isolation.
 * They are the most critical tests in the entire project - failure here means data leakage.
 *
 * Requirements:
 * - Real PostgreSQL database with RLS policies applied
 * - Migrations have been run (npx prisma migrate deploy)
 * - DO NOT use mocks or SQLite - RLS is a PostgreSQL feature
 *
 * Tests prove:
 * 1. Tenant A can only see their own users (not Tenant B's)
 * 2. Tenant B can only see their own users (not Tenant A's)
 * 3. Query without tenant context returns zero results
 * 4. Cross-tenant update attempts fail (record not found)
 * 5. Cross-tenant delete attempts fail (record not found)
 */
describe('Cross-Tenant Isolation (RLS)', () => {
  let tenantAId: string;
  let tenantBId: string;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    // Setup: Create two tenants and users using bypass_rls
    const tenantA = await createTestTenant('Test Tenant A');
    const tenantB = await createTestTenant('Test Tenant B');

    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const userA = await createTestUser(tenantAId, {
      clerkUserId: 'test-clerk-user-a',
      email: 'test-a@example.com',
      role: 'OWNER',
    });

    const userB = await createTestUser(tenantBId, {
      clerkUserId: 'test-clerk-user-b',
      email: 'test-b@example.com',
      role: 'OWNER',
    });

    userAId = userA.id;
    userBId = userB.id;
  });

  afterAll(async () => {
    // Cleanup: Remove test data
    await cleanupTestData();
    await disconnectPrisma();
  });

  it('Tenant A can only see their own users', async () => {
    // Create a tenant-scoped Prisma client for Tenant A
    const tenantAClient = prisma.$extends(withTenantRLS(tenantAId));

    // Query all users with Tenant A's RLS context
    const users = await tenantAClient.user.findMany();

    // Assert: Only Tenant A's user should be returned
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe(userAId);
    expect(users[0].tenantId).toBe(tenantAId);
    expect(users[0].email).toBe('test-a@example.com');

    // Assert: ZERO Tenant B users in results
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tenantBUsers = users.filter((u: any) => u.tenantId === tenantBId);
    expect(tenantBUsers).toHaveLength(0);
  });

  it('Tenant B can only see their own users', async () => {
    // Create a tenant-scoped Prisma client for Tenant B
    const tenantBClient = prisma.$extends(withTenantRLS(tenantBId));

    // Query all users with Tenant B's RLS context
    const users = await tenantBClient.user.findMany();

    // Assert: Only Tenant B's user should be returned
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe(userBId);
    expect(users[0].tenantId).toBe(tenantBId);
    expect(users[0].email).toBe('test-b@example.com');

    // Assert: ZERO Tenant A users in results
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tenantAUsers = users.filter((u: any) => u.tenantId === tenantAId);
    expect(tenantAUsers).toHaveLength(0);
  });

  it('Query without tenant context returns zero results', async () => {
    // Create a client with NO tenant context (empty string)
    const noContextClient = prisma.$extends(withTenantRLS(''));

    // Query users without tenant context
    const users = await noContextClient.user.findMany();

    // Assert: Defense-in-depth - no data leaks when context is missing
    expect(users).toHaveLength(0);

    // Assert: Even direct query by ID returns nothing
    const userById = await noContextClient.user.findUnique({
      where: { id: userAId },
    });
    expect(userById).toBeNull();
  });

  it('Cross-tenant update fails', async () => {
    // Create a tenant-scoped client for Tenant A
    const tenantAClient = prisma.$extends(withTenantRLS(tenantAId));

    // Attempt to update Tenant B's user from Tenant A's context
    // This should fail with Prisma P2025 error (Record not found)
    await expect(
      tenantAClient.user.update({
        where: { id: userBId },
        data: { email: 'hacked@example.com' },
      })
    ).rejects.toThrow();

    // Verify that Tenant B's user was NOT modified
    const tenantBClient = prisma.$extends(withTenantRLS(tenantBId));
    const userB = await tenantBClient.user.findUnique({
      where: { id: userBId },
    });

    expect(userB).not.toBeNull();
    expect(userB?.email).toBe('test-b@example.com');
  });

  it('Cross-tenant delete fails', async () => {
    // Create a tenant-scoped client for Tenant A
    const tenantAClient = prisma.$extends(withTenantRLS(tenantAId));

    // Attempt to delete Tenant B's user from Tenant A's context
    // This should fail with Prisma P2025 error (Record not found)
    await expect(
      tenantAClient.user.delete({
        where: { id: userBId },
      })
    ).rejects.toThrow();

    // Verify that Tenant B's user still exists
    const tenantBClient = prisma.$extends(withTenantRLS(tenantBId));
    const userB = await tenantBClient.user.findUnique({
      where: { id: userBId },
    });

    expect(userB).not.toBeNull();
    expect(userB?.id).toBe(userBId);
  });
});
