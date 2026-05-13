/**
 * settlements-carryover.test.ts
 *
 * Tests garnishment carryover behavior:
 * - Capped deduction: amountCollected grows by the applied (capped) amount each period.
 * - FIXED_INSTALLMENTS eventually completes when amountCollected reaches totalAmount.
 *
 * Note: v1 carryover behavior — when a garnishment is capped, the system does NOT
 * bump amountCollected by the carryover portion. The next period re-requests the
 * same amountPerPeriod and is again subject to the cap. This is documented behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';

import { generateSettlementForDriver } from '@/lib/driver-pay/settlement-generator';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeComponent(grossAmount: string) {
  return {
    id: `comp-${Math.random()}`,
    category: 'BASE_PAY',
    isTaxable: true,
    grossAmount: { toString: () => grossAmount },
    isReimbursement: false,
    deletedAt: null,
  };
}

function makeAssignment(grossAmount: string) {
  return {
    id: `asgn-${Math.random()}`,
    payComponents: [makeComponent(grossAmount)],
    load: { id: 'load-1', referenceNumber: 'L-001', status: 'DELIVERED' },
    approvedAt: new Date('2026-04-10'),
  };
}

function makeDeduction(opts: {
  id: string;
  schedule: string;
  amountPerPeriod: string;
  totalAmount?: string | null;
  amountCollected?: string;
  maxPercentageOfNet?: string | null;
}) {
  return {
    id: opts.id,
    schedule: opts.schedule,
    amountPerPeriod: { toString: () => opts.amountPerPeriod },
    totalAmount: opts.totalAmount ? { toString: () => opts.totalAmount } : null,
    amountCollected: { toString: () => opts.amountCollected ?? '0.00' },
    maxPercentageOfNet: opts.maxPercentageOfNet
      ? { toString: () => opts.maxPercentageOfNet }
      : null,
    paused: false,
    deletedAt: null,
  };
}

function makeMockPrisma(opts: {
  assignment: ReturnType<typeof makeAssignment>;
  deduction: ReturnType<typeof makeDeduction>;
  capturedIncrement?: { value: string | null };
}) {
  const createdSettlement = {
    id: 'settlement-1',
    tenantId: 'tenant-A',
    driverId: 'driver-1',
    periodStart: new Date('2026-04-08'),
    periodEnd: new Date('2026-04-14'),
    status: 'DRAFT',
    settlementReference: 'SET-REF',
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-1',
    deletedAt: null,
  };

  const txClient = {
    driverSettlement: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(createdSettlement),
    },
    loadDriverAssignment: {
      findMany: vi.fn().mockResolvedValue([opts.assignment]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    driverBonus: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    driverDeduction: {
      findMany: vi.fn().mockResolvedValue([opts.deduction]),
      update: vi.fn().mockImplementation(({ data }: { data: { amountCollected?: { increment: unknown } } }) => {
        if (opts.capturedIncrement && data.amountCollected?.increment !== undefined) {
          opts.capturedIncrement.value = String(data.amountCollected.increment);
        }
        return Promise.resolve({});
      }),
    },
    driverPayAuditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ id: opts.assignment.id }]),
  };

  const prisma = {
    $transaction: vi
      .fn()
      .mockImplementation(
        async (fn: (tx: typeof txClient) => Promise<unknown>, _opts?: unknown) => {
          return fn(txClient);
        },
      ),
  };

  return { prisma, txClient };
}

const BASE_INPUT = {
  tenantId: 'tenant-A',
  driverId: 'driver-1',
  periodStart: new Date('2026-04-08'),
  periodEnd: new Date('2026-04-14'),
  actorUserId: 'user-1',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('settlement-generator — carryover', () => {
  beforeEach(() => vi.clearAllMocks());

  it('garnishment cap — period 1 applies $250 (25% cap), period 2 also applies $250', async () => {
    // Period 1: gross=$1000, deduction requested=$400, cap=25%→$250 applied
    const capturedPeriod1 = { value: null as string | null };
    const deductionPeriod1 = makeDeduction({
      id: 'ded-garnish',
      schedule: 'EVERY_SETTLEMENT',
      amountPerPeriod: '400.00',
      maxPercentageOfNet: '25',
      amountCollected: '0.00',
    });
    const { prisma: prisma1 } = makeMockPrisma({
      assignment: makeAssignment('1000.00'),
      deduction: deductionPeriod1,
      capturedIncrement: capturedPeriod1,
    });

    const result1 = await generateSettlementForDriver(prisma1 as never, BASE_INPUT);

    expect(result1.settlement.totalDeductions.toFixed(2)).toBe('250.00');
    expect(result1.settlement.netPay.toFixed(2)).toBe('750.00');
    expect(result1.carryoverApplied.toFixed(2)).toBe('150.00');

    // Period 2: same scenario — amountCollected=$250 now, but still requests $400
    // cap still 25% of $1000 = $250
    const capturedPeriod2 = { value: null as string | null };
    const deductionPeriod2 = makeDeduction({
      id: 'ded-garnish',
      schedule: 'EVERY_SETTLEMENT',
      amountPerPeriod: '400.00',
      maxPercentageOfNet: '25',
      amountCollected: '250.00', // from period 1
    });
    const { prisma: prisma2 } = makeMockPrisma({
      assignment: makeAssignment('1000.00'),
      deduction: deductionPeriod2,
      capturedIncrement: capturedPeriod2,
    });

    const result2 = await generateSettlementForDriver(prisma2 as never, {
      ...BASE_INPUT,
      periodStart: new Date('2026-04-15'),
      periodEnd: new Date('2026-04-21'),
    });

    expect(result2.settlement.totalDeductions.toFixed(2)).toBe('250.00');
    expect(result2.settlement.netPay.toFixed(2)).toBe('750.00');

    // Over 2 periods: $500 collected, $300 uncollected (v1 carryover behavior)
    const total = new Decimal(capturedPeriod2.value ?? '0').plus(new Decimal(capturedPeriod1.value ?? '0'));
    expect(total.toFixed(2)).toBe('500.00');
  });

  it('FIXED_INSTALLMENTS deduction completes when amountCollected reaches totalAmount', async () => {
    // Period 1: $250 applied → amountCollected = $250
    const ded1 = makeDeduction({
      id: 'ded-fixed',
      schedule: 'FIXED_INSTALLMENTS',
      amountPerPeriod: '250.00',
      totalAmount: '500.00',
      amountCollected: '0.00',
    });
    const { prisma: p1 } = makeMockPrisma({ assignment: makeAssignment('2000.00'), deduction: ded1 });
    const r1 = await generateSettlementForDriver(p1 as never, BASE_INPUT);
    expect(r1.settlement.totalDeductions.toFixed(2)).toBe('250.00');

    // Period 2: $250 applied → amountCollected = $500 (totalAmount reached)
    const ded2 = makeDeduction({
      id: 'ded-fixed',
      schedule: 'FIXED_INSTALLMENTS',
      amountPerPeriod: '250.00',
      totalAmount: '500.00',
      amountCollected: '250.00',
    });
    const { prisma: p2 } = makeMockPrisma({ assignment: makeAssignment('2000.00'), deduction: ded2 });
    const r2 = await generateSettlementForDriver(p2 as never, {
      ...BASE_INPUT,
      periodStart: new Date('2026-04-15'),
      periodEnd: new Date('2026-04-21'),
    });
    expect(r2.settlement.totalDeductions.toFixed(2)).toBe('250.00');

    // Period 3: amountCollected=$500 = totalAmount → deduction fully collected, skip
    const ded3 = makeDeduction({
      id: 'ded-fixed',
      schedule: 'FIXED_INSTALLMENTS',
      amountPerPeriod: '250.00',
      totalAmount: '500.00',
      amountCollected: '500.00', // fully paid
    });
    // Simulate DB returning no deduction (fully paid filtered or remaining=0)
    const { prisma: p3, txClient: tc3 } = makeMockPrisma({ assignment: makeAssignment('2000.00'), deduction: ded3 });
    // Override driverDeduction.findMany to return the fully-paid deduction
    // The generator will skip it because remaining = totalAmount - amountCollected = 0
    const r3 = await generateSettlementForDriver(p3 as never, {
      ...BASE_INPUT,
      periodStart: new Date('2026-04-22'),
      periodEnd: new Date('2026-04-28'),
    });
    expect(r3.settlement.totalDeductions.toFixed(2)).toBe('0.00');
    expect(tc3.driverDeduction.update).not.toHaveBeenCalled();
  });
});
