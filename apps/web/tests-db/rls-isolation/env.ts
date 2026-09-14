/**
 * quick-598 — shared connection guard, fixture loader and target list for the
 * REAL RLS isolation suite.
 *
 * WHY THIS SUITE EXISTS
 * ---------------------
 * The 17 tests in `src/__tests__/isolation/` that this suite replaces contained
 * ZERO database references. Every one of them declared a string literal and
 * asserted that literal against itself three lines later:
 *
 *     const policyExpression = `${expectedTenantColumn} = ${expectedFunction}`;
 *     expect(policyExpression).toBe('org_id = current_tenant_id()');
 *
 * They passed identically with every policy in the database dropped
 * (quick-597 section 6 measured exactly that). This file's whole job is to make
 * the replacement incapable of that: it connects, it refuses to skip, and every
 * assertion is against a row count a real Postgres returned.
 *
 * WHY IT LIVES AT `apps/web/tests-db/` AND NOT UNDER `tests/`
 * ----------------------------------------------------------
 * `.github/workflows/ci.yml` runs `npx vitest run` with a DUMMY
 * `DATABASE_URL` (`postgresql://ci:ci@localhost:5432/ci`). `vitest.config.ts`
 * collects `tests/**` AND `src/__tests__/**`, so a DB-backed suite under
 * either path breaks CI. `tests-db/` matches no default include glob and has
 * its own `vitest.db.config.ts`. `npx vitest list` under the default config
 * returns zero `tests-db` paths — that is asserted in the task's verification,
 * not assumed.
 *
 * STAGING ONLY. THIS FILE MUST NEVER IMPORT `scripts/_bootstrap-env`.
 * ------------------------------------------------------------------
 * `_bootstrap-env.ts:53-55` runs `process.env.DATABASE_URL = process.env.DIRECT_URL`
 * UNCONDITIONALLY, and `.env`, `.env.local` and `apps/web/.env.local` ALL point
 * `DIRECT_URL` at PRODUCTION. This file loads `apps/web/.env.staging`
 * explicitly and refuses on the production project ref. Nothing here ever
 * prints a connection string.
 *
 * IT FAILS, IT NEVER SKIPS.
 * -------------------------
 * `tests/isolation/setup.ts` uses `const describeWithDb = hasDatabase ? describe : describe.skip`.
 * That pattern is the reason its ten tests could sit in the repo for months
 * reporting nothing — a green tick that means "no database was configured" is
 * indistinguishable from a green tick that means "isolation holds". Missing
 * env, missing fixtures and a failed connection are all THROWS here.
 */

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
export const STAGING_REF = 'wyixpgunnjmzguhggocz';

const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');

// quick-598 follow-up — read the GITIGNORED runtime handshake file, not
// quick-597's committed evidence copy.
//
// global-setup.ts seeds fixtures before every run and each seed mints fresh
// UUIDs, so pointing this at the evidence file made every test run rewrite 23
// lines of a committed artefact and leave the working tree dirty. That matters
// beyond tidiness: "vercel --prod" ships the working directory rather than git
// HEAD (CLAUDE.md), and it also silently corrupted the record quick-597's
// conclusions rest on. The evidence copy stays frozen; this is the live one.
export const FIXTURE_IDS_PATH = resolve(APP_ROOT, '.rls-fixture-ids.json');

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

process.env.PG_CONNECT_TIMEOUT_MS ??= '30000';

function fail(reason: string): never {
  throw new Error(
    `rls-isolation suite REFUSING TO RUN — ${reason}. This is a FAILURE, not a skip: ` +
      `a suite that quietly does nothing is the exact gate this task replaced.`
  );
}

function requireStagingUrl(name: string): string {
  const url = process.env[name];
  if (!url) fail(`${name} is not set in apps/web/.env.staging`);
  if (url.includes(PRODUCTION_REF)) fail(`${name} names the PRODUCTION project (${PRODUCTION_REF})`);
  if (!url.includes(STAGING_REF)) fail(`${name} does not name the staging project (${STAGING_REF})`);
  return url;
}

/** `postgres` on port 5432. rolbypassrls = true — catalogue reads only. */
export function directUrl(): string {
  return requireStagingUrl('STAGING_DIRECT_URL');
}

/** `app_user` via the Supavisor TRANSACTION-mode pooler. rolbypassrls = false. */
export function appUserUrl(): string {
  return requireStagingUrl('STAGING_DATABASE_URL_APP_USER');
}

// ---------------------------------------------------------------------------
// Fixtures — quick-597's graph, reused rather than rebuilt
// ---------------------------------------------------------------------------

export interface FixtureTenant {
  key: 'A' | 'B';
  slug: string;
  id: string;
  ownerUserId: string;
}

export interface FixtureIds {
  capturedAt: string;
  projectRef: string;
  promoCode: string;
  tenants: Record<'A' | 'B', FixtureTenant>;
  rows: Record<string, Record<'A' | 'B', string[]>>;
}

export function loadFixtureIds(): FixtureIds {
  let parsed: FixtureIds;
  try {
    parsed = JSON.parse(readFileSync(FIXTURE_IDS_PATH, 'utf8')) as FixtureIds;
  } catch (e) {
    fail(
      `could not read ${FIXTURE_IDS_PATH} — run ` +
        `\`npx tsx scripts/audit/597-staging-fixtures.ts --seed\` first (${(e as Error).message})`
    );
  }
  if (parsed.projectRef !== STAGING_REF) {
    fail(`fixture-ids.json was captured against project ${parsed.projectRef}, not ${STAGING_REF}`);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Targets — every table the behaviour probe actually reaches
// ---------------------------------------------------------------------------

/**
 * The `predicate` is evaluated ONCE, as `postgres`, to collect the row ids that
 * belong to each tenant. The `app_user` probe then counts
 * `WHERE id::text = ANY($1)` over those ids.
 *
 * That indirection is the point. If the probe re-derived ownership with the
 * SAME expression the policy uses, a policy rewritten to `USING (true)` and a
 * probe that also says `true` would agree and the suite would pass. Counting a
 * fixed, externally-known id set means the only thing under test is what RLS
 * lets through. `id::text` is uniform because `"PushToken".id` is a cuid (text)
 * while every other target's `id` is a uuid.
 */
export interface IsolationTarget {
  /** Physical table name, as it appears in pg_class.relname. */
  key: string;
  /** The identifier to write in a statement (quoted where the name is PascalCase). */
  sql: string;
  /** SQL fragment with $1 = tenant id, used only by the postgres-side id collection. */
  predicate: string;
  /**
   * `direct` — the table carries its own tenant column.
   * `derived` — ownership is an EXISTS subquery through a parent table, which
   *   is the shape quick-582/597 found easiest to get wrong.
   */
  ownership: 'direct' | 'derived';
}

export const ISOLATION_TARGETS: IsolationTarget[] = [
  // --- tenantId (PascalCase tables) -----------------------------------------
  { key: 'User', sql: '"User"', predicate: '"tenantId" = $1', ownership: 'direct' },
  { key: 'PushToken', sql: '"PushToken"', predicate: '"tenantId" = $1', ownership: 'direct' },
  {
    key: 'SysAdminInvoice',
    sql: '"SysAdminInvoice"',
    predicate: '"tenantId" = $1',
    ownership: 'direct',
  },
  {
    key: 'SysAdminInvoiceItem',
    sql: '"SysAdminInvoiceItem"',
    predicate: '"tenantId" = $1',
    ownership: 'direct',
  },
  // --- tenant_id ------------------------------------------------------------
  { key: 'audit_log', sql: 'audit_log', predicate: 'tenant_id = $1', ownership: 'direct' },
  // --- org_id ---------------------------------------------------------------
  {
    key: 'in_app_notifications',
    sql: 'in_app_notifications',
    predicate: 'org_id = $1',
    ownership: 'direct',
  },
  { key: 'loads', sql: 'loads', predicate: 'org_id = $1', ownership: 'direct' },
  { key: 'dispatches', sql: 'dispatches', predicate: 'org_id = $1', ownership: 'direct' },
  { key: 'clients', sql: 'clients', predicate: 'org_id = $1', ownership: 'direct' },
  { key: 'facilities', sql: 'facilities', predicate: 'org_id = $1', ownership: 'direct' },
  { key: 'carrier_drivers', sql: 'carrier_drivers', predicate: 'org_id = $1', ownership: 'direct' },
  { key: 'carrier_trucks', sql: 'carrier_trucks', predicate: 'org_id = $1', ownership: 'direct' },
  { key: 'route_templates', sql: 'route_templates', predicate: 'org_id = $1', ownership: 'direct' },
  // --- EXISTS-subquery ownership -------------------------------------------
  {
    key: 'stops',
    sql: 'stops',
    predicate: 'dispatch_id IN (SELECT id FROM dispatches WHERE org_id = $1)',
    ownership: 'derived',
  },
  {
    key: 'carrier_documents',
    sql: 'carrier_documents',
    predicate: 'uploaded_by IN (SELECT id FROM "User" WHERE "tenantId" = $1)',
    ownership: 'derived',
  },
  {
    key: 'route_template_stops',
    sql: 'route_template_stops',
    predicate:
      'route_template_id IN (SELECT id FROM route_templates WHERE org_id = $1)',
    ownership: 'derived',
  },
];

// ---------------------------------------------------------------------------
// Id collection (as postgres)
// ---------------------------------------------------------------------------

export type TenantKey = 'A' | 'B';
export type TargetIds = Record<string, Record<TenantKey, string[]>>;

export async function collectTargetIds(
  admin: Client,
  tenants: Record<TenantKey, FixtureTenant>
): Promise<TargetIds> {
  const ids: TargetIds = {};
  for (const target of ISOLATION_TARGETS) {
    ids[target.key] = { A: [], B: [] };
    for (const key of ['A', 'B'] as const) {
      const r = await admin.query<{ id: string }>(
        `SELECT id::text AS id FROM ${target.sql} WHERE ${target.predicate}`,
        [tenants[key].id]
      );
      ids[target.key][key] = r.rows.map((row) => row.id);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Probes — nothing is swallowed (quick-597 ground rule 1)
// ---------------------------------------------------------------------------

export type Probe = { rows: number } | { error: { code: string; message: string } };

export function probeRows(p: Probe, context: string): number {
  if ('rows' in p) return p.rows;
  throw new Error(
    `${context} raised instead of returning a count: [${p.error.code}] ${p.error.message}`
  );
}

export function describeProbe(p: Probe): string {
  return 'rows' in p ? String(p.rows) : `ERROR [${p.error.code}] ${p.error.message}`;
}

/** One statement inside a SAVEPOINT, so an expected raise aborts only itself. */
export async function probe(client: Client, sql: string, params: unknown[] = []): Promise<Probe> {
  await client.query('SAVEPOINT p598');
  try {
    const r = await client.query(sql, params);
    await client.query('RELEASE SAVEPOINT p598');
    if (r.rows.length > 0) {
      const first = r.rows[0] as Record<string, unknown>;
      return { rows: Number(Object.values(first)[0]) };
    }
    return { rows: r.rowCount ?? 0 };
  } catch (e) {
    await client.query('ROLLBACK TO SAVEPOINT p598').catch(() => {});
    const err = e as { code?: string; message?: string };
    return { error: { code: err.code ?? 'UNKNOWN', message: err.message ?? String(e) } };
  }
}

/**
 * A WRITE probe. Identical to `probe`, except the SAVEPOINT is ALWAYS rolled
 * back — on success as well as on failure — so the statement's effect is
 * discarded while its affected-row count is still returned.
 *
 * This is what lets "a cross-tenant DELETE affects zero rows" be asserted
 * against real data without a real deletion. There is no code path here that
 * releases the savepoint, and the enclosing transaction is rolled back too, so
 * a write survives only if BOTH are removed.
 */
export async function probeWriteThenRollback(
  client: Client,
  sql: string,
  params: unknown[] = []
): Promise<Probe> {
  await client.query('SAVEPOINT w598');
  try {
    const r = await client.query(sql, params);
    return { rows: r.rowCount ?? 0 };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { error: { code: err.code ?? 'UNKNOWN', message: err.message ?? String(e) } };
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT w598').catch(() => {});
  }
}

/**
 * Leaf tables only. A cross-tenant DELETE probe needs a counter-assertion that
 * the OWN-tenant DELETE does affect rows, and on a table with inbound foreign
 * keys that own-tenant delete raises 23503 instead of returning a count — which
 * would make the counter-assertion untestable rather than merely awkward.
 * These four have no dependants in the quick-597 fixture graph.
 */
export const WRITE_PROBE_TARGETS = [
  'audit_log',
  'in_app_notifications',
  'PushToken',
  'SysAdminInvoiceItem',
] as const;

export async function openDirect(): Promise<Client> {
  const c = new Client({ connectionString: directUrl() });
  await c.connect();
  return c;
}

export async function openAppUser(): Promise<Client> {
  const c = new Client({ connectionString: appUserUrl() });
  await c.connect();
  return c;
}

