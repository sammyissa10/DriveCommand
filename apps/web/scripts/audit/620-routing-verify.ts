/**
 * quick-620 — THE API_V1 ROUTING PROOF.
 *
 *   npx tsx scripts/audit/620-routing-verify.ts --run [--throw-after-drop]
 *   npx tsx scripts/audit/620-routing-verify.ts --hashes
 *   npx tsx scripts/audit/620-routing-verify.ts --cell <name>      (internal, one COLD cell)
 *
 * Capture / drop / restore / self-healing pre-flight / sorted-list hashes are COPIED VERBATIM from
 * `619-routing-verify.ts` (itself verbatim from 617) with the evidence path changed. The driver-level
 * TC001 hook is 619's FIXED version (both the promise and the callback call forms); it additionally
 * records every other SQLSTATE the driver sees, because on staging a missing column (42703) must be
 * told apart from a policy raise.
 *
 * ── WHAT IS DIFFERENT: THE ROUTE HANDLERS THEMSELVES RUN ─────────────────────
 *
 * Every API_V1 statement is inside a cookie-session route handler. A script has no cookie, so each
 * handler cell imports the REAL route module in a cold process with FOUR module stubs installed via
 * `Module._load` before the import — none of them routed code:
 *   - `@/lib/auth/supabase`      getSession() returns a real staging user's claims (id/tenant/role)
 *   - `next/server`              the real module with `after` replaced by a no-op (no push / email)
 *   - `@/lib/storage/presigned`  generateDownloadUrl returns a stub string (no R2 call)
 *   - `@/lib/context/tenant-context` (stops cells only) the real module with getTenantPrisma — which
 *                                reads request headers — delegating to getTenantPrismaForOrg(tenantId,
 *                                userId), i.e. what it does in a request. getTenantPrismaForOrg is the
 *                                REAL function the routed code calls.
 *
 * ── STAGING DRIFT, MEASURED BEFORE THIS HARNESS WAS WRITTEN ─────────────────
 *
 * Staging's "FleetMessage" lacks `isBroadcast` and `loadId` (production and schema.prisma have both).
 * Every routed FleetMessage statement except audio-url's findFirst and the two mark-read updateMany
 * selects, filters or writes `isBroadcast`, so those handlers fail on 42703 BEFORE any policy is
 * consulted. This harness does NOT alter staging's schema. Those handlers are still run (to show the
 * failure is the column and never TC001) and are labelled BLOCKED_BY_STAGING_DRIFT; the statements they
 * contain are covered by SHAPE cells: the routed statement on the real getTenantPrismaForOrg client with
 * `isBroadcast` removed and nothing else changed. FleetMessage holds 0 rows on staging, so its rows are
 * disposable fixtures (body marker below), created and deleted on the privileged connection, `left 0`.
 *
 * Rules carried from 616-619: POSITIVE staging refusal; `[db-target]` to STDERR, credential masked; ONE
 * COLD PROCESS per cell; SQLSTATE off the cause chain; every zero paired with a privileged counter-read
 * and own > 0; teardown NEVER by `process.kill` — a `finally`, proven by `--throw-after-drop`.
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
  '.planning/quick/620-route-the-api-v1-surface/evidence',
);
const CAPTURE_PATH = resolve(EVIDENCE_DIR, '06-policy-capture.json');

const EXPECTED_POLICY_COUNT = 86;

const TENANT_A = 'b5623cdd-dc19-4900-b75d-0ecfcaf191b8'; // Staging Alpha Carriers
const TENANT_B = '8c6136c4-eb7b-4a89-a524-d1d0e2c8d045'; // Staging Beta Logistics
const OWNER_A = 'd27660ff-feef-43dd-b22c-07ee74b9ee01';
const DRIVER_USER_A = 'd606784c-9518-4fe1-a37e-449aaa8396f3'; // primary driver on STOP_A's dispatch
const DRIVER_USER_B = '63f7cc69-8140-4290-afab-5a34bded0017';
const STOP_A = '07e2d85a-5ba9-45f8-8041-ec3a4de7d721';
const DISPATCH_A = 'd2ee6c42-6e23-44e9-beb0-483a18d52f9c';
const STOP_B = '28c501fe-430b-4cd7-880b-214646ee096f';
const DISPATCH_B = '5867b1ed-e5b7-4c32-881f-3a8d57059ff9';
const MARKER = 'quick-620-fixture-safe-to-delete';

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function refuse(reason: string): never {
  console.error(`620-routing-verify: REFUSING TO RUN — ${reason}`);
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
// (end of the section 619 copied from 617)
// ─── END: copied from 619-routing-verify.ts ───

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

type CellResult = { cell: string; ok: boolean; detail: Record<string, unknown> };

/** The 3 tables the 14 routed statements reach. `Trip` is @@map("dispatches") on org_id and EXEMPT from the extension. */
const TABLES: { model: string; table: string; tenantCol: string; prismaField: string }[] = [
  { model: 'FleetMessage', table: 'FleetMessage', tenantCol: 'tenantId', prismaField: 'tenantId' },
  { model: 'User', table: 'User', tenantCol: 'tenantId', prismaField: 'tenantId' },
  { model: 'Trip', table: 'dispatches', tenantCol: 'org_id', prismaField: 'orgId' },
];

type Fixtures = { A1: string; A2: string; B1: string; B2: string; ownerB: string };
const FIX = (): Fixtures => JSON.parse(process.env.Q620_FIXTURES ?? 'null');

// ── driver hook: 619's fixed dual-form TC001 hook, plus every other SQLSTATE seen ──
const tc001: { sql: string }[] = [];
const driverErrors: string[] = [];
const consoleErrors: string[] = [];
function installHooks() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pg = require('pg');
  const orig = pg.Client.prototype.query;
  const note = (e: unknown, q: unknown) => {
    const code = sqlstateOf(e);
    const sql = typeof q === 'string' ? q : (q as { text?: string })?.text ?? '';
    if (code === 'TC001') tc001.push({ sql: sql.slice(0, 160) });
    else driverErrors.push(`${code}: ${(e as Error)?.message?.slice(0, 120)}`);
  };
  /*
   * BOTH call forms (quick-619): @prisma/adapter-pg sends autocommit statements through Pool.query,
   * which pg-pool implements as client.query(text, values, CALLBACK); only interactive-transaction
   * statements use the promise form. A promise-only hook is blind to the former.
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
    consoleErrors.push(
      a
        .map((x) => (x instanceof Error ? `${x.name}: ${x.message}` : typeof x === 'object' ? safeJson(x) : String(x)))
        .join(' ')
        .slice(0, 400),
    );
    origErr(...a);
  };
}

function safeJson(x: unknown): string {
  try {
    return JSON.stringify(x);
  } catch {
    return String(x);
  }
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

const settle = () => new Promise((r) => setTimeout(r, 300));

// ── route-handler harness ──
type Session = { userId: string; tenantId: string; role: string; firstName: string | null; lastName: string | null };
const SESSION_OWNER_A: Session = { userId: OWNER_A, tenantId: TENANT_A, role: 'OWNER', firstName: 'Q620', lastName: 'Owner' };
const afterCalls: string[] = [];

function installStubs(session: Session, opts: { stubGetTenantPrisma?: boolean } = {}) {
  appEnv();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Module = require('module');
  const origLoad = Module._load;
  const cache = new Map<string, unknown>();
  Module._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === '@/lib/auth/supabase') {
      return {
        getSession: async () => ({ ...session, email: 'q620@staging.test', isSystemAdmin: false, permissions: {} }),
      };
    }
    if (request === 'next/server') {
      if (!cache.has(request)) {
        const real = origLoad.apply(this, [request, parent, isMain]);
        cache.set(request, {
          ...real,
          NextRequest: real.NextRequest,
          NextResponse: real.NextResponse,
          after: (fn: unknown) => {
            afterCalls.push(typeof fn);
          },
        });
      }
      return cache.get(request);
    }
    if (request === '@/lib/storage/presigned') {
      return { generateDownloadUrl: async (key: string) => `stub-presigned://${key}` };
    }
    if (opts.stubGetTenantPrisma && request === '@/lib/context/tenant-context') {
      if (!cache.has(request)) {
        const real = origLoad.apply(this, [request, parent, isMain]);
        cache.set(request, {
          ...real,
          getTenantPrisma: () => real.getTenantPrismaForOrg(session.tenantId, session.userId),
        });
      }
      return cache.get(request);
    }
    return origLoad.apply(this, [request, parent, isMain]);
  };
}

async function callHandler(
  modPath: string,
  method: 'GET' | 'POST',
  url: string,
  opts: { body?: unknown; params?: Record<string, string> } = {},
) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { NextRequest } = require('next/server');
  const mod = await import(modPath);
  const req = new NextRequest(`http://localhost${url}`, {
    method,
    ...(opts.body !== undefined
      ? { body: JSON.stringify(opts.body), headers: { 'content-type': 'application/json' } }
      : {}),
  });
  const res: Response = opts.params
    ? await mod[method](req, { params: Promise.resolve(opts.params) })
    : await mod[method](req);
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  await settle();
  return { status: res.status, json };
}

const columnMissing = () =>
  driverErrors.some((e) => e.startsWith('42703')) ||
  consoleErrors.some((l) => /P2022|does not exist|ColumnNotFound/i.test(l));

function driftCell(name: string, status: number, statementsReached: string): CellResult {
  const drift = status === 500 && columnMissing();
  return {
    cell: name,
    // ok = behaved exactly as the measured drift predicts, with no TC001. NOT a proof of the routed statement.
    ok: drift && tc001.length === 0,
    detail: {
      verdict: drift ? 'BLOCKED_BY_STAGING_DRIFT' : 'UNEXPECTED',
      status,
      tc001Observed: tc001.length,
      driverErrors: driverErrors.slice(0, 3),
      statementsReached,
      afterCallbacksScheduled: afterCalls.length,
    },
  };
}

const countBody = (body: string) =>
  privileged(async (c) =>
    Number((await c.query(`SELECT count(*)::int n FROM "FleetMessage" WHERE body=$1`, [body])).rows[0].n),
  );

const CELLS: Record<string, () => Promise<CellResult>> = {
  /** The hook's own control: an unscoped read on a dropped-policy table MUST raise TC001 AND be recorded. */
  'hook-control': async () => {
    appEnv();
    const { prisma } = await import('../../src/lib/db/prisma');
    let caught = 'none';
    try {
      await (prisma as any).fleetMessage.count();
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

  // ── REAL HANDLERS, fully executable on staging ──

  /** audio-url:36 — own message: the routed findFirst returns it. */
  'handler:audio-url:own': async () => {
    installStubs(SESSION_OWNER_A);
    const f = FIX();
    const r = await callHandler(
      '../../src/app/api/v1/messages/[id]/audio-url/route',
      'GET',
      `/api/v1/messages/${f.A1}/audio-url`,
      { params: { id: f.A1 } },
    );
    const url = (r.json as { url?: string })?.url;
    return {
      cell: 'handler:audio-url:own',
      ok: r.status === 200 && url === 'stub-presigned://quick-620/fixture-a1.m4a' && tc001.length === 0,
      detail: { status: r.status, url, tc001Observed: tc001.length, driverErrors, covers: 'audio-url:36 — row RETURNED' },
    };
  },

  /** audio-url:36 — tenant B's message id with tenant A's session: 404, while the row exists. */
  'handler:audio-url:foreign': async () => {
    installStubs(SESSION_OWNER_A);
    const f = FIX();
    const counter = await privileged(async (c) =>
      Number(
        (await c.query(`SELECT count(*)::int n FROM "FleetMessage" WHERE id=$1 AND "tenantId"=$2`, [f.B1, TENANT_B]))
          .rows[0].n,
      ),
    );
    const r = await callHandler(
      '../../src/app/api/v1/messages/[id]/audio-url/route',
      'GET',
      `/api/v1/messages/${f.B1}/audio-url`,
      { params: { id: f.B1 } },
    );
    return {
      cell: 'handler:audio-url:foreign',
      ok: r.status === 404 && counter === 1 && tc001.length === 0,
      detail: { status: r.status, json: r.json, privilegedCounterRead: counter, tc001Observed: tc001.length },
    };
  },

  /** send:64 — a recipient in ANOTHER tenant: the routed User.findFirst returns nothing → 404, no write reached. */
  'handler:send:foreign-recipient': async () => {
    installStubs(SESSION_OWNER_A);
    const f = FIX();
    const counter = await privileged(async (c) =>
      Number(
        (await c.query(`SELECT count(*)::int n FROM "User" WHERE id=$1 AND "tenantId"=$2`, [f.ownerB, TENANT_B])).rows[0]
          .n,
      ),
    );
    const body = `${MARKER} send-foreign`;
    const r = await callHandler('../../src/app/api/v1/messages/send/route', 'POST', '/api/v1/messages/send', {
      body: { recipientId: f.ownerB, body },
    });
    const written = await countBody(body);
    return {
      cell: 'handler:send:foreign-recipient',
      ok: r.status === 404 && counter === 1 && written === 0 && tc001.length === 0,
      detail: { status: r.status, json: r.json, privilegedCounterRead: counter, rowsWritten: written, tc001Observed: tc001.length },
    };
  },

  /**
   * send:64 + :76 — own-tenant recipient. :64 must RETURN the recipient (else 404); :76's create then
   * writes `isBroadcast`, which staging lacks → 42703 → 500 with nothing written.
   */
  'handler:send:own-recipient': async () => {
    installStubs(SESSION_OWNER_A);
    const body = `${MARKER} send-own`;
    const r = await callHandler('../../src/app/api/v1/messages/send/route', 'POST', '/api/v1/messages/send', {
      body: { recipientId: DRIVER_USER_A, body },
    });
    const written = await countBody(body);
    const base = driftCell(
      'handler:send:own-recipient',
      r.status,
      'send:64 RETURNED the recipient (a 404 would have ended the handler); send:76 blocked by missing isBroadcast',
    );
    return { ...base, ok: base.ok && written === 0, detail: { ...base.detail, rowsWritten: written } };
  },

  // ── REAL HANDLERS, blocked by staging drift (run to show the failure is the column, never TC001) ──

  'handler:thread': async () => {
    installStubs(SESSION_OWNER_A);
    const r = await callHandler(
      '../../src/app/api/v1/messages/thread/route',
      'GET',
      `/api/v1/messages/thread?driverId=${DRIVER_USER_A}`,
    );
    return driftCell('handler:thread', r.status, 'thread:79 blocked (select isBroadcast); :105 and :118 not reached');
  },

  'handler:conversations': async () => {
    installStubs(SESSION_OWNER_A);
    const r = await callHandler(
      '../../src/app/api/v1/messages/conversations/route',
      'GET',
      '/api/v1/messages/conversations',
    );
    return driftCell(
      'handler:conversations',
      r.status,
      'conversations:38 blocked (where/select isBroadcast); :74 and :94 not reached',
    );
  },

  'handler:broadcast': async () => {
    installStubs(SESSION_OWNER_A);
    const body = `${MARKER} broadcast`;
    const r = await callHandler('../../src/app/api/v1/messages/broadcast/route', 'POST', '/api/v1/messages/broadcast', {
      body: { body },
    });
    const written = await countBody(body);
    const base = driftCell('handler:broadcast', r.status, 'broadcast:54 blocked (data isBroadcast)');
    return { ...base, ok: base.ok && written === 0, detail: { ...base.detail, rowsWritten: written } };
  },

  'handler:stops:GET': async () => {
    installStubs(SESSION_OWNER_A, { stubGetTenantPrisma: true });
    const r = await callHandler(
      '../../src/app/api/v1/carrier/stops/[id]/messages/route',
      'GET',
      `/api/v1/carrier/stops/${STOP_A}/messages`,
      { params: { id: STOP_A } },
    );
    return driftCell(
      'handler:stops:GET',
      r.status,
      'stop-ownership lookup passed (else 404); stops:49 blocked (select isBroadcast); :76 and :89 not reached',
    );
  },

  'handler:stops:POST': async () => {
    installStubs(SESSION_OWNER_A, { stubGetTenantPrisma: true });
    const body = `${MARKER} stops-post`;
    const r = await callHandler(
      '../../src/app/api/v1/carrier/stops/[id]/messages/route',
      'POST',
      `/api/v1/carrier/stops/${STOP_A}/messages`,
      { params: { id: STOP_A }, body: { body } },
    );
    const written = await countBody(body);
    const base = driftCell(
      'handler:stops:POST',
      r.status,
      'stop lookup + driver user resolved (else 404/422); stops:201 blocked (data isBroadcast)',
    );
    return { ...base, ok: base.ok && written === 0, detail: { ...base.detail, rowsWritten: written } };
  },

  // ── SHAPE CELLS — the routed statement on the real getTenantPrismaForOrg client, `isBroadcast` removed ──

  /** stops:49 — findMany { tenantId, stopId }: own stop returns A1; tenant B's stop via client A returns 0 while it holds B1. */
  'shape:fleet-findMany-stop': async () => {
    const f = FIX();
    const p = await tenantClient(TENANT_A);
    const own = await (p as any).$transaction((tx: any) =>
      tx.fleetMessage.findMany({ where: { tenantId: TENANT_A, stopId: STOP_A }, select: { id: true } }),
    );
    const foreign = await (p as any).$transaction((tx: any) =>
      tx.fleetMessage.findMany({ where: { tenantId: TENANT_B, stopId: STOP_B }, select: { id: true } }),
    );
    const counter = await privileged(async (c) =>
      Number(
        (await c.query(`SELECT count(*)::int n FROM "FleetMessage" WHERE "tenantId"=$1 AND stop_id=$2`, [TENANT_B, STOP_B]))
          .rows[0].n,
      ),
    );
    await settle();
    return {
      cell: 'shape:fleet-findMany-stop',
      ok: own.length === 1 && own[0].id === f.A1 && foreign.length === 0 && counter === 1 && tc001.length === 0,
      detail: { own: own.length, foreign: foreign.length, privilegedCounterRead: counter, tc001Observed: tc001.length },
    };
  },

  /** thread:79 driver branch + conversations:38 — the OR minus `{ isBroadcast: true }`; and with the route's tenantId REMOVED. */
  'shape:fleet-findMany-or': async () => {
    const p = await tenantClient(TENANT_A);
    const or = [
      { senderId: OWNER_A },
      { recipientId: OWNER_A },
      { senderId: DRIVER_USER_B },
      { recipientId: DRIVER_USER_B },
    ];
    const withPred = await (p as any).$transaction((tx: any) =>
      tx.fleetMessage.findMany({ where: { tenantId: TENANT_A, OR: or }, select: { id: true, tenantId: true } }),
    );
    const noPred = await (p as any).$transaction((tx: any) =>
      tx.fleetMessage.findMany({ where: { body: { startsWith: MARKER } }, select: { id: true, tenantId: true } }),
    );
    const counter = await privileged(async (c) =>
      Number((await c.query(`SELECT count(*)::int n FROM "FleetMessage" WHERE body LIKE $1`, [`${MARKER}%`])).rows[0].n),
    );
    await settle();
    const allA = (rows: { tenantId: string }[]) => rows.every((r) => r.tenantId === TENANT_A);
    return {
      cell: 'shape:fleet-findMany-or',
      ok: withPred.length === 2 && allA(withPred) && noPred.length === 2 && allA(noPred) && counter === 4 && tc001.length === 0,
      detail: {
        withRoutePredicate: withPred.length,
        withoutRoutePredicate: noPred.length,
        privilegedFixtureRows: counter,
        tc001Observed: tc001.length,
      },
    };
  },

  /** stops:76 / thread:105 — updateMany { id in } with NO tenant predicate, handed one own id and one FOREIGN id. */
  'shape:fleet-updateMany-mark-read': async () => {
    const f = FIX();
    const p = await tenantClient(TENANT_A);
    const res = await (p as any).$transaction((tx: any) =>
      tx.fleetMessage.updateMany({ where: { id: { in: [f.A1, f.B1] } }, data: { readAt: new Date() } }),
    );
    const after = await privileged(
      async (c) =>
        (await c.query(`SELECT id, "readAt" IS NOT NULL AS read FROM "FleetMessage" WHERE id = ANY($1)`, [[f.A1, f.B1]]))
          .rows as { id: string; read: boolean }[],
    );
    await privileged((c) => c.query(`UPDATE "FleetMessage" SET "readAt" = NULL WHERE id = ANY($1)`, [[f.A1, f.B1]]));
    await settle();
    const a1 = after.find((r) => r.id === f.A1)?.read;
    const b1 = after.find((r) => r.id === f.B1)?.read;
    return {
      cell: 'shape:fleet-updateMany-mark-read',
      ok: res.count === 1 && a1 === true && b1 === false && tc001.length === 0,
      detail: { updatedCount: res.count, ownMarkedRead: a1, foreignMarkedRead: b1, readAtResetAfter: true, tc001Observed: tc001.length },
    };
  },

  /**
   * stops:201 / send:76 / broadcast:54 — the WRITE half of the policy, with the bypass gone.
   *
   * FIRST RUN: a Prisma `fleetMessage.create` on the tenant client failed P2022 — Prisma writes the
   * @default(false) `isBroadcast` column on every create, and staging lacks it. So NO Prisma create on
   * FleetMessage can execute on staging; the extension's create-injection and "createdById stays NULL"
   * are UNPROVEN ON STAGING (the latter is structural: userId is not passed). What CAN be measured is the
   * database's answer to an INSERT on the tenant client's own connection, GUC set by the real
   * getTenantPrismaForOrg, bypass_rls_policy dropped: own tenant ADMITTED, foreign tenant REFUSED 42501.
   */
  'shape:fleet-insert-policy': async () => {
    const p = await tenantClient(TENANT_A);
    const ownBody = `${MARKER} insert-own`;
    const foreignBody = `${MARKER} insert-foreign`;
    const ins = (tenant: string, body: string) =>
      (p as any).$transaction((tx: any) =>
        tx.$executeRaw`INSERT INTO "FleetMessage" (id, "tenantId", "senderId", "senderRole", body, "recipientId", "createdAt")
                      VALUES (gen_random_uuid(), ${tenant}::uuid, ${OWNER_A}::uuid, 'OWNER', ${body}, ${DRIVER_USER_A}::uuid, now())`,
      );
    let ownAdmitted: unknown = null;
    try {
      ownAdmitted = await ins(TENANT_A, ownBody);
    } catch (e) {
      ownAdmitted = { threw: sqlstateOf(e) };
    }
    // SECOND RUN: Prisma wraps a failed raw statement as P2010, and sqlstateOf() stops at that wrapper
    // code. The database's own SQLSTATE is read where it is authoritative — at the driver hook.
    let foreignCaller = 'none';
    const driverBefore = driverErrors.length;
    try {
      await ins(TENANT_B, foreignBody);
    } catch (e) {
      foreignCaller = sqlstateOf(e);
    }
    await settle();
    const foreignDriver = driverErrors.slice(driverBefore).map((l) => l.slice(0, 5));
    const foreign = foreignDriver.includes('42501') ? '42501' : foreignDriver.join(',') || 'none';
    const ownRows = await countBody(ownBody);
    const foreignRows = await countBody(foreignBody);
    await settle();
    return {
      cell: 'shape:fleet-insert-policy',
      ok: ownAdmitted === 1 && ownRows === 1 && foreign === '42501' && foreignRows === 0 && tc001.length === 0,
      detail: {
        ownInsertRowCount: ownAdmitted,
        ownRowsWritten: ownRows,
        foreignInsertSqlstate: foreign,
        foreignCallerSaw: foreignCaller,
        foreignDriverCodes: foreignDriver,
        foreignRowsWritten: foreignRows,
        tc001Observed: tc001.length,
        unprovenOnStaging: 'Prisma create injection + createdById NULL (P2022 on the missing isBroadcast column)',
      },
    };
  },

  /** stops:89 / conversations:74 / thread:118 — User.findMany { id in [ownA, ownerB], tenantId }; and with tenantId REMOVED. */
  'shape:user-findMany': async () => {
    const f = FIX();
    const p = await tenantClient(TENANT_A);
    const ids = [OWNER_A, f.ownerB];
    const withPred = await (p as any).$transaction((tx: any) =>
      tx.user.findMany({ where: { id: { in: ids }, tenantId: TENANT_A }, select: { id: true } }),
    );
    const noPred = await (p as any).$transaction((tx: any) =>
      tx.user.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    );
    const counter = await privileged(async (c) =>
      Number((await c.query(`SELECT count(*)::int n FROM "User" WHERE id = ANY($1)`, [ids])).rows[0].n),
    );
    await settle();
    const onlyOwn = (rows: { id: string }[]) => rows.length === 1 && rows[0].id === OWNER_A;
    return {
      cell: 'shape:user-findMany',
      ok: onlyOwn(withPred) && onlyOwn(noPred) && counter === 2 && tc001.length === 0,
      detail: {
        withRoutePredicate: withPred.map((r: any) => r.id),
        withoutRoutePredicate: noPred.map((r: any) => r.id),
        privilegedCounterRead: counter,
        tc001Observed: tc001.length,
      },
    };
  },

  /** conversations:94 — Trip.findMany { id in, orgId }. Trip is EXEMPT from the extension, so the orgId-less read is the POLICY alone. */
  'shape:trip-findMany': async () => {
    const p = await tenantClient(TENANT_A);
    const ids = [DISPATCH_A, DISPATCH_B];
    const withPred = await (p as any).$transaction((tx: any) =>
      tx.trip.findMany({ where: { id: { in: ids }, orgId: TENANT_A }, select: { id: true } }),
    );
    const policyOnly = await (p as any).$transaction((tx: any) =>
      tx.trip.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    );
    const counter = await privileged(async (c) =>
      Number((await c.query(`SELECT count(*)::int n FROM dispatches WHERE id = ANY($1)`, [ids])).rows[0].n),
    );
    await settle();
    const onlyOwn = (rows: { id: string }[]) => rows.length === 1 && rows[0].id === DISPATCH_A;
    return {
      cell: 'shape:trip-findMany',
      ok: onlyOwn(withPred) && onlyOwn(policyOnly) && counter === 2 && tc001.length === 0,
      detail: {
        withRoutePredicate: withPred.map((r: any) => r.id),
        policyAloneNoPredicate: policyOnly.map((r: any) => r.id),
        privilegedCounterRead: counter,
        tc001Observed: tc001.length,
      },
    };
  },
};

/** Per-table: unscoped raises TC001 · scoped succeeds · cross-tenant 0 paired with a counter-read and own > 0. */
async function tableCell(spec: (typeof TABLES)[number]): Promise<CellResult> {
  const camel = spec.model.charAt(0).toLowerCase() + spec.model.slice(1);
  const detail: Record<string, unknown> = { model: spec.model, table: spec.table };
  appEnv();
  const { prisma } = await import('../../src/lib/db/prisma');
  try {
    detail.unscoped = { raised: false, count: await (prisma as any)[camel].count() };
  } catch (e) {
    detail.unscoped = { raised: true, sqlstate: sqlstateOf(e) };
  }
  const unscopedOk = (detail.unscoped as any).raised && (detail.unscoped as any).sqlstate === 'TC001';
  let own: number | null = null;
  let scopedThrew: string | null = null;
  try {
    const p = await tenantClient(TENANT_A);
    own = await (p as any).$transaction((tx: any) => tx[camel].count());
    detail.scopedOwn = own;
  } catch (e) {
    scopedThrew = sqlstateOf(e);
    detail.scopedOwn = { threw: true, sqlstate: scopedThrew };
  }
  const counter = await privileged(async (c) =>
    Number((await c.query(`SELECT count(*)::int n FROM "${spec.table}" WHERE "${spec.tenantCol}" = $1`, [TENANT_B])).rows[0].n),
  );
  let foreign: number | null = null;
  try {
    const p2 = await tenantClient(TENANT_A);
    foreign = await (p2 as any).$transaction((tx: any) => tx[camel].count({ where: { [spec.prismaField]: TENANT_B } }));
  } catch (e) {
    foreign = -1;
    detail.crossTenantThrew = sqlstateOf(e);
  }
  const crossProven = foreign === 0 && counter > 0 && (own ?? 0) > 0;
  detail.crossTenant = {
    foreignSeenByTenantA: foreign,
    privilegedCounterRead: counter,
    verdict: crossProven ? 'PROVEN' : `UNPROVEN BY NAME — own=${own} foreign=${foreign} foreignRowsOnStaging=${counter}`,
    data: spec.model === 'FleetMessage' ? 'FIXTURE rows only — staging holds 0 real FleetMessage rows' : 'real staging rows',
  };
  return { cell: `table:${spec.model}`, ok: unscopedOk && scopedThrew === null && crossProven, detail };
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
    r = {
      cell: name,
      ok: false,
      detail: { threw: true, sqlstate: sqlstateOf(e), message: (e as Error).message?.slice(0, 400), tc001Observed: tc001.length },
    };
  }
  process.stdout.write('\n__CELL__' + JSON.stringify(r) + '\n');
  process.exit(0);
}

function spawnCell(name: string, fixtures: Fixtures): CellResult {
  const out = execFileSync(
    process.execPath,
    [resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs'), __filename, '--cell', name],
    {
      cwd: APP_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 240_000,
      env: { ...process.env, Q620_FIXTURES: JSON.stringify(fixtures) },
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  const m = /__CELL__(.*)/.exec(out);
  if (!m) return { cell: name, ok: false, detail: { error: 'no cell payload', raw: out.slice(-400) } };
  return JSON.parse(m[1]) as CellResult;
}

// ── fixtures: privileged, staging-only, marker-bodied, deleted in the finally ──
async function deleteFixtures(): Promise<number> {
  return privileged(async (c) => {
    await c.query(`DELETE FROM "FleetMessage" WHERE body LIKE $1`, [`${MARKER}%`]);
    return Number((await c.query(`SELECT count(*)::int n FROM "FleetMessage" WHERE body LIKE $1`, [`${MARKER}%`])).rows[0].n);
  });
}

async function createFixtures(): Promise<Fixtures> {
  banner(DIRECT_URL, 'FIXTURES (FleetMessage, marker-bodied)');
  return privileged(async (c) => {
    const ownerB = (
      await c.query(`SELECT id FROM "User" WHERE "tenantId"=$1 AND role='OWNER' ORDER BY "createdAt" LIMIT 1`, [TENANT_B])
    ).rows[0]?.id as string | undefined;
    if (!ownerB) refuse('no OWNER in tenant B on staging');
    const ins = async (
      tenant: string,
      sender: string,
      role: string,
      recipient: string,
      tag: string,
      stop: string | null,
      dispatch: string | null,
      audio: string | null,
    ) =>
      (
        await c.query(
          `INSERT INTO "FleetMessage" (id, "tenantId", "senderId", "senderRole", body, "recipientId", stop_id, "dispatchId", audio_url, "createdAt")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, now()) RETURNING id`,
          [tenant, sender, role, `${MARKER} ${tag}`, recipient, stop, dispatch, audio],
        )
      ).rows[0].id as string;
    const A1 = await ins(TENANT_A, DRIVER_USER_A, 'DRIVER', OWNER_A, 'A1', STOP_A, DISPATCH_A, 'quick-620/fixture-a1.m4a');
    const A2 = await ins(TENANT_A, OWNER_A, 'OWNER', DRIVER_USER_A, 'A2', null, null, null);
    const B1 = await ins(TENANT_B, DRIVER_USER_B, 'DRIVER', ownerB, 'B1', STOP_B, DISPATCH_B, 'quick-620/fixture-b1.m4a');
    const B2 = await ins(TENANT_B, ownerB, 'OWNER', DRIVER_USER_B, 'B2', null, null, null);
    console.log(`fixtures: A1 ${A1} · A2 ${A2} · B1 ${B1} · B2 ${B2} · ownerB ${ownerB}`);
    return { A1, A2, B1, B2, ownerB };
  });
}

async function run(opts: { throwAfterDrop: boolean }) {
  banner(DIRECT_URL, 'RUN');
  const healed = await preflightHeal();
  if (healed) console.log(`pre-flight: ${healed}`);
  const stale = await deleteFixtures();
  console.log(`pre-flight: leftover marker rows after cleanup = ${stale}`);
  await capture();

  const cap = JSON.parse(readFileSync(CAPTURE_PATH, 'utf8')) as { policies: CapturedPolicy[] };
  const have = new Set(cap.policies.map((p) => p.tablename));
  const toDrop = TABLES.map((t) => t.table).filter((t) => have.has(t));
  const missing = TABLES.map((t) => t.table).filter((t) => !have.has(t));
  console.log(
    `tables reached by routed statements : ${TABLES.length}; carrying bypass_rls_policy: ${toDrop.length}; missing: ${JSON.stringify(missing)}`,
  );

  const results: CellResult[] = [];
  let threw: string | null = null;
  let fixtures: Fixtures | null = null;
  let fixturesLeft: number | null = null;
  try {
    fixtures = await createFixtures();
    await dropOn(toDrop);
    if (opts.throwAfterDrop) {
      throw new Error('--throw-after-drop: deliberate throw between the DROP and the probes, to prove the finally restores.');
    }
    for (const c of [...Object.keys(CELLS), ...TABLES.map((t) => `table:${t.model}`)]) {
      const r = spawnCell(c, fixtures);
      results.push(r);
      console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.cell}  ${JSON.stringify(r.detail)}`);
    }
  } catch (e) {
    threw = (e as Error).message;
    console.error(`\n!! ${threw}`);
  } finally {
    const r = await restore();
    printRestore(r);
    fixturesLeft = await deleteFixtures();
    console.log(`FIXTURES: deleted; marker rows left ${fixturesLeft}`);
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      resolve(EVIDENCE_DIR, opts.throwAfterDrop ? '06-throw-after-drop.json' : '06-probe-cells.json'),
      JSON.stringify(
        {
          generated: new Date().toISOString(),
          database: `${STAGING_REF} (staging)`,
          role: 'app_user',
          tripwire: 'on',
          droppedPolicyTables: toDrop,
          fixtures,
          threw,
          results,
          restore: r,
          fixturesLeft,
        },
        null,
        2,
      ) + '\n',
    );
    if (!r.ok) refuse('RESTORE FAILED — staging is in a modified state. STOP.');
    if (fixturesLeft !== 0) refuse(`FIXTURE CLEANUP FAILED — ${fixturesLeft} marker rows remain.`);
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
  console.error('usage: 620-routing-verify.ts [--run [--throw-after-drop] | --hashes]');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
