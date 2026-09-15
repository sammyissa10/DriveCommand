/**
 * quick-603 Task 6 — shared kit for the cron injection tests.
 *
 * THE CRON SECRET: the REAL guard is used, never a mock.
 * ------------------------------------------------------
 * The plan allows either mocking `@/lib/security/cron-auth` or setting
 * `CRON_SECRET` and building the Bearer header. **Every test here does the
 * second**, for one reason: `verifyCronSecret` reads `process.env.CRON_SECRET`
 * at call time and hashes both sides, so setting the env var exercises the real
 * timing-safe comparison. A mocked guard would let a route whose authentication
 * had been broken still pass every one of these tests. Doing it the same way in
 * all twelve files also means there is one place to look when one of them
 * unexpectedly 401s.
 *
 * WHY THE FAILURES ARE INJECTED AND NOT PROVOKED
 * ----------------------------------------------
 * There is no local database (DEC-3) and production is never written. Every
 * failure below is a rejected promise from a `vi.fn()` at a module boundary.
 * Nothing in these tests opens a connection.
 */
import { vi, expect } from 'vitest';
import { NextRequest } from 'next/server';

export const TEST_CRON_SECRET = 'quick-603-test-cron-secret';

/** The sentinel every test injects, so an assertion can name it exactly. */
export class InjectedFailure extends Error {
  code = 'TC001';
  constructor(what: string) {
    super(`injected failure: ${what}`);
    this.name = 'InjectedFailure';
  }
}

/** A request the real `verifyCronSecret` accepts. */
export function cronRequest(path = 'http://localhost/api/cron/test'): NextRequest {
  process.env.CRON_SECRET = TEST_CRON_SECRET;
  return new NextRequest(path, {
    headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
  });
}

/** A logger double that keeps the REAL `serializeError` (failure-report.ts uses it). */
export async function loggerDouble(importOriginal: () => Promise<unknown>) {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

/**
 * Assertion 2, factored out because getting it wrong is the whole point.
 *
 * Asserting only "the second argument is the error" would PASS on the pre-fix
 * code for the routes whose arity was already correct. Asserting only "the
 * rendered value is not '[object Object]'" would pass on a call with no second
 * argument at all. Both halves, every time.
 */
export function expectNamedInLog(
  errorSpy: { mock: { calls: unknown[][] } },
  injected: InjectedFailure,
): void {
  const calls = errorSpy.mock.calls;
  const withError = calls.filter((c) => c[1] === injected);
  expect(
    withError.length,
    `no logger.error call carried the injected error in slot 2. Calls were: ${JSON.stringify(
      calls.map((c) => [c[0], typeof c[1], String(c[1])]),
    )}`,
  ).toBeGreaterThan(0);

  for (const call of withError) {
    // `logger.ts:52` does `error instanceof Error ? error : new Error(String(error ?? message))`.
    // If slot 2 is an object literal, THAT is where '[object Object]' is born.
    expect(String(call[1])).not.toBe('[object Object]');
    expect(String(call[1])).toContain(injected.message);
  }
}

/** Assertion 1 helper — the body says a failure happened, by name. */
export function expectFailureReported(
  body: Record<string, unknown>,
  status: number,
  scopeFragment: string,
): void {
  expect(status, 'status must report the failure').toBe(500);
  expect(body.success ?? body.ok, '`success`/`ok` must not be true beside a failure').not.toBe(true);
  expect(body.failureCount as number).toBeGreaterThan(0);
  const failures = body.failures as Array<{ scope: string; message: string }>;
  expect(Array.isArray(failures)).toBe(true);
  expect(
    failures.some((f) => f.scope.includes(scopeFragment)),
    `no failure named a scope containing "${scopeFragment}". Got: ${JSON.stringify(failures)}`,
  ).toBe(true);
  expect(
    failures.some((f) => f.message.includes('injected failure')),
    `no failure carried the injected message. Got: ${JSON.stringify(failures)}`,
  ).toBe(true);
}
