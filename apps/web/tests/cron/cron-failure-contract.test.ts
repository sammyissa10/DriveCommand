/**
 * quick-603 — the contract itself, plus a source-scanning guard over the twelve
 * fixed routes.
 *
 * WHY A SOURCE SCAN AS WELL AS THE INJECTION TESTS (quick-549's rule)
 * -------------------------------------------------------------------
 * Row/response assertions and source scans catch different classes. The eleven
 * injection tests would all stay green if somebody added a THIRTEENTH cron route
 * that wrote `success: true` unconditionally — they only know about the routes
 * they name. The scan is what notices.
 *
 * The three things a source-reading guard in this repo must have, learned the
 * hard way: CRLF normalisation (quick-546 — `core.autocrlf=true`, no
 * `.gitattributes`, so an LF end-marker does not exist in the working tree), a
 * "was the file actually found" assertion, and a length floor that is a
 * PARAMETER rather than a blanket constant (quick-562 — a legitimate one-line
 * re-export is 293 bytes, so a blanket 400-byte floor fails on healthy source).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loggerDouble } from './_cron-test-kit';

// `CronFailures.record` logs by design, so the real logger would print ~60 stack
// traces and call `Sentry.captureException` for errors this file INVENTED. The
// double keeps the real `serializeError`, which `failure-report.ts` uses.
vi.mock('@/lib/logger', async (io) => loggerDouble(io));

import {
  CronFailures,
  CRON_FAILURE_LIST_CAP,
  CRON_FAILURE_STATUS,
  cronStatus,
  describeError,
} from '@/lib/cron/failure-report';

const CRON_DIR = join(process.cwd(), 'src/app/api/cron');

/** The twelve routes Task 1 classified DELIBERATE_MISREPORTED and Task 3 fixed. */
const FIXED_ROUTES = [
  'automations',
  'carrier-auto-dispatch',
  'carrier-compliance-alerts',
  'cleanup-quarantine',
  'digest-compliance-30day',
  'digest-daily-driver',
  'digest-weekly-owner',
  'purge-deleted',
  'send-reminders',
  'trip-reminders',
  'workflow-digest',
  'workflow-notifications',
];

/** The three Task 1 classified CLEAN. They keep their literals, legitimately. */
const CLEAN_ROUTES = ['auto-close-tickets', 'mark-overdue-invoices'];

/** `readModule` normalises CRLF and enforces a PER-FILE floor, never a blanket one. */
function readModule(path: string, floorBytes: number): string {
  const raw = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  // "Was it actually found" — the failure mode of a bad read is an empty string
  // that then satisfies every "does not contain" assertion vacuously.
  expect(raw.length, `${path} is shorter than its floor of ${floorBytes} bytes`).toBeGreaterThan(
    floorBytes,
  );
  return raw;
}

describe('CronFailures — the contract', () => {
  it('`ok` is a getter over the count, so it cannot be set true beside a failure', () => {
    const f = new CronFailures();
    expect(f.ok).toBe(true);
    expect(cronStatus(f)).toBe(200);

    f.record('m', 'scope-1', new Error('boom'));
    expect(f.ok).toBe(false);
    expect(cronStatus(f)).toBe(CRON_FAILURE_STATUS);
    expect(CRON_FAILURE_STATUS).toBe(500);

    // There is no assignable `ok` field. Writing to the getter is a no-op in
    // sloppy mode and a TypeError in strict; either way the count still wins.
    try {
      (f as unknown as { ok: boolean }).ok = true;
    } catch {
      /* strict mode */
    }
    expect(f.ok).toBe(false);
  });

  it('names a failure with a real message, and carries a code when the error has one', () => {
    const f = new CronFailures();
    const withCode = Object.assign(new Error('relation does not exist'), { code: 'TC001' });
    f.record('m', 'CarrierLoad', withCode);
    f.record('m', 'Trip', 'a bare string, not an Error');

    const report = f.report();
    expect(report.failureCount).toBe(2);
    expect(report.failures[0]).toEqual({
      scope: 'CarrierLoad',
      message: 'relation does not exist',
      code: 'TC001',
    });
    expect(report.failures[1]).toEqual({
      scope: 'Trip',
      message: 'a bare string, not an Error',
    });
    expect('code' in report.failures[1]).toBe(false);
  });

  it('caps the LIST but never the COUNT, and says so when the cap bites', () => {
    const f = new CronFailures();
    const n = CRON_FAILURE_LIST_CAP + 7;
    for (let i = 0; i < n; i++) f.record('m', `scope-${i}`, new Error(`e${i}`));

    const report = f.report();
    expect(report.failureCount, 'the count is never capped').toBe(n);
    expect(report.failures).toHaveLength(CRON_FAILURE_LIST_CAP);
    expect(report.failuresTruncated, 'a silent cap is the failure mode this avoids').toBe(true);
  });

  it('does not claim truncation when the cap did not bite', () => {
    const f = new CronFailures();
    f.record('m', 's', new Error('x'));
    expect(f.report().failuresTruncated).toBeUndefined();
  });

  it('describeError never renders a container as [object Object]', () => {
    expect(describeError(new Error('real')).message).toBe('real');
    expect(describeError({ error: 'wrapped' }).message).toBe('[object Object]');
    // …which is precisely why the CONTAINER must never reach `logger.error`'s
    // slot 2. `record` takes the error itself, so it cannot.
  });
});

describe('source guard — the twelve fixed routes', () => {
  it('the cron directory still holds exactly the routes this guard names', () => {
    const dirs = readdirSync(CRON_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    // A counter-assertion: if a route is ADDED and not classified, this fails
    // loudly rather than the guard below silently covering one fewer file.
    expect(dirs).toEqual([...FIXED_ROUTES, ...CLEAN_ROUTES].sort());
  });

  for (const route of FIXED_ROUTES) {
    it(`${route} computes its success flag rather than writing a literal`, () => {
      const path = join(CRON_DIR, route, 'route.ts');
      // Per-file floor: the smallest of the twelve is purge-deleted at ~2kB.
      const src = readModule(path, 1000);

      expect(src, `${route} must import the shared contract`).toContain(
        "from '@/lib/cron/failure-report'",
      );

      // Comments are stripped so this task's own explanatory prose — which
      // quotes the old broken literals verbatim — is not matched as code.
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n');

      expect(code.length, 'stripping comments must not empty the file').toBeGreaterThan(400);
      expect(code, `${route} still writes an unconditional success literal`).not.toMatch(
        /\b(success|ok):\s*true\b/,
      );
      expect(code, `${route} must derive its flag from the accumulator`).toMatch(
        /\b(success|ok):\s*failures\.ok\b/,
      );
    });
  }

  it('purge-deleted no longer erases a failure from its total', () => {
    const src = readModule(join(CRON_DIR, 'purge-deleted/route.ts'), 1000);
    // The exact predicate the audit's verification greps for.
    expect(src).not.toContain('filter(n => n > 0)');
    expect(src).not.toContain('= -1');
  });

  it('the CLEAN routes are left alone — their literals are on paths that cannot have failed', () => {
    for (const route of CLEAN_ROUTES) {
      const src = readModule(join(CRON_DIR, route, 'route.ts'), 500);
      // Counter-assertion. Without it, deleting these two routes outright would
      // satisfy every "must not contain" assertion above.
      expect(src).toContain('success: true');
      expect(src).toContain('{ status: 500 }');
      expect(src).not.toContain("from '@/lib/cron/failure-report'");
    }
  });
});
