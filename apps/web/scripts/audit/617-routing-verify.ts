/**
 * quick-617 — THE ROUTING PROOF HARNESS.
 *
 *   npx tsx scripts/audit/617-routing-verify.ts --guc-probe
 *   npx tsx scripts/audit/617-routing-verify.ts --fixtures-ensure | --fixtures-teardown
 *   npx tsx scripts/audit/617-routing-verify.ts --hashes
 *   npx tsx scripts/audit/617-routing-verify.ts --run [--single-file] [--throw-after-drop]
 *   npx tsx scripts/audit/617-routing-verify.ts --cell <name>      (internal, one COLD cell)
 *
 * Adapted from `616-routing-verify.ts` — its staging-only env loading, positive
 * production refusal, masked `[db-target]` banner, `pg_policies` capture/restore,
 * sorted-list verification, `--throw-after-drop` path and self-healing pre-flight
 * are reused rather than reinvented.
 *
 * ── THE RULES THIS HARNESS EXISTS TO OBEY ───────────────────────────────────
 *
 *   NEVER import `scripts/_bootstrap-env` — it does `DATABASE_URL = DIRECT_URL`
 *     and in this repo `DIRECT_URL` points at PRODUCTION (quick-607).
 *   Refuse POSITIVELY: proceed only when the ref IS staging. A negative-only
 *     check passes on a third, unknown database.
 *   `[db-target]` goes to STDERR with the credential MASKED (quick-585/607).
 *   ONE TRANSACTION PER CELL — a TC001 aborts its transaction and every later
 *     statement returns 25P02, which makes one raise look like six.
 *   ONE CHILD PROCESS per cell that tests a RAISE — the GUC is session scope on
 *     a `max: 1` pool, so the first tenant-touching statement in a process leaves
 *     it set for everything after (quick-602/610).
 *   SQLSTATE off `err.cause.code`, walking the cause chain, NEVER `err.code`,
 *     which is `undefined` on Prisma's `DriverAdapterError` (quick-610).
 *   Every ZERO carries a PRIVILEGED counter-read; every `foreign === 0` is PAIRED
 *     with `own > 0` — an empty table still raises, so the vacuity risk is
 *     entirely on the success side (quick-610).
 *   Counts come from a SCALAR, never `rowCount`.
 *   Teardown is NEVER `process.kill` — quick-616's SIGINT proof terminated
 *     unconditionally on Windows and left staging at 85 policies. The `finally`
 *     is proven by `--throw-after-drop`; what a `finally` cannot cover is covered
 *     by `preflightHeal()`, which runs in the NEXT process.
 */

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { createHash, randomUUID } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execFileSync } from 'child_process';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';

const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence',
);
const CAPTURE_PATH = resolve(EVIDENCE_DIR, '04-policy-capture.json');

/** The live `bypass_rls_policy` population on staging. A different number means these numbers are stale. */
const EXPECTED_POLICY_COUNT = 86;

const TENANT_A = 'b5623cdd-dc19-4900-b75d-0ecfcaf191b8'; // Staging Alpha Carriers
const TENANT_B = '8c6136c4-eb7b-4a89-a524-d1d0e2c8d045'; // Staging Beta Logistics
const DRIVER_A = 'f2885df5-21d3-48ef-8303-e96a1e533ad2'; // DRIVER in tenant A
const DRIVER_B = '63f7cc69-8140-4290-afab-5a34bded0017'; // DRIVER in tenant B

/** Fixture markers, so teardown can assert `left 0` without touching anything else. */
const FIXTURE_TAG = 'quick-617 fixture — safe to delete';

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function refuse(reason: string): never {
  console.error(`617-routing-verify: REFUSING TO RUN — ${reason}`);
  process.exit(1);
}

function staging(raw: string | undefined, name: string): string {
  if (!raw) refuse(`${name} is not set`);
  if (raw.includes(PRODUCTION_REF)) refuse(`${name} names PRODUCTION (${PRODUCTION_REF})`);
  if (!raw.includes(STAGING_REF)) refuse(`${name} does not name staging (${STAGING_REF})`);
  return raw.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');
}

const DIRECT_URL = staging(process.env.STAGING_DIRECT_URL, 'STAGING_DIRECT_URL');
const APP_USER_URL = staging(
  process.env.STAGING_DATABASE_URL_APP_USER,
  'STAGING_DATABASE_URL_APP_USER',
);

function banner(url: string, label: string) {
  const u = new URL(url);
  console.error(
    `[db-target] project : ${STAGING_REF} (staging)  host : ${u.host}  role : ${u.username}  lane : ${label}  (credential MASKED, never printed)`,
  );
}

/** SQLSTATE lives on the CAUSE CHAIN, never on `err.code` alone (quick-610). */
function sqlstateOf(e: unknown): string {
  const seen = new Set<unknown>();
  let cur: unknown = e;
  while (cur && typeof cur === 'object' && !seen.has(cur)) {
    seen.add(cur);
    const code = (cur as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return 'UNKNOWN';
}

// ---------------------------------------------------------------------------
// pg_policies capture / drop / restore
// ---------------------------------------------------------------------------

type CapturedPolicy = {
  schemaname: string;
  tablename: string;
  policyname: string;
  permissive: string;
  roles: string;
  cmd: string;
  qual: string | null;
  with_check: string | null;
  ddl: string;
};

function ddlFor(p: Omit<CapturedPolicy, 'ddl'>): string {
  const roles = p.roles.replace(/^\{|\}$/g, '');
  const parts = [
    `CREATE POLICY "${p.policyname}" ON "${p.schemaname}"."${p.tablename}"`,
    `  AS ${p.permissive === 'PERMISSIVE' ? 'PERMISSIVE' : 'RESTRICTIVE'}`,
    `  FOR ${p.cmd}`,
    `  TO ${roles}`,
  ];
  if (p.qual !== null) parts.push(`  USING (${p.qual})`);
  if (p.with_check !== null) parts.push(`  WITH CHECK (${p.with_check})`);
  return parts.join('\n') + ';';
}

const POLICY_QUERY = `
  SELECT schemaname, tablename, policyname, permissive,
         roles::text AS roles, cmd, qual, with_check
    FROM pg_policies
   WHERE policyname = 'bypass_rls_policy'
   ORDER BY schemaname, tablename`;

async function readPolicies(c: Client): Promise<Omit<CapturedPolicy, 'ddl'>[]> {
  return (await c.query(POLICY_QUERY)).rows;
}

/**
 * The self-healing pre-flight. Runs in the NEXT process, so it survives what a
 * `finally` cannot — including a hard kill. A short live count plus a capture
 * file on disk means a previous run died between the drop and the restore.
 */
async function preflightHeal(): Promise<string | null> {
  const c = new Client({ connectionString: DIRECT_URL });
  await c.connect();
  let live: number;
  try {
    live = (
      await c.query(
        `SELECT count(*)::int AS n FROM pg_policies WHERE policyname='bypass_rls_policy'`,
      )
    ).rows[0].n;
  } finally {
    await c.end();
  }
  if (live === EXPECTED_POLICY_COUNT) return null;
  if (live > EXPECTED_POLICY_COUNT) {
    refuse(
      `live bypass_rls_policy count is ${live}, MORE than the expected ${EXPECTED_POLICY_COUNT}. ` +
        `That is not an interrupted run — the population grew. STOPPING.`,
    );
  }
  if (!existsSync(CAPTURE_PATH)) {
    refuse(
      `live bypass_rls_policy count is ${live} (expected ${EXPECTED_POLICY_COUNT}) and there is NO capture ` +
        `file to heal from. STOPPING — do not run anything else against staging until a human looks at this.`,
    );
  }
  console.error('');
  console.error(
    `!! PRE-FLIGHT HEAL: live bypass_rls_policy = ${live}, expected ${EXPECTED_POLICY_COUNT}.`,
  );
  console.error(`!! A previous run died between the DROP and the RESTORE. Restoring from ${CAPTURE_PATH}.`);
  const r = await restore();
  printRestore(r);
  if (!r.ok) refuse('PRE-FLIGHT HEAL FAILED — staging is in a modified state. STOP.');
  return `healed from ${live} back to ${EXPECTED_POLICY_COUNT}`;
}

async function capture(): Promise<CapturedPolicy[]> {
  banner(DIRECT_URL, 'CAPTURE (read-only)');
  const c = new Client({ connectionString: DIRECT_URL });
  await c.connect();
  try {
    const rows = await readPolicies(c);
    const captured: CapturedPolicy[] = rows.map((r) => ({ ...r, ddl: ddlFor(r) }));
    const tables = captured.map((p) => `${p.schemaname}.${p.tablename}`).sort();
    console.log(`bypass_rls_policy: ${captured.length} policies on ${new Set(tables).size} tables`);
    if (captured.length !== EXPECTED_POLICY_COUNT) {
      throw new Error(
        `EXPECTED ${EXPECTED_POLICY_COUNT} bypass_rls_policy rows, FOUND ${captured.length}. ` +
          `The population changed. STOPPING BEFORE ANY DROP.`,
      );
    }
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      CAPTURE_PATH,
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          database: `${STAGING_REF} (staging)`,
          count: captured.length,
          sortedTableList: tables,
          sortedTableListSha256: createHash('sha256').update(tables.join('\n')).digest('hex'),
          sortedTableListMd5: createHash('md5').update(tables.join('\n')).digest('hex'),
          policies: captured,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`captured DDL for all ${captured.length} → ${CAPTURE_PATH}`);
    return captured;
  } finally {
    await c.end();
  }
}

async function dropOn(tables: string[]) {
  banner(DIRECT_URL, 'DROP (scoped)');
  const c = new Client({ connectionString: DIRECT_URL });
  await c.connect();
  try {
    for (const t of tables) {
      await c.query(`DROP POLICY IF EXISTS "bypass_rls_policy" ON public."${t}"`);
      console.log(`DROPPED bypass_rls_policy ON public."${t}"`);
    }
    const n = (
      await c.query(`SELECT count(*)::int AS n FROM pg_policies WHERE policyname='bypass_rls_policy'`)
    ).rows[0].n;
    console.log(`bypass_rls_policy now: ${n} (was ${EXPECTED_POLICY_COUNT})`);
  } finally {
    await c.end();
  }
}

type RestoreResult = {
  restoredCount: number;
  liveCount: number;
  onlyInBefore: string[];
  onlyInAfter: string[];
  sortedListIdentical: boolean;
  bodyMismatches: string[];
  ok: boolean;
};

async function restore(): Promise<RestoreResult> {
  const cap = JSON.parse(readFileSync(CAPTURE_PATH, 'utf8')) as {
    sortedTableList: string[];
    policies: CapturedPolicy[];
  };
  const c = new Client({ connectionString: DIRECT_URL });
  await c.connect();
  let restored = 0;
  try {
    const live = await readPolicies(c);
    const liveKeys = new Set(live.map((p) => `${p.schemaname}.${p.tablename}`));
    for (const p of cap.policies) {
      if (liveKeys.has(`${p.schemaname}.${p.tablename}`)) continue;
      await c.query(p.ddl);
      restored++;
    }

    const after = await readPolicies(c);
    const afterTables = after.map((p) => `${p.schemaname}.${p.tablename}`).sort();
    const beforeTables = [...cap.sortedTableList].sort();
    const onlyInBefore = beforeTables.filter((t) => !afterTables.includes(t));
    const onlyInAfter = afterTables.filter((t) => !beforeTables.includes(t));
    const sortedListIdentical =
      onlyInBefore.length === 0 &&
      onlyInAfter.length === 0 &&
      beforeTables.length === afterTables.length &&
      beforeTables.every((t, i) => t === afterTables[i]);

    // BYTE-FOR-BYTE. "A policy of that name exists" is what lets a restored
    // policy with a DIFFERENT BODY pass.
    const byKey = new Map(after.map((p) => [`${p.schemaname}.${p.tablename}`, p]));
    const bodyMismatches: string[] = [];
    for (const p of cap.policies) {
      const k = `${p.schemaname}.${p.tablename}`;
      const now = byKey.get(k);
      if (!now) {
        bodyMismatches.push(`${k}: MISSING`);
        continue;
      }
      for (const f of ['permissive', 'roles', 'cmd', 'qual', 'with_check'] as const) {
        if ((now as Record<string, unknown>)[f] !== (p as Record<string, unknown>)[f]) {
          bodyMismatches.push(`${k}.${f}`);
        }
      }
    }

    return {
      restoredCount: restored,
      liveCount: after.length,
      onlyInBefore,
      onlyInAfter,
      sortedListIdentical,
      bodyMismatches,
      ok: sortedListIdentical && bodyMismatches.length === 0 && after.length === EXPECTED_POLICY_COUNT,
    };
  } finally {
    await c.end();
  }
}

function printRestore(r: RestoreResult) {
  console.log(`RESTORE: re-created ${r.restoredCount}; live now ${r.liveCount}`);
  console.log(`  sorted list identical : ${r.sortedListIdentical}`);
  console.log(`  only in before        : ${JSON.stringify(r.onlyInBefore)}`);
  console.log(`  only in after         : ${JSON.stringify(r.onlyInAfter)}`);
  console.log(`  body mismatches       : ${JSON.stringify(r.bodyMismatches)}`);
  console.log(`  VERDICT               : ${r.ok ? 'PASS' : 'FAIL'}`);
}

// ---------------------------------------------------------------------------
// --hashes — BOTH algorithms, BOTH databases (fact H)
// ---------------------------------------------------------------------------

async function sortedListFor(url: string, label: string) {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const rows = await readPolicies(c);
    const tables = rows.map((p) => `${p.schemaname}.${p.tablename}`).sort();
    const joined = tables.join('\n');
    return {
      label,
      count: rows.length,
      tables,
      // TWO recorded figures, TWO algorithms, TWO spellings of "the list" —
      // and they are NOT in conflict (fact H). Both are reproduced here by name
      // so a future reader never has to search for the normalisation:
      //
      //   sha256 over "public.X\npublic.Y…"  reproduces quick-616's
      //     0fa356b932f1d8859d938883977c9e459fb477f7277957c22a59e176d443f8cd
      //   md5 over "X,Y,…" (BARE names, comma-joined) reproduces the
      //     orchestrator's .planning/STATE.md:966 figure
      //     29498ef6e52f51dcc02461a1abbb84b0
      //
      // The bare/comma spelling was FOUND by trying fourteen normalisations,
      // not assumed. An algorithm mismatch is not drift, and neither is a
      // joiner mismatch — but only one of the fourteen matched, so this is a
      // reproduction and not a coincidence.
      sha256: createHash('sha256').update(joined).digest('hex'),
      md5: createHash('md5').update(joined).digest('hex'),
      sha256BareComma: createHash('sha256')
        .update(tables.map((t) => t.replace(/^public\./, '')).join(','))
        .digest('hex'),
      md5BareComma: createHash('md5')
        .update(tables.map((t) => t.replace(/^public\./, '')).join(','))
        .digest('hex'),
    };
  } finally {
    await c.end();
  }
}

async function hashes() {
  banner(DIRECT_URL, 'HASHES staging (read-only)');
  const stg = await sortedListFor(DIRECT_URL, 'staging');
  // PRODUCTION, READ-ONLY. This harness never writes to production; the only
  // statement it issues there is the pg_policies SELECT above.
  // The production reference is loaded EXPLICITLY and used for exactly ONE
  // statement — the `pg_policies` SELECT above. `.env.local` is read here and
  // nowhere else in this file, and never assigned to DATABASE_URL: quick-607's
  // rule is that a script must never do `DATABASE_URL = DIRECT_URL`.
  loadEnv({ path: resolve(APP_ROOT, '.env.local'), quiet: true });
  const prodRaw = process.env.PRODUCTION_DIRECT_URL_READONLY ?? process.env.DIRECT_URL;
  let prod: Awaited<ReturnType<typeof sortedListFor>> | { label: string; error: string };
  if (!prodRaw || !prodRaw.includes(PRODUCTION_REF)) {
    prod = { label: 'production', error: 'no production connection string available to this process' };
  } else {
    const u = new URL(prodRaw.replace(':6543/', ':5432/').replace('?pgbouncer=true', ''));
    console.error(
      `[db-target] project : ${PRODUCTION_REF} (PRODUCTION, READ-ONLY pg_policies SELECT)  host : ${u.host}  role : ${u.username}  (credential MASKED)`,
    );
    prod = await sortedListFor(u.toString(), 'production');
  }
  const out = { generated: new Date().toISOString(), staging: stg, production: prod };
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(resolve(EVIDENCE_DIR, '04-sorted-list-hashes.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify({ staging: { ...stg, tables: `${stg.tables.length} tables` }, production: 'tables' in prod ? { ...prod, tables: `${prod.tables.length} tables` } : prod }, null, 2));
  return out;
}

// ---------------------------------------------------------------------------
// Fixtures — created on the PRIVILEGED connection, torn down with `left 0`
// ---------------------------------------------------------------------------

const FIXTURE_IDS = {
  incidentA: '617a0000-0000-4000-8000-00000000000a',
  incidentB: '617b0000-0000-4000-8000-00000000000b',
};

async function fixturesEnsure() {
  banner(DIRECT_URL, 'FIXTURES ensure (privileged)');
  const c = new Client({ connectionString: DIRECT_URL });
  await c.connect();
  try {
    for (const [id, tenant, driver] of [
      [FIXTURE_IDS.incidentA, TENANT_A, DRIVER_A],
      [FIXTURE_IDS.incidentB, TENANT_B, DRIVER_B],
    ] as const) {
      await c.query(
        `INSERT INTO "DriverIncident"
           (id, "tenantId", "driverId", category, severity, description, "reportedAt", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'OTHER', 'LOW', $4, now(), now(), now())
         ON CONFLICT (id) DO NOTHING`,
        [id, tenant, driver, FIXTURE_TAG],
      );
    }
    const n = (
      await c.query(`SELECT count(*)::int AS n FROM "DriverIncident" WHERE description = $1`, [
        FIXTURE_TAG,
      ])
    ).rows[0].n;
    console.log(`fixtures present: ${n} (expect 2)`);
    if (n < 2) throw new Error('fixture creation did not land');
  } finally {
    await c.end();
  }
}

async function fixturesTeardown() {
  banner(DIRECT_URL, 'FIXTURES teardown (privileged)');
  const c = new Client({ connectionString: DIRECT_URL });
  await c.connect();
  try {
    await c.query(`DELETE FROM "DriverIncident" WHERE description = $1`, [FIXTURE_TAG]);
    const left = (
      await c.query(`SELECT count(*)::int AS n FROM "DriverIncident" WHERE description = $1`, [
        FIXTURE_TAG,
      ])
    ).rows[0].n;
    console.log(`fixtures left: ${left} (must be 0)`);
    if (left !== 0) throw new Error('TEARDOWN INCOMPLETE');
  } finally {
    await c.end();
  }
}

// ---------------------------------------------------------------------------
// CELLS — each runs in its OWN COLD PROCESS via `--cell <name>`
// ---------------------------------------------------------------------------

type CellResult = { cell: string; ok: boolean; detail: Record<string, unknown> };

/**
 * Acquire the REAL client, through the REAL function, in a process whose
 * DATABASE_URL is staging-as-app_user and whose tripwire is armed. Importing
 * `tenant-context` rather than reimplementing it is the point — a probe that
 * re-derives the acquisition is not measuring the acquisition.
 */
async function realTenantClient(tenantId: string) {
  process.env.DATABASE_URL = APP_USER_URL;
  process.env.TENANT_CONTEXT_TRIPWIRE = 'on';
  const { getTenantPrismaForOrg } = await import('../../src/lib/context/tenant-context');
  return getTenantPrismaForOrg(tenantId);
}

async function privileged<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DIRECT_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

const CELLS: Record<string, () => Promise<CellResult>> = {
  /**
   * FACT F — the single highest-consequence unknown in the task.
   * `getTenantPrismaForOrg` sets `app.current_tenant_id` at SESSION scope on the
   * BARE client, as one autocommit statement, BEFORE returning the extended
   * client. Every routed statement then runs inside `tenantPrisma.$transaction`.
   * Is the GUC visible in there? Nothing before this measured it.
   */
  'guc-visible': async () => {
    const p = await realTenantClient(TENANT_A);
    const rows = await (p as any).$transaction(async (tx: any) => {
      return tx.$queryRaw`SELECT current_setting('app.current_tenant_id', TRUE) AS v, current_user AS who`;
    });
    const v = rows?.[0]?.v ?? null;
    return {
      cell: 'guc-visible',
      ok: v === TENANT_A,
      detail: { readBack: v, expected: TENANT_A, role: rows?.[0]?.who ?? null },
    };
  },

  /** Own-tenant read through the tenant client, inside a $transaction. */
  'own-read': async () => {
    const p = await realTenantClient(TENANT_A);
    const n = await (p as any).$transaction(async (tx: any) =>
      tx.driverIncident.count({ where: { tenantId: TENANT_A } }),
    );
    return { cell: 'own-read', ok: n > 0, detail: { own: n } };
  },

  /**
   * Cross-tenant read. `foreign === 0` is PAIRED with a privileged counter-read
   * proving the foreign rows exist — a zero over an empty foreign set is worse
   * than no evidence at all (quick-610).
   */
  'foreign-read': async () => {
    const counter = await privileged(
      async (c) =>
        (
          await c.query(`SELECT count(*)::int AS n FROM "DriverIncident" WHERE "tenantId" = $1`, [
            TENANT_B,
          ])
        ).rows[0].n as number,
    );
    const p = await realTenantClient(TENANT_A);
    const foreign = await (p as any).$transaction(async (tx: any) =>
      tx.driverIncident.count({ where: { tenantId: TENANT_B } }),
    );
    return {
      cell: 'foreign-read',
      ok: foreign === 0 && counter > 0,
      detail: { foreignSeenByTenantA: foreign, privilegedCounterRead: counter },
    };
  },

  /**
   * Own-tenant WRITE, and the positive evidence for Rule 2: the created row's
   * `createdById` must still be NULL, because `userId` was not passed.
   */
  'own-write-audit-null': async () => {
    const p = await realTenantClient(TENANT_A);
    const created = await (p as any).$transaction(async (tx: any) =>
      tx.driverIncident.create({
        data: {
          tenantId: TENANT_A,
          driverId: DRIVER_A,
          category: 'OTHER',
          severity: 'LOW',
          description: FIXTURE_TAG,
          reportedAt: new Date(),
        },
      }),
    );
    const row = await privileged(
      async (c) =>
        (
          await c.query(
            `SELECT "createdById", "updatedById", "tenantId" FROM "DriverIncident" WHERE id = $1`,
            [created.id],
          )
        ).rows[0],
    );
    return {
      cell: 'own-write-audit-null',
      ok: row != null && row.createdById === null && row.updatedById === null && row.tenantId === TENANT_A,
      detail: { id: created.id, createdById: row?.createdById ?? null, updatedById: row?.updatedById ?? null, tenantId: row?.tenantId ?? null },
    };
  },

  /**
   * THE ARMING PROOF, part 4. Zero TC001 anywhere else is exactly what a
   * DISARMED tripwire looks like, so an unscoped read MUST raise here.
   * This is the FIRST tenant-touching statement of its own process, or it
   * inherits whatever the previous statement left on the `max: 1` pool.
   */
  'unscoped-raises': async () => {
    process.env.DATABASE_URL = APP_USER_URL;
    process.env.TENANT_CONTEXT_TRIPWIRE = 'on';
    const { prisma } = await import('../../src/lib/db/prisma');
    try {
      const n = await (prisma as any).driverIncident.count();
      return { cell: 'unscoped-raises', ok: false, detail: { raised: false, count: n } };
    } catch (e) {
      const code = sqlstateOf(e);
      return { cell: 'unscoped-raises', ok: code === 'TC001', detail: { raised: true, sqlstate: code } };
    }
  },

  /**
   * THE `findUnique` + top-level `select` HAZARD.
   *
   * `withTenantRLS` cannot add `tenantId` to a findUnique `where` (it must be
   * unique-only), so it runs the query and POST-CHECKS the result:
   *     if (result && result.tenantId !== tenantId) return null
   * With a `select` that omits `tenantId`, `result.tenantId` is `undefined`,
   * `undefined !== tenantId` is TRUE, and the row is discarded — FOR ITS OWN
   * TENANT. Ten MOBILE_API call sites have exactly that shape.
   *
   * Measured rather than argued, because 24 other live call sites in this repo
   * share it and "core owner functionality is silently broken" is too large a
   * claim to rest on a reading.
   */
  'finduniq-select-hazard': async () => {
    const p = await realTenantClient(TENANT_A);
    const out = await (p as any).$transaction(async (tx: any) => {
      const withoutTenantId = await tx.driverIncident.findUnique({
        where: { id: FIXTURE_IDS.incidentA },
        select: { id: true },
      });
      const withTenantId = await tx.driverIncident.findUnique({
        where: { id: FIXTURE_IDS.incidentA },
        select: { id: true, tenantId: true },
      });
      const noSelect = await tx.driverIncident.findUnique({ where: { id: FIXTURE_IDS.incidentA } });
      return {
        selectWithoutTenantId: withoutTenantId,
        selectWithTenantId: withTenantId,
        noSelect: noSelect ? { id: noSelect.id } : null,
      };
    });
    const counter = await privileged(
      async (c) =>
        (
          await c.query(`SELECT count(*)::int AS n FROM "DriverIncident" WHERE id = $1`, [
            FIXTURE_IDS.incidentA,
          ])
        ).rows[0].n as number,
    );
    // The HAZARD IS CONFIRMED when the row exists, the tenantId-bearing select
    // finds it, and the tenantId-omitting select does not.
    const hazardConfirmed =
      counter === 1 && out.selectWithTenantId !== null && out.selectWithoutTenantId === null;
    return {
      cell: 'finduniq-select-hazard',
      ok: true, // reporting cell — the verdict is in `hazardConfirmed`
      detail: { ...out, privilegedCounterRead: counter, hazardConfirmed },
    };
  },
  /**
   * THE SAME HAZARD ON A SECOND, INDEPENDENT MODEL — and on a row this task did
   * not create. `Truck` already carries one pre-existing row per staging tenant,
   * so this cell needs no fixture at all, which removes "your fixture was odd"
   * as an explanation. `Truck` is also the model under
   * `(owner)/actions/maintenance.ts:162`, one of the 24 LIVE sites outside this
   * task's scope — so this is the closest measurement available to the claim
   * being made about them, short of invoking the server action.
   */
  'finduniq-select-hazard-truck': async () => {
    const truckId = await privileged(
      async (c) =>
        (
          await c.query(`SELECT id FROM "Truck" WHERE "tenantId" = $1 LIMIT 1`, [TENANT_A])
        ).rows[0]?.id as string | undefined,
    );
    if (!truckId) {
      return { cell: 'finduniq-select-hazard-truck', ok: false, detail: { error: 'UNPROVEN — no Truck row in tenant A on staging' } };
    }
    const p = await realTenantClient(TENANT_A);
    const out = await (p as any).$transaction(async (tx: any) => ({
      selectWithoutTenantId: await tx.truck.findUnique({ where: { id: truckId }, select: { id: true } }),
      selectWithTenantId: await tx.truck.findUnique({ where: { id: truckId }, select: { id: true, tenantId: true } }),
    }));
    const hazardConfirmed = out.selectWithTenantId !== null && out.selectWithoutTenantId === null;
    return {
      cell: 'finduniq-select-hazard-truck',
      ok: true,
      detail: { truckId, ...out, hazardConfirmed, note: 'pre-existing row, not a fixture' },
    };
  },
};

/**
 * THE PER-TABLE CELL, `--cell table:<Model>`.
 *
 * Three questions per model, in ONE cold process, IN THIS ORDER, because the
 * first is the only one that must run before any tenant context exists:
 *
 *   A  UNSCOPED — the bare client, no tenant context, as the FIRST
 *      tenant-touching statement of the process. MUST raise TC001. This is the
 *      per-table arming proof AND the proof that a policy is consulted at all,
 *      and it works on an EMPTY table: the policy expression is evaluated at
 *      scan setup, not per row (quick-610). With bypass_rls_policy DROPPED, the
 *      only policy left standing is tenant_isolation_policy.
 *   B  SCOPED — a tenant client. MUST NOT raise, and returns a count.
 *   C  CROSS-TENANT — the same client counting the OTHER tenant's rows. MUST be
 *      0, and is reported UNPROVEN unless the privileged counter-read shows the
 *      foreign rows EXIST and the own count is > 0. An empty foreign set makes a
 *      0 worth nothing; `own > 0` is what makes it evidence.
 */
async function tableCell(modelPascal: string): Promise<CellResult> {
  const camel = modelPascal.charAt(0).toLowerCase() + modelPascal.slice(1);
  const detail: Record<string, unknown> = { model: modelPascal };

  // A — must be FIRST. Bare client, no tenant context.
  process.env.DATABASE_URL = APP_USER_URL;
  process.env.TENANT_CONTEXT_TRIPWIRE = 'on';
  const { prisma } = await import('../../src/lib/db/prisma');
  try {
    const n = await (prisma as any)[camel].count();
    detail.unscoped = { raised: false, count: n };
  } catch (e) {
    detail.unscoped = { raised: true, sqlstate: sqlstateOf(e) };
  }
  const unscopedOk = (detail.unscoped as any).raised && (detail.unscoped as any).sqlstate === 'TC001';

  // B — scoped.
  let own: number | null = null;
  let scopedThrew: string | null = null;
  try {
    const p = await realTenantClient(TENANT_A);
    own = await (p as any).$transaction(async (tx: any) => tx[camel].count());
    detail.scopedOwn = own;
  } catch (e) {
    scopedThrew = sqlstateOf(e);
    detail.scopedOwn = { threw: true, sqlstate: scopedThrew, message: (e as Error).message?.slice(0, 200) };
  }

  // C — cross-tenant, with the privileged counter-read that makes a 0 mean something.
  let foreign: number | null = null;
  let counter = 0;
  const tenantCol = modelPascal === 'Tenant' ? null : 'tenantId';
  if (tenantCol) {
    try {
      counter = await privileged(
        async (c) =>
          Number(
            (
              await c.query(
                `SELECT count(*)::int AS n FROM "${modelPascal}" WHERE "${tenantCol}" = $1`,
                [TENANT_B],
              )
            ).rows[0].n,
          ),
      );
    } catch {
      counter = -1; // table name is not the model name, or the column differs
    }
    try {
      const p2 = await realTenantClient(TENANT_A);
      foreign = await (p2 as any).$transaction(async (tx: any) =>
        tx[camel].count({ where: { [tenantCol]: TENANT_B } }),
      );
    } catch (e) {
      foreign = -1;
      detail.crossTenantThrew = sqlstateOf(e);
    }
  }
  const crossProven = tenantCol !== null && foreign === 0 && counter > 0 && (own ?? 0) > 0;
  detail.crossTenant = {
    foreignSeenByTenantA: foreign,
    privilegedCounterRead: counter,
    verdict: crossProven
      ? 'PROVEN (foreign 0 paired with own > 0 and a non-empty foreign set)'
      : tenantCol === null
        ? 'N/A — Tenant has no tenantId column and is an EXEMPT_MODEL'
        : `UNPROVEN BY NAME — own=${own} foreign=${foreign} foreignRowsOnStaging=${counter}`,
  };

  return {
    cell: `table:${modelPascal}`,
    // The cell PASSES on the two questions every table can answer regardless of
    // how sparse staging is. The cross-tenant half is reported by name and never
    // silently counted as a pass.
    ok: unscopedOk && scopedThrew === null,
    detail,
  };
}

async function runCell(name: string) {
  if (name.startsWith('table:')) {
    try {
      const r = await tableCell(name.slice('table:'.length));
      process.stdout.write('\n__CELL__' + JSON.stringify(r) + '\n');
    } catch (e) {
      process.stdout.write(
        '\n__CELL__' +
          JSON.stringify({ cell: name, ok: false, detail: { threw: true, sqlstate: sqlstateOf(e), message: (e as Error).message?.slice(0, 300) } }) +
          '\n',
      );
    }
    process.exit(0);
  }
  const fn = CELLS[name];
  if (!fn) refuse(`unknown cell "${name}". Known: ${Object.keys(CELLS).join(', ')}`);
  try {
    const r = await fn();
    process.stdout.write('\n__CELL__' + JSON.stringify(r) + '\n');
  } catch (e) {
    process.stdout.write(
      '\n__CELL__' +
        JSON.stringify({
          cell: name,
          ok: false,
          detail: { threw: true, sqlstate: sqlstateOf(e), message: (e as Error).message?.slice(0, 400) },
        }) +
        '\n',
    );
  }
  process.exit(0);
}

/** Spawn ONE COLD PROCESS per cell. The GUC is session scope on a max:1 pool. */
function spawnCell(name: string): CellResult {
  const out = execFileSync(
    process.execPath,
    [resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs'), __filename, '--cell', name],
    { cwd: APP_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 120_000 },
  );
  const m = /__CELL__(.*)/.exec(out);
  if (!m) return { cell: name, ok: false, detail: { error: 'no cell payload', raw: out.slice(-400) } };
  return JSON.parse(m[1]) as CellResult;
}

// ---------------------------------------------------------------------------
// --guc-probe — fact F and the findUnique hazard, BEFORE any policy is touched
// ---------------------------------------------------------------------------

async function gucProbe() {
  banner(APP_USER_URL, 'GUC PROBE (app_user, tripwire armed)');
  await preflightHeal();
  await fixturesEnsure();
  const cells = ['guc-visible', 'unscoped-raises', 'own-read', 'foreign-read', 'finduniq-select-hazard', 'finduniq-select-hazard-truck'];
  const results: CellResult[] = [];
  for (const c of cells) {
    const r = spawnCell(c);
    results.push(r);
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.cell}  ${JSON.stringify(r.detail)}`);
  }
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    resolve(EVIDENCE_DIR, '02-guc-probe.json'),
    JSON.stringify({ generated: new Date().toISOString(), database: `${STAGING_REF} (staging)`, role: 'app_user', tripwire: 'on', results }, null, 2) + '\n',
  );
  return results;
}

// ---------------------------------------------------------------------------
// --run — capture, drop, probe, restore in a finally
// ---------------------------------------------------------------------------

/**
 * Models reached by the ROUTED statements — the scope of the DROP.
 *
 * The 8 STOPPED-AND-REPORTED files are EXCLUDED: they still carry their bypass
 * flag, so dropping the policy under them would be probing code this task
 * deliberately did not change, and a failure there would be attributed to the
 * routing rather than to the stop.
 */
function affectedTables(singleFile: boolean): string[] {
  if (singleFile) return ['DriverIncident'];
  const inv = JSON.parse(readFileSync(resolve(EVIDENCE_DIR, '01-inventory.json'), 'utf8')) as {
    statements: { file: string; operations: { modelPascal: string }[] }[];
    findUniqueSelectHazards: { file: string }[];
  };
  const stopped = new Set(inv.findUniqueSelectHazards.map((h) => h.file));
  const models = new Set<string>();
  for (const s of inv.statements) {
    if (stopped.has(s.file)) continue;
    for (const o of s.operations) models.add(o.modelPascal);
  }
  // Prisma model name === table name for every model this surface touches
  // (checked against pg_tables; none of them carry an @@map).
  return [...models].sort();
}

async function run(opts: { singleFile: boolean; throwAfterDrop: boolean }) {
  banner(DIRECT_URL, 'RUN');
  const healed = await preflightHeal();
  if (healed) console.log(`pre-flight: ${healed}`);
  await capture();
  await fixturesEnsure();

  const wanted = affectedTables(opts.singleFile);
  // Only drop where a bypass_rls_policy actually exists.
  const cap = JSON.parse(readFileSync(CAPTURE_PATH, 'utf8')) as { policies: CapturedPolicy[] };
  const have = new Set(cap.policies.map((p) => p.tablename));
  const toDrop = wanted.filter((t) => have.has(t));
  const notCarrying = wanted.filter((t) => !have.has(t));
  console.log(`tables reached by routed statements : ${wanted.length}`);
  console.log(`  carrying bypass_rls_policy (DROP) : ${toDrop.length} — ${JSON.stringify(toDrop)}`);
  console.log(`  NOT carrying one (nothing to drop): ${notCarrying.length} — ${JSON.stringify(notCarrying)}`);

  let results: CellResult[] = [];
  let threw: string | null = null;
  try {
    await dropOn(toDrop);
    if (opts.throwAfterDrop) {
      throw new Error(
        '--throw-after-drop: deliberate throw between the DROP and the probes, to prove the finally restores.',
      );
    }
    const named = [
      'guc-visible',
      'unscoped-raises',
      'own-read',
      'foreign-read',
      'own-write-audit-null',
      'finduniq-select-hazard',
    ];
    const perTable = opts.singleFile ? [] : wanted.map((t) => `table:${t}`);
    for (const c of [...named, ...perTable]) {
      const r = spawnCell(c);
      results.push(r);
      console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.cell}  ${JSON.stringify(r.detail)}`);
    }
  } catch (e) {
    threw = (e as Error).message;
    console.error(`\n!! ${threw}`);
  } finally {
    const r = await restore();
    printRestore(r);
    await fixturesTeardown().catch((e) => console.error('teardown error:', (e as Error).message));
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      resolve(EVIDENCE_DIR, '04-probe-cells.json'),
      JSON.stringify(
        {
          generated: new Date().toISOString(),
          database: `${STAGING_REF} (staging)`,
          role: 'app_user',
          tripwire: 'on',
          mode: opts.singleFile ? 'single-file' : 'surface',
          droppedPolicyTables: toDrop,
          tablesWithoutBypassPolicy: notCarrying,
          threw,
          results,
          restore: r,
        },
        null,
        2,
      ) + '\n',
    );
    if (!r.ok) refuse('RESTORE FAILED — staging is in a modified state. STOP.');
  }
  if (threw) process.exit(3);
  const bad = results.filter((x) => !x.ok);
  if (bad.length) {
    console.error(`FAILED CELLS: ${bad.map((b) => b.cell).join(', ')}`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------

async function main() {
  const a = process.argv.slice(2);
  const cellIdx = a.indexOf('--cell');
  if (cellIdx !== -1) return runCell(a[cellIdx + 1]);
  if (a.includes('--hashes')) return void (await hashes());
  if (a.includes('--fixtures-ensure')) return void (await fixturesEnsure());
  if (a.includes('--fixtures-teardown')) return void (await fixturesTeardown());
  if (a.includes('--guc-probe')) {
    const rs = await gucProbe();
    await fixturesTeardown();
    const bad = rs.filter((r) => !r.ok);
    if (bad.length) {
      console.error(`FAILED CELLS: ${bad.map((b) => b.cell).join(', ')}`);
      process.exit(2);
    }
    return;
  }
  if (a.includes('--run')) {
    return run({
      singleFile: a.includes('--single-file'),
      throwAfterDrop: a.includes('--throw-after-drop'),
    });
  }
  console.error(
    'usage: 617-routing-verify.ts [--guc-probe | --hashes | --fixtures-ensure | --fixtures-teardown | --run [--single-file] [--throw-after-drop]]',
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
