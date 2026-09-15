/**
 * quick-603 — `cleanup-quarantine`.
 *
 * NOTE ON WHY THIS ROUTE IS TESTED AT ALL: it is **not scheduled** and never has
 * been (`git log -S"cleanup-quarantine" -- vercel.json` is empty; the live Vercel
 * project's 14 cron definitions do not include it). quick-603 deliberately did
 * NOT add a schedule — that is a product decision. What it did fix is the
 * reporting, because the route is on the enumerated surface and it misreported:
 * `success: true` beside a non-zero `errors`, and two `[object Object]` logs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  cronRequest,
  loggerDouble,
  InjectedFailure,
  expectNamedInLog,
  expectFailureReported,
} from './_cron-test-kit';

const h = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('@/lib/logger', async (io) => loggerDouble(io));
vi.mock('@/lib/storage/s3-client', () => ({
  s3Client: { send: h.send },
  getBucketName: () => 'test-bucket',
}));

/** M = 4 stale quarantine objects; object 2 of 4 refuses to delete. */
const M = 4;
const OLD = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4h old — past the 1h threshold
const OBJECTS = Array.from({ length: M }, (_, i) => ({
  Key: `tenant-abc/_quarantine/file-${i}.pdf`,
  LastModified: OLD,
}));
const FAILING_KEY = 'tenant-abc/_quarantine/file-1.pdf';
const injected = new InjectedFailure(FAILING_KEY);

/** Both commands go through the same `s3Client.send`; tell them apart by shape. */
function isList(cmd: unknown): boolean {
  return typeof (cmd as { input?: { Prefix?: string } })?.input?.Prefix === 'string';
}
function deletedKey(cmd: unknown): string | undefined {
  return (cmd as { input?: { Key?: string } })?.input?.Key;
}

describe('cron/cleanup-quarantine — injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.send.mockImplementation(async (cmd: unknown) => {
      if (isList(cmd)) return { Contents: OBJECTS, IsTruncated: false };
      if (deletedKey(cmd) === FAILING_KEY) return Promise.reject(injected);
      return {};
    });
  });

  it('reports the failure, names the object key, and STILL attempts all M deletes', async () => {
    const { logger } = await import('@/lib/logger');
    const { GET } = await import('@/app/api/cron/cleanup-quarantine/route');

    const res = await GET(cronRequest());
    const body = await res.json();

    // 1. THE RESPONSE SAYS SO.
    expectFailureReported(body, res.status, FAILING_KEY);

    // 2. THE LOG CARRIES A REAL MESSAGE (this route logged `[object Object]`).
    expectNamedInLog(logger.error as never, injected);

    // 3. THE BATCH STILL CONTINUED — M deletes attempted (plus the one list call).
    const deletes = h.send.mock.calls.filter(([cmd]) => !isList(cmd));
    expect(deletes).toHaveLength(M);
    expect(body.scanned).toBe(M);
    expect(body.deleted).toBe(M - 1);
    expect(body.errors).toBe(1);
  });

  it('is unchanged on a fully-successful run', async () => {
    h.send.mockImplementation(async (cmd: unknown) =>
      isList(cmd) ? { Contents: OBJECTS, IsTruncated: false } : {},
    );

    const { GET } = await import('@/app/api/cron/cleanup-quarantine/route');
    const res = await GET(cronRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body).toMatchObject({ scanned: M, deleted: M, errors: 0, failureCount: 0 });
  });

  it('names the list failure rather than logging it as an object', async () => {
    const listInjected = new InjectedFailure('ListObjectsV2');
    h.send.mockImplementation(async (cmd: unknown) =>
      isList(cmd) ? Promise.reject(listInjected) : {},
    );

    const { logger } = await import('@/lib/logger');
    const { GET } = await import('@/app/api/cron/cleanup-quarantine/route');
    const res = await GET(cronRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.failureCount).toBe(1);
    expectNamedInLog(logger.error as never, listInjected);
  });
});
