/**
 * quick-603 — `send-reminders`.
 *
 * Its defect was not `purge-deleted`'s. The logging arity was already right; what
 * was missing was the status, the unconditional `success: true`, and — the one
 * nobody else had — a **tenant-level catch that `continue`d with no counter at
 * all**, while `processedTenants` reported `tenants.length` regardless. A whole
 * tenant's reminders could vanish and the body said every tenant was processed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  cronRequest,
  loggerDouble,
  InjectedFailure,
  expectNamedInLog,
  expectFailureReported,
} from './_cron-test-kit';

const h = vi.hoisted(() => ({
  tenantFindMany: vi.fn(),
  findUpcomingMaintenance: vi.fn(),
  findExpiringDocuments: vi.fn(),
  findExpiringDriverDocuments: vi.fn(),
  dispatchNotification: vi.fn(),
}));

vi.mock('@/lib/logger', async (io) => loggerDouble(io));
vi.mock('@/lib/db/admin-prisma', () => ({
  getAdminDb: vi.fn(async () => ({ tenant: { findMany: h.tenantFindMany } })),
}));
vi.mock('@/lib/notifications/check-upcoming-maintenance', () => ({
  findUpcomingMaintenance: h.findUpcomingMaintenance,
}));
vi.mock('@/lib/notifications/check-expiring-documents', () => ({
  findExpiringDocuments: h.findExpiringDocuments,
}));
vi.mock('@/lib/notifications/check-expiring-driver-documents', () => ({
  findExpiringDriverDocuments: h.findExpiringDriverDocuments,
}));
vi.mock('@/lib/notifications/dispatcher', () => ({ dispatchNotification: h.dispatchNotification }));
vi.mock('@/lib/email/send-driver-document-expiry-reminder', () => ({
  formatDocumentType: (t: string) => t,
}));

/** M = 4 maintenance items on one tenant; item 2 of 4 fails. */
const M = 4;
const items = Array.from({ length: M }, (_, i) => ({
  truckId: `truck-${i}`,
  truckName: `Unit ${i}`,
  serviceType: 'OIL',
  nextDueDate: new Date('2026-10-01T00:00:00Z'),
}));
const FAILING_TRUCK = 'truck-1';
const injected = new InjectedFailure(FAILING_TRUCK);

describe('cron/send-reminders — injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.tenantFindMany.mockResolvedValue([{ id: 'tenant-a', name: 'Alpha Freight' }]);
    h.findUpcomingMaintenance.mockResolvedValue(items);
    h.findExpiringDocuments.mockResolvedValue([]);
    h.findExpiringDriverDocuments.mockResolvedValue([]);
    h.dispatchNotification.mockImplementation(async (_k: string, opts: { payload: { truckId: string } }) =>
      opts.payload.truckId === FAILING_TRUCK
        ? Promise.reject(injected)
        : { sent: 1, skipped: 0, failed: 0 },
    );
  });

  it('reports the failure, names the truck, and STILL dispatches the other M-1 items', async () => {
    const { logger } = await import('@/lib/logger');
    const { GET } = await import('@/app/api/cron/send-reminders/route');

    const res = await GET(cronRequest());
    const body = await res.json();

    // 1. THE RESPONSE SAYS SO.
    expectFailureReported(body, res.status, FAILING_TRUCK);

    // 2. THE LOG CARRIES A REAL MESSAGE.
    expectNamedInLog(logger.error as never, injected);

    // 3. THE BATCH STILL CONTINUED — M dispatches attempted, not 1 and not 2.
    expect(h.dispatchNotification).toHaveBeenCalledTimes(M);
    expect(body.maintenance.sent).toBe(M - 1);
    expect(body.maintenance.failed).toBe(1);
  });

  it('counts and NAMES a whole lost tenant — the catch that used to `continue` with no counter', async () => {
    const tenantInjected = new InjectedFailure('tenant-b');
    h.tenantFindMany.mockResolvedValue([
      { id: 'tenant-a', name: 'Alpha Freight' },
      { id: 'tenant-b', name: 'Bravo Hauling' },
      { id: 'tenant-c', name: 'Charlie Cartage' },
    ]);
    h.findUpcomingMaintenance.mockImplementation(async (tenantId: string) =>
      tenantId === 'tenant-b' ? Promise.reject(tenantInjected) : [],
    );

    const { logger } = await import('@/lib/logger');
    const { GET } = await import('@/app/api/cron/send-reminders/route');

    const res = await GET(cronRequest());
    const body = await res.json();

    expectFailureReported(body, res.status, 'tenant:tenant-b');
    expectNamedInLog(logger.error as never, tenantInjected);

    // The other two tenants were STILL processed — 3 attempts, not 2.
    expect(h.findUpcomingMaintenance).toHaveBeenCalledTimes(3);
    // …and `processedTenants` now means processed. It used to be `tenants.length`.
    expect(body.processedTenants).toBe(2);
    expect(body.tenantsFound).toBe(3);
  });

  it('is unchanged on a fully-successful run', async () => {
    h.dispatchNotification.mockResolvedValue({ sent: 1, skipped: 0, failed: 0 });

    const { GET } = await import('@/app/api/cron/send-reminders/route');
    const res = await GET(cronRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.processedTenants).toBe(1);
    expect(body.maintenance).toEqual({ sent: M, skipped: 0, failed: 0 });
    expect(body.failureCount).toBe(0);
  });
});
