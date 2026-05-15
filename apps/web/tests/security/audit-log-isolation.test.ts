/**
 * audit_log isolation + append-only enforcement tests.
 *
 * Two-tenant isolation:
 *   - Seed 2 audit_log rows in tenant A and 2 in tenant B (via bypass_rls inserts).
 *   - Connect as tenant A user → query auditLog.findMany → assert exactly 2 rows,
 *     all with tenantId === tenantAId.
 *
 * Append-only:
 *   - Verify app_user does NOT have UPDATE or DELETE privilege on audit_log.
 *     Uses has_table_privilege() because SET ROLE is not always feasible in test env.
 *
 * Follows the pattern of apps/web/tests/isolation/dropdowns.test.ts.
 * Requires a real PostgreSQL database with the migration applied.
 * Skipped automatically when DATABASE_URL is not set.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { withTenantRLS } from '@/lib/db/extensions/tenant-rls';
import {
  prisma,
  createTestTenant,
  createTestUser,
  cleanupTestData,
  disconnectPrisma,
} from '../isolation/setup';

const hasDatabase = !!process.env.DATABASE_URL;
const describeWithDb = hasDatabase ? describe : describe.skip;

describeWithDb('audit_log isolation + append-only (spec §4.4)', () => {
  let tenantAId: string;
  let tenantBId: string;
  let userAId: string;
  let userBId: string;
  let rowAIds: string[] = [];
  let rowBIds: string[] = [];

  beforeAll(async () => {
    const tenantA = await createTestTenant('Test Tenant A AuditLog');
    const tenantB = await createTestTenant('Test Tenant B AuditLog');
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const userA = await createTestUser(tenantAId, {
      clerkUserId: `audit-test-user-a-${Date.now()}`,
      email: `audit-test-a-${Date.now()}@example.com`,
      role: 'OWNER',
    });
    const userB = await createTestUser(tenantBId, {
      clerkUserId: `audit-test-user-b-${Date.now()}`,
      email: `audit-test-b-${Date.now()}@example.com`,
      role: 'OWNER',
    });
    userAId = userA.id;
    userBId = userB.id;

    // Seed 2 rows in tenant A and 2 in tenant B via bypass_rls
    // Use raw INSERT because audit_log has no Prisma create path without bypass_rls
    // (RLS FORCE would block app_user without the session var set)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seedResult = await (prisma as any).$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // 2 rows for tenant A
      const a1 = await tx.auditLog.create({
        data: {
          tenantId: tenantAId,
          userId: userAId,
          action: 'VIEW_PII',
          resourceType: 'carrier_driver',
          resourceId: tenantAId, // reuse UUID — just for test
        },
        select: { id: true },
      });
      const a2 = await tx.auditLog.create({
        data: {
          tenantId: tenantAId,
          userId: userAId,
          action: 'EXPORT',
          resourceType: 'carrier_driver',
          resourceId: tenantAId,
        },
        select: { id: true },
      });

      // 2 rows for tenant B
      const b1 = await tx.auditLog.create({
        data: {
          tenantId: tenantBId,
          userId: userBId,
          action: 'VIEW_PII',
          resourceType: 'carrier_driver',
          resourceId: tenantBId,
        },
        select: { id: true },
      });
      const b2 = await tx.auditLog.create({
        data: {
          tenantId: tenantBId,
          userId: userBId,
          action: 'VIEW_PII_DENIED',
          resourceType: 'carrier_driver',
          resourceId: tenantBId,
        },
        select: { id: true },
      });

      return { a1, a2, b1, b2 };
    });

    rowAIds = [seedResult.a1.id, seedResult.a2.id];
    rowBIds = [seedResult.b1.id, seedResult.b2.id];
  });

  afterAll(async () => {
    // Clean up audit_log rows and tenants
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      await tx.auditLog.deleteMany({
        where: { tenantId: { in: [tenantAId, tenantBId] } },
      });
    });
    await cleanupTestData();
    await disconnectPrisma();
  });

  it('tenant A user sees exactly 2 audit_log rows, all in tenant A', async () => {
    const tenantAClient = prisma.$extends(withTenantRLS(tenantAId));
    const rows = await tenantAClient.auditLog.findMany({
      where: { tenantId: tenantAId },
    });

    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.tenantId).toBe(tenantAId);
    }
  });

  it('tenant A user does NOT see tenant B rows when querying all', async () => {
    const tenantAClient = prisma.$extends(withTenantRLS(tenantAId));
    const rows = await tenantAClient.auditLog.findMany();

    const tenantBRows = rows.filter((r: { tenantId: string }) => r.tenantId === tenantBId);
    expect(tenantBRows.length).toBe(0);
  });

  it('app_user does NOT have UPDATE privilege on audit_log', async () => {
    // Verify via PostgreSQL privilege check — safe even without SET ROLE
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (prisma as any).$queryRaw<Array<{ has_update: boolean }>>`
      SELECT has_table_privilege('app_user', 'audit_log', 'UPDATE') AS has_update
    `;
    expect(result[0]?.has_update).toBe(false);
  });

  it('app_user does NOT have DELETE privilege on audit_log', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (prisma as any).$queryRaw<Array<{ has_delete: boolean }>>`
      SELECT has_table_privilege('app_user', 'audit_log', 'DELETE') AS has_delete
    `;
    expect(result[0]?.has_delete).toBe(false);
  });

  it('seeded row IDs are distinct between tenants', () => {
    // Sanity check that our seed produced genuinely separate rows
    const allIds = [...rowAIds, ...rowBIds];
    const unique = new Set(allIds);
    expect(unique.size).toBe(allIds.length);
  });
});
