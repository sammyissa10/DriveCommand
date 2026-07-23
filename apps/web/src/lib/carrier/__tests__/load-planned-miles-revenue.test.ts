import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — loads.ts pulls in a real Postgres pool (lib/db/prisma) and email
// notification senders as module-level side effects; none of that should run
// in a unit test. getTenantPrisma is the seam we drive with a fake tenant
// Prisma client per test.
// ---------------------------------------------------------------------------

vi.mock('@/lib/context/tenant-context', () => ({
  getTenantPrisma: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {},
  TX_OPTIONS: {},
}));

vi.mock('@/lib/carrier/notifications', () => ({
  sendInvoiceGeneratedNotification: vi.fn(),
  sendClientDeliveredNotification: vi.fn(),
  sendClientInvoiceReadyNotification: vi.fn(),
  sendTripChangeNotification: vi.fn(),
}));

vi.mock('next/server', () => ({
  after: vi.fn(),
}));

import { getTenantPrisma } from '@/lib/context/tenant-context';
import { createLoad, updateLoad } from '@/lib/carrier/loads';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createLoad — plannedMiles banks per_mile revenue at creation', () => {
  it('plannedMiles=48, rate=2.85 persists totalRevenue 136.80 (not 0)', async () => {
    const carrierLoadUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'load-1',
      ...data,
    }));

    // Content-based branching stand-in for the 3 distinct carrierLoad.findFirst
    // shapes createLoad's flow issues (order doesn't matter to this mock):
    //   1. referenceNumber auto-numbering lookup (where.referenceNumber)
    //   2. applyPlannedMilesRevenue's load-for-calc lookup (include.dispatch)
    //   3. the final re-fetch after create (plain where.id)
    const carrierLoadFindFirst = vi.fn(async (args: { where?: Record<string, unknown>; include?: Record<string, unknown> }) => {
      if (args?.include?.dispatch) {
        return {
          id: 'load-1',
          dispatchId: null,
          dispatch: null,
          contract: null,
          rateType: 'per_mile',
          rateAmount: 2.85,
          commodityWeightLbs: null,
          commodityPallets: null,
          otherCharges: null,
          brokerFlag: false,
          carrierCost: null,
        };
      }
      if (args?.where?.referenceNumber) {
        return null; // no prior loads this year — first LD-YYYY-00001
      }
      return { id: 'load-1', totalRevenue: 136.8 };
    });

    const mockPrisma = {
      carrierClient: {
        findFirst: vi.fn().mockResolvedValue({ id: 'client-1', orgId: 'org-1' }),
      },
      carrierContract: { findFirst: vi.fn() },
      carrierLoad: {
        findFirst: carrierLoadFindFirst,
        create: vi.fn().mockResolvedValue({
          id: 'load-1',
          dispatchId: null,
          referenceNumber: 'LD-2026-00001',
        }),
        update: carrierLoadUpdate,
      },
    };
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    await createLoad('org-1', {
      clientId: 'client-1',
      rateType: 'per_mile',
      rateAmount: 2.85,
      plannedMiles: 48,
    });

    // Find the update call that writes totalRevenue — this is the money-math
    // proof that plannedMiles reached calculateRevenue instead of being
    // dropped, which previously left totalRevenue at 0.
    const revenueCall = carrierLoadUpdate.mock.calls.find(
      ([callArgs]) => (callArgs as { data: Record<string, unknown> }).data.totalRevenue !== undefined
    );
    expect(revenueCall).toBeDefined();
    const [callArgs] = revenueCall!;
    const { data } = callArgs as { data: { totalRevenue: number; fuelSurcharge: number } };

    expect(data.totalRevenue).toBe(136.8);
    expect(data.totalRevenue.toFixed(2)).toBe('136.80');
    expect(data.fuelSurcharge).toBe(0);
  });
});

describe('updateLoad — dispatchId-only attach recomputes revenue from the Trip', () => {
  it('attaching a dispatch to a milesless per_mile load recomputes totalRevenue from the Trip plannedMiles', async () => {
    const RATE = 2.5;
    const PLANNED_MILES = 120;

    const carrierLoadUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'load-2',
      ...data,
    }));

    // Content-based branching for the distinct carrierLoad.findFirst shapes in
    // updateLoad's dispatch-attach + recalculateAndStore flow:
    //   1. existing-load fetch at the top of updateLoad (plain where.id)
    //   2. pendingStopsJson carry-over check (select.pendingStopsJson)
    //   3. recalculateAndStore's load+dispatch+contract fetch (include.dispatch)
    //   4. the final "fresh" re-fetch (plain where.id)
    const carrierLoadFindFirst = vi.fn(async (args: { where?: Record<string, unknown>; select?: Record<string, unknown>; include?: Record<string, unknown> }) => {
      if (args?.include?.dispatch) {
        return {
          id: 'load-2',
          orgId: 'org-1',
          dispatchId: 'trip-1',
          rateType: 'per_mile',
          rateAmount: RATE,
          commodityWeightLbs: null,
          commodityPallets: null,
          otherCharges: null,
          brokerFlag: false,
          carrierCost: null,
          dispatch: { plannedMiles: PLANNED_MILES, actualMiles: null },
          contract: null,
        };
      }
      if (args?.select?.pendingStopsJson) {
        return { pendingStopsJson: null };
      }
      return {
        id: 'load-2',
        orgId: 'org-1',
        dispatchId: null,
        status: 'pending',
        pendingStopsJson: null,
        referenceNumber: 'LD-2026-00002',
      };
    });

    const mockPrisma = {
      carrierLoad: {
        findFirst: carrierLoadFindFirst,
        update: carrierLoadUpdate,
      },
      carrierStop: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    // dispatchId-only PATCH — no plannedMiles override in the payload. The
    // Trip carries plannedMiles=120; revenue must be sourced from there.
    await updateLoad('org-1', 'load-2', { dispatchId: 'trip-1' });

    const revenueCall = carrierLoadUpdate.mock.calls.find(
      ([callArgs]) => (callArgs as { data: Record<string, unknown> }).data.totalRevenue !== undefined
    );
    expect(revenueCall).toBeDefined();
    const [callArgs] = revenueCall!;
    const { data } = callArgs as { data: { totalRevenue: number } };

    expect(data.totalRevenue).toBe(PLANNED_MILES * RATE); // 120 * 2.5 = 300
    expect(data.totalRevenue).not.toBe(0);
  });
});
