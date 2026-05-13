/**
 * Regression tests for settlement-generator.ts — spec section 10.4.
 *
 * These tests use a lightweight Prisma mock (vi.fn) so no database is needed.
 * All money assertions use .toFixed(2) string comparison to avoid float drift.
 */

import { describe, it, expect, vi } from 'vitest';
import Decimal from 'decimal.js';
import {
  generateSettlementForDriver,
  SettlementOverlapError,
} from '@/lib/driver-pay/settlement-generator';
import type { PrismaClient } from '@/generated/prisma';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns an object whose .toString() returns value — satisfies Prisma Decimal shape */
function dec(value: string | number) {
  return { toString: () => String(value) };
}

const TENANT_ID = 'tenant-aaaa';
const DRIVER_ID = 'driver-bbbb';
const ACTOR_ID = 'actor-cccc';
const ASSIGNMENT_ID = 'asgn-1111';
const periodStart = new Date('2026-05-01T00:00:00Z');
const periodEnd = new Date('2026-05-15T23:59:59Z');

const BASE_INPUT = {
  tenantId: TENANT_ID,
  driverId: DRIVER_ID,
  periodStart,
  periodEnd,
  actorUserId: ACTOR_ID,
};

interface MockOpts {
  overlapping?: { id: string } | null;
  lockedRows?: Array<{ id: string }>;
  assignments?: unknown[];
  bonuses?: unknown[];
  deductions?: unknown[];
}

function makeComponent(
  category: string,
  grossAmount: string,
  isTaxable: boolean,
) {
  return { category, grossAmount: dec(grossAmount), isTaxable, deletedAt: null };
}

function makeAssignment(components: ReturnType<typeof makeComponent>[]) {
  return {
    id: ASSIGNMENT_ID,
    payComponents: components,
    load: { id: 'load-1', referenceNumber: 'REF-1', status: 'DELIVERED' },
  };
}

function makeDeduction(opts: {
  id?: string;
  schedule?: string;
  amountPerPeriod: string;
  amountCollected?: string;
  totalAmount?: string | null;
  maxPercentageOfNet?: string | null;
}) {
  return {
    id: opts.id ?? 'ded-1',
    schedule: opts.schedule ?? 'EVERY_SETTLEMENT',
    amountPerPeriod: dec(opts.amountPerPeriod),
    amountCollected: dec(opts.amountCollected ?? '0'),
    totalAmount: opts.totalAmount !== undefined && opts.totalAmount !== null
      ? dec(opts.totalAmount)
      : null,
    maxPercentageOfNet: opts.maxPercentageOfNet !== undefined && opts.maxPercentageOfNet !== null
      ? dec(opts.maxPercentageOfNet)
      : null,
    paused: false,
    deletedAt: null,
  };
}

function makeMockPrisma(opts: MockOpts = {}): PrismaClient {
  let settlementIdSeq = 0;

  const tx = {
    $queryRaw: vi.fn().mockResolvedValue(opts.lockedRows ?? [{ id: ASSIGNMENT_ID }]),
    driverSettlement: {
      findFirst: vi.fn().mockResolvedValue(opts.overlapping ?? null),
      create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => ({
        id: `settlement-${++settlementIdSeq}`,
        tenantId: TENANT_ID,
        driverId: DRIVER_ID,
        periodStart,
        periodEnd,
        status: 'DRAFT',
        settlementReference: args.data.settlementReference,
        notes: args.data.notes ?? null,
        createdBy: ACTOR_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    },
    loadDriverAssignment: {
      findMany: vi.fn().mockResolvedValue(opts.assignments ?? []),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    driverBonus: {
      findMany: vi.fn().mockResolvedValue(opts.bonuses ?? []),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    driverDeduction: {
      findMany: vi.fn().mockResolvedValue(opts.deductions ?? []),
      update: vi.fn().mockResolvedValue({}),
    },
    driverPayAuditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  };

  return {
    $transaction: vi.fn().mockImplementation(
      (cb: (tx: unknown) => unknown) => cb(tx),
    ),
  } as unknown as PrismaClient;
}

// ---------------------------------------------------------------------------
// Regression: load-level DEDUCTION component (negative gross_amount)
// ---------------------------------------------------------------------------

describe('regression — load-level DEDUCTION component', () => {
  it('DEDUCTION component (-$50) is counted in totalDeductions (not silently cancelled)', async () => {
    const prisma = makeMockPrisma({
      assignments: [
        makeAssignment([
          makeComponent('EARNING', '741.13', true),
          makeComponent('DEDUCTION', '-50.00', false),
        ]),
      ],
    });

    const result = await generateSettlementForDriver(prisma, BASE_INPUT);

    expect(result.settlement.grossTaxable.toFixed(2)).toBe('741.13');
    expect(result.settlement.grossNonTaxable.toFixed(2)).toBe('0.00');
    expect(result.settlement.totalDeductions.toFixed(2)).toBe('50.00');
    expect(result.settlement.netPay.toFixed(2)).toBe('691.13');
  });

  it('DEDUCTION component does NOT flow into grossTaxable or grossNonTaxable', async () => {
    const prisma = makeMockPrisma({
      assignments: [
        makeAssignment([
          makeComponent('BASE_PAY', '500.00', true),
          makeComponent('DEDUCTION', '-100.00', false),
        ]),
      ],
    });

    const result = await generateSettlementForDriver(prisma, BASE_INPUT);

    // gross figures must not include the deduction amount
    expect(result.settlement.grossTaxable.toFixed(2)).toBe('500.00');
    expect(result.settlement.grossNonTaxable.toFixed(2)).toBe('0.00');
    expect(result.settlement.totalDeductions.toFixed(2)).toBe('100.00');
    expect(result.settlement.netPay.toFixed(2)).toBe('400.00');
  });
});

// ---------------------------------------------------------------------------
// Regression: recurring standalone deduction
// ---------------------------------------------------------------------------

describe('regression — recurring standalone deduction', () => {
  it('EVERY_SETTLEMENT deduction ($50) appears in totalDeductions with no load-level component', async () => {
    const prisma = makeMockPrisma({
      assignments: [
        makeAssignment([makeComponent('EARNING', '741.13', true)]),
      ],
      deductions: [makeDeduction({ amountPerPeriod: '50.00' })],
    });

    const result = await generateSettlementForDriver(prisma, BASE_INPUT);

    expect(result.settlement.totalDeductions.toFixed(2)).toBe('50.00');
    expect(result.settlement.netPay.toFixed(2)).toBe('691.13');
    expect(result.deductionCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Regression: combined (exact bug report fixture)
// ---------------------------------------------------------------------------

describe('regression — combined load-level DEDUCTION + recurring deduction', () => {
  it('both sources sum into totalDeductions; net_pay = 641.13', async () => {
    // Simulates the exact scenario from the bug report:
    //   grossTaxable  = 661.13 (BASE_PAY + Stop-Off + Retention bonus)
    //   grossNonTaxable = 80.00 (two Lumper Reimbursements, non-taxable)
    //   load DEDUCTION component = -50.00 (Advance Repayment)
    //   recurring ADVANCE deduction = 50.00 EVERY_SETTLEMENT
    const prisma = makeMockPrisma({
      assignments: [
        makeAssignment([
          makeComponent('BASE_PAY', '661.13', true),
          makeComponent('REIMBURSEMENT', '80.00', false),
          makeComponent('DEDUCTION', '-50.00', false),
        ]),
      ],
      deductions: [makeDeduction({ id: 'ded-advance', amountPerPeriod: '50.00' })],
    });

    const result = await generateSettlementForDriver(prisma, BASE_INPUT);

    expect(result.settlement.grossTaxable.toFixed(2)).toBe('661.13');
    expect(result.settlement.grossNonTaxable.toFixed(2)).toBe('80.00');
    expect(result.settlement.totalDeductions.toFixed(2)).toBe('100.00');
    expect(result.settlement.netPay.toFixed(2)).toBe('641.13');
  });

  it('FIXED_INSTALLMENTS deduction with remaining balance uses min(perPeriod, remaining)', async () => {
    const prisma = makeMockPrisma({
      assignments: [
        makeAssignment([makeComponent('EARNING', '1000.00', true)]),
      ],
      deductions: [
        makeDeduction({
          schedule: 'FIXED_INSTALLMENTS',
          amountPerPeriod: '100.00',
          totalAmount: '130.00',
          amountCollected: '80.00', // remaining = 50
        }),
      ],
    });

    const result = await generateSettlementForDriver(prisma, BASE_INPUT);

    // remaining = 130 - 80 = 50; min(100, 50) = 50
    expect(result.settlement.totalDeductions.toFixed(2)).toBe('50.00');
    expect(result.settlement.netPay.toFixed(2)).toBe('950.00');
  });

  it('FIXED_INSTALLMENTS deduction fully collected is skipped', async () => {
    const prisma = makeMockPrisma({
      assignments: [
        makeAssignment([makeComponent('EARNING', '1000.00', true)]),
      ],
      deductions: [
        makeDeduction({
          schedule: 'FIXED_INSTALLMENTS',
          amountPerPeriod: '100.00',
          totalAmount: '300.00',
          amountCollected: '300.00', // fully collected
        }),
      ],
    });

    const result = await generateSettlementForDriver(prisma, BASE_INPUT);

    expect(result.settlement.totalDeductions.toFixed(2)).toBe('0.00');
    expect(result.settlement.netPay.toFixed(2)).toBe('1000.00');
    expect(result.deductionCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Garnishment cap (maxPercentageOfNet) — must still be applied first
// ---------------------------------------------------------------------------

describe('garnishment cap still applied before adding to totalDeductions', () => {
  it('deduction capped at 30% of net; carryover recorded', async () => {
    // grossTotal = 100; deduction requested $50; cap = 30% × 100 = $30
    const prisma = makeMockPrisma({
      assignments: [
        makeAssignment([makeComponent('EARNING', '100.00', true)]),
      ],
      deductions: [
        makeDeduction({
          amountPerPeriod: '50.00',
          maxPercentageOfNet: '30',
        }),
      ],
    });

    const result = await generateSettlementForDriver(prisma, BASE_INPUT);

    expect(result.settlement.totalDeductions.toFixed(2)).toBe('30.00');
    expect(result.settlement.netPay.toFixed(2)).toBe('70.00');
    expect(result.carryoverApplied.toFixed(2)).toBe('20.00');
  });

  it('garnishment cap applies AFTER load-level DEDUCTION components reduce available net', async () => {
    // grossTotal = 100; componentDeduction = 20; net before recurring = 80
    // recurring $50 capped at 25% × 80 = $20
    const prisma = makeMockPrisma({
      assignments: [
        makeAssignment([
          makeComponent('EARNING', '100.00', true),
          makeComponent('DEDUCTION', '-20.00', false),
        ]),
      ],
      deductions: [
        makeDeduction({
          amountPerPeriod: '50.00',
          maxPercentageOfNet: '25',
        }),
      ],
    });

    const result = await generateSettlementForDriver(prisma, BASE_INPUT);

    // netBeforeThis = 100 - 20 = 80; cap = 25% × 80 = 20; applied = min(50, 20) = 20
    expect(result.settlement.totalDeductions.toFixed(2)).toBe('40.00');
    expect(result.settlement.netPay.toFixed(2)).toBe('60.00');
    expect(result.carryoverApplied.toFixed(2)).toBe('30.00');
  });

  it('net pay is clamped to 0 and never goes negative', async () => {
    const prisma = makeMockPrisma({
      assignments: [
        makeAssignment([makeComponent('EARNING', '50.00', true)]),
      ],
      deductions: [makeDeduction({ amountPerPeriod: '200.00' })],
    });

    const result = await generateSettlementForDriver(prisma, BASE_INPUT);

    expect(result.settlement.netPay.toFixed(2)).toBe('0.00');
    expect(result.settlement.totalDeductions.toFixed(2)).toBe('200.00');
  });
});

// ---------------------------------------------------------------------------
// Overlap guard
// ---------------------------------------------------------------------------

describe('overlap guard', () => {
  it('throws SettlementOverlapError when a FINALIZED settlement already covers the period', async () => {
    const prisma = makeMockPrisma({
      overlapping: { id: 'existing-settlement-id' },
    });

    await expect(
      generateSettlementForDriver(prisma, BASE_INPUT),
    ).rejects.toBeInstanceOf(SettlementOverlapError);
  });

  it('SettlementOverlapError carries the conflicting settlement ID', async () => {
    const prisma = makeMockPrisma({
      overlapping: { id: 'conflict-xyz' },
    });

    await expect(
      generateSettlementForDriver(prisma, BASE_INPUT),
    ).rejects.toMatchObject({ conflictingSettlementId: 'conflict-xyz' });
  });
});

// ---------------------------------------------------------------------------
// Empty-period edge case
// ---------------------------------------------------------------------------

describe('empty period', () => {
  it('produces zero totals and zero net pay when no assignments/bonuses/deductions exist', async () => {
    const prisma = makeMockPrisma({
      lockedRows: [],
      assignments: [],
      bonuses: [],
      deductions: [],
    });

    const result = await generateSettlementForDriver(prisma, BASE_INPUT);

    expect(result.settlement.grossTaxable.toFixed(2)).toBe('0.00');
    expect(result.settlement.grossNonTaxable.toFixed(2)).toBe('0.00');
    expect(result.settlement.totalDeductions.toFixed(2)).toBe('0.00');
    expect(result.settlement.netPay.toFixed(2)).toBe('0.00');
    expect(result.assignmentCount).toBe(0);
    expect(result.bonusCount).toBe(0);
    expect(result.deductionCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Non-taxable bonus flows to grossNonTaxable
// ---------------------------------------------------------------------------

describe('bonus routing', () => {
  it('non-taxable bonus flows to grossNonTaxable, not grossTaxable', async () => {
    const bonus = {
      id: 'bonus-1',
      amount: dec('75.00'),
      isTaxable: false,
      paidAt: null,
      settlementId: null,
      scheduledPayDate: new Date('2026-05-10'),
      deletedAt: null,
    };

    const prisma = makeMockPrisma({
      lockedRows: [],
      assignments: [],
      bonuses: [bonus],
    });

    const result = await generateSettlementForDriver(prisma, BASE_INPUT);

    expect(result.settlement.grossTaxable.toFixed(2)).toBe('0.00');
    expect(result.settlement.grossNonTaxable.toFixed(2)).toBe('75.00');
    expect(result.settlement.netPay.toFixed(2)).toBe('75.00');
    expect(result.bonusCount).toBe(1);
  });

  it('taxable bonus flows to grossTaxable', async () => {
    const bonus = {
      id: 'bonus-2',
      amount: dec('200.00'),
      isTaxable: true,
      paidAt: null,
      settlementId: null,
      scheduledPayDate: new Date('2026-05-10'),
      deletedAt: null,
    };

    const prisma = makeMockPrisma({
      lockedRows: [],
      assignments: [],
      bonuses: [bonus],
    });

    const result = await generateSettlementForDriver(prisma, BASE_INPUT);

    expect(result.settlement.grossTaxable.toFixed(2)).toBe('200.00');
    expect(result.settlement.grossNonTaxable.toFixed(2)).toBe('0.00');
    expect(result.settlement.netPay.toFixed(2)).toBe('200.00');
  });
});
