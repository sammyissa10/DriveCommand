/**
 * quick-603 — `trip-reminders`.
 *
 * The in-repo PRECEDENT, not a repair. Its logging was already right —
 * `logger.error(msg, err, { …, error: serializeError(err) })` — and it already
 * counted `tenantsFailed`. The only thing wrong was that it returned
 * `{ ok: true }` and 200 beside a non-zero `tenantsFailed`.
 *
 * That makes assertion 2 PASS on the pre-fix code here, which is exactly why
 * assertions 1 and 3 are not optional: a file where only one of the three can
 * go red still needs the other two to pin the behaviour.
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
  getTenantPrismaForOrg: vi.fn(),
  tripFindMany: vi.fn(),
  emitNotification: vi.fn(),
}));

vi.mock('@/lib/logger', async (io) => loggerDouble(io));
vi.mock('@/lib/db/prisma', () => ({ prisma: { tenant: { findMany: h.tenantFindMany } } }));
vi.mock('@/lib/context/tenant-context', () => ({ getTenantPrismaForOrg: h.getTenantPrismaForOrg }));
vi.mock('@/lib/notifications/emit', () => ({ emitNotification: h.emitNotification }));
vi.mock('@/lib/utils/date', () => ({ formatDateInTenantTimezone: () => '2026-09-16 13:00 UTC' }));

/** M = 4 tenants; tenant 2 of 4 throws when its client is acquired. */
const M = 4;
const TENANTS = Array.from({ length: M }, (_, i) => ({ id: `tenant-${i}` }));
const FAILING_TENANT = 'tenant-1';
const injected = new InjectedFailure(FAILING_TENANT);

const TRIP = {
  id: 'trip-1',
  notes: '[DISPATCH_NUMBER=DC-2026-00042]',
  scheduledDeparture: new Date('2026-09-16T13:00:00Z'),
  truck: { unitNumber: 'T-9' },
  primaryDriver: { firstName: 'Dana', lastName: 'Ruiz', userId: 'user-9' },
  stops: [{ facility: { name: 'Depot', city: 'Chicago' } }],
};

describe('cron/trip-reminders — injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.tenantFindMany.mockResolvedValue(TENANTS);
    h.tripFindMany.mockResolvedValue([TRIP]);
    h.emitNotification.mockResolvedValue(undefined);
    h.getTenantPrismaForOrg.mockImplementation(async (tenantId: string) =>
      tenantId === FAILING_TENANT
        ? Promise.reject(injected)
        : { trip: { findMany: h.tripFindMany } },
    );
  });

  it('reports the failure, names the tenant, and STILL reminds the other M-1', async () => {
    const { logger } = await import('@/lib/logger');
    const { GET } = await import('@/app/api/cron/trip-reminders/route');

    const res = await GET(cronRequest());
    const body = await res.json();

    // 1. THE RESPONSE SAYS SO. (The only half that was broken on this route.)
    expectFailureReported(body, res.status, FAILING_TENANT);

    // 2. THE LOG CARRIES A REAL MESSAGE. (Already true pre-fix — kept anyway.)
    expectNamedInLog(logger.error as never, injected);

    // 3. THE BATCH STILL CONTINUED — M client acquisitions, M-1 reminders sent.
    expect(h.getTenantPrismaForOrg).toHaveBeenCalledTimes(M);
    expect(h.emitNotification).toHaveBeenCalledTimes(M - 1);
    expect(body.tenantsProcessed).toBe(M - 1);
    expect(body.tenantsFailed).toBe(1);
  });

  it('is unchanged on a fully-successful run', async () => {
    h.getTenantPrismaForOrg.mockResolvedValue({ trip: { findMany: h.tripFindMany } });

    const { GET } = await import('@/app/api/cron/trip-reminders/route');
    const res = await GET(cronRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.tenantsProcessed).toBe(M);
    expect(body.tenantsFailed).toBe(0);
    expect(body.remindersSent).toBe(M);
    expect(body.windowHours).toBe(24);
    expect(body.failureCount).toBe(0);
  });
});
