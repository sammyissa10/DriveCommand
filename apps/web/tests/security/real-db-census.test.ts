/**
 * quick-608 — the real-database suite census.
 *
 * The runtime guard (`tests/setup/production-db-guard.ts`, applied by both vitest
 * configs) is what makes reaching production IMPOSSIBLE. This file is what makes
 * reaching it VISIBLE: it pins the list of suites that create data, asserts each
 * one routes through `requireDisposableDatabase()`, and asserts the setup file is
 * still wired into both configs.
 *
 * WHY BOTH. A suite that skips the helper still cannot reach production — the
 * setup file has already replaced `DATABASE_URL` with an unroutable sentinel, so
 * the worst case is a connection error against 127.0.0.1:1. What it loses is the
 * explanation: instead of "REFUSING TO RUN — DATABASE_URL named the PRODUCTION
 * project", the author sees ECONNREFUSED and has to work out why. This census
 * turns that from a debugging session into a failing assertion at review time.
 *
 * The audit this closes is docs/audits/production-test-writes.md. Note what it
 * found: the three suites that create `FI-Test-`/`MT-Test-` tenants were missed
 * by an investigation that searched for `ZZ-THROWAWAY`, because a name prefix is
 * not a census. Hence the detector below keys on the WRITE (`tenant.create`,
 * `INSERT INTO "Tenant"`), never on the name.
 *
 * LINE ENDINGS are normalised (quick-546): this repo is `core.autocrlf=true` with
 * an LF index, and a source scan that does not normalise matches nothing and
 * passes vacuously against empty strings.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const APP_ROOT = resolve(__dirname, '../..');

/**
 * Every suite that creates a tenant. Ten, not the seven the audit first found.
 *
 * The last three were invisible to a `ZZ-` sweep: they name their tenants
 * `FI-Test-Tenant-…` and `MT-Test-OrgA/B-…`. They had never actually written to
 * production — confirmed by a production query returning zero such tenants — but
 * only because they lack the hand-rolled `.env.local` loader the other seven
 * carry, which is an accident of how they were written and not a control.
 */
const DATA_CREATING_SUITES: readonly string[] = [
  'tests/carrier/document-import-commit-rollback.test.ts',
  'tests/carrier/document-import-commit-out-of-service.test.ts',
  'tests/carrier/document-import-commit-windows.test.ts',
  'tests/carrier/document-import-commit-notification-isolation.test.ts',
  'tests/carrier/inspection-blocked-side-effects.test.ts',
  'tests/carrier/driver-incident-report-persists.test.ts',
  'tests/carrier/sample-record-picker-filtering.test.ts',
  'tests/carrier/financial-integrity.test.ts',
  'tests/carrier/multi-tenancy.test.ts',
  'tests/carrier/contracted-route-journey.test.ts',
];

/**
 * Files that create tenants but are NOT vitest suites collected by the default
 * config, and carry their own production refusal from quick-598. Listed so the
 * detector's output can be reconciled to zero rather than filtered silently.
 */
const SEPARATELY_GUARDED: readonly string[] = [
  'tests/security/db-fixture-setup.ts', // hardcoded production-ref throw at module load
];

function read(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

/**
 * Comments out, code in.
 *
 * Every scan below asks "does this file DO x", and a file that merely DESCRIBES
 * x — including this one, and including `real-db.ts`'s own header explaining why
 * it no longer uses a single `$transaction` — must not answer yes. The first
 * draft of this file matched its own regex literals and `real-db.ts`'s prose, so
 * two assertions failed against correct code. Same trap quick-600 hit when a
 * `pool.on('connect'` check false-positived on the comment describing the
 * invariant it protected.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * Keyed on the WRITE, never on the tenant name. A name prefix is not a census —
 * that is precisely how three of these ten went unnoticed by an investigation
 * that searched for `ZZ-THROWAWAY`.
 *
 * AND on actually resolving a connection, because "creates a tenant" alone also
 * catches pure source-scanning suites that only quote the call:
 * `tests/security/provisioning-tenant-guc.test.ts` asserts the ORDER of
 * `tx.tenant.create(` inside application source and never opens a socket. It
 * needs no guard, and listing it as needing one would be a rule that is red
 * against correct code — which is a rule people learn to ignore.
 */
function createsATenant(source: string): boolean {
  const code = stripComments(source);
  const writes =
    /\btenant\.create\s*\(/.test(code) || /INSERT\s+INTO\s+"Tenant"/i.test(code);
  const connects =
    /process\.env\.DATABASE_URL/.test(code) ||
    /new Pool\s*\(/.test(code) ||
    /@\/lib\/db\/prisma/.test(code);
  return writes && connects;
}

const ALL_TEST_FILES = [...walk(join(APP_ROOT, 'tests')), ...walk(join(APP_ROOT, 'tests-db'))];

describe('real-database suite census', () => {
  // The "was it actually found" assertion. Without it, a broken walk makes every
  // equality assertion below pass against empty arrays — green, and meaningless.
  it('the scan actually found files to scan', () => {
    expect(ALL_TEST_FILES.length).toBeGreaterThan(40);
  });

  const detected = ALL_TEST_FILES.filter((f) => createsATenant(read(f)))
    .map((f) => relative(APP_ROOT, f).replace(/\\/g, '/'))
    .sort();

  it('every tenant-creating file is either a declared suite or separately guarded', () => {
    const expectedSet = [...DATA_CREATING_SUITES, ...SEPARATELY_GUARDED].sort();
    expect(detected).toEqual(expectedSet);
  });

  it.each(DATA_CREATING_SUITES)('%s calls requireDisposableDatabase()', (suite) => {
    const source = read(join(APP_ROOT, suite));
    expect(source.length).toBeGreaterThan(400);
    expect(source).toContain('requireDisposableDatabase(');
    // The old, unguarded gate must not come back.
    expect(source).not.toContain('const hasDatabase = !!process.env.DATABASE_URL;');
  });
});

describe('the production guard is wired into the runner', () => {
  /**
   * This is the assertion that makes the refusal impossible to omit. A new suite
   * is covered because the RUNNER applies the setup file, not because the suite
   * imported anything — so if this line is ever dropped from a config, every
   * unexamined suite silently regains production access.
   */
  it.each(['vitest.config.ts', 'vitest.db.config.ts'])(
    '%s registers tests/setup/production-db-guard.ts',
    (config) => {
      const source = read(join(APP_ROOT, config));
      expect(source.length).toBeGreaterThan(200);
      expect(source).toContain('./tests/setup/production-db-guard.ts');
      expect(source).toMatch(/setupFiles\s*:/);
    }
  );

  it('the guard replaces DATABASE_URL rather than deleting it', () => {
    // Load-bearing: the ten suites' hand-rolled loaders skip keys that are
    // already defined, so a DELETED DATABASE_URL would be re-read from
    // .env.local one line later and production restored.
    const source = read(join(APP_ROOT, 'tests/setup/production-db-guard.ts'));
    expect(source).toContain('process.env.DATABASE_URL = REFUSAL_SENTINEL');
    expect(source).not.toMatch(/delete\s+process\.env\.DATABASE_URL/);
  });

  it('the sentinel is unroutable, so a suite that ignores the helper still cannot reach production', () => {
    const source = read(join(APP_ROOT, 'tests/support/real-db.ts'));
    expect(source).toMatch(/REFUSAL_SENTINEL[\s\S]{0,200}127\.0\.0\.1:1/);
  });

  it('teardown does not run inside a single transaction on the app pool', () => {
    // The diagnosed cause of nine orphan tenants: ~17 deletes in one
    // $transaction on the pool the test had just exhausted, so a contended run
    // rolled back the whole cleanup.
    const code = stripComments(read(join(APP_ROOT, 'tests/support/real-db.ts')));
    expect(code.length).toBeGreaterThan(400);
    expect(code).toContain('new Pool(');
    expect(code).not.toMatch(/\$transaction/);
  });
});
