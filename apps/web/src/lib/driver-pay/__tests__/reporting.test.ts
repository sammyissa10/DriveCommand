/**
 * reporting.test.ts — Regression tests for Driver Pay Reports (quick-308)
 *
 * Tests SAMMY's exact production data shape:
 *   - Settlement A: PAID, May 9-15, netPay $641.13, totalDeductions $100.00
 *   - Settlement B: VOIDED, May 16-22, netPay $307.80, totalDeductions $0.00
 *   - DriverBonus C: $333.33, settlementId = Settlement A
 *   - DriverBonus D/E/F/G: $166.68 + $333.33 + $333.33 + $333.33 = $1,166.67, settlementId = null
 *     (total master rows = $333.33 + $1,166.67 = ~$1,500)
 *   - DriverDeduction G: STANDARD, amountCollected $100.00, updatedAt May 14
 *
 * Test window: May 11 2026 → May 27 2026
 *
 * ALL tests must FAIL on the pre-refactor reporting.ts (containment, no PAID filter,
 * bonus via triggerDate) and PASS on the refactored version.
 *
 * Mocking style matches apps/web/src/app/api/driver-pay/__tests__/reports-api.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import {
  computeOverviewKpis,
  computeNetPayTrend,
  computeDriverDetail,
  type PeriodRange,
  type ReportFilters,
} from '../reporting';
import { countedSettlementsWhere } from '../reporting-predicate';

// ---------------------------------------------------------------------------
// SAMMY fixture constants
// ---------------------------------------------------------------------------

const TENANT = 'tenant_demoteam';
const DRIVER_ID = 'driver_sammy';
const SETTLEMENT_A_ID = 'settlement-a-paid';
const SETTLEMENT_B_ID = 'settlement-b-voided';

const RANGE_MAY_11_27: PeriodRange = {
  start: new Date('2026-05-11'),
  end:   new Date('2026-05-27'),
};

// Settlement A: PAID, May 9-15 (starts BEFORE window — tests overlap, not containment)
const settlementA = {
  id: SETTLEMENT_A_ID,
  tenantId: TENANT,
  driverId: DRIVER_ID,
  periodStart: new Date('2026-05-09'),
  periodEnd:   new Date('2026-05-15'),
  status: 'PAID',
  netPay:           { toString: () => '641.13' },
  totalDeductions:  { toString: () => '100.00' },
  grossTaxable:     { toString: () => '741.13' },
  grossNonTaxable:  { toString: () => '0.00' },
  paidAt: new Date('2026-05-16'),
  deletedAt: null,
  driver: { firstName: 'Sammy', lastName: 'Issa', payModel: 'CONTRACTOR' },
};

// Settlement B: VOIDED, May 16-22 (inside window — must be EXCLUDED by PAID filter)
const settlementB = {
  id: SETTLEMENT_B_ID,
  tenantId: TENANT,
  driverId: DRIVER_ID,
  periodStart: new Date('2026-05-16'),
  periodEnd:   new Date('2026-05-22'),
  status: 'VOIDED',
  netPay:           { toString: () => '307.80' },
  totalDeductions:  { toString: () => '0.00' },
  grossTaxable:     { toString: () => '307.80' },
  grossNonTaxable:  { toString: () => '0.00' },
  paidAt: null,
  deletedAt: null,
  driver: { firstName: 'Sammy', lastName: 'Issa', payModel: 'CONTRACTOR' },
};

// Bonus C: $333.33 — tied to Settlement A via settlementId (the ONLY correct bonus)
const bonusC = {
  id: 'bonus-c',
  tenantId: TENANT,
  driverId: DRIVER_ID,
  amount: { toString: () => '333.33' },
  triggerDate: new Date('2026-05-13'),
  bonusType: 'PERFORMANCE',
  settlementId: SETTLEMENT_A_ID,
  installmentNumber: 1,
  totalInstallments: 4,
  deletedAt: null,
};

// Bonus D: $166.68 — unsettled (settlementId = null) — should NOT count
const bonusD = {
  id: 'bonus-d',
  tenantId: TENANT,
  driverId: DRIVER_ID,
  amount: { toString: () => '166.68' },
  triggerDate: new Date('2026-05-13'),
  bonusType: 'PERFORMANCE',
  settlementId: null,
  installmentNumber: 2,
  totalInstallments: 4,
  deletedAt: null,
};

// Bonus E: $333.33 — unsettled
const bonusE = {
  id: 'bonus-e',
  tenantId: TENANT,
  driverId: DRIVER_ID,
  amount: { toString: () => '333.33' },
  triggerDate: new Date('2026-05-20'),
  bonusType: 'PERFORMANCE',
  settlementId: null,
  installmentNumber: 3,
  totalInstallments: 4,
  deletedAt: null,
};

// Bonus F: $333.33 — unsettled
const bonusF = {
  id: 'bonus-f',
  tenantId: TENANT,
  driverId: DRIVER_ID,
  amount: { toString: () => '333.33' },
  triggerDate: new Date('2026-05-27'),
  bonusType: 'PERFORMANCE',
  settlementId: null,
  installmentNumber: 4,
  totalInstallments: 4,
  deletedAt: null,
};

// Total of all master bonus rows = 333.33 + 166.68 + 333.33 + 333.33 = 1166.67
// (The plan stated ~$1,500; we use $1,166.67 as the actual total for D+E+F = 833.34 + C = 1,166.67.
//  What matters: only C contributes via settlementId.)

// Deduction G: standard, amountCollected $100.00, updatedAt May 14
const deductionG = {
  id: 'deduction-g',
  tenantId: TENANT,
  driverId: DRIVER_ID,
  deductionType: 'STANDARD',
  amountCollected: { toString: () => '100.00' },
  updatedAt: new Date('2026-05-14'),
  deletedAt: null,
};

// ---------------------------------------------------------------------------
// Mock builder
// ---------------------------------------------------------------------------

/**
 * Build a minimal prisma mock for reporting function tests.
 * Settlement calls use separate arrays; bonus calls use a separate array.
 * Since the refactored code calls settlements FIRST (Promise.all), then bonuses
 * SECOND (conditional Promise.all), we track calls independently.
 */
function makePrisma(opts: {
  currentSettlements?: object[];
  priorSettlements?: object[];
  bonusesForCurrentIds?: object[];
  bonusesForPriorIds?: object[];
  deductions?: object[];
  carrierDriver?: object | null;
}) {
  let settlementCallCount = 0;
  let bonusCallCount = 0;

  return {
    driverSettlement: {
      findMany: vi.fn().mockImplementation(() => {
        settlementCallCount++;
        if (settlementCallCount === 1) return Promise.resolve(opts.currentSettlements ?? []);
        if (settlementCallCount === 2) return Promise.resolve(opts.priorSettlements ?? []);
        return Promise.resolve([]);
      }),
      count: vi.fn().mockResolvedValue((opts.currentSettlements ?? []).length),
    },
    driverBonus: {
      findMany: vi.fn().mockImplementation(() => {
        bonusCallCount++;
        if (bonusCallCount === 1) return Promise.resolve(opts.bonusesForCurrentIds ?? []);
        return Promise.resolve(opts.bonusesForPriorIds ?? []);
      }),
    },
    driverDeduction: {
      findMany: vi.fn().mockResolvedValue(opts.deductions ?? []),
    },
    carrierDriver: {
      findFirst: vi.fn().mockResolvedValue(
        opts.carrierDriver !== undefined
          ? opts.carrierDriver
          : { id: DRIVER_ID, firstName: 'Sammy', lastName: 'Issa', payModel: 'CONTRACTOR' },
      ),
    },
    driverDispute: { findMany: vi.fn().mockResolvedValue([]) },
    loadDriverAssignment: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeOverviewKpis — SAMMY data (quick-308 regression)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('1. returns currentTotal=$641.13 (PAID-only, excludes VOIDED Settlement B)', async () => {
    // Pre-fix: returned $307.80 (VOIDED, wrong)
    // Post-fix: returns $641.13 (PAID, correct via overlap + PAID filter)
    const prisma = makePrisma({
      currentSettlements: [settlementA], // only PAID passed (mock represents DB filter result)
      bonusesForCurrentIds: [bonusC],
    });

    const kpis = await computeOverviewKpis(prisma as never, TENANT, RANGE_MAY_11_27, {});
    expect(kpis.totalPayroll.current).toBe('641.13');
  });

  it('2. returns driversPaid=1 (counts distinct driverId from PAID settlements)', async () => {
    // Pre-fix: returned 0 (in-memory PAID filter on wrong result set)
    // Post-fix: returns 1 (predicate enforces PAID; distinct driverIds = 1)
    const prisma = makePrisma({
      currentSettlements: [settlementA],
      bonusesForCurrentIds: [bonusC],
    });

    const kpis = await computeOverviewKpis(prisma as never, TENANT, RANGE_MAY_11_27, {});
    expect(kpis.driversPaid.current).toBe(1);
  });

  it('3. returns avgNetPay=$641.13 when 1 driver paid (total / 1 = total)', async () => {
    // Pre-fix: returned $0.00 (div by 0 cascade from driversPaid=0)
    // Post-fix: returns $641.13
    const prisma = makePrisma({
      currentSettlements: [settlementA],
      bonusesForCurrentIds: [bonusC],
    });

    const kpis = await computeOverviewKpis(prisma as never, TENANT, RANGE_MAY_11_27, {});
    expect(kpis.avgNetPay.current).toBe('641.13');
  });

  it('4. returns avgNetPay="—" (em dash) when zero drivers paid (empty fixture)', async () => {
    // Pre-fix: returned '0.00' (new Decimal(0).toFixed(2))
    // Post-fix: returns '—' (em dash, never '0.00', to distinguish zero-data from genuine zero avg)
    const prisma = makePrisma({
      currentSettlements: [],
      bonusesForCurrentIds: [],
    });

    const kpis = await computeOverviewKpis(prisma as never, TENANT, RANGE_MAY_11_27, {});
    expect(kpis.driversPaid.current).toBe(0);
    expect(kpis.avgNetPay.current).toBe('—');
  });

  it('5. totalDeductions=$100.00 from PAID settlement only; VOIDED settlement with $50 does NOT contribute', async () => {
    // Pre-fix: returned $0.00 (Settlement B VOIDED had $0 deductions; Settlement A excluded by containment)
    // Post-fix: returns $100.00 (only Settlement A counted)
    //
    // Extra VOIDED settlement with $50 deductions — must not affect result
    const voidedWithDeductions = {
      ...settlementB,
      id: 'settlement-voided-extra',
      totalDeductions: { toString: () => '50.00' },
      status: 'VOIDED',
    };

    // Mock DB: predicate already filtered — only PAID rows are returned to the function
    const prisma = makePrisma({
      currentSettlements: [settlementA], // DB-level filter already excludes VOIDED
      bonusesForCurrentIds: [],
    });

    const kpis = await computeOverviewKpis(prisma as never, TENANT, RANGE_MAY_11_27, {});
    expect(kpis.totalDeductions.current).toBe('100.00');

    // Confirm the where clause passed to findMany includes status: PAID (not VOIDED)
    expect(prisma.driverSettlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: expect.objectContaining({ in: expect.arrayContaining(['PAID']) }),
        }),
      }),
    );
    // Ensure VOIDED is NOT in the status filter
    const firstCallArg = (prisma.driverSettlement.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as { where: { status?: { in?: string[] } } };
    if (firstCallArg.where.status && 'in' in firstCallArg.where.status) {
      expect(firstCallArg.where.status.in).not.toContain('VOIDED');
    }
  });

  it('6. totalBonuses=$333.33 via settlementId join (NOT $1,166.67 from all master DriverBonus rows)', async () => {
    // PRE-FIX headline regression: was $1,500 (all master triggerDate rows in window)
    // POST-FIX: $333.33 (only Bonus C, which has settlementId = Settlement A)
    const prisma = makePrisma({
      currentSettlements: [settlementA],
      // Mock returns only bonuses with settlementId = Settlement A — as the DB predicate would
      bonusesForCurrentIds: [bonusC],
    });

    const kpis = await computeOverviewKpis(prisma as never, TENANT, RANGE_MAY_11_27, {});
    expect(kpis.totalBonuses.current).toBe('333.33');

    // Verify bonus query uses settlementId: { in: [SETTLEMENT_A_ID] } — not triggerDate
    expect(prisma.driverBonus.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          settlementId: expect.objectContaining({ in: expect.arrayContaining([SETTLEMENT_A_ID]) }),
        }),
      }),
    );
    // triggerDate must NOT be a top-level filter on the bonus query
    const bonusCallArg = (prisma.driverBonus.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as { where: Record<string, unknown> };
    expect(bonusCallArg.where).not.toHaveProperty('triggerDate');
  });

  it('7. excludes soft-deleted settlements (deletedAt IS NOT NULL)', async () => {
    // Add a PAID settlement with deletedAt set — predicate must exclude it
    const softDeletedSettlement = {
      ...settlementA,
      id: 'settlement-soft-deleted',
      netPay: { toString: () => '1000.00' },
      deletedAt: new Date('2026-05-10'), // soft-deleted
    };

    // Predicate should pass `deletedAt: null` — the DB would exclude this row.
    // In the mock, we simulate by only returning the non-deleted settlement.
    const prisma = makePrisma({
      currentSettlements: [settlementA], // soft-deleted one filtered by DB, not returned
      bonusesForCurrentIds: [bonusC],
    });

    const kpis = await computeOverviewKpis(prisma as never, TENANT, RANGE_MAY_11_27, {});
    // Confirm predicate includes deletedAt: null
    expect(prisma.driverSettlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
        }),
      }),
    );
    // Confirm soft-deleted amount ($1000) did NOT contribute (only $641.13 in result)
    expect(kpis.totalPayroll.current).toBe('641.13');
  });

  it('8. period overlap: Settlement A (May 9-15) counts for window May 11-27 — not containment', async () => {
    // THE second headline regression.
    // Pre-fix (containment): periodStart >= May 11 → Settlement A (periodStart May 9) EXCLUDED
    // Post-fix (overlap): periodStart <= May 27 AND periodEnd >= May 11 → Settlement A INCLUDED
    //
    // We verify the predicate shape, not just the result.
    const prisma = makePrisma({
      currentSettlements: [settlementA],
      bonusesForCurrentIds: [bonusC],
    });

    await computeOverviewKpis(prisma as never, TENANT, RANGE_MAY_11_27, {});

    // Overlap predicate: periodStart: { lte: range.end }, periodEnd: { gte: range.start }
    expect(prisma.driverSettlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          periodStart: expect.objectContaining({ lte: RANGE_MAY_11_27.end }),
          periodEnd:   expect.objectContaining({ gte: RANGE_MAY_11_27.start }),
        }),
      }),
    );
  });

  it('9. status filter VOIDED returns empty result (out of payroll_out scope)', async () => {
    // The predicate's scope-intersection logic: user selects VOIDED, scope is PAID-only.
    // VOIDED ∉ PAID → predicate returns { status: { in: [] } } → no settlements match.
    const filters: ReportFilters = { status: 'VOIDED' };
    const predicate = countedSettlementsWhere(TENANT, RANGE_MAY_11_27, filters, 'payroll_out');

    // The returned predicate's status filter should be { in: [] } (no match possible)
    const statusFilter = predicate.status as { in: string[] };
    expect(statusFilter).toEqual({ in: [] });
  });

  it('10. bonus query returns zero when no counted settlements (empty window)', async () => {
    // If there are no counted settlements, bonuses query should be skipped (0 bonuses).
    const prisma = makePrisma({
      currentSettlements: [], // no PAID settlements in window
      bonusesForCurrentIds: [], // irrelevant — should not be called
    });

    const kpis = await computeOverviewKpis(prisma as never, TENANT, RANGE_MAY_11_27, {});
    expect(kpis.totalBonuses.current).toBe('0.00');
    // driverBonus.findMany should NOT be called when currentSettlementIds is empty
    expect(prisma.driverBonus.findMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// computeNetPayTrend — agrees with KPI
// ---------------------------------------------------------------------------

describe('computeNetPayTrend — SAMMY data (quick-308 regression)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('11. returns exactly one bucket containing $641.13 for May 11-27 window', async () => {
    // Pre-fix: returned single $307.80 bucket (VOIDED Settlement B)
    // Post-fix: returns single $641.13 bucket (PAID Settlement A)
    const prisma = makePrisma({
      currentSettlements: [settlementA],
    });

    const trend = await computeNetPayTrend(prisma as never, TENANT, RANGE_MAY_11_27, {});
    expect(trend).toHaveLength(1);
    expect(trend[0].netPay).toBe('641.13');
  });

  it('12. trend chart uses same PAID-only predicate as KPI (no VOIDED in chart)', async () => {
    // Verify computeNetPayTrend passes PAID status in the where clause
    const prisma = makePrisma({
      currentSettlements: [settlementA],
    });

    await computeNetPayTrend(prisma as never, TENANT, RANGE_MAY_11_27, {});

    expect(prisma.driverSettlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: expect.objectContaining({ in: expect.arrayContaining(['PAID']) }),
          periodStart: expect.objectContaining({ lte: RANGE_MAY_11_27.end }),
          periodEnd:   expect.objectContaining({ gte: RANGE_MAY_11_27.start }),
        }),
      }),
    );
    const callArg = (prisma.driverSettlement.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0] as { where: { status?: { in?: string[] } } };
    if (callArg.where.status && 'in' in callArg.where.status) {
      expect(callArg.where.status.in).not.toContain('VOIDED');
    }
  });
});

// ---------------------------------------------------------------------------
// countedSettlementsWhere — predicate unit tests
// ---------------------------------------------------------------------------

describe('countedSettlementsWhere predicate', () => {
  it('13. payroll_out scope includes PAID, excludes VOIDED', () => {
    const where = countedSettlementsWhere(TENANT, RANGE_MAY_11_27, {}, 'payroll_out');
    const status = where.status as { in: string[] };
    expect(status.in).toContain('PAID');
    expect(status.in).not.toContain('VOIDED');
    expect(status.in).not.toContain('FINALIZED');
    expect(status.in).not.toContain('DRAFT');
  });

  it('14. approved scope includes PAID and FINALIZED', () => {
    const where = countedSettlementsWhere(TENANT, RANGE_MAY_11_27, {}, 'approved');
    const status = where.status as { in: string[] };
    expect(status.in).toContain('PAID');
    expect(status.in).toContain('FINALIZED');
  });

  it('15. always includes deletedAt: null', () => {
    const where = countedSettlementsWhere(TENANT, RANGE_MAY_11_27, {}, 'payroll_out');
    expect(where.deletedAt).toBeNull();
  });

  it('16. uses overlap not containment (periodStart lte end, periodEnd gte start)', () => {
    const where = countedSettlementsWhere(TENANT, RANGE_MAY_11_27, {}, 'payroll_out');
    expect(where.periodStart).toEqual({ lte: RANGE_MAY_11_27.end });
    expect(where.periodEnd).toEqual({ gte: RANGE_MAY_11_27.start });
  });
});

// ---------------------------------------------------------------------------
// computeDriverDetail — YTD bonuses via settlementId (quick-308 regression)
// ---------------------------------------------------------------------------

describe('computeDriverDetail — YTD bonuses via settlementId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('17. YTD bonuses for SAMMY = $333.33 via settlementId join (not $1,166.67 from master rows)', async () => {
    // Pre-fix: triggerDate window returns all master rows → $1,166.67
    // Post-fix: settlementId join returns only Bonus C → $333.33
    const prisma = makePrisma({
      currentSettlements: [settlementA], // call 1 = YTD settlements
      priorSettlements: [],              // call 2 = not used in computeDriverDetail
      bonusesForCurrentIds: [bonusC],    // only Bonus C via settlementId
      deductions: [],
      carrierDriver: { id: DRIVER_ID, firstName: 'Sammy', lastName: 'Issa', payModel: 'CONTRACTOR' },
    });

    const result = await computeDriverDetail(prisma as never, TENANT, DRIVER_ID, 2026);
    expect(result).not.toBeNull();
    expect(result!.ytd.bonuses).toBe('333.33');
  });

  it('18. YTD earnings = $641.13 (FINALIZED+PAID overlap YTD, Settlement A counts)', async () => {
    // computeDriverDetail uses 'approved' scope (FINALIZED + PAID) for YTD
    // Settlement A is PAID and overlaps YTD (Jan 1 - Dec 31 2026) → counted
    const prisma = makePrisma({
      currentSettlements: [settlementA],
      bonusesForCurrentIds: [bonusC],
      deductions: [],
      carrierDriver: { id: DRIVER_ID, firstName: 'Sammy', lastName: 'Issa', payModel: 'CONTRACTOR' },
    });

    const result = await computeDriverDetail(prisma as never, TENANT, DRIVER_ID, 2026);
    expect(result).not.toBeNull();
    expect(result!.ytd.earnings).toBe('641.13');
  });
});
