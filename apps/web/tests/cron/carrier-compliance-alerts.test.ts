/**
 * quick-603 — `carrier-compliance-alerts`.
 *
 * Two distinct defects here. The tenant catch had **no counter at all**, so a
 * tenant that blew up simply failed to increment `orgs_processed` and was
 * indistinguishable from a tenant that does not exist. And the email catch
 * passed `{ tenantId, error: err }` in slot 2 — `Error: [object Object]` to
 * Sentry — while also being counted nowhere.
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
  executeRawUnsafe: vi.fn(),
  executeRaw: vi.fn(),
  tenantFindMany: vi.fn(),
  getComplianceAlerts: vi.fn(),
  sendComplianceAlertNotifications: vi.fn(),
}));

vi.mock('@/lib/logger', async (io) => loggerDouble(io));
/**
 * quick-606 — RETARGETED, and one spy is deliberately GONE.
 *
 * `$executeRawUnsafe` was the CREATE TABLE / CREATE INDEX bootstrap the route
 * ran on every invocation. Under app_user that is 42501 permission denied for
 * schema public — a runtime connection asked to run DDL — so the block was
 * deleted, and a spy for it would now assert a call that can never happen.
 *
 * The tenant sweep moved to getAdminDb; the raw per-tenant INSERT moved onto
 * the getTenantPrismaForOrg client, because a raw statement is not intercepted
 * by the Prisma extension and the GUC is the only thing that can satisfy
 * carrier_compliance_alert_log's tenant_isolation_policy.
 */
vi.mock('@/lib/db/admin-prisma', () => ({
  getAdminDb: vi.fn(async () => ({ tenant: { findMany: h.tenantFindMany } })),
}));
vi.mock('@/lib/context/tenant-context', () => ({
  getTenantPrismaForOrg: vi.fn(async () => ({ $executeRaw: h.executeRaw })),
}));
vi.mock('@/lib/carrier/compliance', () => ({ getComplianceAlerts: h.getComplianceAlerts }));
vi.mock('@/lib/carrier/notifications', () => ({
  sendComplianceAlertNotifications: h.sendComplianceAlertNotifications,
}));

/** M = 4 tenants; tenant 2 of 4 throws. */
const M = 4;
const TENANTS = Array.from({ length: M }, (_, i) => ({ id: `tenant-${i}`, name: `Tenant ${i}` }));
const FAILING_TENANT = 'tenant-1';
const ALERT = { type: 'CDL_EXPIRING', entityId: 'd1', message: 'CDL expires', severity: 'high' };

describe('cron/carrier-compliance-alerts — injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.executeRawUnsafe.mockResolvedValue(0);
    h.executeRaw.mockResolvedValue(1);
    h.tenantFindMany.mockResolvedValue(TENANTS);
    h.getComplianceAlerts.mockResolvedValue([ALERT]);
    h.sendComplianceAlertNotifications.mockResolvedValue(undefined);
  });

  it('COUNTS the lost tenant — the catch that had no counter — and STILL processes the other M-1', async () => {
    const injected = new InjectedFailure(FAILING_TENANT);
    h.getComplianceAlerts.mockImplementation(async (tenantId: string) =>
      tenantId === FAILING_TENANT ? Promise.reject(injected) : [ALERT],
    );

    const { logger } = await import('@/lib/logger');
    const { GET } = await import('@/app/api/cron/carrier-compliance-alerts/route');

    const res = await GET(cronRequest());
    const body = await res.json();

    // 1. THE RESPONSE SAYS SO.
    expectFailureReported(body, res.status, FAILING_TENANT);

    // 2. THE LOG CARRIES A REAL MESSAGE.
    expectNamedInLog(logger.error as never, injected);

    // 3. THE BATCH STILL CONTINUED — M tenants attempted, not 1 and not 2.
    expect(h.getComplianceAlerts).toHaveBeenCalledTimes(M);
    expect(body.orgs_processed).toBe(M - 1);
  });

  it('names a failed alert email instead of logging it as [object Object], and counts it', async () => {
    const injected = new InjectedFailure('email');
    h.sendComplianceAlertNotifications.mockImplementation(async (tenantId: string) =>
      tenantId === FAILING_TENANT ? Promise.reject(injected) : undefined,
    );

    const { logger } = await import('@/lib/logger');
    const { GET } = await import('@/app/api/cron/carrier-compliance-alerts/route');

    const res = await GET(cronRequest());
    const body = await res.json();

    expectFailureReported(body, res.status, `${FAILING_TENANT}:email`);
    expectNamedInLog(logger.error as never, injected);

    // A failed email is best-effort and must NOT abort the tenant: it is still
    // counted as processed, and every tenant still got an email attempt.
    expect(h.sendComplianceAlertNotifications).toHaveBeenCalledTimes(M);
    expect(body.orgs_processed).toBe(M);
  });

  it('is unchanged on a fully-successful run', async () => {
    const { GET } = await import('@/app/api/cron/carrier-compliance-alerts/route');
    const res = await GET(cronRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.orgs_processed).toBe(M);
    expect(body.total_alerts_found).toBe(M);
    expect(body.failureCount).toBe(0);
  });
});
