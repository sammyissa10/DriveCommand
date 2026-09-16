/**
 * quick-619 — THE LIB_SERVICES ROUTING PROOF.
 *
 *   npx tsx scripts/audit/619-routing-verify.ts --run [--throw-after-drop]
 *   npx tsx scripts/audit/619-routing-verify.ts --hashes
 *   npx tsx scripts/audit/619-routing-verify.ts --cell <name>      (internal, one COLD cell)
 *
 * The capture / drop / restore / self-healing pre-flight / sorted-list hashes
 * are COPIED VERBATIM from `617-routing-verify.ts` (its lines 96-398) with the
 * evidence paths changed, so the mechanism that restored staging correctly last
 * time is the mechanism used this time. Running 617's file itself would write
 * into quick-617's closed evidence.
 *
 * ── WHAT IS DIFFERENT FROM 617: REAL FUNCTIONS, AND A DRIVER-LEVEL TC001 HOOK ─
 *
 * MOBILE_API's statements were route handlers; LIB_SERVICES' are library
 * functions, so where a routed function can be called without a session it is
 * CALLED — not re-implemented as a hand-written query — in a cold process whose
 * DATABASE_URL is staging-as-app_user with the tripwire armed and
 * `bypass_rls_policy` DROPPED on every table it reaches.
 *
 * Several of those functions SWALLOW their own errors (`checkGeofenceAndAlert`,
 * `recordActivationEvent`, `sendPushToOrg` all log and return). A TC001 inside
 * them would therefore look exactly like success. quick-602's rule applies:
 * detect the raise AT THE DRIVER. Every cell patches `pg.Client.prototype.query`
 * before the app's Prisma client is imported and records any rejection whose
 * SQLSTATE is TC001, while letting the original rejection propagate. The
 * `hook-control` cell proves the hook fires — without it, "0 TC001 observed" is
 * indistinguishable from "the hook is not attached".
 *
 * ── NOT CALLABLE WITHOUT A SESSION, AND COVERED ANOTHER WAY ─────────────────
 *
 * `submitDocFeedback` (server action), `analytics` and `instance.get` (tRPC),
 * `runEvaluator` and `generatePlaybookInstance` (writes with FK chains). Their
 * TABLES are in the per-table matrix below, and the acquisition they use is the
 * same function every real-function cell uses.
 *
 * Rules carried from 616/617: never import `_bootstrap-env`; POSITIVE staging
 * refusal; `[db-target]` to STDERR, credential masked; ONE COLD PROCESS per cell
 * (session-scope GUC on a max:1 pool); SQLSTATE off the cause chain; every zero
 * paired with a privileged counter-read and `own > 0`; teardown NEVER by
 * `process.kill` — a `finally`, proven by `--throw-after-drop`, and a pre-flight
 * heal in the NEXT process for what a `finally` cannot cover.
 */

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execFileSync } from 'child_process';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';

const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/619-route-the-lib-services-surface-off-app-b/evidence',
);
const CAPTURE_PATH = resolve(EVIDENCE_DIR, '06-policy-capture.json');

const EXPECTED_POLICY_COUNT = 86;

const TENANT_A = 'b5623cdd-dc19-4900-b75d-0ecfcaf191b8'; // Staging Alpha Carriers
const TENANT_B = '8c6136c4-eb7b-4a89-a524-d1d0e2c8d045'; // Staging Beta Logistics
const DRIVER_A = 'f2885df5-21d3-48ef-8303-e96a1e533ad2';
const TRUCK_A = '610a0000-0000-4610-8000-000000000001';
const OWNER_A = 'd27660ff-feef-43dd-b22c-07ee74b9ee01';
const AUDIT_MARKER = 'quick-619-fixture-safe-to-delete';

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function refuse(reason: string): never {
  console.error(`619-routing-verify: REFUSING TO RUN — ${reason}`);
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

// ─── BEGIN: copied verbatim from 617-routing-verify.ts lines 96-398 (evidence filename changed) ───
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
  writeFileSync(resolve(EVIDENCE_DIR, '06-sorted-list-hashes.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify({ staging: { ...stg, tables: `${stg.tables.length} tables` }, production: 'tables' in prod ? { ...prod, tables: `${prod.tables.length} tables` } : prod }, null, 2));
  return out;
}

// ---------------------------------------------------------------------------
// Fixtures — created on the PRIVILEGED connection, torn down with `left 0`
// ─── END: copied from 617-routing-verify.ts ───

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

type CellResult = { cell: string; ok: boolean; detail: Record<string, unknown> };

/**
 * The 17 tables the 33 ROUTED statements reach, with the SQL table name and
 * tenant column where they differ from the Prisma model. Only `AuditLog` is
 * `@@map`ped. `Tenant` has no tenant column — it is its own tenant.
 *
 * The 11 STOPPED statements' tables that are not also reached by a routed one
 * (`SupportTicket`, `NotificationSendLog`, `carrier_drivers`) are EXCLUDED: those
 * statements still carry their bypass flag, so dropping the policy under them
 * would probe code this task deliberately did not change.
 */
const TABLES: { model: string; table: string; tenantCol: string | null }[] = [
  { model: 'ActivationProgress', table: 'ActivationProgress', tenantCol: 'tenantId' },
  { model: 'AppEvent', table: 'AppEvent', tenantCol: 'tenantId' },
  { model: 'AuditLog', table: 'audit_log', tenantCol: 'tenant_id' },
  { model: 'AutomationRun', table: 'AutomationRun', tenantCol: 'tenantId' },
  { model: 'DocFeedback', table: 'DocFeedback', tenantCol: 'tenantId' },
  { model: 'Load', table: 'Load', tenantCol: 'tenantId' },
  { model: 'Playbook', table: 'Playbook', tenantCol: 'tenantId' },
  { model: 'PlaybookInstance', table: 'PlaybookInstance', tenantCol: 'tenantId' },
  { model: 'PlaybookNotification', table: 'PlaybookNotification', tenantCol: 'tenantId' },
  { model: 'PushToken', table: 'PushToken', tenantCol: 'tenantId' },
  { model: 'Route', table: 'Route', tenantCol: 'tenantId' },
  { model: 'RouteStop', table: 'RouteStop', tenantCol: 'tenantId' },
  { model: 'StepInstance', table: 'StepInstance', tenantCol: 'tenantId' },
  { model: 'StepTemplate', table: 'StepTemplate', tenantCol: 'tenantId' },
  { model: 'Tenant', table: 'Tenant', tenantCol: null },
  { model: 'Truck', table: 'Truck', tenantCol: 'tenantId' },
  { model: 'User', table: 'User', tenantCol: 'tenantId' },
];

/**
 * THE DRIVER-LEVEL TC001 HOOK. Must be installed BEFORE the app's prisma module
 * is imported, because PrismaPg builds its pool on import. The original promise
 * is returned untouched, so the caller still sees the rejection.
 */
const tc001: { sql: string }[] = [];
const consoleErrors: string[] = [];
function installHooks() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pg = require('pg');
  const orig = pg.Client.prototype.query;
  const note = (e: unknown, q: unknown) => {
    if (sqlstateOf(e) === 'TC001') {
      const sql = typeof q === 'string' ? q : (q as { text?: string })?.text ?? '';
      tc001.push({ sql: sql.slice(0, 160) });
    }
  };
  /*
   * BOTH call forms. The first version of this hook watched only the PROMISE
   * form, and its own control cell caught it: the caller saw TC001 and the hook
   * recorded 0. @prisma/adapter-pg sends non-transactional statements through
   * Pool.query, and pg-pool implements that as client.query(text, values,
   * CALLBACK) — which returns undefined. Only statements inside an interactive
   * $transaction use the promise form. So a promise-only hook is blind to every
   * autocommit statement, including the ones most likely to be unscoped.
   */
  pg.Client.prototype.query = function (...args: unknown[]) {
    const last = args[args.length - 1];
    if (typeof last === 'function') {
      args[args.length - 1] = function (this: unknown, err: unknown, ...rest: unknown[]) {
        if (err) note(err, args[0]);
        return (last as (...a: unknown[]) => unknown).call(this, err, ...rest);
      };
    }
    const r = orig.apply(this, args);
    if (r && typeof (r as Promise<unknown>).then === 'function') {
      (r as Promise<unknown>).then(undefined, (e: unknown) => note(e, args[0]));
    }
    return r;
  };
  const origErr = console.error.bind(console);
  console.error = (...a: unknown[]) => {
    consoleErrors.push(a.map((x) => (x instanceof Error ? `${x.name}: ${x.message}` : String(x))).join(' ').slice(0, 300));
    origErr(...a);
  };
}

function appEnv() {
  process.env.DATABASE_URL = APP_USER_URL;
  process.env.TENANT_CONTEXT_TRIPWIRE = 'on';
}

async function tenantClient(tenantId: string) {
  appEnv();
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

/** Let fire-and-forget rejection handlers attached by the hook run. */
const settle = () => new Promise((r) => setTimeout(r, 300));

const CELLS: Record<string, () => Promise<CellResult>> = {
  /**
   * The hook's own control. An unscoped read on a table whose bypass policy is
   * dropped MUST raise TC001, and the hook MUST record it. If this cell fails,
   * every "tc001 observed: 0" below is worthless.
   */
  'hook-control': async () => {
    appEnv();
    const { prisma } = await import('../../src/lib/db/prisma');
    let caught = 'none';
    try {
      await (prisma as any).load.count();
    } catch (e) {
      caught = sqlstateOf(e);
    }
    await settle();
    return {
      cell: 'hook-control',
      ok: caught === 'TC001' && tc001.length >= 1,
      detail: { callerSaw: caught, hookRecorded: tc001.length },
    };
  },

  /** Real function. GPS path, no session. Tenant A driver/truck; no active load on staging. */
  'fn:checkGeofenceAndAlert': async () => {
    appEnv();
    const { checkGeofenceAndAlert } = await import('../../src/lib/geofencing/geofence-check');
    const activeLoads = await privileged(async (c) =>
      Number((await c.query(
        `SELECT count(*)::int n FROM "Load" WHERE "tenantId"=$1 AND "truckId"=$2 AND "driverId"=$3 AND status IN ('DISPATCHED','PICKED_UP','IN_TRANSIT')`,
        [TENANT_A, TRUCK_A, DRIVER_A],
      )).rows[0].n),
    );
    await checkGeofenceAndAlert({ tenantId: TENANT_A, driverId: DRIVER_A, truckId: TRUCK_A, latitude: 41.88, longitude: -87.63 });
    await settle();
    const logged = consoleErrors.filter((l) => /Geofence check error/i.test(l));
    return {
      cell: 'fn:checkGeofenceAndAlert',
      ok: tc001.length === 0 && logged.length === 0,
      detail: {
        tc001Observed: tc001.length,
        geofenceErrorLogged: logged.length,
        activeLoadsForThisDriverTruck: activeLoads,
        covers: activeLoads === 0
          ? 'statement 1 of 8 only (the active-load read, which returned none) — the 7 update/stop statements were not reached on this data'
          : 'active load present — later statements reachable',
      },
    };
  },

  /** Real function. Org push: reads PushToken through the tenant client. */
  'fn:sendPushToOrg': async () => {
    appEnv();
    const { sendPushToOrg } = await import('../../src/lib/notifications/send-push');
    await sendPushToOrg(TENANT_A, { title: 'quick-619 probe', body: 'not sent — no tokens on staging' });
    await settle();
    const tokens = await privileged(async (c) =>
      Number((await c.query(`SELECT count(*)::int n FROM "PushToken" WHERE "tenantId"=$1`, [TENANT_A])).rows[0].n),
    );
    const logged = consoleErrors.filter((l) => /sendPushToOrg failed/i.test(l));
    return {
      cell: 'fn:sendPushToOrg',
      ok: tc001.length === 0 && logged.length === 0,
      detail: { tc001Observed: tc001.length, errorLogged: logged.length, tokensForTenantOnStaging: tokens, covers: 'the token read (statement 1 of 2); cleanup needs a real device receipt error' },
    };
  },

  /**
   * Real function, READ-ONLY by construction: tenant A's `firstRealClientAt` is
   * already set on staging, so the function reads ActivationProgress through the
   * `where: { tenantId }` findUnique (select omitting tenantId — quick-618's fix)
   * and returns at the idempotency check without writing.
   */
  'fn:recordActivationEvent': async () => {
    const before = await privileged(async (c) =>
      (await c.query(`SELECT "firstRealClientAt", "updatedAt" FROM "ActivationProgress" WHERE "tenantId"=$1`, [TENANT_A])).rows[0],
    );
    const eventsBefore = await privileged(async (c) =>
      Number((await c.query(`SELECT count(*)::int n FROM "AppEvent" WHERE "tenantId"=$1`, [TENANT_A])).rows[0].n),
    );
    appEnv();
    const { recordActivationEvent } = await import('../../src/lib/onboarding/activation-tracker');
    await recordActivationEvent(TENANT_A, 'first_real_client');
    await settle();
    const after = await privileged(async (c) =>
      (await c.query(`SELECT "firstRealClientAt", "updatedAt" FROM "ActivationProgress" WHERE "tenantId"=$1`, [TENANT_A])).rows[0],
    );
    const eventsAfter = await privileged(async (c) =>
      Number((await c.query(`SELECT count(*)::int n FROM "AppEvent" WHERE "tenantId"=$1`, [TENANT_A])).rows[0].n),
    );
    const failed = consoleErrors.filter((l) => /recordActivationEvent failed/i.test(l));
    const autoCreate = consoleErrors.concat().filter((l) => /still missing/i.test(l));
    return {
      cell: 'fn:recordActivationEvent',
      // If the findUnique had returned null for its own tenant, the function would
      // take the auto-create branch — create() on a unique tenantId that exists
      // raises P2002 and is logged as "recordActivationEvent failed", and the
      // error-event fallback would add an AppEvent. So: no failure logged AND no
      // new AppEvent AND the row unchanged is the proof the read returned the row.
      ok:
        tc001.length === 0 &&
        failed.length === 0 &&
        autoCreate.length === 0 &&
        before != null &&
        eventsAfter === eventsBefore &&
        String(before.updatedAt) === String(after.updatedAt),
      detail: {
        tc001Observed: tc001.length,
        failureLogged: failed.length,
        progressRowExists: before != null,
        firstRealClientAtAlreadySet: before?.firstRealClientAt != null,
        appEventsBefore: eventsBefore,
        appEventsAfter: eventsAfter,
        progressRowUnchanged: String(before?.updatedAt) === String(after?.updatedAt),
      },
    };
  },

  /**
   * The quick-618 where-shape this task newly makes live: `where: { tenantId }`
   * where the unique key IS tenantId, with a select omitting it. Returned, and
   * the result's key set equals the select exactly.
   */
  'shape:activationProgress-where-tenantId': async () => {
    const counter = await privileged(async (c) =>
      Number((await c.query(`SELECT count(*)::int n FROM "ActivationProgress" WHERE "tenantId"=$1`, [TENANT_A])).rows[0].n),
    );
    const p = await tenantClient(TENANT_A);
    const row = await (p as any).$transaction(async (tx: any) =>
      tx.activationProgress.findUnique({ where: { tenantId: TENANT_A }, select: { isActivated: true, completionPct: true } }),
    );
    const keys = row ? Object.keys(row).sort() : null;
    return {
      cell: 'shape:activationProgress-where-tenantId',
      ok: counter === 1 && JSON.stringify(keys) === JSON.stringify(['completionPct', 'isActivated']),
      detail: { privilegedCounterRead: counter, resultKeys: keys, expectedKeys: ['completionPct', 'isActivated'] },
    };
  },

  /** Real function. Instance-blocked read with an id that does not exist. */
  'fn:sendInstanceBlocked': async () => {
    appEnv();
    const { sendInstanceBlocked } = await import('../../src/server/services/workflows/notifications');
    await sendInstanceBlocked({ playbookInstanceId: '61900000-0000-4000-8000-000000000001', tenantId: TENANT_A });
    await settle();
    const failed = consoleErrors.filter((l) => /sendInstanceBlocked failed/i.test(l));
    return {
      cell: 'fn:sendInstanceBlocked',
      ok: tc001.length === 0 && failed.length === 0,
      detail: { tc001Observed: tc001.length, failureLogged: failed.length, covers: 'the PlaybookInstance read (0 rows on staging, so "not found" is the expected outcome); no push or audit row reached' },
    };
  },

  /**
   * Real function, a real WRITE. security/audit-log.ts was reclassified from
   * BROKEN_POLICY by measurement; this is the proof the routed insert is admitted
   * with bypass_rls_policy dropped. Marker row, deleted on the privileged
   * connection (app_user holds no DELETE on audit_log — quick-599).
   */
  'fn:security-writeAuditLog': async () => {
    appEnv();
    const { writeAuditLog } = await import('../../src/lib/security/audit-log');
    let threw: string | null = null;
    try {
      await writeAuditLog({
        tenantId: TENANT_A,
        userId: OWNER_A,
        action: 'VIEW_PII',
        resourceType: AUDIT_MARKER,
        // `resource_id` is @db.Uuid. The first run passed the marker string here
        // and the insert failed P2007 (22P02) — a fixture defect, not the routing.
        resourceId: '61900000-0000-4000-8000-0000000a0d17',
      });
    } catch (e) {
      threw = sqlstateOf(e);
    }
    await settle();
    const found = await privileged(async (c) =>
      Number((await c.query(`SELECT count(*)::int n FROM audit_log WHERE resource_type=$1 AND tenant_id=$2`, [AUDIT_MARKER, TENANT_A])).rows[0].n),
    );
    const deleted = await privileged(async (c) =>
      (await c.query(`DELETE FROM audit_log WHERE resource_type=$1`, [AUDIT_MARKER])).rowCount ?? 0,
    );
    const left = await privileged(async (c) =>
      Number((await c.query(`SELECT count(*)::int n FROM audit_log WHERE resource_type=$1`, [AUDIT_MARKER])).rows[0].n),
    );
    return {
      cell: 'fn:security-writeAuditLog',
      ok: threw === null && tc001.length === 0 && found === 1 && left === 0,
      detail: { threw, tc001Observed: tc001.length, rowWrittenForTenantA: found, fixturesDeleted: deleted, fixturesLeft: left },
    };
  },

  /**
   * userId omitted ⇒ audit columns untouched. An update through the tenant client
   * leaves Truck A's `updatedById` NULL. The row's own `updatedAt` is restored
   * afterwards on the privileged connection, so the fixture is left as found.
   */
  'own-write-audit-null': async () => {
    const before = await privileged(async (c) =>
      (await c.query(`SELECT "updatedById", "updatedAt", odometer FROM "Truck" WHERE id=$1`, [TRUCK_A])).rows[0],
    );
    const p = await tenantClient(TENANT_A);
    let threw: string | null = null;
    try {
      await (p as any).$transaction(async (tx: any) =>
        tx.truck.update({ where: { id: TRUCK_A }, data: { odometer: before.odometer } }),
      );
    } catch (e) {
      threw = sqlstateOf(e);
    }
    const after = await privileged(async (c) =>
      (await c.query(`SELECT "updatedById", "updatedAt" FROM "Truck" WHERE id=$1`, [TRUCK_A])).rows[0],
    );
    await privileged(async (c) =>
      c.query(`UPDATE "Truck" SET "updatedAt"=$1 WHERE id=$2`, [before.updatedAt, TRUCK_A]),
    );
    const restored = await privileged(async (c) =>
      (await c.query(`SELECT "updatedAt" FROM "Truck" WHERE id=$1`, [TRUCK_A])).rows[0],
    );
    return {
      cell: 'own-write-audit-null',
      ok: threw === null && after.updatedById === null && String(restored.updatedAt) === String(before.updatedAt),
      detail: {
        threw,
        updatedByIdAfter: after.updatedById,
        updatedAtTouchedByPrisma: String(after.updatedAt) !== String(before.updatedAt),
        updatedAtRestored: String(restored.updatedAt) === String(before.updatedAt),
      },
    };
  },
};

/** Per-table: unscoped raises · scoped succeeds · cross-tenant 0 paired with a counter-read. */
async function tableCell(spec: { model: string; table: string; tenantCol: string | null }): Promise<CellResult> {
  const camel = spec.model.charAt(0).toLowerCase() + spec.model.slice(1);
  const detail: Record<string, unknown> = { model: spec.model };

  appEnv();
  const { prisma } = await import('../../src/lib/db/prisma');
  try {
    const n = await (prisma as any)[camel].count();
    detail.unscoped = { raised: false, count: n };
  } catch (e) {
    detail.unscoped = { raised: true, sqlstate: sqlstateOf(e) };
  }
  const unscopedOk = (detail.unscoped as any).raised && (detail.unscoped as any).sqlstate === 'TC001';

  let own: number | null = null;
  let scopedThrew: string | null = null;
  try {
    const p = await tenantClient(TENANT_A);
    own = await (p as any).$transaction(async (tx: any) => tx[camel].count());
    detail.scopedOwn = own;
  } catch (e) {
    scopedThrew = sqlstateOf(e);
    detail.scopedOwn = { threw: true, sqlstate: scopedThrew, message: (e as Error).message?.slice(0, 200) };
  }

  const idCol = spec.tenantCol ?? 'id';
  const prismaField = spec.tenantCol === null ? 'id' : 'tenantId';
  const counter = await privileged(async (c) =>
    Number((await c.query(`SELECT count(*)::int n FROM "${spec.table}" WHERE "${idCol}" = $1`, [TENANT_B])).rows[0].n),
  );
  let foreign: number | null = null;
  try {
    const p2 = await tenantClient(TENANT_A);
    foreign = await (p2 as any).$transaction(async (tx: any) =>
      tx[camel].count({ where: { [prismaField]: TENANT_B } }),
    );
  } catch (e) {
    foreign = -1;
    detail.crossTenantThrew = sqlstateOf(e);
  }
  const crossProven = foreign === 0 && counter > 0 && (own ?? 0) > 0;
  detail.crossTenant = {
    foreignSeenByTenantA: foreign,
    privilegedCounterRead: counter,
    verdict: crossProven
      ? 'PROVEN'
      : `UNPROVEN BY NAME — own=${own} foreign=${foreign} foreignRowsOnStaging=${counter}`,
  };
  return { cell: `table:${spec.model}`, ok: unscopedOk && scopedThrew === null, detail };
}

async function runCell(name: string) {
  installHooks();
  let r: CellResult;
  try {
    if (name.startsWith('table:')) {
      const spec = TABLES.find((t) => t.model === name.slice(6));
      if (!spec) refuse(`unknown table cell ${name}`);
      r = await tableCell(spec);
    } else {
      const fn = CELLS[name];
      if (!fn) refuse(`unknown cell "${name}"`);
      r = await fn();
    }
  } catch (e) {
    r = { cell: name, ok: false, detail: { threw: true, sqlstate: sqlstateOf(e), message: (e as Error).message?.slice(0, 400) } };
  }
  process.stdout.write('\n__CELL__' + JSON.stringify(r) + '\n');
  process.exit(0);
}

function spawnCell(name: string): CellResult {
  const out = execFileSync(
    process.execPath,
    [resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs'), __filename, '--cell', name],
    { cwd: APP_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 180_000 },
  );
  const m = /__CELL__(.*)/.exec(out);
  if (!m) return { cell: name, ok: false, detail: { error: 'no cell payload', raw: out.slice(-400) } };
  return JSON.parse(m[1]) as CellResult;
}

async function run(opts: { throwAfterDrop: boolean }) {
  banner(DIRECT_URL, 'RUN');
  const healed = await preflightHeal();
  if (healed) console.log(`pre-flight: ${healed}`);
  await capture();

  const cap = JSON.parse(readFileSync(CAPTURE_PATH, 'utf8')) as { policies: CapturedPolicy[] };
  const have = new Set(cap.policies.map((p) => p.tablename));
  const toDrop = TABLES.map((t) => t.table).filter((t) => have.has(t));
  const missing = TABLES.map((t) => t.table).filter((t) => !have.has(t));
  console.log(`tables reached by routed statements : ${TABLES.length}; carrying bypass_rls_policy: ${toDrop.length}; missing: ${JSON.stringify(missing)}`);

  const results: CellResult[] = [];
  let threw: string | null = null;
  try {
    await dropOn(toDrop);
    if (opts.throwAfterDrop) {
      throw new Error('--throw-after-drop: deliberate throw between the DROP and the probes, to prove the finally restores.');
    }
    const named = Object.keys(CELLS);
    const perTable = TABLES.map((t) => `table:${t.model}`);
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
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      resolve(EVIDENCE_DIR, opts.throwAfterDrop ? '06-throw-after-drop.json' : '06-probe-cells.json'),
      JSON.stringify(
        { generated: new Date().toISOString(), database: `${STAGING_REF} (staging)`, role: 'app_user', tripwire: 'on', droppedPolicyTables: toDrop, threw, results, restore: r },
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

async function main() {
  const a = process.argv.slice(2);
  const cellIdx = a.indexOf('--cell');
  if (cellIdx !== -1) return runCell(a[cellIdx + 1]);
  if (a.includes('--hashes')) return void (await hashes());
  if (a.includes('--run')) return run({ throwAfterDrop: a.includes('--throw-after-drop') });
  console.error('usage: 619-routing-verify.ts [--run [--throw-after-drop] | --hashes]');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
