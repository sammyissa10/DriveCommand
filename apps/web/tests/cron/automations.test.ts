/**
 * quick-603 — `automations`.
 *
 * `scheduleCronDrivenRule`'s per-candidate catch used to `console.error` and
 * move on with NO counter, and the route then returned `{ok: true, …}`. Two
 * consequences: every tenant's nudge could fail to schedule and the run reported
 * success, and because it was `console.error` rather than `logger.error`, Sentry
 * never saw it at all.
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
  ruleFindUnique: vi.fn(),
  runFindFirst: vi.fn(),
  activationFindMany: vi.fn(),
  subscriptionFindMany: vi.fn(),
  runCreate: vi.fn(),
  getTenantPrismaForOrg: vi.fn(),
  runEvaluator: vi.fn(),
}));

vi.mock('@/lib/logger', async (io) => loggerDouble(io));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    automationRule: { findUnique: h.ruleFindUnique },
    automationRun: { findFirst: h.runFindFirst },
    activationProgress: { findMany: h.activationFindMany },
    subscription: { findMany: h.subscriptionFindMany },
  },
}));
vi.mock('@/lib/context/tenant-context', () => ({ getTenantPrismaForOrg: h.getTenantPrismaForOrg }));
vi.mock('@/lib/automations/evaluator', () => ({ runEvaluator: h.runEvaluator }));

/**
 * M = 4 candidate tenants, and the route runs FOUR rules over them, so the
 * expected write count is 4 x 4 = 16 with one tenant failing on each rule.
 */
const M = 4;
const CANDIDATES = Array.from({ length: M }, (_, i) => ({ tenantId: `tenant-${i}` }));
const FAILING_TENANT = 'tenant-1';
const RULES = 4;
const injected = new InjectedFailure(FAILING_TENANT);

describe('cron/automations — injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.ruleFindUnique.mockResolvedValue({ id: 'rule-1', isActive: true });
    h.runFindFirst.mockResolvedValue(null); // nothing deduped away
    h.activationFindMany.mockResolvedValue(CANDIDATES);
    h.subscriptionFindMany.mockResolvedValue(CANDIDATES);
    h.runCreate.mockResolvedValue({ id: 'run-1' });
    h.getTenantPrismaForOrg.mockImplementation(async (tenantId: string) =>
      tenantId === FAILING_TENANT
        ? Promise.reject(injected)
        : { automationRun: { create: h.runCreate } },
    );
    h.runEvaluator.mockResolvedValue({ pendingCreated: 3, executed: 3, failed: 0 });
  });

  it('COUNTS a failed scheduling — the catch that had none — and STILL schedules the rest', async () => {
    const { logger } = await import('@/lib/logger');
    const { GET } = await import('@/app/api/cron/automations/route');

    const res = await GET(cronRequest());
    const body = await res.json();

    // 1. THE RESPONSE SAYS SO.
    expectFailureReported(body, res.status, FAILING_TENANT);

    // 2. THE LOG CARRIES A REAL MESSAGE — and reaches Sentry at all, which
    //    `console.error` never did.
    expectNamedInLog(logger.error as never, injected);

    // 3. THE BATCH STILL CONTINUED — every candidate of every rule attempted.
    expect(h.getTenantPrismaForOrg).toHaveBeenCalledTimes(M * RULES);
    expect(h.runCreate).toHaveBeenCalledTimes((M - 1) * RULES);
    expect(body.failureCount).toBe(RULES);
    // The evaluator still ran after the scheduling failures.
    expect(h.runEvaluator).toHaveBeenCalledTimes(1);
  });

  it("records runEvaluator's own `failed`, so `ok` cannot be true beside it", async () => {
    h.getTenantPrismaForOrg.mockResolvedValue({ automationRun: { create: h.runCreate } });
    h.runEvaluator.mockResolvedValue({ pendingCreated: 3, executed: 1, failed: 2 });

    const { GET } = await import('@/app/api/cron/automations/route');
    const res = await GET(cronRequest());
    const body = await res.json();

    expect(body.failed).toBe(2);
    expect(body.ok).not.toBe(true);
    expect(res.status).toBe(500);
    expect(body.failureCount).toBe(1);
  });

  it('is unchanged on a fully-successful run', async () => {
    h.getTenantPrismaForOrg.mockResolvedValue({ automationRun: { create: h.runCreate } });

    const { GET } = await import('@/app/api/cron/automations/route');
    const res = await GET(cronRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body).toMatchObject({ pendingCreated: 3, executed: 3, failed: 0, failureCount: 0 });
  });
});
