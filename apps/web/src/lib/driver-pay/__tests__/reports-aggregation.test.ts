/**
 * reports-aggregation.test.ts — Vitest coverage for all 7 report aggregation helpers.
 *
 * Uses vi.fn() mocked Prisma — no real DB calls.
 * Money uses Decimal for fixture amounts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import {
  computeAccessorialSpend,
  computeLoadProfitability,
  computeComponentTypeBreakdown,
  computeOvertimeExposure,
  computeOverrideAudit,
  computeDeductionBalances,
  computeSettlementHistory,
} from '../reports';
import type { PeriodRange } from '../reporting';

const TENANT = 'tenant-test';
const range: PeriodRange = { start: new Date('2026-05-01'), end: new Date('2026-05-31') };

// Helper to create a Decimal-like object matching Prisma's Decimal scalar
function D(v: number | string) {
  const d = new Decimal(v);
  return Object.assign(d, { toString: () => String(v) });
}

// ─── computeAccessorialSpend ───────────────────────────────────────────────

describe('computeAccessorialSpend', () => {
  beforeEach(() => vi.clearAllMocks());

  it('groups correctly, sums bigNumber, computes avgAmount, deltaPct', async () => {
    // Current period: Client A (2 components: $100 + $50), Client B ($200), Unknown ($25)
    const currentComponents = [
      { grossAmount: D(100), loadId: 'l1', load: { clientId: 'client-a', contractId: null, client: { name: 'Client A' }, contract: null } },
      { grossAmount: D(50),  loadId: 'l1', load: { clientId: 'client-a', contractId: null, client: { name: 'Client A' }, contract: null } },
      { grossAmount: D(200), loadId: 'l2', load: { clientId: 'client-b', contractId: null, client: { name: 'Client B' }, contract: null } },
      { grossAmount: D(25),  loadId: 'l3', load: null },
    ];
    // Prior period: total $250
    const priorComponents = [
      { grossAmount: D(250) },
    ];

    let callCount = 0;
    const prisma = {
      loadPayComponent: {
        findMany: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.resolve(currentComponents);
          return Promise.resolve(priorComponents);
        }),
      },
    };

    const result = await computeAccessorialSpend(prisma as never, TENANT, range);

    expect(result.bigNumber).toBe('375.00');
    expect(result.priorTotal).toBe('250.00');
    expect(result.deltaPct).toBe(50); // (375-250)/250*100 = 50

    // rows sorted by totalAmount desc: B ($200), A ($150), Unknown ($25)
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0].clientName).toBe('Client B');
    expect(result.rows[0].totalAmount).toBe('200.00');
    expect(result.rows[1].clientName).toBe('Client A');
    expect(result.rows[1].totalAmount).toBe('150.00');
    expect(result.rows[1].componentCount).toBe(2);
    expect(result.rows[1].avgAmount).toBe('75.00');
    expect(result.rows[2].clientName).toBe('Unknown / No Client');
    expect(result.rows[2].totalAmount).toBe('25.00');
  });
});

// ─── computeLoadProfitability ───────────────────────────────────────────────

describe('computeLoadProfitability', () => {
  beforeEach(() => vi.clearAllMocks());

  it('computes profit, margin, bigNumber, uses assignment.loadRevenue first', async () => {
    const loads = [
      {
        id: 'l1', referenceNumber: 'REF-1', totalRevenue: null, createdAt: new Date('2026-05-10'),
        client: { name: 'Client A' },
        driverAssignments: [{ loadRevenue: D(1000), driverId: 'd1' }],
        payComponents: [{ grossAmount: D(300) }],
      },
      {
        id: 'l2', referenceNumber: 'REF-2', totalRevenue: null, createdAt: new Date('2026-05-11'),
        client: { name: 'Client B' },
        driverAssignments: [{ loadRevenue: D(500), driverId: 'd1' }],
        payComponents: [{ grossAmount: D(500) }],
      },
      {
        id: 'l3', referenceNumber: 'REF-3', totalRevenue: D(200), createdAt: new Date('2026-05-12'),
        client: null,
        driverAssignments: [{ loadRevenue: null, driverId: 'd2' }], // falls back to totalRevenue
        payComponents: [{ grossAmount: D(50) }],
      },
    ];

    const prisma = {
      carrierLoad: {
        findMany: vi.fn().mockResolvedValue(loads),
      },
    };

    const result = await computeLoadProfitability(prisma as never, TENANT, range, {
      page: 1,
      pageSize: 25,
    });

    // bigNumber = sum of all profits: 700 + 0 + 150 = 850
    expect(result.bigNumber).toBe('850.00');
    expect(result.totalCount).toBe(3);

    const l1Row = result.rows.find((r) => r.loadId === 'l1');
    expect(l1Row?.profit).toBe('700.00');
    expect(l1Row?.profitMarginPct).toBe(70);

    const l2Row = result.rows.find((r) => r.loadId === 'l2');
    expect(l2Row?.profit).toBe('0.00');
    expect(l2Row?.profitMarginPct).toBe(0);

    const l3Row = result.rows.find((r) => r.loadId === 'l3');
    expect(l3Row?.revenue).toBe('200.00'); // falls back to totalRevenue
    expect(l3Row?.profit).toBe('150.00');
  });

  it('paginates correctly', async () => {
    const loads = Array.from({ length: 3 }, (_, i) => ({
      id: `l${i}`, referenceNumber: `R${i}`, totalRevenue: D(100), createdAt: new Date('2026-05-01'),
      client: null,
      driverAssignments: [],
      payComponents: [{ grossAmount: D(50) }],
    }));

    const prisma = {
      carrierLoad: {
        findMany: vi.fn().mockResolvedValue(loads),
      },
    };

    const result = await computeLoadProfitability(prisma as never, TENANT, range, {
      page: 1,
      pageSize: 2,
    });

    expect(result.rows).toHaveLength(2);
    expect(result.totalCount).toBe(3);
  });
});

// ─── computeComponentTypeBreakdown ─────────────────────────────────────────

describe('computeComponentTypeBreakdown', () => {
  beforeEach(() => vi.clearAllMocks());

  it('computes bigNumber, pct, sorts descending', async () => {
    const groups = [
      { componentType: 'OVERTIME', _sum: { grossAmount: D(400) }, _count: { _all: 4 } },
      { componentType: 'DETENTION', _sum: { grossAmount: D(100) }, _count: { _all: 2 } },
    ];
    const priorGroups: never[] = [];

    let callCount = 0;
    const prisma = {
      loadPayComponent: {
        groupBy: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.resolve(groups);
          return Promise.resolve(priorGroups);
        }),
      },
    };

    const result = await computeComponentTypeBreakdown(prisma as never, TENANT, range);

    expect(result.bigNumber).toBe('500.00');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].componentType).toBe('OVERTIME');
    expect(result.rows[0].pct).toBe(80);
    expect(result.rows[1].componentType).toBe('DETENTION');
    expect(result.rows[1].pct).toBe(20);
    expect(result.rows[0].totalAmount).toBe('400.00');
  });
});

// ─── computeOvertimeExposure ────────────────────────────────────────────────

describe('computeOvertimeExposure', () => {
  beforeEach(() => vi.clearAllMocks());

  it('computes bigNumber, totalLoadsAffected, driverName, paginates', async () => {
    const components = [
      {
        grossAmount: D(200), driverId: 'd1', loadId: 'load-1', assignmentId: 'a1',
        load: { id: 'load-1', referenceNumber: 'R1' },
        assignment: { id: 'a1', actualHours: D(12), driver: { id: 'd1', firstName: 'John', lastName: 'Doe' } },
      },
      {
        grossAmount: D(150), driverId: 'd2', loadId: 'load-2', assignmentId: 'a2',
        load: { id: 'load-2', referenceNumber: 'R2' },
        assignment: { id: 'a2', actualHours: null, driver: { id: 'd2', firstName: 'Jane', lastName: 'Smith' } },
      },
      {
        grossAmount: D(100), driverId: 'd1', loadId: 'load-2', assignmentId: 'a3',
        load: { id: 'load-2', referenceNumber: 'R2' },
        assignment: { id: 'a3', actualHours: D(10), driver: { id: 'd1', firstName: 'John', lastName: 'Doe' } },
      },
    ];

    const prisma = {
      loadPayComponent: {
        findMany: vi.fn().mockResolvedValueOnce(components).mockResolvedValueOnce([]),
      },
    };

    const result = await computeOvertimeExposure(prisma as never, TENANT, range, { page: 1, pageSize: 25 });

    // bigNumber = 200 + 150 + 100 = 450
    expect(result.bigNumber).toBe('450.00');
    // 2 distinct loads
    expect(result.totalLoadsAffected).toBe(2);
    expect(result.totalCount).toBe(3);

    const row0 = result.rows[0];
    expect(row0.driverName).toBe('John Doe');
    expect(row0.overtimeAmount).toBe('200.00');

    const row1 = result.rows[1];
    expect(row1.driverName).toBe('Jane Smith');
    expect(row1.actualHours).toBeNull();
  });
});

// ─── computeOverrideAudit ───────────────────────────────────────────────────

describe('computeOverrideAudit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('counts overrides, groups byDispatcher, paginates', async () => {
    const assignments = [
      {
        id: 'a1', loadId: 'l1', driverId: 'd1', overrideReason: 'Union rate', createdBy: 'user-1',
        createdAt: new Date('2026-05-10'), payType: 'PER_MILE', baseRate: D(1.5), rateUnit: 'PER_MILE',
        load: { id: 'l1', referenceNumber: 'R1' },
        driver: { id: 'd1', firstName: 'John', lastName: 'Doe' },
      },
      {
        id: 'a2', loadId: 'l2', driverId: 'd2', overrideReason: 'Special cargo', createdBy: 'user-1',
        createdAt: new Date('2026-05-11'), payType: null, baseRate: null, rateUnit: null,
        load: { id: 'l2', referenceNumber: null },
        driver: { id: 'd2', firstName: 'Jane', lastName: 'Smith' },
      },
      {
        id: 'a3', loadId: 'l3', driverId: 'd3', overrideReason: 'Manager approval', createdBy: 'user-2',
        createdAt: new Date('2026-05-12'), payType: null, baseRate: null, rateUnit: null,
        load: { id: 'l3', referenceNumber: 'R3' },
        driver: { id: 'd3', firstName: 'Bob', lastName: 'Jones' },
      },
    ];

    const prisma = {
      loadDriverAssignment: {
        findMany: vi.fn().mockResolvedValueOnce(assignments).mockResolvedValueOnce([]),
      },
    };

    const result = await computeOverrideAudit(prisma as never, TENANT, range, { page: 1, pageSize: 25 });

    expect(result.bigNumber).toBe(3);
    expect(result.totalCount).toBe(3);

    const user1 = result.byDispatcher.find((d) => d.createdBy === 'user-1');
    const user2 = result.byDispatcher.find((d) => d.createdBy === 'user-2');
    expect(user1?.count).toBe(2);
    expect(user2?.count).toBe(1);
  });
});

// ─── computeDeductionBalances ───────────────────────────────────────────────

describe('computeDeductionBalances', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters out zero-remaining and non-FIXED_INSTALLMENTS, computes bigNumber', async () => {
    const deductions = [
      {
        id: 'd1', tenantId: TENANT, driverId: 'dr1',
        deductionType: 'EQUIPMENT', schedule: 'FIXED_INSTALLMENTS',
        totalAmount: D(500), amountCollected: D(200),
        deletedAt: null,
        driver: { firstName: 'John', lastName: 'Doe' },
      },
      {
        id: 'd2', tenantId: TENANT, driverId: 'dr2',
        deductionType: 'LOAN', schedule: 'FIXED_INSTALLMENTS',
        totalAmount: D(300), amountCollected: D(300), // remaining = 0 → filtered out
        deletedAt: null,
        driver: { firstName: 'Jane', lastName: 'Smith' },
      },
      // schedule !== FIXED_INSTALLMENTS → already filtered at DB level (we mock it as excluded)
    ];

    const prisma = {
      driverDeduction: {
        findMany: vi.fn().mockResolvedValue(deductions),
      },
    };

    // Verify the where clause includes schedule: 'FIXED_INSTALLMENTS'
    const result = await computeDeductionBalances(prisma as never, TENANT, { page: 1, pageSize: 25 });

    // Only d1 has remaining > 0
    expect(result.rows).toHaveLength(1);
    // bigNumber = 500 - 200 = 300
    expect(result.bigNumber).toBe('300.00');
    expect(result.rows[0].deductionType).toBe('EQUIPMENT');
    expect(result.rows[0].remaining).toBe('300.00');
    expect(result.rows[0].percentComplete).toBe(40); // 200/500*100

    // Verify query included FIXED_INSTALLMENTS filter
    expect(prisma.driverDeduction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ schedule: 'FIXED_INSTALLMENTS' }),
      }),
    );
  });
});

// ─── computeSettlementHistory ───────────────────────────────────────────────

describe('computeSettlementHistory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sums only PAID for bigNumber, computes statusCounts, includes all rows', async () => {
    const makeSettlement = (id: string, status: string, netPay: number) => ({
      id,
      tenantId: TENANT,
      driverId: `driver-${id}`,
      periodStart: new Date('2026-05-01'),
      periodEnd: new Date('2026-05-07'),
      status,
      grossTaxable: D(netPay + 50),
      grossNonTaxable: D(0),
      totalDeductions: D(50),
      netPay: D(netPay),
      paidAt: status === 'PAID' ? new Date('2026-05-08') : null,
      deletedAt: null,
      driver: { firstName: 'Test', lastName: `Driver ${id}` },
    });

    const allSettlements = [
      makeSettlement('s1', 'PAID', 1000),
      makeSettlement('s2', 'PAID', 1000),
      makeSettlement('s3', 'PAID', 1000),
      makeSettlement('s4', 'DRAFT', 500),
      makeSettlement('s5', 'VOIDED', 300),
    ];
    const paidOnly = allSettlements.filter((s) => s.status === 'PAID');

    // computeSettlementHistory makes these findMany calls in order:
    // 1. page results (all statuses, paginated)
    // 2-6. computeRollingAvgNetPay per row (5 calls — one per settlement, returns [])
    // 7. PAID settlements for bigNumber
    // 8. all settlements for statusCounts
    // 9. prior period PAID settlements
    let callCount = 0;
    const prisma = {
      driverSettlement: {
        findMany: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.resolve(allSettlements); // page query
          // calls 2-6: computeRollingAvgNetPay (one per settlement row) → return []
          if (callCount >= 2 && callCount <= 6) return Promise.resolve([]);
          if (callCount === 7) return Promise.resolve(paidOnly);    // PAID for bigNumber
          if (callCount === 8) return Promise.resolve(allSettlements); // statusCounts
          return Promise.resolve([]); // prior period PAID
        }),
        count: vi.fn().mockResolvedValue(5),
      },
    };

    const result = await computeSettlementHistory(prisma as never, TENANT, range, {}, { page: 1, pageSize: 25 });

    // bigNumber = sum of PAID only: 3000
    expect(result.bigNumber).toBe('3000.00');
    expect(result.statusCounts.PAID).toBe(3);
    expect(result.statusCounts.DRAFT).toBe(1);
    expect(result.statusCounts.VOIDED).toBe(1);
    // Total rows returned = 5 (all statuses)
    expect(result.totalCount).toBe(5);
    expect(result.rows).toHaveLength(5);
  });
});
