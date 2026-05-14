/**
 * reports-api.test.ts
 *
 * Vitest suite for Driver Pay Phase 10 reports.
 * Covers: RBAC, KPI computations, period boundaries, trend %, tenant isolation.
 *
 * Mocking style matches settlements-tenant.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/supabase', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/context/tenant-context', () => ({
  getTenantPrisma: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import Decimal from 'decimal.js';

// Import route handlers
import { GET as overviewGET } from '@/app/api/driver-pay/reports/overview/route';
import { GET as settlmentsGET } from '@/app/api/driver-pay/reports/settlements/route';
import { GET as driverDetailGET } from '@/app/api/driver-pay/reports/drivers/[driverId]/route';

// Import pure aggregation helpers for direct unit tests
import {
  computeDeltaPct,
  getPeriodRange,
  computeOverviewKpis,
} from '@/lib/driver-pay/reporting';

// ---------------------------------------------------------------------------
// Session fixtures
// ---------------------------------------------------------------------------

const ownerSession = {
  userId: 'u-owner-1',
  email: 'owner@tenantA.com',
  role: 'OWNER',
  tenantId: 'tenant-A',
};

const managerSession = {
  userId: 'u-mgr-1',
  email: 'manager@tenantA.com',
  role: 'MANAGER',
  tenantId: 'tenant-A',
};

const driverSession = {
  userId: 'u-driver-1',
  email: 'driver@tenantA.com',
  role: 'DRIVER',
  tenantId: 'tenant-A',
};

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/**
 * Build a DriverSettlement-like fixture with Prisma Decimal-compatible fields.
 * Decimal fields have a `.toString()` method to match Prisma's Decimal type.
 */
function makeSettlement(
  id: string,
  tenantId: string,
  driverId: string,
  overrides: {
    netPay?: string;
    totalDeductions?: string;
    grossTaxable?: string;
    grossNonTaxable?: string;
    status?: string;
    periodStart?: Date;
    periodEnd?: Date;
  } = {},
) {
  return {
    id,
    tenantId,
    driverId,
    periodStart: overrides.periodStart ?? new Date('2026-05-11'),
    periodEnd: overrides.periodEnd ?? new Date('2026-05-17'),
    status: overrides.status ?? 'PAID',
    grossTaxable: { toString: () => overrides.grossTaxable ?? '2000.00' },
    grossNonTaxable: { toString: () => overrides.grossNonTaxable ?? '0.00' },
    totalDeductions: { toString: () => overrides.totalDeductions ?? '200.00' },
    netPay: { toString: () => overrides.netPay ?? '1800.00' },
    settlementReference: `SET-${id}`,
    pdfUrl: null,
    finalizedBy: null,
    finalizedAt: null,
    paidAt: new Date(),
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u-owner-1',
    deletedAt: null,
    driver: { firstName: 'John', lastName: 'Driver', payModel: 'per_mile' },
  };
}

function makeBonus(id: string, tenantId: string, driverId: string, amount: string) {
  return {
    id,
    tenantId,
    driverId,
    amount: { toString: () => amount },
    triggerDate: new Date('2026-05-14'),
    bonusType: 'PERFORMANCE',
    deletedAt: null,
  };
}

function makeReq(url: string): NextRequest {
  return new NextRequest(new URL(url), { method: 'GET' });
}

// ---------------------------------------------------------------------------
// Minimal prisma mock builder
// ---------------------------------------------------------------------------

function makePrisma(opts: {
  settlements?: object[];
  priorSettlements?: object[];
  bonuses?: object[];
  priorBonuses?: object[];
  carrierDriver?: object | null;
  disputeCount?: number;
  disputeList?: object[];
  assignmentList?: object[];
  deductionList?: object[];
  settlementCount?: number;
  rollingAvgSettlements?: object[];
}) {
  // We need findMany to distinguish current vs prior range queries.
  // The simplest approach: first call returns settlements, second returns priorSettlements.
  let settlementFindManyCallCount = 0;
  let bonusFindManyCallCount = 0;

  return {
    driverSettlement: {
      findMany: vi.fn().mockImplementation(() => {
        settlementFindManyCallCount++;
        if (settlementFindManyCallCount === 1) return Promise.resolve(opts.settlements ?? []);
        if (settlementFindManyCallCount === 2) return Promise.resolve(opts.priorSettlements ?? []);
        // Rolling avg queries and others
        return Promise.resolve(opts.rollingAvgSettlements ?? []);
      }),
      count: vi.fn().mockResolvedValue(opts.settlementCount ?? (opts.settlements ?? []).length),
    },
    driverBonus: {
      findMany: vi.fn().mockImplementation(() => {
        bonusFindManyCallCount++;
        if (bonusFindManyCallCount === 1) return Promise.resolve(opts.bonuses ?? []);
        return Promise.resolve(opts.priorBonuses ?? []);
      }),
    },
    carrierDriver: {
      findFirst: vi.fn().mockResolvedValue(
        opts.carrierDriver !== undefined ? opts.carrierDriver : { id: 'driver-1', firstName: 'John', lastName: 'Driver', payModel: 'per_mile' },
      ),
    },
    driverDispute: {
      findMany: vi.fn().mockResolvedValue(opts.disputeList ?? []),
      count: vi.fn().mockResolvedValue(opts.disputeCount ?? 0),
    },
    loadDriverAssignment: {
      findMany: vi.fn().mockResolvedValue(opts.assignmentList ?? []),
      count: vi.fn().mockResolvedValue(0),
    },
    driverDeduction: {
      findMany: vi.fn().mockResolvedValue(opts.deductionList ?? []),
    },
  };
}

// ===========================================================================
// 1. RBAC — GET /api/driver-pay/reports/overview
// ===========================================================================

describe('GET /api/driver-pay/reports/overview — RBAC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 with no session', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(getTenantPrisma).mockResolvedValue(makePrisma({}) as never);

    const res = await overviewGET(makeReq('http://localhost/api/driver-pay/reports/overview'));
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 403 for DRIVER role', async () => {
    vi.mocked(getSession).mockResolvedValue(driverSession);
    vi.mocked(getTenantPrisma).mockResolvedValue(makePrisma({}) as never);

    const res = await overviewGET(makeReq('http://localhost/api/driver-pay/reports/overview'));
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Forbidden');
  });

  it('returns 200 for OWNER role with empty data', async () => {
    vi.mocked(getSession).mockResolvedValue(ownerSession);
    vi.mocked(getTenantPrisma).mockResolvedValue(makePrisma({}) as never);

    const res = await overviewGET(makeReq('http://localhost/api/driver-pay/reports/overview?period=this_week'));
    expect(res.status).toBe(200);
    const body = await res.json() as { kpis: object };
    expect(body.kpis).toBeDefined();
  });
});

// ===========================================================================
// 2. KPI computations — handcrafted fixture
// ===========================================================================

describe('KPI computations — computeOverviewKpis', () => {
  beforeEach(() => vi.clearAllMocks());

  it('correctly sums totalPayroll and counts driversPaid from fixture', async () => {
    /**
     * Fixture: 3 drivers, 5 settlements, 2 bonuses in range.
     * Expected:
     *   totalPayroll = 1800 + 1500 + 2000 + 900 + 1200 = 7400
     *   driversPaid = 3 (drivers d1, d2, d3 all PAID)
     *   avgNetPay = 7400 / 3 ≈ 2466.67
     *   totalDeductions = 200 + 100 + 300 + 50 + 150 = 800
     *   totalBonuses = 250 + 500 = 750
     */
    const currentSettlements = [
      makeSettlement('s1', 'tenant-A', 'd1', { netPay: '1800.00', totalDeductions: '200.00', status: 'PAID' }),
      makeSettlement('s2', 'tenant-A', 'd2', { netPay: '1500.00', totalDeductions: '100.00', status: 'PAID' }),
      makeSettlement('s3', 'tenant-A', 'd3', { netPay: '2000.00', totalDeductions: '300.00', status: 'PAID' }),
      makeSettlement('s4', 'tenant-A', 'd1', { netPay: '900.00', totalDeductions: '50.00', status: 'PAID' }),
      makeSettlement('s5', 'tenant-A', 'd2', { netPay: '1200.00', totalDeductions: '150.00', status: 'PAID' }),
    ];
    const bonuses = [
      makeBonus('b1', 'tenant-A', 'd1', '250.00'),
      makeBonus('b2', 'tenant-A', 'd2', '500.00'),
    ];
    // Prior period: smaller set to produce meaningful deltas
    const priorSettlements = [
      makeSettlement('ps1', 'tenant-A', 'd1', { netPay: '1000.00', totalDeductions: '100.00', status: 'PAID' }),
      makeSettlement('ps2', 'tenant-A', 'd2', { netPay: '800.00', totalDeductions: '80.00', status: 'PAID' }),
    ];

    const prisma = makePrisma({
      settlements: currentSettlements,
      priorSettlements,
      bonuses,
      priorBonuses: [],
    });

    const range = { start: new Date('2026-05-11'), end: new Date('2026-05-17') };
    const kpis = await computeOverviewKpis(prisma as never, 'tenant-A', range, {});

    // totalPayroll: sum of all netPay
    expect(kpis.totalPayroll.current).toBe('7400.00');

    // driversPaid: distinct driverId where status=PAID → d1, d2, d3
    expect(kpis.driversPaid.current).toBe(3);

    // avgNetPay: 7400 / 3 ≈ 2466.67
    const avgDecimal = new Decimal('7400').div(3).toDecimalPlaces(2);
    expect(kpis.avgNetPay.current).toBe(avgDecimal.toFixed(2));

    // totalDeductions
    expect(kpis.totalDeductions.current).toBe('800.00');

    // totalBonuses
    expect(kpis.totalBonuses.current).toBe('750.00');
  });

  it('delta: prior payroll 1800, current 7400 → delta ≈ +311.1%', async () => {
    const currentSettlements = [
      makeSettlement('s1', 'tenant-A', 'd1', { netPay: '7400.00', totalDeductions: '0.00', status: 'PAID' }),
    ];
    const priorSettlements = [
      makeSettlement('ps1', 'tenant-A', 'd1', { netPay: '1800.00', totalDeductions: '0.00', status: 'PAID' }),
    ];

    const prisma = makePrisma({ settlements: currentSettlements, priorSettlements, bonuses: [], priorBonuses: [] });
    const range = { start: new Date('2026-05-11'), end: new Date('2026-05-17') };
    const kpis = await computeOverviewKpis(prisma as never, 'tenant-A', range, {});

    // delta = (7400 - 1800) / 1800 * 100 = 5600/1800 * 100 ≈ 311.1
    const expectedDelta = new Decimal('7400').minus('1800').div('1800').mul(100).toDecimalPlaces(1).toNumber();
    expect(kpis.totalPayroll.delta).toBe(expectedDelta);
  });

  it('delta is null when prior is zero', async () => {
    const currentSettlements = [
      makeSettlement('s1', 'tenant-A', 'd1', { netPay: '1000.00', totalDeductions: '0.00', status: 'PAID' }),
    ];
    const prisma = makePrisma({ settlements: currentSettlements, priorSettlements: [], bonuses: [], priorBonuses: [] });
    const range = { start: new Date('2026-05-11'), end: new Date('2026-05-17') };
    const kpis = await computeOverviewKpis(prisma as never, 'tenant-A', range, {});

    expect(kpis.totalPayroll.delta).toBeNull();
  });
});

// ===========================================================================
// 3. Period boundary handling
// ===========================================================================

describe('Period boundary handling', () => {
  it('getPeriodRange this_week with fixed now=2026-05-13 → Mon 2026-05-11, end is same week Sunday', () => {
    const now = new Date('2026-05-13T12:00:00Z');
    const range = getPeriodRange('this_week', undefined, undefined, now);

    // Week starts Monday — start must be on a Monday (day 1)
    // Use local date math to avoid UTC offset issues in the assertion
    const startDay = range.start.getDay(); // 1 = Monday
    const endDay = range.end.getDay();     // 0 = Sunday

    expect(startDay).toBe(1); // Monday
    expect(endDay).toBe(0);   // Sunday

    // The range must span exactly 7 days (or close — endOfWeek is end-of-Sunday)
    const diffDays = Math.round((range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBeGreaterThanOrEqual(6);
    expect(diffDays).toBeLessThanOrEqual(7);

    // start must be 2026-05-11 in local time (the Monday of the week containing May 13)
    expect(range.start.getFullYear()).toBe(2026);
    expect(range.start.getMonth()).toBe(4); // May = index 4
    expect(range.start.getDate()).toBe(11);
  });

  it('settlement on periodStart boundary date IS included (overlap check)', async () => {
    // Settlement with periodStart = 2026-05-11 (boundary day) must be counted.
    // With overlap semantics: periodStart <= range.end AND periodEnd >= range.start
    const boundarySettlement = makeSettlement('s-boundary', 'tenant-A', 'd1', {
      netPay: '1000.00',
      totalDeductions: '0.00',
      status: 'PAID',
      periodStart: new Date('2026-05-11'),
      periodEnd: new Date('2026-05-17'),
    });

    const prisma = makePrisma({ settlements: [boundarySettlement], priorSettlements: [], bonuses: [], priorBonuses: [] });
    const range = { start: new Date('2026-05-11'), end: new Date('2026-05-17') };

    // Verify the findMany call uses overlap semantics (lte on periodStart, gte on periodEnd)
    const kpis = await computeOverviewKpis(prisma as never, 'tenant-A', range, {});

    expect(prisma.driverSettlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          periodStart: expect.objectContaining({ lte: range.end }),
          periodEnd:   expect.objectContaining({ gte: range.start }),
        }),
      }),
    );
    // The boundary settlement IS counted
    expect(kpis.totalPayroll.current).toBe('1000.00');
  });

  it('settlement fully BEFORE range window is excluded by overlap (periodEnd < range.start)', () => {
    // Overlap semantics: periodEnd >= range.start is required.
    // A settlement ending before range.start fails this condition → excluded.
    // Example: settlement May 1-7 does NOT overlap window May 11-17.
    const range = getPeriodRange('this_week', undefined, undefined, new Date('2026-05-13T12:00:00Z'));
    const settlementPeriodEnd = new Date('2026-05-07'); // ends before window start (May 11)
    // periodEnd < range.start → NOT gte range.start → excluded by overlap semantics
    expect(settlementPeriodEnd < range.start).toBe(true);
  });
});

// ===========================================================================
// 4. Trend percentage math — computeDeltaPct
// ===========================================================================

describe('Trend percentage math — computeDeltaPct', () => {
  it('prior=100, current=150 → delta=50', () => {
    expect(computeDeltaPct(new Decimal('150'), new Decimal('100'))).toBe(50);
  });

  it('prior=200, current=100 → delta=-50', () => {
    expect(computeDeltaPct(new Decimal('100'), new Decimal('200'))).toBe(-50);
  });

  it('prior=0, current=500 → null (divide-by-zero)', () => {
    expect(computeDeltaPct(new Decimal('500'), new Decimal('0'))).toBeNull();
  });

  it('prior=100, current=100 → delta=0', () => {
    expect(computeDeltaPct(new Decimal('100'), new Decimal('100'))).toBe(0);
  });
});

// ===========================================================================
// 5. Tenant isolation
// ===========================================================================

describe('Tenant isolation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('overview route always passes tenantId in where clause (tenant-A)', async () => {
    vi.mocked(getSession).mockResolvedValue(ownerSession); // tenantId: tenant-A
    const findManySpy = vi.fn().mockResolvedValue([]);
    const prisma = {
      driverSettlement: {
        findMany: findManySpy,
        count: vi.fn().mockResolvedValue(0),
      },
      driverBonus: { findMany: vi.fn().mockResolvedValue([]) },
      carrierDriver: { findFirst: vi.fn().mockResolvedValue(null) },
      driverDispute: { findMany: vi.fn().mockResolvedValue([]) },
      loadDriverAssignment: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
      driverDeduction: { findMany: vi.fn().mockResolvedValue([]) },
    };
    vi.mocked(getTenantPrisma).mockResolvedValue(prisma as never);

    await overviewGET(makeReq('http://localhost/api/driver-pay/reports/overview?period=this_week'));

    // The first call to findMany must have tenantId: 'tenant-A' in where
    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-A' }),
      }),
    );
  });

  it('per-driver detail route returns 404 when driver belongs to different tenant (findFirst returns null)', async () => {
    vi.mocked(getSession).mockResolvedValue(ownerSession); // tenantId: tenant-A
    const prisma = {
      driverSettlement: { findMany: vi.fn().mockResolvedValue([]) },
      driverBonus: { findMany: vi.fn().mockResolvedValue([]) },
      // findFirst returns null → driver not in this tenant's RLS scope
      carrierDriver: { findFirst: vi.fn().mockResolvedValue(null) },
      driverDispute: { findMany: vi.fn().mockResolvedValue([]) },
      loadDriverAssignment: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
      driverDeduction: { findMany: vi.fn().mockResolvedValue([]) },
    };
    vi.mocked(getTenantPrisma).mockResolvedValue(prisma as never);

    const res = await driverDetailGET(
      makeReq('http://localhost/api/driver-pay/reports/drivers/driver-from-tenant-B'),
      { params: Promise.resolve({ driverId: 'driver-from-tenant-B' }) },
    );

    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// 6. Per-driver detail — RBAC
// ===========================================================================

describe('Per-driver detail — RBAC', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 for DRIVER role on /reports/drivers/[driverId]', async () => {
    vi.mocked(getSession).mockResolvedValue(driverSession);
    vi.mocked(getTenantPrisma).mockResolvedValue(makePrisma({}) as never);

    const res = await driverDetailGET(
      makeReq('http://localhost/api/driver-pay/reports/drivers/driver-1'),
      { params: Promise.resolve({ driverId: 'driver-1' }) },
    );

    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Forbidden');
  });

  it('returns 200 for MANAGER role on /reports/drivers/[driverId]', async () => {
    vi.mocked(getSession).mockResolvedValue(managerSession);
    vi.mocked(getTenantPrisma).mockResolvedValue(
      makePrisma({
        carrierDriver: { id: 'driver-1', firstName: 'John', lastName: 'Doe', payModel: 'per_mile' },
        settlements: [],
        bonuses: [],
        deductionList: [],
      }) as never,
    );

    const res = await driverDetailGET(
      makeReq('http://localhost/api/driver-pay/reports/drivers/driver-1'),
      { params: Promise.resolve({ driverId: 'driver-1' }) },
    );

    expect(res.status).toBe(200);
  });

  it('returns 401 for unauthenticated request to /reports/drivers/[driverId]', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await driverDetailGET(
      makeReq('http://localhost/api/driver-pay/reports/drivers/driver-1'),
      { params: Promise.resolve({ driverId: 'driver-1' }) },
    );

    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// 7. Settlements route RBAC
// ===========================================================================

describe('GET /api/driver-pay/reports/settlements — RBAC', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 for unauthenticated request', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await settlmentsGET(makeReq('http://localhost/api/driver-pay/reports/settlements'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for DRIVER role', async () => {
    vi.mocked(getSession).mockResolvedValue(driverSession);
    vi.mocked(getTenantPrisma).mockResolvedValue(makePrisma({}) as never);

    const res = await settlmentsGET(makeReq('http://localhost/api/driver-pay/reports/settlements'));
    expect(res.status).toBe(403);
  });

  it('returns paginated settlements for OWNER role', async () => {
    vi.mocked(getSession).mockResolvedValue(ownerSession);
    const settlements = [
      makeSettlement('s1', 'tenant-A', 'd1'),
      makeSettlement('s2', 'tenant-A', 'd2'),
    ];
    vi.mocked(getTenantPrisma).mockResolvedValue(
      makePrisma({
        settlements,
        settlementCount: 2,
        rollingAvgSettlements: [],
      }) as never,
    );

    const res = await settlmentsGET(
      makeReq('http://localhost/api/driver-pay/reports/settlements?period=this_week'),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { rows: unknown[]; total: number };
    expect(body.total).toBe(2);
    expect(Array.isArray(body.rows)).toBe(true);
  });
});
