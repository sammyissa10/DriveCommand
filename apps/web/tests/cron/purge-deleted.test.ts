/**
 * quick-603 — `purge-deleted`, the worked example.
 *
 * Pre-fix behaviour, measured over HTTP by quick-602: seven `deleteMany` calls
 * raised `TC001`, the route returned `200 {"success":true,"totalPurged":0}`, and
 * each failure logged as `Error: [object Object]`.
 *
 * Three assertions, all three load-bearing:
 *   1. the response says so;
 *   2. the log carries a REAL message in slot 2;
 *   3. the batch still continued — 1 of 7 fails, the other 6 are still attempted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  cronRequest,
  loggerDouble,
  InjectedFailure,
  expectNamedInLog,
  expectFailureReported,
} from './_cron-test-kit';

const MODELS = [
  'carrierLoad',
  'trip',
  'carrierContract',
  'carrierClient',
  'carrierDriver',
  'carrierTruck',
  'route',
] as const;

/** M = 7. The failing one is deliberately NOT the last, so "continued" is testable. */
const FAILING_CLIENT_KEY = 'carrierContract';
/** The route names models in PascalCase; the Prisma client keys them in camelCase. */
const FAILING_MODEL_NAME = 'CarrierContract';
const M = MODELS.length;

/**
 * `vi.hoisted` because `vi.mock`'s factory is hoisted above every other
 * statement in the file: a plain `const` initialised at module scope is still
 * `undefined` when the factory runs, and `beforeEach` would then reach for
 * `.mockImplementation` on nothing.
 */
const deleteManySpies = vi.hoisted(() => {
  const models = [
    'carrierLoad',
    'trip',
    'carrierContract',
    'carrierClient',
    'carrierDriver',
    'carrierTruck',
    'route',
  ];
  const spies: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of models) spies[m] = vi.fn();
  return spies;
});

vi.mock('@/lib/logger', async (io) => loggerDouble(io));
vi.mock('@/lib/db/prisma', () => {
  const client: Record<string, unknown> = {};
  for (const m of Object.keys(deleteManySpies)) {
    client[m] = { deleteMany: deleteManySpies[m] };
  }
  return { prisma: client };
});

const injected = new InjectedFailure(FAILING_CLIENT_KEY);

describe('cron/purge-deleted — injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const m of MODELS) {
      deleteManySpies[m].mockImplementation(async () =>
        m === FAILING_CLIENT_KEY ? Promise.reject(injected) : { count: 3 },
      );
    }
  });

  it('reports the failure in the status and the body, names the model, and keeps the survivors in the total', async () => {
    const { logger } = await import('@/lib/logger');
    const { GET } = await import('@/app/api/cron/purge-deleted/route');

    const res = await GET(cronRequest());
    const body = await res.json();

    // 1. THE RESPONSE SAYS SO.
    expectFailureReported(body, res.status, FAILING_MODEL_NAME);

    // 2. THE LOG CARRIES A REAL MESSAGE.
    expectNamedInLog(logger.error as never, injected);

    // 3. THE BATCH STILL CONTINUED — all M models were attempted, not 1 and not 2.
    for (const m of MODELS) {
      expect(deleteManySpies[m], `${m}.deleteMany should have been attempted`).toHaveBeenCalledTimes(1);
    }
    expect(Object.values(deleteManySpies).filter((s) => s.mock.calls.length === 1)).toHaveLength(M);

    // …and the survivors' counts are still in the total. 6 survivors x 3 = 18.
    expect(body.totalPurged).toBe((M - 1) * 3);
  });

  /**
   * Assertion 2, ISOLATED.
   *
   * In the combined test above, `expectFailureReported` runs first and fails
   * first on pre-fix code, so the RED run never reaches the log assertion and
   * cannot demonstrate it. This one asserts nothing but the log, which is what
   * makes `Error: [object Object]` provable on its own.
   */
  it('logs the real error in slot 2, never `[object Object]`', async () => {
    const { logger } = await import('@/lib/logger');
    const { GET } = await import('@/app/api/cron/purge-deleted/route');
    await GET(cronRequest());
    expectNamedInLog(logger.error as never, injected);
  });

  it('never writes a negative sentinel into `results`, so nothing can erase a failure from the total', async () => {
    const { GET } = await import('@/app/api/cron/purge-deleted/route');
    const res = await GET(cronRequest());
    const body = await res.json();

    // The pre-fix code wrote `results[name] = -1` and then filtered it out of the
    // sum. `results` now holds successes only; the failure lives in `failures`.
    const values = Object.values(body.results as Record<string, number>);
    expect(values.every((n) => n >= 0), `results must not carry a sentinel: ${JSON.stringify(body.results)}`).toBe(true);
    expect(Object.keys(body.results as object)).not.toContain(FAILING_MODEL_NAME);
    expect(body.failureCount).toBe(1);
  });

  it('is unchanged on a fully-successful run: 200, success true, every original key present', async () => {
    for (const m of MODELS) deleteManySpies[m].mockResolvedValue({ count: 2 });

    const { GET } = await import('@/app/api/cron/purge-deleted/route');
    const res = await GET(cronRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.totalPurged).toBe(M * 2);
    expect(Object.keys(body.results as object)).toHaveLength(M);
    expect(body.failureCount).toBe(0);
    expect(body.failures).toEqual([]);
    expect(body.failuresTruncated).toBeUndefined();
  });

  it('still refuses an unauthenticated request', async () => {
    const { GET } = await import('@/app/api/cron/purge-deleted/route');
    const { NextRequest } = await import('next/server');
    const res = await GET(new NextRequest('http://localhost/api/cron/purge-deleted'));
    expect(res.status).toBe(401);
  });
});
