/**
 * settlements-rerun.test.ts
 *
 * Tests that re-running generation after void correctly re-includes
 * previously settled assignments, and that overlapping periods are blocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  generateSettlementForDriver,
  SettlementOverlapError,
} from '@/lib/driver-pay/settlement-generator';

// ---------------------------------------------------------------------------
// Shared mock factory (same pattern as settlements-algorithm.test.ts)
// ---------------------------------------------------------------------------

function makeComponent(opts: { category: string; isTaxable: boolean; grossAmount: string }) {
  return {
    id: `comp-${Math.random()}`,
    category: opts.category,
    isTaxable: opts.isTaxable,
    grossAmount: { toString: () => opts.grossAmount },
    isReimbursement: false,
    deletedAt: null,
  };
}

function makeAssignment(id: string) {
  return {
    id,
    payComponents: [
      makeComponent({ category: 'BASE_PAY', isTaxable: true, grossAmount: '500.00' }),
    ],
    load: { id: 'load-1', referenceNumber: 'L-001', status: 'DELIVERED' },
    approvedAt: new Date('2026-04-10'),
  };
}

function makeMockPrisma(opts: {
  existingSettlement?: { id: string } | null;
  lockedRows?: Array<{ id: string }>;
  assignments?: ReturnType<typeof makeAssignment>[];
}) {
  const createdSettlement = {
    id: 'settlement-new',
    tenantId: 'tenant-A',
    driverId: 'driver-1',
    periodStart: new Date('2026-04-08'),
    periodEnd: new Date('2026-04-14'),
    status: 'DRAFT',
    settlementReference: 'SET-20260408-DRIVER-XYZ',
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-1',
    deletedAt: null,
  };

  const txClient = {
    driverSettlement: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          opts.existingSettlement !== undefined ? opts.existingSettlement : null,
        ),
      create: vi.fn().mockResolvedValue(createdSettlement),
    },
    loadDriverAssignment: {
      findMany: vi.fn().mockResolvedValue(opts.assignments ?? []),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    driverBonus: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    driverDeduction: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    driverPayAuditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $queryRaw: vi.fn().mockResolvedValue(opts.lockedRows ?? []),
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

describe('settlement-generator — rerun behavior', () => {
  beforeEach(() => vi.clearAllMocks());

  it('second generate run for same period/driver returns SettlementOverlapError (FINALIZED exists)', async () => {
    // Simulate a FINALIZED settlement exists for the same period
    const { prisma } = makeMockPrisma({
      existingSettlement: { id: 'existing-finalized' },
    });

    await expect(
      generateSettlementForDriver(prisma as never, BASE_INPUT),
    ).rejects.toThrow(SettlementOverlapError);
  });

  it('after VOID, re-running succeeds and includes assignments (settlementId=null again)', async () => {
    // After void, assignments have settlementId=null → appear in $queryRaw
    const { prisma, txClient } = makeMockPrisma({
      existingSettlement: null, // no overlap
      lockedRows: [{ id: 'asgn-1' }, { id: 'asgn-2' }],
      assignments: [makeAssignment('asgn-1'), makeAssignment('asgn-2')],
    });

    const result = await generateSettlementForDriver(prisma as never, BASE_INPUT);

    expect(result.assignmentCount).toBe(2);
    expect(txClient.loadDriverAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['asgn-1', 'asgn-2'] } }),
        data: expect.objectContaining({ settlementId: 'settlement-new' }),
      }),
    );
  });

  it('non-overlapping period creates a separate settlement', async () => {
    // Period Apr 15–21 (different from Apr 8–14) — no overlap expected
    const { prisma } = makeMockPrisma({
      existingSettlement: null, // DB returns no overlap for the new period
      lockedRows: [{ id: 'asgn-3' }],
      assignments: [makeAssignment('asgn-3')],
    });

    const result = await generateSettlementForDriver(prisma as never, {
      ...BASE_INPUT,
      periodStart: new Date('2026-04-15'),
      periodEnd: new Date('2026-04-21'),
    });

    expect(result.assignmentCount).toBe(1);
  });
});
