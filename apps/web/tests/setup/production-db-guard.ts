/**
 * Global vitest setup — takes PRODUCTION away from every test file, in every
 * worker, before any of them runs.
 *
 * Registered as a `setupFiles` entry in `vitest.config.ts` and
 * `vitest.db.config.ts`. That registration is the entire point: `setupFiles` is
 * applied by the RUNNER to every collected file, so a suite cannot fail to be
 * covered by it, cannot forget to import it, and does not have to know it exists.
 * `tests/support/real-db.ts`'s `requireDisposableDatabase()` is the other half —
 * it turns what this file does into a readable error instead of a connection
 * failure.
 *
 * WHY A SENTINEL RATHER THAN A DELETE. The ten data-creating suites hand-parse
 * `.env.local` themselves, and their loaders skip any key already present:
 *
 *     if (process.env[key] !== undefined) continue;
 *
 * So deleting `DATABASE_URL` would leave it undefined, the loader would read
 * `.env.local`, and production would be restored one line later. A DEFINED value
 * is the only thing those loaders leave alone. The sentinel is also a valid but
 * unroutable connection string, so a suite that ignores `real-db.ts` entirely
 * still cannot reach production — it fails against 127.0.0.1:1.
 *
 * WHAT THIS DOES NOT DO. It does not make the ~2000 mocked unit tests fail.
 * They never open a connection, so replacing a string they do not read changes
 * nothing for them. Only a suite that actually dials the database notices.
 *
 * Source: docs/audits/production-test-writes.md (quick-608).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  isProductionUrl,
  PRODUCTION_OPT_IN,
  PRODUCTION_REF,
  productionOptInPresent,
  REFUSAL_SENTINEL,
} from '../support/real-db';

/**
 * The same candidate list, in the same order, that the suites' own loaders use.
 * This file has to see what THEY would see, or it would clear an environment
 * they are about to re-populate from a file it never looked at.
 */
const ENV_CANDIDATES = [
  resolve(process.cwd(), '.env.local'),
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '..', '..', '.env.local'),
  resolve(process.cwd(), '..', '..', '.env'),
];

function readDatabaseUrlFromFiles(): string | undefined {
  for (const file of ENV_CANDIDATES) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      if (trimmed.slice(0, eq).trim() !== 'DATABASE_URL') continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return value;
    }
  }
  return undefined;
}

function banner(message: string): void {
  // stderr, so a `--json` reporter's stdout payload stays parseable.
  if (!process.env.__PRODUCTION_DB_GUARD_ANNOUNCED) {
    process.env.__PRODUCTION_DB_GUARD_ANNOUNCED = '1';
    console.error(message);
  }
}

if (productionOptInPresent(process.env)) {
  // Explicit opt-in. Say so loudly on every run — this is the state in which a
  // test suite is allowed to write to the production database.
  if (isProductionUrl(process.env.DATABASE_URL) || isProductionUrl(readDatabaseUrlFromFiles())) {
    banner(
      `\n[test-db-guard] ${PRODUCTION_OPT_IN}=1 — real-database suites are ALLOWED to write to ` +
        `the PRODUCTION project (${PRODUCTION_REF}). This is almost never what you want.\n`
    );
  }
} else {
  const fromEnv = process.env.DATABASE_URL;

  /**
   * ONLY when the process ALREADY carries a production URL. An ABSENT
   * `DATABASE_URL` is left absent, and that restraint is load-bearing.
   *
   * The first draft also set the sentinel when `DATABASE_URL` was undefined and
   * `.env.local` held production — reasoning that a suite was about to read the
   * file anyway. That INVENTED a `DATABASE_URL` for every other suite in the
   * run. Six suites that had always skipped (`tests/security/audit-log-isolation`,
   * `carrier-driver-pii`, `restricted-documents`, `tenant-header-forgery`,
   * `inspection-route-guard`, `driver-pay-tenant-isolation`) gate on
   * `!!process.env.DATABASE_URL`, so a defined sentinel flipped them from
   * SKIPPED to FAILING against an unroutable host — sixteen newly red files,
   * none of them a real defect. A guard that breaks suites it was not aimed at
   * is a guard people rip out.
   *
   * The file-sourced case is covered by the OTHER mechanism instead:
   * `requireDisposableDatabase()` re-checks the resolved string itself, after
   * the suite's own loader has run, and throws on the production ref. That is
   * why `real-db.ts` carries a second `isProductionUrl` check that looks
   * redundant and is not.
   */
  if (isProductionUrl(fromEnv)) {
    process.env.DATABASE_URL = REFUSAL_SENTINEL;
    // DIRECT_URL is left alone on purpose: nothing in the test path reads it,
    // and quick-607 established that it must stay privileged for migrations.
  }

  // The BANNER fires on either signal — an exported production URL, or an
  // absent one with production sitting in `.env.local` waiting to be read. Both
  // are runs in which real-database suites will refuse, so both are worth
  // announcing. Only the first CHANGES the environment; see above for why.
  if (isProductionUrl(fromEnv) || isProductionUrl(readDatabaseUrlFromFiles())) {
    banner(
      `\n[test-db-guard] DATABASE_URL resolves to the PRODUCTION project (${PRODUCTION_REF}).\n` +
        `[test-db-guard] Real-database suites will REFUSE to run. Nothing will be written.\n` +
        `[test-db-guard] Point DATABASE_URL at staging to run them, or set ${PRODUCTION_OPT_IN}=1.\n` +
        `[test-db-guard] See docs/audits/production-test-writes.md\n`
    );
  }
}
