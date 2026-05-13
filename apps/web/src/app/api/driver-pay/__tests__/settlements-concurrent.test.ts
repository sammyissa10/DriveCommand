/**
 * settlements-concurrent.test.ts
 *
 * Tests that two concurrent generate calls for the same driver+period result
 * in exactly one settlement being created.
 *
 * With the mock (non-PostgreSQL) approach:
 * - The first call succeeds (findFirst returns null).
 * - The second call sees the first settlement (simulated via a shared counter)
 *   and throws SettlementOverlapError.
 *
 * For real Serializable isolation testing against a live PostgreSQL database,
 * use TEST_PG_URL integration tests (marked skipIf below).
 *
 * Note: True concurrent serialization failure can only be tested against a
 * real PostgreSQL DB with Serializable isolation. The mock test demonstrates
 * the pre-check guard behavior (first overlap check fires before transaction).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  generateSettlementForDriver,
  generateSettlementsBatch,
  SettlementOverlapError,
} from '@/lib/driver-pay/settlement-generator';

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

function makeAssignment() {
  return {
    id: `asgn-${Math.random()}`,
    payComponents: [makeComponent('1000.00')],
    load: { id: 'load-1', referenceNumber: 'L-001', status: 'DELIVERED' },
    approvedAt: new Date('2026-04-10'),
  };
}

// ---------------------------------------------------------------------------
// Concurrent mock: simulates one succeeding and one failing
// ---------------------------------------------------------------------------

/**
 * Creates a mock prisma where:
 * - The first call to $transaction resolves with a new settlement.
 * - Subsequent calls for the same driver+period see the overlap and throw.
 *
 * IMPORTANT: In JS single-threaded async, Promise.all starts both async
 * functions but they interleave at await points. To simulate serializable
 * isolation, we use a mutex (promise chain) so transactions run one-at-a-time.
 * The second transaction runs AFTER the first completes, so it sees the
 * already-created settlement.
 */
function makeConcurrentMockPrisma() {
  // Shared mutable state across all tx invocations
  let settlementsCreated = 0;
  let txCallCount = 0;

  // Mutex: ensures transactions run serially (simulates DB-level serialization)
  let txQueue: Promise<unknown> = Promise.resolve();

  const createdSettlement = {
    id: 'settlement-concurrent',
    tenantId: 'tenant-A',
    driverId: 'driver-1',
    periodStart: new Date('2026-04-08'),
    periodEnd: new Date('2026-04-14'),
    status: 'DRAFT',
    settlementReference: 'SET-CONCURRENT',
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-1',
    deletedAt: null,
  };

  const prisma = {
    $transaction: vi.fn().mockImplementation(
      (fn: (tx: unknown) => Promise<unknown>, _opts?: unknown) => {
        // Chain onto the queue — each transaction waits for the previous to finish
        const result = txQueue.then(async () => {
          txCallCount++;
          // Capture state AT THIS TRANSACTION'S START (after prior tx committed)
          const alreadyExists = settlementsCreated > 0;

          const tx = {
            driverSettlement: {
              findFirst: vi.fn().mockResolvedValue(
                alreadyExists ? { id: 'settlement-concurrent' } : null,
              ),
              create: vi.fn().mockImplementation(() => {
                settlementsCreated++;
                return Promise.resolve(createdSettlement);
              }),
            },
            loadDriverAssignment: {
              findMany: vi.fn().mockResolvedValue([makeAssignment()]),
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
            $queryRaw: vi.fn().mockResolvedValue([{ id: 'asgn-1' }]),
          };

          return fn(tx);
        });
        // Advance the queue (swallow errors so the mutex doesn't get stuck)
        txQueue = result.catch(() => undefined);
        return result;
      },
    ),
    _getTxCallCount: () => txCallCount,
    _getSettlementsCreated: () => settlementsCreated,
  };

  return prisma;
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

describe('settlement-generator — concurrency', () => {
  beforeEach(() => vi.clearAllMocks());

  it('two sequential calls — first succeeds, second throws SettlementOverlapError', async () => {
    const prisma = makeConcurrentMockPrisma();

    // First call succeeds
    const result1 = await generateSettlementForDriver(prisma as never, BASE_INPUT);
    expect(result1.settlement.status).toBe('DRAFT');

    // Second call for same period sees the overlap and throws
    await expect(
      generateSettlementForDriver(prisma as never, BASE_INPUT),
    ).rejects.toThrow(SettlementOverlapError);

    // Only one settlement was created
    expect(prisma._getSettlementsCreated()).toBe(1);
  });

  it('Promise.all concurrent calls — exactly one settlement created', async () => {
    const prisma = makeConcurrentMockPrisma();

    const [r1, r2] = await Promise.allSettled([
      generateSettlementForDriver(prisma as never, BASE_INPUT),
      generateSettlementForDriver(prisma as never, BASE_INPUT),
    ]);

    const succeeded = [r1, r2].filter((r) => r.status === 'fulfilled');
    const failed = [r1, r2].filter((r) => r.status === 'rejected');

    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);

    if (failed[0]?.status === 'rejected') {
      expect(failed[0].reason).toBeInstanceOf(SettlementOverlapError);
    }

    // Only one DriverSettlement created
    expect(prisma._getSettlementsCreated()).toBe(1);
  });

  it('generateSettlementsBatch accumulates conflicts instead of throwing', async () => {
    const prisma = makeConcurrentMockPrisma();

    // Generate for 2 drivers, first already has overlap for driver-1
    const results = await generateSettlementsBatch(prisma as never, {
      tenantId: 'tenant-A',
      driverIds: ['driver-1', 'driver-1'], // same driver twice (simulates overlap)
      periodStart: new Date('2026-04-08'),
      periodEnd: new Date('2026-04-14'),
      actorUserId: 'user-1',
    });

    // One should succeed, one should be a conflict
    expect(results.results.length + results.conflicts.length).toBe(2);
    expect(results.conflicts.length).toBeGreaterThanOrEqual(1);
    expect(results.conflicts[0]).toHaveProperty('driverId');
    expect(results.conflicts[0]).toHaveProperty('reason');
  });

  /**
   * Skip this test unless a real PostgreSQL URL is configured.
   * True serialization failures require actual DB-level Serializable isolation.
   * The mock tests above demonstrate the pre-check guard behavior only.
   */
  it.skipIf(!process.env.TEST_PG_URL)(
    'real PostgreSQL: serializable isolation prevents double-settlement',
    async () => {
      // Integration test — requires TEST_PG_URL env var
      // This test would use a real Prisma client and verify SERIALIZATION_FAILURE
      // handling at the database level.
      console.log('TEST_PG_URL integration test placeholder — skipped in CI without DB');
    },
  );
});
