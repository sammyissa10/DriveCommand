/**
 * Test suite: dispatch enforcement + override audit
 *
 * Spec reference: Section 15 Phase 4 DoD tests 3 + 4
 *   DoD test 3 — override audit row written with reason, userId, entityType, entityId, tenantId
 *   DoD test 4 — dispatch creation blocked for non-ready driver without admin override
 *
 * Tests cover:
 *   1. DoD test 4: throws DRIVER_NOT_DISPATCH_READY, dispatch NOT created
 *   2. DoD test 3: admin override creates dispatch AND writes audit row with all 5 required fields
 *   3. Override rejected for non-admin caller → OVERRIDE_REQUIRES_ADMIN, no audit row
 *   4. Ready driver creates dispatch normally — no audit row written
 *   5. Audit row tenantId matches the dispatch's orgId (cross-tenant bug guard)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTrip } from '@/lib/carrier/trips';
import { prisma } from '@/lib/db/prisma';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    carrierDriver: { findFirst: vi.fn() },
    carrierTruck: { findFirst: vi.fn() },
    carrierDriver_coDriver: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    trip: { findFirst: vi.fn(), create: vi.fn() },
    dispatchOverrideAudit: { create: vi.fn() },
    carrierStop: { count: vi.fn() },
    routeTemplateStop: { findMany: vi.fn() },
    routeTemplate: { findFirst: vi.fn() },
  },
}));

// after() from next/server is post-response — don't execute callbacks in unit tests
vi.mock('next/server', () => ({
  after: vi.fn(),
}));

vi.mock('@/server/services/workflows/fireEvent', () => ({
  fireEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/carrier/notifications', () => ({
  sendDispatchAssignedNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/notifications/send-push', () => ({
  sendPushToUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/carrier/in-app-notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/carrier/pay-calculator', () => ({
  generateDriverPayRecords: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/carrier/route-templates', () => ({
  computeNextOccurrence: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const ORG_ID = 'org-001';
const DRIVER_ID = 'driver-001';
const TRUCK_ID = 'truck-001';
const DRIVER_USER_ID = 'user-driver-001';
const ADMIN_USER_ID = 'user-admin-001';
const DISPATCH_ID = 'dispatch-001';

const BASE_INPUT = {
  primaryDriverId: DRIVER_ID,
  truckId: TRUCK_ID,
};

function setupReadyDriver() {
  vi.mocked(prisma.carrierDriver.findFirst).mockResolvedValue({
    id: DRIVER_ID,
    orgId: ORG_ID,
    userId: DRIVER_USER_ID,
    firstName: 'John',
    lastName: 'Driver',
  } as any);
  vi.mocked(prisma.carrierTruck.findFirst).mockResolvedValue({ id: TRUCK_ID, orgId: ORG_ID } as any);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ isDispatchReady: true } as any);
  vi.mocked(prisma.trip.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.trip.create).mockResolvedValue({ id: DISPATCH_ID, orgId: ORG_ID } as any);
}

function setupNotReadyDriver() {
  vi.mocked(prisma.carrierDriver.findFirst).mockResolvedValue({
    id: DRIVER_ID,
    orgId: ORG_ID,
    userId: DRIVER_USER_ID,
    firstName: 'John',
    lastName: 'Driver',
  } as any);
  vi.mocked(prisma.carrierTruck.findFirst).mockResolvedValue({ id: TRUCK_ID, orgId: ORG_ID } as any);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ isDispatchReady: false } as any);
}

describe('dispatch enforcement + override audit (Phase 4 DoD tests 3 + 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Test 1: DoD test 4 — dispatch blocked for non-ready driver without override
  // ---------------------------------------------------------------------------
  it('DoD test 4: throws DRIVER_NOT_DISPATCH_READY and does NOT create dispatch when driver is not ready', async () => {
    setupNotReadyDriver();

    await expect(createTrip(ORG_ID, { ...BASE_INPUT })).rejects.toThrow(
      'DRIVER_NOT_DISPATCH_READY'
    );

    // No dispatch or audit row should have been created
    expect(prisma.trip.create).not.toHaveBeenCalled();
    expect(prisma.dispatchOverrideAudit.create).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test 2: DoD test 3 — admin override creates dispatch AND writes audit row
  // ---------------------------------------------------------------------------
  it('DoD test 3: admin override creates dispatch and writes DispatchOverrideAudit with all 5 required fields', async () => {
    vi.mocked(prisma.carrierDriver.findFirst).mockResolvedValue({
      id: DRIVER_ID,
      orgId: ORG_ID,
      userId: DRIVER_USER_ID,
    } as any);
    vi.mocked(prisma.carrierTruck.findFirst).mockResolvedValue({ id: TRUCK_ID, orgId: ORG_ID } as any);
    // First call: driver readiness check → not ready
    // Second call: current user role check → OWNER (admin)
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ isDispatchReady: false } as any)
      .mockResolvedValueOnce({ role: 'OWNER' } as any);
    vi.mocked(prisma.trip.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.trip.create).mockResolvedValue({ id: DISPATCH_ID, orgId: ORG_ID } as any);
    vi.mocked(prisma.dispatchOverrideAudit.create).mockResolvedValue({} as any);

    await createTrip(ORG_ID, {
      ...BASE_INPUT,
      overrideReason: 'customer emergency',
      overrideForEntityType: 'DRIVER',
      overrideForEntityId: DRIVER_USER_ID,
      currentUserId: ADMIN_USER_ID,
    });

    // Dispatch was created exactly once
    expect(prisma.trip.create).toHaveBeenCalledTimes(1);

    // Audit row written with all 5 required fields
    expect(prisma.dispatchOverrideAudit.create).toHaveBeenCalledTimes(1);
    expect(prisma.dispatchOverrideAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reason: 'customer emergency',
          userId: ADMIN_USER_ID,
          entityType: 'DRIVER',
          entityId: DRIVER_USER_ID,
          tenantId: ORG_ID,
          dispatchId: DISPATCH_ID,
        }),
      })
    );
  });

  // ---------------------------------------------------------------------------
  // Test 3: Override rejected for non-admin
  // ---------------------------------------------------------------------------
  it('throws OVERRIDE_REQUIRES_ADMIN when a non-admin attempts to override dispatch readiness', async () => {
    vi.mocked(prisma.carrierDriver.findFirst).mockResolvedValue({
      id: DRIVER_ID,
      orgId: ORG_ID,
      userId: DRIVER_USER_ID,
    } as any);
    vi.mocked(prisma.carrierTruck.findFirst).mockResolvedValue({ id: TRUCK_ID, orgId: ORG_ID } as any);
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ isDispatchReady: false } as any)
      .mockResolvedValueOnce({ role: 'DRIVER' } as any); // non-admin

    await expect(
      createTrip(ORG_ID, {
        ...BASE_INPUT,
        overrideReason: 'trying to force it',
        overrideForEntityType: 'DRIVER',
        overrideForEntityId: DRIVER_USER_ID,
        currentUserId: DRIVER_USER_ID,
      })
    ).rejects.toThrow('OVERRIDE_REQUIRES_ADMIN');

    // Neither dispatch nor audit row should have been created
    expect(prisma.trip.create).not.toHaveBeenCalled();
    expect(prisma.dispatchOverrideAudit.create).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test 4: Ready driver — happy path, no audit row written
  // ---------------------------------------------------------------------------
  it('creates dispatch normally for a dispatch-ready driver without writing any audit row', async () => {
    setupReadyDriver();

    await createTrip(ORG_ID, { ...BASE_INPUT });

    expect(prisma.trip.create).toHaveBeenCalledTimes(1);
    expect(prisma.dispatchOverrideAudit.create).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test 5: Audit row tenantId matches the dispatch's orgId (cross-tenant guard)
  // ---------------------------------------------------------------------------
  it('audit row tenantId equals the dispatch orgId — prevents cross-tenant audit bugs', async () => {
    vi.mocked(prisma.carrierDriver.findFirst).mockResolvedValue({
      id: DRIVER_ID,
      orgId: ORG_ID,
      userId: DRIVER_USER_ID,
    } as any);
    vi.mocked(prisma.carrierTruck.findFirst).mockResolvedValue({ id: TRUCK_ID, orgId: ORG_ID } as any);
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ isDispatchReady: false } as any)
      .mockResolvedValueOnce({ role: 'OWNER' } as any);
    vi.mocked(prisma.trip.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.trip.create).mockResolvedValue({ id: DISPATCH_ID, orgId: ORG_ID } as any);
    vi.mocked(prisma.dispatchOverrideAudit.create).mockResolvedValue({} as any);

    await createTrip(ORG_ID, {
      ...BASE_INPUT,
      overrideReason: 'emergency run',
      overrideForEntityType: 'DRIVER',
      overrideForEntityId: DRIVER_USER_ID,
      currentUserId: ADMIN_USER_ID,
    });

    const auditCall = vi.mocked(prisma.dispatchOverrideAudit.create).mock.calls[0][0];
    expect(auditCall.data.tenantId).toBe(ORG_ID);
  });
});
