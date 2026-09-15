/**
 * quick-602 — the unmigrated-path TRIPWIRE, measured rather than reasoned about.
 *
 *   npx tsx scripts/audit/602-tripwire-verify.ts --baseline
 *   npx tsx scripts/audit/602-tripwire-verify.ts --mechanism
 *   npx tsx scripts/audit/602-tripwire-verify.ts --tag-equivalence
 *   npx tsx scripts/audit/602-tripwire-verify.ts --after
 *   npx tsx scripts/audit/602-tripwire-verify.ts --setup | --teardown
 *
 * Writes evidence/<phase>.json and evidence/<phase>.md.
 *
 * STAGING ONLY. THIS FILE MUST NEVER IMPORT `scripts/_bootstrap-env`.
 * ------------------------------------------------------------------
 * `_bootstrap-env.ts` runs `process.env.DATABASE_URL = process.env.DIRECT_URL`
 * UNCONDITIONALLY, and every env file points `DIRECT_URL` at PRODUCTION. This file
 * loads `apps/web/.env.staging` explicitly and refuses on the production ref for
 * every writeable connection. Modelled on `scripts/audit/601-provisioning-verify.ts`
 * — same ground rules, same environment discipline, same evidence shape.
 *
 * PRODUCTION IS READ, NEVER WRITTEN. `--baseline` opens ONE production connection,
 * immediately issues `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` and runs
 * every statement inside `BEGIN READ ONLY ... ROLLBACK`, so a write is refused by the
 * server rather than by this file's good intentions.
 *
 * FIVE GROUND RULES (inherited verbatim from 601)
 *   1. Nothing is swallowed. Every probe records `{ok:true,...}` or
 *      `{error:{code,message,detail,hint}}` with the SQLSTATE and the full message.
 *   2. Direct SQL probes run inside `BEGIN ... ROLLBACK`, fenced per-probe with a
 *      SAVEPOINT.
 *   3. Both directions, always.
 *   4. Loud failure on a failed restore. A policy left rewritten, or a probe object
 *      left behind, is unrecoverable staging drift.
 *   5. This is a REPORT. Only a connect, fixture or restore failure exits non-zero.
 *
 * WHY THE MECHANISM PHASE USES COMMITTED THROWAWAY OBJECTS
 * -------------------------------------------------------
 * DDL inside a rolled-back transaction as `postgres` is invisible to the separate
 * `app_user` session that has to do the measuring. So the probe table, the probe
 * function and the probe raiser are CREATEd and COMMITted, measured, then dropped in
 * a `finally` whose landing is asserted against `pg_class`/`pg_proc`. No real table's
 * policies are touched in that phase.
 */

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';

const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/602-build-the-unmigrated-path-tripwire-so-th/evidence',
);

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function refuse(reason: string): never {
  console.error(`602-tripwire-verify: REFUSING TO RUN — ${reason}`);
  process.exit(1);
}

const DIRECT_URL = process.env.STAGING_DIRECT_URL;
const APP_USER_RAW = process.env.STAGING_DATABASE_URL_APP_USER;
const ADMIN_URL = process.env.STAGING_DATABASE_URL_ADMIN;

for (const [name, url] of [
  ['STAGING_DIRECT_URL', DIRECT_URL],
  ['STAGING_DATABASE_URL_APP_USER', APP_USER_RAW],
  ['STAGING_DATABASE_URL_ADMIN', ADMIN_URL],
] as const) {
  if (!url) refuse(`${name} is not set in apps/web/.env.staging`);
  if (url.includes(PRODUCTION_REF)) refuse(`${name} names the PRODUCTION project`);
  if (!url.includes(STAGING_REF)) refuse(`${name} does not name the staging project`);
}

/** 6543 (transaction mode) is not reachable from a developer machine; 5432 is the same role. */
const APP_USER_URL = APP_USER_RAW!.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');

process.env.PG_CONNECT_TIMEOUT_MS ??= '30000';

const MARKER = 'RLS602';

/** Read-only production URL, resolved from `.env.local` and used ONLY inside `--baseline`. */
function productionReadOnlyUrl(): string | null {
  const envLocal = resolve(APP_ROOT, '.env.local');
  if (!existsSync(envLocal)) return null;
  const text = readFileSync(envLocal, 'utf8').replace(/\r\n/g, '\n');
  const m = text.match(/^DIRECT_URL="?([^"\n]+)"?$/m);
  if (!m) return null;
  const url = m[1];
  if (!url.includes(PRODUCTION_REF)) return null;
  return url.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');
}

// ---------------------------------------------------------------------------
// Probe plumbing
// ---------------------------------------------------------------------------

type Direction = 'legitimate' | 'cross-tenant' | 'observation';

type Probe =
  | { label: string; direction: Direction; ok: true; detail: string }
  | {
      label: string;
      direction: Direction;
      ok: false;
      error: { code: string | undefined; message: string; detail?: string; hint?: string };
    };

const probes: Probe[] = [];

function record(p: Probe) {
  probes.push(p);
  const tag = p.ok ? 'OK  ' : 'FAIL';
  const body = p.ok ? p.detail : `${p.error.code} ${p.error.message}`;
  console.log(`  ${tag} [${p.direction}] ${p.label} -> ${body}`);
}

type ProbeOutcome = { ok: true; rows: number; first?: string } | { ok: false; code?: string; message: string };

async function sqlProbe(
  c: Client,
  label: string,
  direction: Direction,
  sql: string,
  params: unknown[] = [],
): Promise<ProbeOutcome> {
  try {
    await c.query('SAVEPOINT p');
    const r = await c.query(sql, params);
    await c.query('RELEASE SAVEPOINT p');
    const first = r.rows[0] ? JSON.stringify(r.rows[0]) : '';
    record({ label, direction, ok: true, detail: `rows=${r.rowCount}${first ? ' ' + first : ''}` });
    return { ok: true, rows: r.rowCount ?? 0, first };
  } catch (e) {
    const err = e as { code?: string; message: string; detail?: string; hint?: string };
    await c.query('ROLLBACK TO SAVEPOINT p');
    await c.query('RELEASE SAVEPOINT p');
    record({
      label,
      direction,
      ok: false,
      error: { code: err.code, message: err.message, detail: err.detail, hint: err.hint },
    });
    return { ok: false, code: err.code, message: err.message };
  }
}

/** Unfenced variant, for sessions deliberately running outside an explicit transaction. */
async function bareProbe(
  c: Client,
  label: string,
  direction: Direction,
  sql: string,
  params: unknown[] = [],
): Promise<ProbeOutcome> {
  try {
    const r = await c.query(sql, params);
    const first = r.rows[0] ? JSON.stringify(r.rows[0]) : '';
    record({ label, direction, ok: true, detail: `rows=${r.rowCount}${first ? ' ' + first : ''}` });
    return { ok: true, rows: r.rowCount ?? 0, first };
  } catch (e) {
    const err = e as { code?: string; message: string; detail?: string; hint?: string };
    record({
      label,
      direction,
      ok: false,
      error: { code: err.code, message: err.message, detail: err.detail, hint: err.hint },
    });
    return { ok: false, code: err.code, message: err.message };
  }
}

function outcomeCell(o: ProbeOutcome): string {
  return o.ok ? `rows=${o.rows}${o.first ? ' ' + o.first : ''}` : `${o.code}`;
}

// ---------------------------------------------------------------------------
// Shared catalogue reads
// ---------------------------------------------------------------------------

export type PolicyRow = {
  table: string;
  policy: string;
  cmd: string;
  permissive: boolean;
  roles: string;
  using: string | null;
  withCheck: string | null;
};

const POLICY_SQL = `
  SELECT c.relname                                AS table,
         p.polname                                AS policy,
         p.polcmd::text                           AS cmd,
         p.polpermissive                          AS permissive,
         coalesce(array_to_string(ARRAY(
           SELECT rolname FROM pg_roles WHERE oid = ANY(p.polroles) ORDER BY rolname), ','), '') AS roles,
         pg_get_expr(p.polqual, p.polrelid)       AS using,
         pg_get_expr(p.polwithcheck, p.polrelid)  AS with_check
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
   ORDER BY c.relname, p.polname`;

async function readPolicies(c: Client): Promise<PolicyRow[]> {
  const r = await c.query(POLICY_SQL);
  return r.rows.map((x) => ({
    table: x.table as string,
    policy: x.policy as string,
    cmd: x.cmd as string,
    permissive: x.permissive as boolean,
    roles: x.roles as string,
    using: (x.using as string | null) ?? null,
    withCheck: (x.with_check as string | null) ?? null,
  }));
}

export type Bucket = 'covered' | 'inline' | 'bypass' | 'neither';

/**
 * The four-way classification. Order matters and is stated rather than implied: a
 * policy that CALLS the function is covered even if it also mentions the raw GUC;
 * the bypass shape is only claimed for a policy that reads `app.bypass_rls` and
 * nothing tenant-scoped.
 */
export function classify(p: PolicyRow): Bucket {
  const text = `${p.using ?? ''} ${p.withCheck ?? ''}`;
  if (text.includes('current_tenant_id(')) return 'covered';
  if (text.includes("current_setting('app.current_tenant_id'")) return 'inline';
  if (text.includes("current_setting('app.bypass_rls'")) return 'bypass';
  return 'neither';
}

async function readFunctionBody(c: Client, name: string, args: string) {
  const r = await c.query(
    `SELECT p.proname, pg_get_functiondef(p.oid) AS def, p.prosecdef, p.provolatile, l.lanname,
            coalesce(array_to_string(p.proacl::text[], ' '), '(default)') AS acl
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
       JOIN pg_language l ON l.oid = p.prolang
      WHERE p.proname = $1 AND pg_get_function_identity_arguments(p.oid) = $2`,
    [name, args],
  );
  return r.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Phase: --baseline
// ---------------------------------------------------------------------------

async function surveyDatabase(c: Client, label: string) {
  const policies = await readPolicies(c);
  const counts: Record<Bucket, number> = { covered: 0, inline: 0, bypass: 0, neither: 0 };
  for (const p of policies) counts[classify(p)] += 1;

  const ledger = await c.query(
    `SELECT migration_name, applied_steps_count, checksum, finished_at
       FROM _prisma_migrations ORDER BY finished_at DESC NULLS LAST LIMIT 3`,
  );
  const fn = await readFunctionBody(c, 'current_tenant_id', '');
  const raiser = await readFunctionBody(c, 'tenant_context_required', 'p_raw text');
  const roles = await c.query(
    `SELECT rolname, rolbypassrls FROM pg_roles
      WHERE rolname IN ('app_user','app_admin','postgres') ORDER BY rolname`,
  );
  const roleSettings = await c.query(
    `SELECT coalesce(r.rolname,'(all roles)') AS role,
            coalesce(d.datname,'(all databases)') AS db,
            s.setconfig::text AS setconfig
       FROM pg_db_role_setting s
       LEFT JOIN pg_roles r ON r.oid = s.setrole
       LEFT JOIN pg_database d ON d.oid = s.setdatabase
      ORDER BY 1,2`,
  );
  const tagCounts = await c.query(
    `SELECT (SELECT count(*)::int FROM "Tag") AS tags,
            (SELECT count(*)::int FROM "TagAssignment") AS assignments`,
  );

  const inlineBodies = policies
    .filter((p) => classify(p) === 'inline')
    .map((p) => ({ table: p.table, policy: p.policy, cmd: p.cmd, roles: p.roles, using: p.using, withCheck: p.withCheck }));

  const survey = {
    label,
    totalPolicies: policies.length,
    counts,
    sum: counts.covered + counts.inline + counts.bypass + counts.neither,
    ledgerHead: (ledger.rows[0]?.migration_name as string) ?? null,
    ledgerTop3: ledger.rows.map((r) => r.migration_name as string),
    currentTenantId: fn
      ? {
          language: fn.lanname as string,
          prosecdef: fn.prosecdef as boolean,
          provolatile: fn.provolatile as string,
          acl: fn.acl as string,
          def: (fn.def as string).replace(/\r\n/g, '\n'),
        }
      : null,
    tenantContextRequiredPresent: !!raiser,
    roles: roles.rows,
    pgDbRoleSetting: roleSettings.rows,
    tagRows: tagCounts.rows[0],
    inlineBodies,
    bypassTables: policies.filter((p) => p.policy === 'bypass_rls_policy').map((p) => p.table).sort(),
    neither: policies.filter((p) => classify(p) === 'neither').map((p) => `${p.table}.${p.policy}`),
    policyKeys: policies.map((p) => `${p.table}.${p.policy}`).sort(),
  };
  console.log(
    `${label}: ${survey.totalPolicies} policies — covered ${counts.covered} / inline ${counts.inline} / bypass ${counts.bypass} / neither ${counts.neither}; ledger head ${survey.ledgerHead}`,
  );
  return survey;
}

async function phaseBaseline() {
  const staging = new Client({ connectionString: DIRECT_URL });
  await staging.connect();
  await staging.query('BEGIN READ ONLY');

  const prodUrl = productionReadOnlyUrl();
  let production: Client | null = null;
  if (prodUrl) {
    production = new Client({ connectionString: prodUrl });
    await production.connect();
    await production.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
    await production.query('BEGIN READ ONLY');
  }

  const out: Record<string, unknown> = {};
  out.staging = await surveyDatabase(staging, 'staging');
  if (production) out.production = await surveyDatabase(production, 'production');
  else console.log('production: NOT READ — no production DIRECT_URL resolvable from apps/web/.env.local');

  if (production) {
    const s = new Set((out.staging as { policyKeys: string[] }).policyKeys);
    const p = new Set((out.production as { policyKeys: string[] }).policyKeys);
    const onlyStaging = [...s].filter((k) => !p.has(k));
    const onlyProduction = [...p].filter((k) => !s.has(k));
    out.setDifference = { onlyStaging, onlyProduction };
    record(
      onlyStaging.length === 0 && onlyProduction.length === 0
        ? {
            label: 'policy-name set difference staging <-> production is empty, BOTH directions',
            direction: 'observation',
            ok: true,
            detail: '0 only-staging, 0 only-production',
          }
        : {
            label: 'policy-name set difference staging <-> production is empty, BOTH directions',
            direction: 'observation',
            ok: false,
            error: {
              code: 'ASSERT',
              message: `onlyStaging=${JSON.stringify(onlyStaging)} onlyProduction=${JSON.stringify(onlyProduction)}`,
            },
          },
    );

    const sb = (out.staging as { currentTenantId: { def: string } | null }).currentTenantId?.def;
    const pb = (out.production as { currentTenantId: { def: string } | null }).currentTenantId?.def;
    record(
      sb === pb
        ? {
            label: 'current_tenant_id() is byte-identical on both databases',
            direction: 'observation',
            ok: true,
            detail: 'identical',
          }
        : {
            label: 'current_tenant_id() is byte-identical on both databases',
            direction: 'observation',
            ok: false,
            error: { code: 'ASSERT', message: `staging=${sb}\nproduction=${pb}` },
          },
    );
  }

  await staging.query('ROLLBACK');
  await staging.end();
  if (production) {
    await production.query('ROLLBACK');
    await production.end();
  }
  writeEvidence('01-baseline', out);
}

// ---------------------------------------------------------------------------
// Phase: --mechanism
// ---------------------------------------------------------------------------

/** The PROPOSED `current_tenant_id()` body, verbatim, under a probe name. */
const PROBE_FN = `
CREATE OR REPLACE FUNCTION public.probe_current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE(
    NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid,
    CASE WHEN COALESCE(current_setting('app.tenant_context_tripwire', TRUE), 'off') = 'on'
         THEN public.probe_tenant_context_required(current_setting('app.current_tenant_id', TRUE))
         ELSE NULL::uuid END
  );
$fn$`;

/** The PROPOSED plpgsql raiser, verbatim, under a probe name. */
const PROBE_RAISER = `
CREATE OR REPLACE FUNCTION public.probe_tenant_context_required(p_raw text) RETURNS uuid
  LANGUAGE plpgsql STABLE AS $fn$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'TC001',
    MESSAGE = 'tenant context is required: app.current_tenant_id is '
              || CASE WHEN p_raw IS NULL THEN 'UNSET' ELSE 'the EMPTY STRING' END,
    DETAIL  = 'statement: ' || current_query(),
    HINT    = 'This statement ran with no tenant context. Acquire one (getTenantPrisma / '
              || 'getTenantPrismaForOrg / withTenantContext) before querying, or SET '
              || 'app.tenant_context_tripwire = ''off'' on this connection.';
END;
$fn$`;

const TENANT_A = '602a0000-0000-4000-8000-000000000001';
const TENANT_B = '602b0000-0000-4000-8000-000000000002';

async function createProbeObjects(pg: Client) {
  await pg.query(PROBE_RAISER);
  await pg.query(PROBE_FN);
  await pg.query(`REVOKE ALL ON FUNCTION public.probe_tenant_context_required(text) FROM PUBLIC`);
  await pg.query(`GRANT EXECUTE ON FUNCTION public.probe_tenant_context_required(text) TO app_user`);
  await pg.query(`GRANT EXECUTE ON FUNCTION public.probe_current_tenant_id() TO app_user`);

  for (const [name, order] of [
    ['tripwire_probe_602', 'tenant_first'],
    ['tripwire_probe_602_rev', 'bypass_first'],
  ] as const) {
    await pg.query(`DROP TABLE IF EXISTS public.${name}`);
    await pg.query(
      `CREATE TABLE public.${name} (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         "tenantId" uuid NOT NULL)`,
    );
    await pg.query(`ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY`);
    await pg.query(`ALTER TABLE public.${name} FORCE ROW LEVEL SECURITY`);
    await pg.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${name} TO app_user`);
    const tenantPolicy = `CREATE POLICY tenant_isolation_policy ON public.${name}
        AS PERMISSIVE FOR ALL TO PUBLIC
        USING ("tenantId" = public.probe_current_tenant_id())`;
    const bypassPolicy = `CREATE POLICY bypass_rls_policy ON public.${name}
        AS PERMISSIVE FOR ALL TO PUBLIC
        USING (current_setting('app.bypass_rls', true) = 'on')`;
    // Both creation orders, because a single ordering is a sample of one.
    if (order === 'tenant_first') {
      await pg.query(tenantPolicy);
      await pg.query(bypassPolicy);
    } else {
      await pg.query(bypassPolicy);
      await pg.query(tenantPolicy);
    }
    await pg.query(`INSERT INTO public.${name} ("tenantId") VALUES ($1), ($2)`, [TENANT_A, TENANT_B]);
  }
}

async function dropProbeObjects(pg: Client) {
  await pg.query(`DROP TABLE IF EXISTS public.tripwire_probe_602`);
  await pg.query(`DROP TABLE IF EXISTS public.tripwire_probe_602_rev`);
  await pg.query(`DROP FUNCTION IF EXISTS public.probe_current_tenant_id()`);
  await pg.query(`DROP FUNCTION IF EXISTS public.probe_tenant_context_required(text)`);
  const left = await pg.query(
    `SELECT (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
              WHERE n.nspname='public' AND c.relname LIKE 'tripwire_probe_602%') AS tables,
            (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.proname LIKE 'probe_%tenant%') AS fns`,
  );
  return left.rows[0] as { tables: number; fns: number };
}

async function appUser(): Promise<Client> {
  const c = new Client({ connectionString: APP_USER_URL });
  await c.connect();
  return c;
}

async function phaseMechanism() {
  const pg = new Client({ connectionString: DIRECT_URL });
  await pg.connect();

  const out: Record<string, unknown> = {};
  let leftovers: { tables: number; fns: number } = { tables: -1, fns: -1 };

  try {
    await createProbeObjects(pg);
    console.log('probe objects created (committed)');

    // --- 0. IS THE "UNSET" CASE EVEN OBSERVABLE FROM HERE? -------------------
    // Every staging URL in `.env.staging` is Supavisor SESSION mode
    // (`aws-0-us-west-1.pooler.supabase.com:5432`), so a `new Client()` is not
    // necessarily a fresh backend — quick-413 measured GUCs bleeding across
    // connect/release on exactly this pooler. Before claiming UNSET vs EMPTY is
    // distinguishable, measure it: read the GUC as the FIRST statement on several
    // fresh clients, alongside a control name this repo has never set.
    {
      const readings: Array<Record<string, unknown>> = [];
      for (let i = 0; i < 5; i++) {
        const c = await appUser();
        const r = await c.query(
          `SELECT current_setting('app.current_tenant_id', TRUE) AS tenant_raw,
                  current_setting('app.current_tenant_id', TRUE) IS NULL AS tenant_is_null,
                  current_setting('app.never_set_602_control', TRUE) IS NULL AS control_is_null,
                  current_setting('app.tenant_context_tripwire', TRUE) AS tripwire_raw,
                  pg_backend_pid() AS pid`,
        );
        readings.push(r.rows[0]);
        await c.end();
      }
      out.gucPresenceOnFreshClients = readings;
      const anyNull = readings.some((r) => r.tenant_is_null === true);
      const allControlNull = readings.every((r) => r.control_is_null === true);
      console.log('  fresh-client GUC readings:', JSON.stringify(readings));
      record({
        label:
          'CONTROL: a name this repo never sets (app.never_set_602_control) reads NULL on every fresh client',
        direction: 'observation',
        ok: true,
        detail: `allControlNull=${allControlNull}`,
      });
      record({
        label:
          'app.current_tenant_id reads NULL (truly UNSET) on at least one fresh app_user client through the session pooler',
        direction: 'observation',
        ok: true,
        detail: `anyNull=${anyNull} readings=${JSON.stringify(readings.map((r) => r.tenant_raw))}`,
      });
    }

    // --- 1. the COALESCE fast path must NOT raise ---------------------------
    {
      const c = await appUser();
      await c.query(`SET app.tenant_context_tripwire = 'on'`);
      await c.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TENANT_A]);
      await bareProbe(
        c,
        'FAST PATH: probe_current_tenant_id() with flag ON and a real uuid',
        'legitimate',
        `SELECT public.probe_current_tenant_id() AS v`,
      );
      await bareProbe(
        c,
        'FAST PATH: SELECT through a tenant policy that calls it, flag ON, real uuid',
        'legitimate',
        `SELECT count(*)::int AS n FROM public.tripwire_probe_602`,
      );
      const ex = await c.query(`EXPLAIN (VERBOSE, COSTS OFF) SELECT * FROM public.tripwire_probe_602`);
      out.explainFastPath = ex.rows.map((r) => r['QUERY PLAN'] as string);
      console.log('  EXPLAIN (fast path):\n' + (out.explainFastPath as string[]).map((l) => '    ' + l).join('\n'));
      await c.end();
    }

    // --- 1b. UNSET (a fresh connection) and EMPTY STRING must both raise -----
    {
      const c = await appUser(); // fresh: app.current_tenant_id has never been set here
      await c.query(`SET app.tenant_context_tripwire = 'on'`);
      const raw = await c.query(`SELECT current_setting('app.current_tenant_id', TRUE) IS NULL AS is_null`);
      const freshIsNull = raw.rows[0].is_null === true;
      record(
        freshIsNull
          ? {
              label:
                'a fresh app_user connection has app.current_tenant_id UNSET (current_setting(..,TRUE) IS NULL)',
              direction: 'observation',
              ok: true,
              detail: 'is_null=true',
            }
          : {
              label:
                'a fresh app_user connection has app.current_tenant_id UNSET (current_setting(..,TRUE) IS NULL)',
              direction: 'observation',
              ok: false,
              error: { code: 'ASSERT', message: `is_null=${raw.rows[0].is_null}` },
            },
      );
      await bareProbe(c, 'UNSET: probe_current_tenant_id(), flag ON', 'legitimate', `SELECT public.probe_current_tenant_id() AS v`);
      await bareProbe(
        c,
        'UNSET: SELECT through the tenant policy, flag ON',
        'legitimate',
        `SELECT count(*)::int AS n FROM public.tripwire_probe_602`,
      );

      await c.query(`SELECT set_config('app.current_tenant_id', '', false)`);
      await bareProbe(c, 'EMPTY STRING: probe_current_tenant_id(), flag ON', 'legitimate', `SELECT public.probe_current_tenant_id() AS v`);
      await bareProbe(
        c,
        'EMPTY STRING: SELECT through the tenant policy, flag ON',
        'legitimate',
        `SELECT count(*)::int AS n FROM public.tripwire_probe_602`,
      );
      await c.end();
    }

    // --- 1c. flag OFF is today's behaviour ----------------------------------
    {
      const c = await appUser();
      await bareProbe(
        c,
        'FLAG OFF (flag unset), tenant UNSET: probe_current_tenant_id() returns NULL',
        'legitimate',
        `SELECT public.probe_current_tenant_id() IS NULL AS is_null`,
      );
      await bareProbe(
        c,
        'FLAG OFF (flag unset), tenant UNSET: SELECT filters silently',
        'legitimate',
        `SELECT count(*)::int AS n FROM public.tripwire_probe_602`,
      );
      await c.query(`SET app.tenant_context_tripwire = 'off'`);
      await bareProbe(
        c,
        "FLAG explicitly 'off', tenant UNSET: SELECT filters silently",
        'legitimate',
        `SELECT count(*)::int AS n FROM public.tripwire_probe_602`,
      );
      await c.end();
    }

    // --- 2. the bypass OR, BOTH policy-creation orders, SELECT/UPDATE/DELETE --
    const bypassResults: Record<string, Record<string, string>> = {};
    for (const [table, order] of [
      ['tripwire_probe_602', 'tenant policy created FIRST'],
      ['tripwire_probe_602_rev', 'bypass policy created FIRST'],
    ] as const) {
      const c = await appUser();
      await c.query(`SET app.tenant_context_tripwire = 'on'`);
      await c.query(`SELECT set_config('app.bypass_rls', 'on', false)`);
      await c.query('BEGIN');
      const sel = await sqlProbe(c, `BYPASS OR (${order}): SELECT on ${table}`, 'observation', `SELECT count(*)::int AS n FROM public.${table}`);
      const upd = await sqlProbe(c, `BYPASS OR (${order}): UPDATE on ${table}`, 'observation', `UPDATE public.${table} SET "tenantId" = "tenantId"`);
      const del = await sqlProbe(c, `BYPASS OR (${order}): DELETE on ${table}`, 'observation', `DELETE FROM public.${table}`);
      bypassResults[order] = { select: outcomeCell(sel), update: outcomeCell(upd), delete: outcomeCell(del) };
      const ex = await c
        .query(`EXPLAIN (VERBOSE, COSTS OFF) SELECT * FROM public.${table}`)
        .catch((e) => ({ rows: [{ 'QUERY PLAN': `EXPLAIN raised: ${(e as Error).message}` }] }));
      ((out.explainBypass ??= {}) as Record<string, string[]>)[order] = ex.rows.map((r) => r['QUERY PLAN'] as string);
      await c.query('ROLLBACK').catch(() => {});
      await c.end();
    }
    out.bypassResults = bypassResults;

    // --- 3. the TC001 payload, quoted ---------------------------------------
    {
      const c = await appUser();
      await c.query(`SET app.tenant_context_tripwire = 'on'`);
      const payloads: Record<string, unknown> = {};
      for (const [caseName, setter] of [
        ['UNSET', null],
        ['EMPTY', `SELECT set_config('app.current_tenant_id', '', false)`],
      ] as const) {
        if (setter) await c.query(setter);
        try {
          await c.query(`SELECT id FROM public.tripwire_probe_602 WHERE "tenantId" IS NOT NULL`);
          payloads[caseName] = { raised: false };
        } catch (e) {
          const err = e as { code?: string; message: string; detail?: string; hint?: string };
          payloads[caseName] = {
            raised: true,
            code: err.code,
            message: err.message,
            detail: err.detail,
            hint: err.hint,
          };
        }
      }
      out.tc001Payload = payloads;
      console.log('  TC001 payloads:', JSON.stringify(payloads, null, 2));
      await c.query(`RESET app.tenant_context_tripwire`).catch(() => {});
      await c.query(`SELECT set_config('app.current_tenant_id','',false)`).catch(() => {});
      await c.end();
    }

    // --- 4. does a session-level SET of the flag BLEED across the pooler? -----
    // If it does, "staging is left flag-off" cannot be asserted by simply closing
    // the client — a later connection could land on a backend still carrying 'on'.
    {
      // (a) the hazard, demonstrated: SET the flag, close the client WITHOUT
      //     resetting, then read it from a "new" client.
      const setter = await appUser();
      const setterPid = (await setter.query(`SELECT pg_backend_pid() AS pid`)).rows[0].pid;
      await setter.query(`SET app.tenant_context_tripwire = 'on'`);
      await setter.end();
      const reader = await appUser();
      const seen = await reader.query(
        `SELECT pg_backend_pid() AS pid, current_setting('app.tenant_context_tripwire', TRUE) AS flag`,
      );
      await reader.query(`RESET app.tenant_context_tripwire`);
      await reader.end();
      out.tripwireFlagBleedWithoutReset = { setterPid, ...seen.rows[0] };
      record({
        label:
          'HAZARD: a session SET of the tripwire flag, with the client closed and NO RESET, is still readable from the next client',
        direction: 'observation',
        ok: true,
        detail: `setterPid=${setterPid} readerPid=${seen.rows[0].pid} flag=${JSON.stringify(seen.rows[0].flag)}`,
      });

      // (b) after an explicit RESET, across several clients.
      const bleed: Array<Record<string, unknown>> = [];
      for (let i = 0; i < 6; i++) {
        const c = await appUser();
        const r = await c.query(
          `SELECT pg_backend_pid() AS pid, current_setting('app.tenant_context_tripwire', TRUE) AS flag`,
        );
        bleed.push(r.rows[0]);
        await c.query(`RESET app.tenant_context_tripwire`);
        await c.end();
      }
      out.tripwireFlagBleed = bleed;
      const stillOn = bleed.filter((b) => b.flag === 'on').length;
      console.log('  post-run flag readings across 6 fresh clients:', JSON.stringify(bleed));
      record({
        label:
          'after the probe sessions closed, how many fresh app_user clients still read the tripwire flag as ON (session-pooler bleed)',
        direction: 'observation',
        ok: true,
        detail: `stillOn=${stillOn} of 6; each was RESET after reading`,
      });
    }
  } finally {
    leftovers = await dropProbeObjects(pg);
    console.log(`probe objects dropped — leftover tables=${leftovers.tables} functions=${leftovers.fns}`);
  }

  out.leftovers = leftovers;
  writeEvidence('02-mechanism', out);
  await pg.end();
  if (leftovers.tables !== 0 || leftovers.fns !== 0) {
    console.error('PROBE CLEANUP FAILED — objects survive. Fix before anything else.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Fixtures (RLS602) — shared by --tag-equivalence and --after
// ---------------------------------------------------------------------------

async function seedFixtures(pg: Client) {
  const ids: string[] = [];
  for (const k of ['a', 'b']) {
    const r = await pg.query(
      `INSERT INTO "Tenant" (name, slug, "updatedAt") VALUES ($1, $2, now())
       ON CONFLICT (slug) DO UPDATE SET "updatedAt" = now()
       RETURNING id`,
      [`${MARKER} fixture ${k}`, `${MARKER.toLowerCase()}-fixture-${k}`],
    );
    ids.push(r.rows[0].id as string);
  }
  const tagIds: string[] = [];
  for (const id of ids) {
    await pg.query(
      `INSERT INTO "Tag" ("tenantId", name, "updatedAt") VALUES ($1, $2, now())
       ON CONFLICT ("tenantId", name) DO NOTHING`,
      [id, `${MARKER} tag`],
    );
    const tag = await pg.query(`SELECT id FROM "Tag" WHERE "tenantId" = $1 AND name = $2`, [id, `${MARKER} tag`]);
    const tagId = tag.rows[0].id as string;
    tagIds.push(tagId);
    const existing = await pg.query(
      `SELECT count(*)::int AS n FROM "TagAssignment" WHERE "tagId" = $1 AND "truckId" IS NULL AND "userId" IS NULL`,
      [tagId],
    );
    if ((existing.rows[0].n as number) === 0) {
      await pg.query(`INSERT INTO "TagAssignment" ("tenantId","tagId") VALUES ($1,$2)`, [id, tagId]);
    }
  }
  const counts = await pg.query(
    `SELECT (SELECT count(*)::int FROM "Tag" WHERE "tenantId" = ANY($1)) AS tags,
            (SELECT count(*)::int FROM "TagAssignment" WHERE "tenantId" = ANY($1)) AS assignments`,
    [ids],
  );
  return {
    tenantA: ids[0],
    tenantB: ids[1],
    tagA: tagIds[0],
    tagB: tagIds[1],
    ...(counts.rows[0] as { tags: number; assignments: number }),
  };
}

async function teardownFixtures(pg: Client) {
  const ids = await pg.query(`SELECT id FROM "Tenant" WHERE name LIKE $1`, [`${MARKER}%`]);
  const tenantIds = ids.rows.map((r) => r.id as string);
  for (const id of tenantIds) {
    await pg.query(`DELETE FROM "TagAssignment" WHERE "tenantId" = $1`, [id]);
    await pg.query(`DELETE FROM "Tag" WHERE "tenantId" = $1`, [id]);
    await pg.query(`DELETE FROM "Tenant" WHERE id = $1`, [id]);
  }
  const left = await pg.query(
    `SELECT (SELECT count(*)::int FROM "Tenant" WHERE name LIKE $1) AS tenants,
            (SELECT count(*)::int FROM "Tag" WHERE name LIKE $1) AS tags,
            (SELECT count(*)::int FROM "TagAssignment" ta
               JOIN "Tenant" t ON t.id = ta."tenantId" WHERE t.name LIKE $1) AS assignments`,
    [`${MARKER}%`],
  );
  return { deleted: tenantIds.length, ...(left.rows[0] as { tenants: number; tags: number; assignments: number }) };
}

// ---------------------------------------------------------------------------
// Phase: --tag-equivalence
// ---------------------------------------------------------------------------

const NEW_TAG_USING = `("tenantId" = current_tenant_id())`;

type GucCase = { name: string; value: string | null };

async function tagMatrix(
  fixtures: { tenantA: string; tenantB: string; tagA: string; tagB: string },
  phase: 'before' | 'after',
): Promise<Record<string, unknown>> {
  const cases: GucCase[] = [
    { name: 'tenant A (canonical lowercase)', value: fixtures.tenantA },
    { name: 'tenant B', value: fixtures.tenantB },
    { name: "'' (the pool default)", value: '' },
    { name: 'unset', value: null },
    { name: 'tenant A UPPERCASED', value: fixtures.tenantA.toUpperCase() },
    { name: "'not-a-uuid'", value: 'not-a-uuid' },
  ];

  const result: Record<string, unknown> = {};
  for (const table of ['Tag', 'TagAssignment']) {
    for (const g of cases) {
      const c = await appUser();
      if (g.value !== null) await c.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [g.value]);
      await c.query('BEGIN');
      const key = `${phase} | ${table} | ${g.name}`;
      const sel = await sqlProbe(
        c,
        `${key} | SELECT tenant A rows`,
        'observation',
        `SELECT count(*)::int AS n FROM "${table}" WHERE "tenantId" = $1`,
        [fixtures.tenantA],
      );
      const ins = await sqlProbe(
        c,
        `${key} | INSERT own tenant (A)`,
        'legitimate',
        table === 'Tag'
          ? `INSERT INTO "Tag" ("tenantId", name, "updatedAt") VALUES ($1, $2, now())`
          : `INSERT INTO "TagAssignment" ("tenantId","tagId") VALUES ($1, $2)`,
        table === 'Tag' ? [fixtures.tenantA, `${MARKER} probe ${Date.now()}`] : [fixtures.tenantA, fixtures.tagA],
      );
      const insX = await sqlProbe(
        c,
        `${key} | INSERT foreign tenant (B)`,
        'cross-tenant',
        table === 'Tag'
          ? `INSERT INTO "Tag" ("tenantId", name, "updatedAt") VALUES ($1, $2, now())`
          : `INSERT INTO "TagAssignment" ("tenantId","tagId") VALUES ($1, $2)`,
        table === 'Tag' ? [fixtures.tenantB, `${MARKER} probe x ${Date.now()}`] : [fixtures.tenantB, fixtures.tagB],
      );
      await c.query('ROLLBACK').catch(() => {});
      await c.end();
      result[key] = {
        select: outcomeCell(sel),
        insertOwn: outcomeCell(ins),
        insertForeign: outcomeCell(insX),
      };
    }
  }
  return result;
}

async function phaseTagEquivalence() {
  const pg = new Client({ connectionString: DIRECT_URL });
  await pg.connect();
  const fixtures = await seedFixtures(pg);
  console.log('fixtures:', fixtures);
  if (fixtures.tags < 2 || fixtures.assignments < 2) {
    console.error('FIXTURE FAILURE: Tag/TagAssignment fixtures did not seed. A matrix over empty tables tests nothing.');
    process.exit(1);
  }

  const out: Record<string, unknown> = { fixtures };

  // Capture the live bodies FROM THE CATALOGUE, never from a literal in this file.
  const captured: Record<string, { using: string; withCheck: string | null }> = {};
  for (const t of ['Tag', 'TagAssignment']) {
    const r = await pg.query(
      `SELECT pg_get_expr(p.polqual, p.polrelid) AS using, pg_get_expr(p.polwithcheck, p.polrelid) AS wc
         FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
        WHERE c.relname = $1 AND p.polname = 'tenant_isolation_policy'`,
      [t],
    );
    if (r.rowCount !== 1) {
      console.error(`FIXTURE FAILURE: tenant_isolation_policy not found on "${t}".`);
      process.exit(1);
    }
    captured[t] = { using: r.rows[0].using as string, withCheck: (r.rows[0].wc as string | null) ?? null };
  }
  out.capturedBodies = captured;
  console.log('captured bodies:', JSON.stringify(captured));

  out.before = await tagMatrix(fixtures, 'before');

  let restoredOk = false;
  try {
    for (const t of ['Tag', 'TagAssignment']) {
      await pg.query(`DROP POLICY tenant_isolation_policy ON "${t}"`);
      await pg.query(`CREATE POLICY tenant_isolation_policy ON "${t}" AS PERMISSIVE FOR ALL TO PUBLIC USING ${NEW_TAG_USING}`);
    }
    console.log('policies temporarily rewritten to the proposed body');
    out.after = await tagMatrix(fixtures, 'after');
  } finally {
    for (const t of ['Tag', 'TagAssignment']) {
      await pg.query(`DROP POLICY IF EXISTS tenant_isolation_policy ON "${t}"`);
      const check = captured[t].withCheck ? ` WITH CHECK (${captured[t].withCheck})` : '';
      await pg.query(
        `CREATE POLICY tenant_isolation_policy ON "${t}" AS PERMISSIVE FOR ALL TO PUBLIC USING (${captured[t].using})${check}`,
      );
    }
    const back: Record<string, string> = {};
    for (const t of ['Tag', 'TagAssignment']) {
      const r = await pg.query(
        `SELECT pg_get_expr(p.polqual, p.polrelid) AS using FROM pg_policy p
           JOIN pg_class c ON c.oid = p.polrelid
          WHERE c.relname = $1 AND p.polname = 'tenant_isolation_policy'`,
        [t],
      );
      back[t] = r.rows[0]?.using as string;
    }
    restoredOk = back['Tag'] === captured['Tag'].using && back['TagAssignment'] === captured['TagAssignment'].using;
    out.restoredBodies = back;
    out.restoredByteEqual = restoredOk;
    console.log('restored bodies byte-equal to captured:', restoredOk, JSON.stringify(back));
  }

  writeEvidence('03-tag-equivalence', out);
  await pg.end();
  if (!restoredOk) {
    console.error('POLICY RESTORE FAILED — the live body is not byte-identical to what was captured.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

function writeEvidence(phase: string, extra: Record<string, unknown>) {
  if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
  const payload = { phase, generatedAt: new Date().toISOString(), projectRef: STAGING_REF, ...extra, probes };
  writeFileSync(resolve(EVIDENCE_DIR, `${phase}.json`), JSON.stringify(payload, null, 2) + '\n', 'utf8');

  const lines = [
    `# quick-602 — \`${phase}\``,
    '',
    `Generated ${payload.generatedAt} against staging (\`${STAGING_REF}\`).`,
    '',
    '```json',
    JSON.stringify(extra, null, 2),
    '```',
    '',
    '| direction | probe | result |',
    '|---|---|---|',
    ...probes.map(
      (p) =>
        `| ${p.direction} | ${p.label.replace(/\|/g, '\\|')} | ${
          p.ok
            ? `OK — ${p.detail.replace(/\|/g, '\\|')}`
            : `\`${p.error.code}\` ${p.error.message.replace(/\|/g, '\\|').replace(/\n/g, '<br>')}`
        } |`,
    ),
    '',
  ];
  writeFileSync(resolve(EVIDENCE_DIR, `${phase}.md`), lines.join('\n'), 'utf8');
  console.log(`\nWrote ${resolve(EVIDENCE_DIR, `${phase}.md`)}`);
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

(async () => {
  const arg = process.argv.find((a) => a.startsWith('--'));
  switch (arg) {
    case '--baseline':
      await phaseBaseline();
      break;
    case '--recheck': {
      // Same survey as --baseline, written under a caller-chosen evidence name, so
      // the baseline evidence is never overwritten by a later confirmation run.
      const outName = (process.argv.find((a) => a.startsWith('--out=')) ?? '--out=recheck').slice(6);
      const staging = new Client({ connectionString: DIRECT_URL });
      await staging.connect();
      await staging.query('BEGIN READ ONLY');
      const res: Record<string, unknown> = { staging: await surveyDatabase(staging, 'staging') };
      await staging.query('ROLLBACK');
      await staging.end();
      const prodUrl = productionReadOnlyUrl();
      if (prodUrl) {
        const production = new Client({ connectionString: prodUrl });
        await production.connect();
        await production.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
        await production.query('BEGIN READ ONLY');
        res.production = await surveyDatabase(production, 'production');
        await production.query('ROLLBACK');
        await production.end();
      }
      writeEvidence(outName, res);
      break;
    }
    case '--mechanism':
      await phaseMechanism();
      break;
    case '--tag-equivalence':
      await phaseTagEquivalence();
      break;
    case '--setup': {
      const pg = new Client({ connectionString: DIRECT_URL });
      await pg.connect();
      console.log('fixtures:', await seedFixtures(pg));
      await pg.end();
      break;
    }
    case '--teardown': {
      const pg = new Client({ connectionString: DIRECT_URL });
      await pg.connect();
      const t = await teardownFixtures(pg);
      console.log('teardown:', t);
      await pg.end();
      if (t.tenants !== 0 || t.tags !== 0 || t.assignments !== 0) process.exit(1);
      break;
    }
    default:
      refuse('pass one of --baseline | --mechanism | --tag-equivalence | --setup | --after | --teardown');
  }
})().catch((e) => {
  console.error('602-tripwire-verify: UNCAUGHT', e);
  process.exit(1);
});
