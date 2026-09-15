/**
 * quick-603 — the three digests.
 *
 * ONE FILE, THREE ROUTES, AND THE PER-ROUTE ASSERTIONS ARE STILL PER ROUTE.
 * ------------------------------------------------------------------------
 * `digest-daily-driver`, `digest-weekly-owner` and `digest-compliance-30day` are
 * byte-for-byte the same shape apart from the trigger key, the role and the
 * payload builder — the same reason quick-603's fix could apply the same six
 * replacements to all three. The parameterisation is over the three routes, so
 * each still gets its own `describe` and its own three assertions; what is
 * shared is the mock wiring, not the verdict.
 *
 * Their defect was only the status and the unconditional `success: true`: the
 * counters and the logging arity were already right. The failing-item assertion
 * would therefore have passed pre-fix; **assertion 1 is what makes these red.**
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
  userFindMany: vi.fn(),
  dispatchNotification: vi.fn(),
  buildDaily: vi.fn(),
  buildWeekly: vi.fn(),
  buildCompliance: vi.fn(),
}));

vi.mock('@/lib/logger', async (io) => loggerDouble(io));
vi.mock('@/lib/db/admin-prisma', () => ({
  getAdminDb: vi.fn(async () => ({ tenant: { findMany: h.tenantFindMany } })),
}));
/**
 * quick-606 — RETARGETED, and the retarget is the point.
 *
 * This file used to mock `@/lib/db/extensions/tenant-rls` and
 * `@/lib/db/prisma`, because the three routes did
 * `prisma.$extends(withTenantRLS(tenant.id))`. They no longer do: quick-606
 * moved them onto `getTenantPrismaForOrg`, which sets `app.current_tenant_id`
 * AND applies the same extension.
 *
 * Left alone, those two mocks would have injected into a DEAD CODE PATH and
 * this file would have gone green forever while testing nothing — the Phase-10
 * `sendDispatchAssignedNotification` shape exactly. The mock has to point at
 * the function the routes actually call.
 */
vi.mock('@/lib/context/tenant-context', () => ({
  getTenantPrismaForOrg: vi.fn(async () => ({ user: { findMany: h.userFindMany } })),
}));
vi.mock('@/lib/notifications/dispatcher', () => ({ dispatchNotification: h.dispatchNotification }));
vi.mock('@/lib/notifications/digests/daily-driver-payload', () => ({
  buildDailyDriverPayload: h.buildDaily,
}));
vi.mock('@/lib/notifications/digests/weekly-owner-payload', () => ({
  buildWeeklyOwnerPayload: h.buildWeekly,
}));
vi.mock('@/lib/notifications/digests/compliance-30day-payload', () => ({
  buildCompliance30DayPayload: h.buildCompliance,
}));

/** M = 5 recipients on one tenant; recipient 2 of 5 fails. */
const M = 5;
const RECIPIENTS = Array.from({ length: M }, (_, i) => ({
  id: `person-${i}`,
  email: `p${i}@example.test`,
  firstName: `P${i}`,
}));
const FAILING = 'person-1';

const ROUTES = [
  { name: 'digest-daily-driver', path: '@/app/api/cron/digest-daily-driver/route', builder: h.buildDaily },
  { name: 'digest-weekly-owner', path: '@/app/api/cron/digest-weekly-owner/route', builder: h.buildWeekly },
  { name: 'digest-compliance-30day', path: '@/app/api/cron/digest-compliance-30day/route', builder: h.buildCompliance },
] as const;

for (const route of ROUTES) {
  describe(`cron/${route.name} — injection`, () => {
    const injected = new InjectedFailure(`${route.name}:${FAILING}`);

    beforeEach(() => {
      vi.clearAllMocks();
      h.tenantFindMany.mockResolvedValue([{ id: 'tenant-a', name: 'Alpha Freight' }]);
      h.userFindMany.mockResolvedValue(RECIPIENTS);
      for (const b of [h.buildDaily, h.buildWeekly, h.buildCompliance]) {
        b.mockImplementation(async (_db: unknown, _tenantId: string, personId: string) =>
          personId === FAILING ? Promise.reject(injected) : { anything: true },
        );
      }
      h.dispatchNotification.mockResolvedValue({ sent: 1, skipped: 0, failed: 0 });
    });

    it('reports the failure, names the recipient, and STILL builds all M payloads', async () => {
      const { logger } = await import('@/lib/logger');
      const { GET } = await import(route.path);

      const res = await GET(cronRequest());
      const body = await res.json();

      // 1. THE RESPONSE SAYS SO. (The only half that was broken here.)
      expectFailureReported(body, res.status, FAILING);

      // 2. THE LOG CARRIES A REAL MESSAGE.
      expectNamedInLog(logger.error as never, injected);

      // 3. THE BATCH STILL CONTINUED — M payload builds, not 1 and not 2, and
      //    the M-1 survivors were each dispatched.
      expect(route.builder).toHaveBeenCalledTimes(M);
      expect(h.dispatchNotification).toHaveBeenCalledTimes(M - 1);
      expect(body.sent).toBe(M - 1);
      expect(body.failed).toBe(1);
    });

    it("records the dispatcher's own `result.failed`, so `success` cannot be true beside `failed: 3`", async () => {
      for (const b of [h.buildDaily, h.buildWeekly, h.buildCompliance]) {
        b.mockResolvedValue({ anything: true });
      }
      // Nothing throws. The dispatcher simply reports channel delivery failures.
      h.dispatchNotification.mockResolvedValue({ sent: 0, skipped: 0, failed: 3 });

      const { GET } = await import(route.path);
      const res = await GET(cronRequest());
      const body = await res.json();

      expect(body.failed).toBeGreaterThan(0);
      expect(body.success).not.toBe(true);
      expect(res.status).toBe(500);
      expect(body.failureCount).toBe(M);
    });

    it('is unchanged on a fully-successful run', async () => {
      for (const b of [h.buildDaily, h.buildWeekly, h.buildCompliance]) {
        b.mockResolvedValue({ anything: true });
      }

      const { GET } = await import(route.path);
      const res = await GET(cronRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.processedTenants).toBe(1);
      expect(body.sent).toBe(M);
      expect(body.failed).toBe(0);
      expect(body.failureCount).toBe(0);
    });
  });
}
