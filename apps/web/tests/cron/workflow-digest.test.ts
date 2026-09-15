/**
 * quick-603 — `workflow-digest`.
 *
 * Its per-recipient email catch had no counter, so every recipient of a tenant
 * could fail to receive the digest and `tenantsSent++` still ran below. All
 * three of its `logger.error` calls also passed `{ error: … }` in slot 2.
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
  instanceFindManyAdmin: vi.fn(),
  transaction: vi.fn(),
  sendEmail: vi.fn(),
  notificationFindFirst: vi.fn(),
  userFindMany: vi.fn(),
}));

vi.mock('@/lib/logger', async (io) => loggerDouble(io));
vi.mock('@/lib/db/admin-prisma', () => ({
  getAdminDb: vi.fn(async () => ({ playbookInstance: { findMany: h.instanceFindManyAdmin } })),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: h.transaction }, TX_OPTIONS: {} }));
vi.mock('@/lib/email/resend-client', () => ({ sendEmail: h.sendEmail }));
vi.mock('@/emails/workflow-safety-digest', () => ({ WorkflowSafetyDigestEmail: () => null }));
vi.mock('@/lib/app-url', () => ({ getAppBaseUrl: () => 'https://example.test' }));

/** M = 4 recipients on one tenant; recipient 2 of 4 bounces. */
const M = 4;
const RECIPIENTS = Array.from({ length: M }, (_, i) => ({
  id: `user-${i}`,
  email: `u${i}@example.test`,
  firstName: `U${i}`,
}));
const FAILING_EMAIL = 'u1@example.test';

/**
 * The route drives four separate `prisma.$transaction(async tx => …)` calls.
 * One fake `tx` serves them all — each callback only touches the delegate it
 * needs, so an over-supplied stub is harmless and a per-call stub would be four
 * near-identical objects.
 */
function fakeTx() {
  return {
    $executeRaw: vi.fn(async () => 0),
    playbookNotification: { findFirst: h.notificationFindFirst, create: vi.fn(async () => ({})) },
    stepInstance: { count: vi.fn(async () => 2) },
    playbookInstance: { count: vi.fn(async () => 1), findFirst: vi.fn(async () => ({ id: 'pi-1' })) },
    user: { findMany: h.userFindMany },
    tenant: { findUnique: vi.fn(async () => ({ name: 'Alpha Freight' })) },
  };
}

describe('cron/workflow-digest — injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.instanceFindManyAdmin.mockResolvedValue([{ tenantId: 'tenant-a' }]);
    h.notificationFindFirst.mockResolvedValue(null);
    h.userFindMany.mockResolvedValue(RECIPIENTS);
    h.sendEmail.mockResolvedValue({ id: 'em-1' });
    h.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(fakeTx()));
  });

  it('COUNTS a failed recipient email — the catch that had none — and STILL emails the other M-1', async () => {
    const injected = new InjectedFailure(FAILING_EMAIL);
    h.sendEmail.mockImplementation(async (args: { to: string }) =>
      args.to === FAILING_EMAIL ? Promise.reject(injected) : { id: 'em-1' },
    );

    const { logger } = await import('@/lib/logger');
    const { GET } = await import('@/app/api/cron/workflow-digest/route');

    const res = await GET(cronRequest());
    const body = await res.json();

    // 1. THE RESPONSE SAYS SO.
    expectFailureReported(body, res.status, 'recipient:user-1');

    // 2. THE LOG CARRIES A REAL MESSAGE (this route logged `{ error: emailErr }`).
    expectNamedInLog(logger.error as never, injected);

    // 3. THE BATCH STILL CONTINUED — M emails attempted, not 1 and not 2.
    expect(h.sendEmail).toHaveBeenCalledTimes(M);
  });

  it('reports a whole failed tenant and STILL processes the others', async () => {
    h.instanceFindManyAdmin.mockResolvedValue([
      { tenantId: 'tenant-a' },
      { tenantId: 'tenant-b' },
      { tenantId: 'tenant-c' },
    ]);
    const injected = new InjectedFailure('tenant-b');
    // Keyed on the tenant in the query, not on a call INDEX. An index assumes
    // how many transactions a tenant costs, which is exactly the kind of
    // brittle coupling that makes a test fail for the wrong reason.
    h.notificationFindFirst.mockImplementation(async (args: { where: { tenantId: string } }) =>
      args.where.tenantId === 'tenant-b' ? Promise.reject(injected) : null,
    );

    const { logger } = await import('@/lib/logger');
    const { GET } = await import('@/app/api/cron/workflow-digest/route');

    const res = await GET(cronRequest());
    const body = await res.json();

    expectFailureReported(body, res.status, 'tenant:tenant-b');
    expectNamedInLog(logger.error as never, injected);
    expect(body.tenantsErrored).toBe(1);
    expect(body.tenantsSent).toBe(2);
  });

  it('is unchanged on a fully-successful run', async () => {
    const { GET } = await import('@/app/api/cron/workflow-digest/route');
    const res = await GET(cronRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.tenantsSent).toBe(1);
    expect(body.tenantsErrored).toBe(0);
    expect(body.failureCount).toBe(0);
  });
});
