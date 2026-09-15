/**
 * quick-603 — the one failure-reporting contract every scheduled route uses.
 *
 * THE PROBLEM THIS EXISTS TO END
 * -----------------------------
 * Twelve of the fifteen scheduled entry points caught a failure, kept going
 * (correctly), and then told the operator the run had succeeded. `purge-deleted`
 * was the worst of them: seven database errors produced `200 {"success":true,
 * "totalPurged":0}` and seven log lines reading `Error: [object Object]`. See
 * `docs/audits/scheduled-job-failure-reporting.md`.
 *
 * THE THREE PROPERTIES, AND WHERE EACH IS ENFORCED
 * ------------------------------------------------
 * (a) every failure is NAMED with a real message — `record()` is the only way to
 *     add one, and it demands the error itself, not a stringification.
 * (b) `success`/`ok` is NEVER true beside a non-zero failure count — `ok` is a
 *     GETTER over `count`, so there is no literal for an edit to get wrong. The
 *     routes write `success: failures.ok`, never `success: true`, and
 *     `tests/cron/cron-failure-contract.test.ts` scans the route sources to keep
 *     it that way.
 * (c) a failure is never erased from a total — `count` is incremented before
 *     anything else can happen to it and is never filtered. `purge-deleted`'s
 *     `-1` sentinel plus `.filter(n => n > 0)` was the erasure; it is deleted
 *     rather than patched, and successes and failures now live in two separate
 *     structures so there is no shared total left to erase from.
 *
 * WHY `record()` DOES THE LOGGING TOO
 * -----------------------------------
 * `logger.error(message, error, context)` takes the error SECOND. Eleven of the
 * scheduled surface's `logger.error` calls passed a context object there, which
 * `logger.ts:52` turns into `new Error('[object Object]')` and hands to
 * `Sentry.captureException` — no message, no code, no stack. Folding the log
 * into the recorder makes the right arity the only reachable one from a cron
 * route, instead of a convention twelve files have to remember. Same reasoning
 * as `commit-service.ts:264`'s `afterResponse`, which documents this exact bug.
 *
 * WHY THE LIST IS CAPPED AND THE COUNT IS NOT
 * -------------------------------------------
 * A tenant sweep that fails for 5,000 tenants must not return a 5,000-element
 * array. But a SILENT cap is the failure mode `trip-reminders:108` already
 * refuses by name — "a bounded sweep that reports 'done' reads as full coverage
 * when it is not" — so `failuresTruncated: true` appears whenever the cap bites,
 * and `failureCount` is always the true total.
 */

import { logger, serializeError } from '@/lib/logger';

/**
 * How many named failures a response body will carry.
 *
 * Lives here and nowhere else — the tests import this constant rather than
 * restating 50, so moving it is one edit.
 */
export const CRON_FAILURE_LIST_CAP = 50;

/** HTTP status for a run that failed at least once. See audit §4.6 for why 500. */
export const CRON_FAILURE_STATUS = 500;

export interface CronFailure {
  /** The thing that failed: a model name, a tenant id, a driver id, an object key. */
  scope: string;
  /** The REAL message, never `[object Object]` and never a stringified container. */
  message: string;
  /** Prisma's / Postgres' code when the error carries one. Absent otherwise. */
  code?: string;
}

export interface CronFailureReport {
  failureCount: number;
  failures: CronFailure[];
  failuresTruncated?: boolean;
}

/**
 * Pull a real message, and a code where one exists, out of a caught value.
 *
 * `instanceof Error` is safe here in a way it is not across the monorepo's
 * duplicated `@trpc/server` (quick-546): `Error` is a realm intrinsic, not a
 * package export. `logger.ts:52` makes the same test for the same reason.
 */
export function describeError(err: unknown): { message: string; code?: string } {
  const message = err instanceof Error ? err.message : String(err);
  let code: string | undefined;
  if (err !== null && typeof err === 'object' && 'code' in err) {
    const raw = (err as { code: unknown }).code;
    if (typeof raw === 'string' || typeof raw === 'number') code = String(raw);
  }
  return code === undefined ? { message } : { message, code };
}

/**
 * The accumulator a cron route carries through its loops.
 *
 * Deliberately a class with a getter rather than a plain counter: `ok` cannot be
 * assigned, so property (b) survives an edit that a boolean field would not.
 */
export class CronFailures {
  private readonly items: CronFailure[] = [];
  private total = 0;

  /**
   * Record one failure AND log it with the real `logger.error` arity.
   *
   * @param logMessage the route's own sentence — kept route-specific on purpose,
   *                   because "[CRON] purge-deleted: failed to purge Trip" is the
   *                   line an operator greps for.
   * @param scope      the thing that failed.
   * @param err        the caught value, passed through untouched.
   * @param context    anything else worth having in Sentry.
   */
  record(
    logMessage: string,
    scope: string,
    err: unknown,
    context?: Record<string, unknown>,
  ): void {
    const { message, code } = describeError(err);
    this.total += 1;
    if (this.items.length < CRON_FAILURE_LIST_CAP) {
      this.items.push(code === undefined ? { scope, message } : { scope, message, code });
    }
    // Error SECOND. `serializeError` in the context because
    // `JSON.stringify(new Error('boom'))` is `{}`.
    logger.error(logMessage, err, { ...context, scope, err: serializeError(err) });
  }

  /** The true total, never capped, never filtered. */
  get count(): number {
    return this.total;
  }

  /** A getter, so nothing can write `ok = true` beside a non-zero count. */
  get ok(): boolean {
    return this.total === 0;
  }

  /** The additive keys every fixed route merges into its existing body. */
  report(): CronFailureReport {
    const base: CronFailureReport = { failureCount: this.total, failures: [...this.items] };
    if (this.total > this.items.length) base.failuresTruncated = true;
    return base;
  }
}

/**
 * 200 on a clean run, 500 once anything has failed.
 *
 * Vercel does NOT retry a non-2xx cron response, so this cannot cause a resend;
 * what it buys is that the invocation is coloured Error red in the runtime log
 * and is reachable with a `level=error` filter. 207 was rejected because it
 * carries no log level at all and is therefore indistinguishable from a 200 in
 * the one surface an operator scans. Both facts are cited in audit §4.
 */
export function cronStatus(failures: CronFailures): number {
  return failures.ok ? 200 : CRON_FAILURE_STATUS;
}
