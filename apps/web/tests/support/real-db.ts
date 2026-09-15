/**
 * The single door for any test suite that touches a REAL database.
 *
 * WHY THIS EXISTS — quick-608, from `docs/audits/production-test-writes.md`.
 *
 * Ten suites under `tests/carrier/` create a throwaway tenant and exercise the
 * real commit path against it. Every one of them resolved its connection from
 * `apps/web/.env.local`, which names PRODUCTION, and none carried any refusal.
 * Nine orphan tenants accumulated in production between 2026-08-27 and
 * 2026-09-15, three of them during quick-607's own verification runs.
 *
 * The guard those suites DID carry — `assertDisposable()` plus a
 * `PROTECTED_TENANT_ID` — protects a TENANT, not a DATABASE. It worked
 * perfectly: every write landed inside the suite's own throwaway tenant, and
 * measurement confirmed no real tenant's data was ever touched. It simply
 * answered a different question from the one that mattered, because the
 * throwaway tenant was being created in production.
 *
 * So the check here is on the DATABASE. It resolves the Supabase project ref out
 * of the connection string and refuses the production ref outright.
 *
 * TWO MECHANISMS, DELIBERATELY — see `tests/setup/production-db-guard.ts` for
 * the other half. That one is a global `setupFiles` entry the RUNNER applies, so
 * a suite cannot fail to be covered by it. This one is a function a suite CALLS,
 * so the block is a loud throw rather than a silent skip. Neither alone is
 * enough: the setup file cannot produce a good error message for a suite it
 * knows nothing about, and a helper can always be forgotten.
 */

import { Pool } from 'pg';

/** Supabase project ref of PRODUCTION. Never a test target. */
export const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';

/**
 * What `production-db-guard.ts` writes into `DATABASE_URL` when it takes
 * production away.
 *
 * DEFINED, never deleted — and that is load-bearing. The hand-rolled `.env.local`
 * loaders in these suites skip any key already present
 * (`if (process.env[key] !== undefined) continue`), so a DELETED `DATABASE_URL`
 * would simply be re-read from the file and production restored. A sentinel is
 * the only value those existing loaders will leave alone.
 *
 * It is also a syntactically valid but unroutable connection string, so a suite
 * that ignores this module entirely still cannot reach production — it gets a
 * connection error against 127.0.0.1:1 instead.
 */
export const REFUSAL_SENTINEL =
  'postgresql://REFUSED-BY-production-db-guard@127.0.0.1:1/REFUSED';

/** The env var that opts a run back into writing to production. */
export const PRODUCTION_OPT_IN = 'ALLOW_PRODUCTION_TEST_WRITES';

/**
 * The Supabase project ref — the only part of a connection string that says
 * WHICH DATABASE. Returns null for a string that carries none (a local database,
 * a CI dummy, the sentinel above), which is a real answer and not an error.
 */
export function projectRefOf(connectionString: string): string | null {
  const fromUser = /:\/\/[^:/@]*\.([a-z]{20})(?::|@)/.exec(connectionString);
  if (fromUser) return fromUser[1];
  const fromHost = /@db\.([a-z]{20})\.supabase\.(?:co|com)/.exec(connectionString);
  if (fromHost) return fromHost[1];
  return null;
}

export function isProductionUrl(connectionString: string | undefined): boolean {
  if (!connectionString) return false;
  return projectRefOf(connectionString) === PRODUCTION_REF;
}

export function productionOptInPresent(env: Record<string, string | undefined>): boolean {
  return env[PRODUCTION_OPT_IN] === '1';
}

export class ProductionDatabaseRefusal extends Error {}

/**
 * Call this INSTEAD of `const hasDatabase = !!process.env.DATABASE_URL`.
 *
 * Three outcomes, and the split between skip and throw is deliberate:
 *
 *   - `DATABASE_URL` ABSENT       -> `{ hasDatabase: false }`, the suite skips.
 *     Unchanged behaviour, and it must stay unchanged: this is CI, which runs
 *     `npx vitest run` with a dummy localhost URL, and a machine with no env
 *     file at all.
 *   - `DATABASE_URL` = PRODUCTION -> **THROWS**. A refusal is not a skip. These
 *     suites were writing to production; a silent skip would hide that fact the
 *     same way `tests/isolation/` reported "no tests" for months.
 *   - anything else               -> `{ hasDatabase: true, url }`, the suite runs.
 *
 * Called at MODULE SCOPE by every data-creating suite, so the throw happens at
 * import — before `beforeAll`, and therefore before any row can exist.
 */
export function requireDisposableDatabase(suiteName: string): {
  hasDatabase: boolean;
  url: string;
} {
  const url = process.env.DATABASE_URL;

  if (url === REFUSAL_SENTINEL) {
    throw new ProductionDatabaseRefusal(
      `\n${suiteName} REFUSING TO RUN — DATABASE_URL named the PRODUCTION project ` +
        `(${PRODUCTION_REF}).\n\n` +
        `This suite CREATES tenants, users, clients, drivers, trucks, facilities, imports,\n` +
        `trips, stops and loads. Nine orphan tenants are already in production because it\n` +
        `used to run there — see docs/audits/production-test-writes.md.\n\n` +
        `To run it, point DATABASE_URL at a disposable database:\n` +
        `  DATABASE_URL="<staging direct url>" npx vitest run <this file>\n\n` +
        `To override anyway (you almost certainly do not want this):\n` +
        `  ${PRODUCTION_OPT_IN}=1\n`
    );
  }

  if (!url) return { hasDatabase: false, url: '' };

  // Second line of defence. The setup file normally replaces a production URL
  // before this runs, but a suite whose env was assembled some other way (an
  // explicit export, a loader that ran first) reaches production without ever
  // passing through it. Check the string itself, not just the sentinel.
  if (isProductionUrl(url) && !productionOptInPresent(process.env)) {
    throw new ProductionDatabaseRefusal(
      `\n${suiteName} REFUSING TO RUN — DATABASE_URL names the PRODUCTION project ` +
        `(${PRODUCTION_REF}).\n` +
        `Point DATABASE_URL at a disposable database, or set ${PRODUCTION_OPT_IN}=1.\n`
    );
  }

  return { hasDatabase: true, url };
}

/**
 * FK-ordered delete list for a throwaway tenant. Children first.
 *
 * Raw SQL rather than Prisma delegates because this runs on its own connection
 * with no Prisma client — see `teardownThrowawayTenant`. Each entry is a table
 * and the predicate that scopes it to one tenant.
 *
 * `NotificationLog` and `in_app_notifications` are here because both are RESTRICT
 * foreign keys to `Tenant` that were once missing from the Prisma-era list; the
 * 2026-09-04 orphan carries 12 `NotificationLog` rows for exactly that reason
 * (quick-551). `TenantNotificationSettings` is CASCADE and correctly absent.
 */
const TEARDOWN_STATEMENTS: readonly string[] = [
  `DELETE FROM carrier_documents WHERE dispatch_id IN (SELECT id FROM dispatches WHERE org_id = $1)`,
  `DELETE FROM stops WHERE dispatch_id IN (SELECT id FROM dispatches WHERE org_id = $1)`,
  `DELETE FROM loads WHERE org_id = $1`,
  `DELETE FROM dispatches WHERE org_id = $1`,
  `DELETE FROM facility_external_references WHERE org_id = $1`,
  `DELETE FROM document_import_pages WHERE org_id = $1`,
  `DELETE FROM document_imports WHERE org_id = $1`,
  `DELETE FROM document_profiles WHERE org_id = $1`,
  `DELETE FROM carrier_truck_defects WHERE org_id = $1`,
  `DELETE FROM "StepInstance" WHERE "tenantId" = $1`,
  `DELETE FROM "PlaybookInstance" WHERE "tenantId" = $1`,
  `DELETE FROM "PlaybookStep" WHERE "tenantId" = $1`,
  `DELETE FROM "PlaybookTrigger" WHERE "tenantId" = $1`,
  `DELETE FROM "Playbook" WHERE "tenantId" = $1`,
  `DELETE FROM "StepTemplate" WHERE "tenantId" = $1`,
  `DELETE FROM "DriverIncident" WHERE "tenantId" = $1`,
  `DELETE FROM route_templates WHERE org_id = $1`,
  `DELETE FROM facilities WHERE org_id = $1`,
  `DELETE FROM carrier_trucks WHERE org_id = $1`,
  `DELETE FROM carrier_drivers WHERE org_id = $1`,
  `DELETE FROM client_contacts WHERE org_id = $1`,
  `DELETE FROM contracts WHERE org_id = $1`,
  `DELETE FROM clients WHERE org_id = $1`,
  `DELETE FROM "NotificationLog" WHERE "tenantId" = $1`,
  `DELETE FROM "UserNotificationPreference" WHERE "tenantId" = $1`,
  `DELETE FROM "NotificationSubscription" WHERE "tenantId" = $1`,
  `DELETE FROM in_app_notifications WHERE org_id = $1`,
  `DELETE FROM "DispatchOverrideAudit" WHERE "tenantId" = $1`,
  `DELETE FROM "TenantNotificationSettings" WHERE "tenantId" = $1`,
  `DELETE FROM "ActivationProgress" WHERE "tenantId" = $1`,
  `DELETE FROM "User" WHERE "tenantId" = $1`,
  `DELETE FROM "Tenant" WHERE id = $1`,
];

/** Tables re-counted after the delete. A survivor in any of these throws. */
const VERIFY_COUNTS: readonly [string, string][] = [
  ['Tenant', `SELECT count(*)::int AS n FROM "Tenant" WHERE id = $1`],
  ['users', `SELECT count(*)::int AS n FROM "User" WHERE "tenantId" = $1`],
  ['dispatches', `SELECT count(*)::int AS n FROM dispatches WHERE org_id = $1`],
  ['loads', `SELECT count(*)::int AS n FROM loads WHERE org_id = $1`],
  ['document_imports', `SELECT count(*)::int AS n FROM document_imports WHERE org_id = $1`],
  ['facilities', `SELECT count(*)::int AS n FROM facilities WHERE org_id = $1`],
  ['carrier_drivers', `SELECT count(*)::int AS n FROM carrier_drivers WHERE org_id = $1`],
  ['carrier_trucks', `SELECT count(*)::int AS n FROM carrier_trucks WHERE org_id = $1`],
  ['clients', `SELECT count(*)::int AS n FROM clients WHERE org_id = $1`],
  ['NotificationLog', `SELECT count(*)::int AS n FROM "NotificationLog" WHERE "tenantId" = $1`],
  ['in_app_notifications', `SELECT count(*)::int AS n FROM in_app_notifications WHERE org_id = $1`],
];

/**
 * Delete a throwaway tenant and everything under it, on a connection this
 * function owns.
 *
 * THREE DELIBERATE DEPARTURES from the `afterAll` this replaces, each aimed at
 * the diagnosed cause rather than at the symptom:
 *
 *  1. ITS OWN POOL. The old teardown ran on the app's Prisma pool — the same
 *     pool the test had just exhausted. The recorded failures are
 *     `Unable to start a transaction in the given time` and `timeout exceeded
 *     when trying to connect`: pool contention killed the test and then killed
 *     the cleanup. A teardown that can only run when the run was healthy enough
 *     not to need it is not a teardown. This opens a fresh 1-connection pool.
 *
 *  2. NO SINGLE TRANSACTION. The old deletes were one `$transaction`, so any
 *     failure rolled back ALL of them — which is why every surviving orphan has
 *     every child row still intact, rather than a partial delete. Outside a
 *     transaction, a statement that fails leaves the ones before it done, so a
 *     bad run shrinks the orphan instead of preserving it whole.
 *
 *  3. RETRY WITH BACKOFF per statement, because contention is transient and the
 *     whole point is to survive a run that is already struggling.
 *
 * Verification is kept exactly as it was: re-count, and THROW on any survivor. A
 * silent cleanup failure leaves orphans in a database, which is worse than a red
 * test.
 */
export async function teardownThrowawayTenant(opts: {
  tenantId: string;
  tenantName: string;
  connectionString: string;
  /** Guards against ever being pointed at a real tenant id. */
  protectedTenantId?: string;
}): Promise<void> {
  const { tenantId, tenantName, connectionString, protectedTenantId } = opts;

  if (!tenantId) return;
  if (protectedTenantId && tenantId === protectedTenantId) {
    throw new Error(`REFUSED: teardown was handed the protected tenant ${protectedTenantId}`);
  }
  if (isProductionUrl(connectionString) && !productionOptInPresent(process.env)) {
    throw new ProductionDatabaseRefusal(
      `REFUSED: teardown was handed a PRODUCTION connection string (${PRODUCTION_REF}).`
    );
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 30_000,
    idleTimeoutMillis: 5_000,
  });

  try {
    for (const sql of TEARDOWN_STATEMENTS) {
      await runWithRetry(pool, sql, tenantId);
    }

    const survivors: string[] = [];
    for (const [label, sql] of VERIFY_COUNTS) {
      const res = await runWithRetry(pool, sql, tenantId);
      const n = res?.rows?.[0]?.n ?? 0;
      if (n > 0) survivors.push(`${label}=${n}`);
    }

    if (survivors.length > 0) {
      throw new Error(
        `CLEANUP FAILED — orphan rows left for throwaway tenant ${tenantId} ` +
          `(${tenantName}): ${survivors.join(', ')}`
      );
    }
  } finally {
    await pool.end().catch(() => {
      /* best effort: the process is exiting either way */
    });
  }
}

/** Three attempts, 250ms / 1s backoff. Contention is transient; a hard error is not. */
async function runWithRetry(
  pool: Pool,
  sql: string,
  tenantId: string
): Promise<{ rows: { n?: number }[] }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await pool.query(sql, [tenantId]);
    } catch (err) {
      lastError = err;
      // A missing table means this repo's schema moved on; retrying cannot help
      // and swallowing it would hide a teardown list that has gone stale.
      const code = (err as { code?: string }).code;
      if (code === '42P01' || code === '42703') throw err;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 250 * (attempt + 1) * 2));
    }
  }
  throw lastError;
}
