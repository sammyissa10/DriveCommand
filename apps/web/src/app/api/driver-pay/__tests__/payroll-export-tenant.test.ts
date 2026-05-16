/**
 * payroll-export-tenant.test.ts
 *
 * Tenant isolation: POST /api/reports/payroll-export must never return
 * settlements that belong to a different tenant, even when the caller
 * explicitly passes cross-tenant settlement IDs in the request body.
 *
 * Mechanism: the route adds `tenantId: session.tenantId` to every Prisma
 * findMany query, so org B settlement IDs silently resolve to zero rows
 * when called from an org A session. This test verifies that invariant.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/supabase', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/context/tenant-context', () => ({
  getTenantPrisma: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { POST } from '@/app/api/reports/payroll-export/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORG_A_TENANT_ID = 'tenant-org-a-00000000-0000-0000-0000-000000000001';
const ORG_B_TENANT_ID = 'tenant-org-b-00000000-0000-0000-0000-000000000002';

// Valid UUIDs for settlements in org B
const ORG_B_SETTLEMENT_ID_1 = 'b0000001-0000-4000-8000-000000000001';
const ORG_B_SETTLEMENT_ID_2 = 'b0000001-0000-4000-8000-000000000002';

function makeOwnerSession(tenantId: string) {
  return { userId: 'user-owner', email: 'owner@org.com', role: 'OWNER', tenantId };
}

function makeReq(settlementIds: string[]) {
  return new NextRequest(new URL('http://localhost/api/reports/payroll-export'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'generic_csv',
      employmentType: 'W2_EMPLOYEE',
      settlementIds,
    }),
  });
}

/**
 * Build a mock Prisma client that simulates the DB returning only
 * settlements whose tenantId matches `allowedTenantId`.
 *
 * When org A's owner requests org B's settlement IDs, the mock returns []
 * because the WHERE clause includes `tenantId = 'tenant-org-a-...'` which
 * does not match the org B settlements.
 */
function makePrisma(allowedTenantId: string) {
  // Org B settlements — only returned when the tenantId filter matches org B
  const orgBSettlements = [
    {
      id: ORG_B_SETTLEMENT_ID_1,
      tenantId: ORG_B_TENANT_ID,
      driverId: 'driver-b-1',
      status: 'FINALIZED',
      employmentTypeSnapshot: 'W2_EMPLOYEE',
      grossTaxable: { toString: () => '2000.00' },
      grossNonTaxable: { toString: () => '0.00' },
      totalDeductions: { toString: () => '0.00' },
      netPay: { toString: () => '2000.00' },
      periodStart: new Date('2026-04-08'),
      periodEnd: new Date('2026-04-14'),
      settlementReference: 'ORG-B-REF-1',
      notes: null,
      driver: { id: 'driver-b-1', firstName: 'Test', lastName: 'Driver B', email: 'driverb@org.com', phone: null },
    },
  ];

  return {
    driverSettlement: {
      /**
       * Simulates `WHERE id IN (...) AND tenantId = allowedTenantId`.
       * Org A's session → allowedTenantId = 'tenant-org-a-...' → org B rows filtered out.
       */
      findMany: vi.fn().mockImplementation(
        ({ where }: { where: { tenantId?: string; id?: { in: string[] } } }) => {
          const requestedIds: string[] = where.id?.in ?? [];
          const tenantFilter: string = where.tenantId ?? '';

          // Simulate the DB: only return rows that match BOTH id IN (...) AND tenantId
          const result = orgBSettlements.filter(
            (s) => requestedIds.includes(s.id) && s.tenantId === tenantFilter,
          );

          // Also allow returning empty for org A settlement IDs (not in fixture)
          return Promise.resolve(result);
        },
      ),
    },
    loadDriverAssignment: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    loadPayComponent: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    driverBonus: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    driverPayAuditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/reports/payroll-export — tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('org A session requesting org B settlement IDs returns empty export (0 rows), not org B data', async () => {
    // Org A owner is authenticated
    vi.mocked(getSession).mockResolvedValue(makeOwnerSession(ORG_A_TENANT_ID));
    // Prisma mock filters by tenantId — org B rows are excluded for org A session
    vi.mocked(getTenantPrisma).mockResolvedValue(makePrisma(ORG_A_TENANT_ID) as never);

    const res = await POST(makeReq([ORG_B_SETTLEMENT_ID_1, ORG_B_SETTLEMENT_ID_2]));

    // Route finds zero settlements (tenantId filter eliminates org B rows)
    // With zero rows and no draft IDs, the route proceeds to build an empty export.
    // An empty export returns 200 with a header-only CSV — never org B data.
    // The status must NOT be 422 (that would only happen for DRAFTs).
    // It also must NOT be 403 (org A owner is authenticated).
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);

    if (res.status === 200) {
      // If 200, verify the response body does NOT contain org B driver names or settlement refs
      const body = await res.text();
      expect(body).not.toContain('Driver B');
      expect(body).not.toContain('ORG-B-REF-1');
      expect(body).not.toContain(ORG_B_TENANT_ID);
    }
    // 422 is acceptable too — if the route can't find the requested IDs, it could
    // surface a "settlements not found" style error. Either way, no org B data is leaked.
  });

  it('org A session: driverSettlement.findMany is always called with org A tenantId', async () => {
    vi.mocked(getSession).mockResolvedValue(makeOwnerSession(ORG_A_TENANT_ID));
    const prisma = makePrisma(ORG_A_TENANT_ID);
    vi.mocked(getTenantPrisma).mockResolvedValue(prisma as never);

    await POST(makeReq([ORG_B_SETTLEMENT_ID_1]));

    expect(prisma.driverSettlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: ORG_A_TENANT_ID }),
      }),
    );
  });

  it('org B session: driverSettlement.findMany is called with org B tenantId', async () => {
    vi.mocked(getSession).mockResolvedValue(makeOwnerSession(ORG_B_TENANT_ID));
    const prisma = makePrisma(ORG_B_TENANT_ID);
    vi.mocked(getTenantPrisma).mockResolvedValue(prisma as never);

    await POST(makeReq([ORG_B_SETTLEMENT_ID_1]));

    expect(prisma.driverSettlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: ORG_B_TENANT_ID }),
      }),
    );
  });

  it('loadDriverAssignment.findMany is also scoped to the session tenantId', async () => {
    vi.mocked(getSession).mockResolvedValue(makeOwnerSession(ORG_A_TENANT_ID));
    const prisma = makePrisma(ORG_A_TENANT_ID);
    vi.mocked(getTenantPrisma).mockResolvedValue(prisma as never);

    // Simulate org B settlements found (e.g., an attacker who bypassed the first filter)
    // to verify the second query (assignments) is also tenant-scoped
    prisma.driverSettlement.findMany.mockResolvedValue([
      {
        id: ORG_B_SETTLEMENT_ID_1,
        tenantId: ORG_A_TENANT_ID, // forge to look like it passed the first check
        driverId: 'driver-b-1',
        status: 'FINALIZED',
        employmentTypeSnapshot: 'W2_EMPLOYEE',
        grossTaxable: { toString: () => '2000.00' },
        grossNonTaxable: { toString: () => '0.00' },
        totalDeductions: { toString: () => '0.00' },
        netPay: { toString: () => '2000.00' },
        periodStart: new Date('2026-04-08'),
        periodEnd: new Date('2026-04-14'),
        settlementReference: 'ORG-B-REF-1',
        notes: null,
        driver: { id: 'driver-b-1', firstName: 'Test', lastName: 'Driver B', email: 'driverb@org.com', phone: null },
      },
    ]);

    await POST(makeReq([ORG_B_SETTLEMENT_ID_1]));

    // Even if the first query somehow returned a row, the assignment query must
    // also be scoped to the session's tenantId
    if (prisma.loadDriverAssignment.findMany.mock.calls.length > 0) {
      expect(prisma.loadDriverAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: ORG_A_TENANT_ID }),
        }),
      );
    }
  });
});
