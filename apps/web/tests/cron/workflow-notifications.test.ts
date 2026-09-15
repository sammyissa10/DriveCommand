/**
 * quick-603 — `workflow-notifications`, the sharpest case on the whole surface.
 *
 * Its two SWEEP-level catches swallowed a query failure with no counter of any
 * kind. If the STEP_OVERDUE query failed, the route returned
 * `{ok:true, stats:{overdueSent:0, overdueErrors:0, …}}` — **byte-identical to a
 * clean run with nothing due**. There was no reading of that body that could
 * distinguish "nothing to do" from "the sweep never ran". A failed SWEEP and a
 * failed ITEM are different facts; they now have different counters.
 *
 * All four of its `logger.error` calls also passed `{ err }` in slot 2, one of
 * them multi-line — the single site the line-oriented grep scan missed.
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
  stepFindMany: vi.fn(),
  instanceFindMany: vi.fn(),
  stepUpdate: vi.fn(),
  getTenantPrismaForOrg: vi.fn(),
  sendStepOverdue: vi.fn(),
  sendInstanceBlockedEmail: vi.fn(),
}));

vi.mock('@/lib/logger', async (io) => loggerDouble(io));
vi.mock('@/lib/db/admin-prisma', () => ({
  getAdminDb: vi.fn(async () => ({
    stepInstance: { findMany: h.stepFindMany },
    playbookInstance: { findMany: h.instanceFindMany },
  })),
}));
vi.mock('@/lib/context/tenant-context', () => ({ getTenantPrismaForOrg: h.getTenantPrismaForOrg }));
vi.mock('@/server/services/workflows/notifications', () => ({
  sendStepOverdue: h.sendStepOverdue,
  sendInstanceBlockedEmail: h.sendInstanceBlockedEmail,
}));

/** M = 5 overdue steps; step 2 of 5 fails to send. */
const M = 5;
const STEPS = Array.from({ length: M }, (_, i) => ({
  id: `step-${i}`,
  stepSnapshot: { overdueRecipient: 'OWNER', dueWithinHours: 24 },
  playbookInstance: { tenantId: 'tenant-a', entityId: 'trip-1', entityType: 'DISPATCH' },
}));
const FAILING_STEP = 'step-1';

describe('cron/workflow-notifications — injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.stepFindMany.mockResolvedValue(STEPS);
    h.instanceFindMany.mockResolvedValue([]);
    h.getTenantPrismaForOrg.mockResolvedValue({ stepInstance: { update: h.stepUpdate } });
    h.stepUpdate.mockResolvedValue({});
    h.sendStepOverdue.mockResolvedValue(undefined);
    h.sendInstanceBlockedEmail.mockResolvedValue(undefined);
  });

  it('reports a failed ITEM, names the step, and STILL sends the other M-1', async () => {
    const injected = new InjectedFailure(FAILING_STEP);
    h.sendStepOverdue.mockImplementation(async (args: { stepInstanceId: string }) =>
      args.stepInstanceId === FAILING_STEP ? Promise.reject(injected) : undefined,
    );

    const { logger } = await import('@/lib/logger');
    const { GET } = await import('@/app/api/cron/workflow-notifications/route');

    const res = await GET(cronRequest());
    const body = await res.json();

    // 1. THE RESPONSE SAYS SO.
    expectFailureReported(body, res.status, FAILING_STEP);

    // 2. THE LOG CARRIES A REAL MESSAGE (this route logged `{ err }`).
    expectNamedInLog(logger.error as never, injected);

    // 3. THE BATCH STILL CONTINUED — M sends attempted, not 1 and not 2.
    expect(h.sendStepOverdue).toHaveBeenCalledTimes(M);
    expect(body.stats.overdueSent).toBe(M - 1);
    expect(body.stats.overdueErrors).toBe(1);
    // A failed ITEM is not a failed SWEEP.
    expect(body.stats.sweepsFailed).toBe(0);
  });

  it('a failed SWEEP is no longer byte-identical to a clean run with nothing due', async () => {
    const injected = new InjectedFailure('STEP_OVERDUE query');
    h.stepFindMany.mockRejectedValue(injected);

    const { logger } = await import('@/lib/logger');
    const { GET } = await import('@/app/api/cron/workflow-notifications/route');

    const res = await GET(cronRequest());
    const body = await res.json();

    // The counters that a clean-with-nothing-due run also produces:
    expect(body.stats.overdueSent).toBe(0);
    expect(body.stats.overdueErrors).toBe(0);
    // …and the ones that now tell the two apart.
    expect(body.stats.sweepsFailed).toBe(1);
    expectFailureReported(body, res.status, 'sweep:STEP_OVERDUE');
    expectNamedInLog(logger.error as never, injected);

    // Sweep 2 still ran — one failed sweep must not abort the other.
    expect(h.instanceFindMany).toHaveBeenCalledTimes(1);
  });

  it('is unchanged on a fully-successful run, and a clean empty run stays 200', async () => {
    const { GET } = await import('@/app/api/cron/workflow-notifications/route');
    const res = await GET(cronRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.stats).toMatchObject({
      overdueSent: M,
      overdueErrors: 0,
      blockedEmailsSent: 0,
      blockedEmailErrors: 0,
      sweepsFailed: 0,
    });
    expect(body.failureCount).toBe(0);
  });
});
