/**
 * quick-621 — THE OWNER-LAYOUT PROOF.
 *
 *   node scripts/audit/620-start-staging-server.js <log>        (FIRST — dev server with the in-process TC001 hook)
 *   CLICK_THROUGH_LOG=<log> npx tsx scripts/audit/621-layout-verify.ts --run [--throw-after-drop]
 *   npx tsx scripts/audit/621-layout-verify.ts --hashes
 *   npx tsx scripts/audit/621-layout-verify.ts --cell <name>     (internal, one COLD cell)
 *
 * Capture / drop / restore / self-heal / sorted-list hashes are COPIED VERBATIM from
 * `620-routing-verify.ts` (itself from 619/617), evidence path changed.
 *
 * `bypass_rls_policy` is DROPPED on the three tables the layout reads — "Tenant",
 * "ActivationProgress", "User" — and then:
 *
 *   FUNCTION CELLS (cold process each, fixed dual-form driver hook installed before import):
 *     the REAL `(owner)/layout.tsx` default export is CALLED with `getSession`/`getRole` stubbed
 *     to a real staging owner's claims. It returns <TRPCReactProvider><OwnerShell …/></…>; the
 *     OwnerShell props — tenantName, onboardingComplete, congratsShownAt, tourSeen — are compared
 *     field by field against a PRIVILEGED read of the same rows. That is "the layout's data
 *     renders", measured on the value handed to the shell, for both tenants. A third cell passes a
 *     session whose tenant claim is empty and asserts the layout REJECTS — the old code rendered
 *     defaults in that case.
 *
 *   HTTP CELLS (in this process, against the running dev server): owners of tenant A and B log in
 *     BEFORE the drop (login reads the same tables), then GET owner pages DURING the drop. Each
 *     response's HTML must contain its own tenant's name and not the other's; the server-log slice
 *     for each request is read for `[q620-hook] TC001` lines — the in-process detector, not a text
 *     search for errors a route might have logged.
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
  '.planning/quick/621-sweep-layouts-templates-middleware-provi/evidence',
);
const CAPTURE_PATH = resolve(EVIDENCE_DIR, '06-policy-capture.json');

const EXPECTED_POLICY_COUNT = 86;


loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function refuse(reason: string): never {
  console.error(`621-layout-verify: REFUSING TO RUN — ${reason}`);
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
// ─── END: copied from 620-routing-verify.ts ───

type CellResult = { cell: string; ok: boolean; detail: Record<string, unknown> };

const TABLES: { model: string; table: string; tenantCol: string; prismaField: string }[] = [
  { model: 'Tenant', table: 'Tenant', tenantCol: 'id', prismaField: 'id' },
  { model: 'ActivationProgress', table: 'ActivationProgress', tenantCol: 'tenantId', prismaField: 'tenantId' },
  { model: 'User', table: 'User', tenantCol: 'tenantId', prismaField: 'tenantId' },
];

// ── 619/620's fixed dual-form driver hook ──
const tc001: { sql: string }[] = [];
const driverErrors: string[] = [];
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
}

function appEnv() {
  process.env.DATABASE_URL = APP_USER_URL;
  process.env.TENANT_CONTEXT_TRIPWIRE = 'on';
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

type Claims = { userId: string; tenantId: string; role: string };

async function owners(): Promise<{ A: Claims & { email: string; tenantName: string }; B: Claims & { email: string; tenantName: string } }> {
  return privileged(async (c) => {
    const pick = async (email: string) => {
      const r = (
        await c.query(
          `SELECT u.id, u."tenantId", u.role, t.name FROM "User" u JOIN "Tenant" t ON t.id = u."tenantId" WHERE u.email = $1`,
          [email],
        )
      ).rows[0];
      if (!r) refuse(`no staging user ${email}`);
      return { userId: r.id, tenantId: r.tenantId, role: r.role, email, tenantName: r.name };
    };
    return { A: await pick('owner@alpha.staging.test'), B: await pick('owner@beta.staging.test') };
  });
}

/** Stub ONLY the session helpers; everything the layout itself does is real. */
function stubSession(claims: Claims) {
  appEnv();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Module = require('module');
  const origLoad = Module._load;
  Module._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === '@/lib/auth/supabase') {
      return {
        getSession: async () => ({ ...claims, email: 'q621@staging.test', firstName: null, lastName: null, isSystemAdmin: false, permissions: {} }),
        getRole: async () => claims.role,
      };
    }
    return origLoad.apply(this, [request, parent, isMain]);
  };
}

async function callLayout(): Promise<Record<string, unknown>> {
  const mod = await import('../../src/app/(owner)/layout');
  const el = (await mod.default({ children: null })) as { props: { children: { props: Record<string, unknown> } } };
  const shell = el.props.children.props;
  return {
    tenantName: shell.tenantName,
    onboardingComplete: shell.onboardingComplete,
    congratsShownAt: shell.congratsShownAt,
    tourSeen: shell.tourSeen,
  };
}

async function truthFor(claims: Claims) {
  return privileged(async (c) => {
    const t = (await c.query(`SELECT name FROM "Tenant" WHERE id=$1`, [claims.tenantId])).rows[0];
    const a = (await c.query(`SELECT "isActivated", "congratsShownAt" FROM "ActivationProgress" WHERE "tenantId"=$1`, [claims.tenantId])).rows[0];
    const u = (await c.query(`SELECT "onboardingTourSeen" FROM "User" WHERE id=$1`, [claims.userId])).rows[0];
    return {
      tenantName: t?.name ?? null,
      onboardingComplete: a?.isActivated ?? false,
      congratsShownAt: a?.congratsShownAt ? new Date(a.congratsShownAt).toISOString() : null,
      tourSeen: u?.onboardingTourSeen ?? false,
      activationRowExists: !!a,
    };
  });
}

async function layoutCell(name: string, which: 'A' | 'B'): Promise<CellResult> {
  const o = await owners();
  const claims = o[which];
  stubSession(claims);
  const truth = await truthFor(claims);
  const got = await callLayout();
  await settle();
  const fields = ['tenantName', 'onboardingComplete', 'congratsShownAt', 'tourSeen'] as const;
  const mismatches = fields.filter((f) => got[f] !== truth[f]);
  const otherName = o[which === 'A' ? 'B' : 'A'].tenantName;
  return {
    cell: name,
    ok: mismatches.length === 0 && typeof got.tenantName === 'string' && got.tenantName !== otherName && tc001.length === 0,
    detail: { shellProps: got, privilegedTruth: truth, mismatches, otherTenantName: otherName, tc001Observed: tc001.length, driverErrors },
  };
}

const CELLS: Record<string, () => Promise<CellResult>> = {
  'hook-control': async () => {
    appEnv();
    const { prisma } = await import('../../src/lib/db/prisma');
    let caught = 'none';
    try {
      await (prisma as any).tenant.count();
    } catch (e) {
      caught = sqlstateOf(e);
    }
    await settle();
    return { cell: 'hook-control', ok: caught === 'TC001' && tc001.length >= 1, detail: { callerSaw: caught, hookRecorded: tc001.length } };
  },

  /** The PRE-FIX shape, verbatim SQL from the old layout: this is what the `catch {}` hid. */
  'control:old-layout-raw-read': async () => {
    const o = await owners();
    appEnv();
    const { prisma } = await import('../../src/lib/db/prisma');
    let caught = 'none';
    try {
      await (prisma as any).$queryRaw`SELECT name FROM "Tenant" WHERE id = ${o.A.tenantId}::uuid LIMIT 1`;
    } catch (e) {
      caught = sqlstateOf(e);
    }
    await settle();
    return {
      cell: 'control:old-layout-raw-read',
      ok: tc001.length >= 1,
      detail: { callerSaw: caught, hookRecorded: tc001.length, meaning: 'the old layout caught this and rendered tenantName = null' },
    };
  },

  'fn:owner-layout:tenant-A': () => layoutCell('fn:owner-layout:tenant-A', 'A'),
  'fn:owner-layout:tenant-B': () => layoutCell('fn:owner-layout:tenant-B', 'B'),

  /** A failed read must PROPAGATE. An empty tenant claim is a real failure mode (getSession yields '' when absent). */
  'fn:owner-layout:failure-propagates': async () => {
    const o = await owners();
    stubSession({ ...o.A, tenantId: '' });
    let rejected: string | null = null;
    let rendered: unknown = null;
    try {
      rendered = await callLayout();
    } catch (e) {
      rejected = `${sqlstateOf(e)}: ${(e as Error).message?.replace(/\s+/g, ' ').slice(0, 160)}`;
    }
    await settle();
    return {
      cell: 'fn:owner-layout:failure-propagates',
      ok: rejected !== null && rendered === null,
      detail: { rejected, rendered, meaning: 'the pre-fix layout rendered defaults here with HTTP 200' },
    };
  },

  /** User read isolation: a tenant-A session asking for tenant B's owner row gets no row (default), while the row exists. */
  'fn:owner-layout:cross-tenant-user': async () => {
    const o = await owners();
    stubSession({ ...o.A, userId: o.B.userId });
    const bTruth = await truthFor(o.B);
    const got = await callLayout();
    await settle();
    return {
      cell: 'fn:owner-layout:cross-tenant-user',
      ok: got.tenantName === o.A.tenantName && got.tourSeen === false && tc001.length === 0,
      detail: {
        shellProps: got,
        tenantBOwnerRowTourSeen: bTruth.tourSeen,
        discriminating: bTruth.tourSeen === true
          ? 'YES — B owner has tourSeen=true, so false proves the row was not read'
          : 'NO — B owner tourSeen is false on staging, so the default and a leaked read are indistinguishable; UNPROVEN BY DATA',
        tc001Observed: tc001.length,
      },
    };
  },
};

async function tableCell(spec: (typeof TABLES)[number]): Promise<CellResult> {
  const camel = spec.model.charAt(0).toLowerCase() + spec.model.slice(1);
  const detail: Record<string, unknown> = { model: spec.model };
  appEnv();
  const { prisma } = await import('../../src/lib/db/prisma');
  try {
    detail.unscoped = { raised: false, count: await (prisma as any)[camel].count() };
  } catch (e) {
    detail.unscoped = { raised: true, sqlstate: sqlstateOf(e) };
  }
  const unscopedOk = (detail.unscoped as any).raised && (detail.unscoped as any).sqlstate === 'TC001';
  const { getTenantPrismaForOrg } = await import('../../src/lib/context/tenant-context');
  const o = await owners();
  let own: number | null = null;
  let foreign: number | null = null;
  try {
    const p = await getTenantPrismaForOrg(o.A.tenantId);
    own = await (p as any).$transaction((tx: any) => tx[camel].count({ where: { [spec.prismaField]: o.A.tenantId } }));
    foreign = await (p as any).$transaction((tx: any) => tx[camel].count({ where: { [spec.prismaField]: o.B.tenantId } }));
  } catch (e) {
    detail.scopedThrew = sqlstateOf(e);
  }
  const counter = await privileged(async (c) =>
    Number((await c.query(`SELECT count(*)::int n FROM "${spec.table}" WHERE "${spec.tenantCol}" = $1`, [o.B.tenantId])).rows[0].n),
  );
  const proven = foreign === 0 && counter > 0 && (own ?? 0) > 0;
  detail.crossTenant = {
    own,
    foreignSeenByTenantA: foreign,
    privilegedCounterRead: counter,
    verdict: proven ? 'PROVEN' : `UNPROVEN BY NAME — own=${own} foreign=${foreign} foreignRowsOnStaging=${counter}`,
  };
  // ActivationProgress: tenant B holds no row on staging, so its cross-tenant cell cannot be proven by data.
  return { cell: `table:${spec.model}`, ok: unscopedOk && detail.scopedThrew === undefined && (own ?? 0) > 0 && foreign === 0, detail };
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
    r = { cell: name, ok: false, detail: { threw: true, sqlstate: sqlstateOf(e), message: (e as Error).message?.slice(0, 400), tc001Observed: tc001.length } };
  }
  process.stdout.write('\n__CELL__' + JSON.stringify(r) + '\n');
  process.exit(0);
}

function spawnCell(name: string): CellResult {
  const out = execFileSync(
    process.execPath,
    [resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs'), __filename, '--cell', name],
    { cwd: APP_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 240_000, maxBuffer: 32 * 1024 * 1024 },
  );
  const m = /__CELL__(.*)/.exec(out);
  if (!m) return { cell: name, ok: false, detail: { error: 'no cell payload', raw: out.slice(-400) } };
  return JSON.parse(m[1]) as CellResult;
}

// ── HTTP cells: real pages through the dev server, in-process hook in the server ──
const BASE = 'http://localhost:3000';
const SERVER_LOG = process.env.CLICK_THROUGH_LOG;

function joinSetCookie(headers: Headers): string {
  const raw = (headers as any).getSetCookie?.() as string[] | undefined;
  const list = raw && raw.length ? raw : [headers.get('set-cookie') ?? ''];
  return list.filter(Boolean).map((c) => c.split(';')[0]).join('; ');
}

async function login(email: string): Promise<string> {
  const pw = process.env.STAGING_SEED_PASSWORD;
  if (!pw) refuse('STAGING_SEED_PASSWORD not set in .env.staging');
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    body: JSON.stringify({ email, password: pw }),
    redirect: 'manual',
  });
  const cookie = joinSetCookie(res.headers);
  if (res.status !== 200 || !cookie.includes('sb-')) refuse(`login ${email} -> ${res.status}`);
  return cookie;
}

function logSize(): number {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('fs').statSync(SERVER_LOG!).size;
}
function logSlice(from: number, to: number): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs');
  const fd = fs.openSync(SERVER_LOG!, 'r');
  const buf = Buffer.alloc(Math.max(0, to - from));
  fs.readSync(fd, buf, 0, buf.length, from);
  fs.closeSync(fd);
  return buf.toString('utf8');
}

const HTTP_PAGES = ['/help', '/carrier/dashboard', '/dashboard'];

async function httpCells(cookies: { A: string; B: string }, names: { A: string; B: string }): Promise<CellResult[]> {
  const out: CellResult[] = [];
  for (const who of ['A', 'B'] as const) {
    for (const path of HTTP_PAGES) {
      const before = logSize();
      const res = await fetch(`${BASE}${path}`, { headers: { cookie: cookies[who] }, redirect: 'manual' });
      const html = await res.text();
      await settle();
      await new Promise((r) => setTimeout(r, 700)); // let the server flush the request line
      const after = logSize();
      const slice = logSlice(before, after);
      const hookLines = slice.split('\n').filter((l) => l.includes('[q620-hook] TC001'));
      const other = who === 'A' ? names.B : names.A;
      // React escapes & ' etc. in text; the staging names contain none.
      const ownRendered = html.includes(names[who]);
      const otherRendered = html.includes(other);
      out.push({
        cell: `http:${who}:${path}`,
        ok: res.status === 200 && ownRendered && !otherRendered && hookLines.length === 0,
        detail: {
          status: res.status,
          ownTenantNameInHtml: ownRendered,
          otherTenantNameInHtml: otherRendered,
          workspaceFallbackInHtml: html.includes('>Workspace<'),
          hookTc001Lines: hookLines.map((l) => l.slice(0, 200)),
          logByteRange: [before, after],
        },
      });
    }
  }
  return out;
}

async function run(opts: { throwAfterDrop: boolean }) {
  banner(DIRECT_URL, 'RUN');
  if (!SERVER_LOG && !opts.throwAfterDrop) refuse('CLICK_THROUGH_LOG is not set — start 620-start-staging-server.js first');
  const healed = await preflightHeal();
  if (healed) console.log(`pre-flight: ${healed}`);
  await capture();
  const cap = JSON.parse(readFileSync(CAPTURE_PATH, 'utf8')) as { policies: CapturedPolicy[] };
  const have = new Set(cap.policies.map((p) => p.tablename));
  const toDrop = TABLES.map((t) => t.table).filter((t) => have.has(t));
  console.log(`tables the layout reads: ${TABLES.length}; carrying bypass_rls_policy: ${toDrop.length}`);

  let cookies: { A: string; B: string } | null = null;
  let names: { A: string; B: string } | null = null;
  if (!opts.throwAfterDrop) {
    const o = await owners();
    names = { A: o.A.tenantName, B: o.B.tenantName };
    cookies = { A: await login(o.A.email), B: await login(o.B.email) }; // BEFORE the drop
    console.log(`logged in: ${o.A.email} (${names.A}) · ${o.B.email} (${names.B})`);
  }

  const results: CellResult[] = [];
  let threw: string | null = null;
  try {
    await dropOn(toDrop);
    if (opts.throwAfterDrop) throw new Error('--throw-after-drop: deliberate throw between the DROP and the probes, to prove the finally restores.');
    for (const c of [...Object.keys(CELLS), ...TABLES.map((t) => `table:${t.model}`)]) {
      const r = spawnCell(c);
      results.push(r);
      console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.cell}  ${JSON.stringify(r.detail)}`);
    }
    for (const r of await httpCells(cookies!, names!)) {
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
      JSON.stringify({ generated: new Date().toISOString(), database: `${STAGING_REF} (staging)`, role: 'app_user', tripwire: 'on', droppedPolicyTables: toDrop, threw, results, restore: r }, null, 2) + '\n',
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
  console.error('usage: 621-layout-verify.ts [--run [--throw-after-drop] | --hashes]');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
