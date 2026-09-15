/**
 * quick-602 STEP 4 — run the APPLICATION against staging as `app_user` with the
 * tripwire ON, and report every path BY NAME.
 *
 *   npx tsx scripts/audit/602-execution-sweep.ts
 *
 * `wrapper-migration-scope.md` counted CALL SITES. Nothing has ever counted
 * EXECUTIONS. The static countdown (Task 5) is a different instrument and cannot
 * discharge this step.
 *
 * STAGING ONLY. NEVER IMPORTS `scripts/_bootstrap-env` (it assigns
 * DATABASE_URL = DIRECT_URL unconditionally, and DIRECT_URL is PRODUCTION in every
 * env file). Refuses on the production ref.
 *
 * WHY IT INVOKES THE REAL FUNCTIONS RATHER THAN REPLAYING THEIR SQL
 * ----------------------------------------------------------------
 * 601-provisioning-verify.ts's header argues this at length and the reasoning
 * transfers unchanged: replaying statements by hand proves the policy set admits a
 * sequence *I* typed out, not the sequence Prisma actually emits. `DATABASE_URL` is
 * assigned BEFORE any dynamic import because `lib/db/prisma.ts` builds its `pg.Pool`
 * at module scope.
 *
 * THE FOUR VERDICTS, NEVER MERGED
 *   RAISED_TC001  the entry point (or something it awaited) raised SQLSTATE TC001
 *   COMPLETED     ran to completion with no TC001, plus a `dbTouched` flag
 *   OTHER_FAILURE threw for an unrelated reason — recorded with {code,message} and
 *                 counted as evidence about NOTHING
 *   NOT_INVOKED   listed by name with the reason, in its own table, never summed
 *                 into the passes
 */

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Environment — assigned BEFORE any dynamic import
// ---------------------------------------------------------------------------

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';

const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/602-build-the-unmigrated-path-tripwire-so-th/evidence',
);
const CRON_DIR = resolve(APP_ROOT, 'src/app/api/cron');

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function refuse(reason: string): never {
  console.error(`602-execution-sweep: REFUSING TO RUN — ${reason}`);
  process.exit(1);
}

const DIRECT_URL = process.env.STAGING_DIRECT_URL;
const APP_USER_RAW = process.env.STAGING_DATABASE_URL_APP_USER;
for (const [name, url] of [
  ['STAGING_DIRECT_URL', DIRECT_URL],
  ['STAGING_DATABASE_URL_APP_USER', APP_USER_RAW],
] as const) {
  if (!url) refuse(`${name} is not set in apps/web/.env.staging`);
  if (url.includes(PRODUCTION_REF)) refuse(`${name} names the PRODUCTION project`);
  if (!url.includes(STAGING_REF)) refuse(`${name} does not name the staging project`);
}
const APP_USER_URL = APP_USER_RAW!.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');

// The application pool is built from DATABASE_URL at module scope.
process.env.DATABASE_URL = APP_USER_URL;
process.env.DIRECT_URL = APP_USER_URL;
// `getAdminDb` resolves DATABASE_URL_ADMIN. Without it the three admin-routed cron
// routes fail on a MISSING VARIABLE, which would be reported as OTHER_FAILURE and
// would say nothing about the thing being measured — whether a bypassing connection
// is structurally out of the tripwire's reach.
if (process.env.STAGING_DATABASE_URL_ADMIN) {
  process.env.DATABASE_URL_ADMIN = process.env.STAGING_DATABASE_URL_ADMIN.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');
}
process.env.PG_CONNECT_TIMEOUT_MS ??= '30000';

// 4a.2 — no live outbound email or push. Deleted BEFORE any import, and asserted.
const SILENCED = [
  'RESEND_API_KEY',
  'GMAIL_USER',
  'GMAIL_APP_PASSWORD',
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_PASSWORD',
  'EXPO_ACCESS_TOKEN',
  'EXPO_PUSH_TOKEN',
] as const;
for (const k of SILENCED) delete process.env[k];

// 4a.4 — CRON_SECRET is in no env file, so `verifyCronSecret` would return false and
// every cron route would 401, which looks like a clean sweep and measures NOTHING.
const CRON_SECRET = randomUUID();
process.env.CRON_SECRET = CRON_SECRET;

process.env.EMAIL_TOKEN_SECRET ??= randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------

type Verdict = 'RAISED_TC001' | 'COMPLETED' | 'OTHER_FAILURE' | 'NOT_INVOKED';

type Row = {
  name: string;
  population: string;
  mechanism: string;
  verdict: Verdict;
  dbTouched?: boolean;
  queries?: number;
  detail?: string;
  tc001?: { message?: string; detail?: string; hint?: string };
  error?: { code?: string; message: string };
  reason?: string;
};

const rows: Row[] = [];
const notInvoked: Row[] = [];

/**
 * TC001 detection by STRUCTURE, never by message prose, walking `cause`/`meta`
 * because Prisma wraps driver errors. `instanceof` is unusable across two copies of
 * a library in a monorepo (quick-546).
 */
function findSqlState(err: unknown, depth = 0): string | undefined {
  if (!err || depth > 8) return undefined;
  if (typeof err !== 'object') return undefined;
  const e = err as Record<string, unknown>;
  if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code) && e.code !== 'P2010') return e.code;
  for (const k of ['cause', 'meta', 'originalError', 'error']) {
    const found = findSqlState(e[k], depth + 1);
    if (found) return found;
  }
  return undefined;
}

function tc001Payload(err: unknown, depth = 0): { message?: string; detail?: string; hint?: string } | undefined {
  if (!err || depth > 8 || typeof err !== 'object') return undefined;
  const e = err as Record<string, unknown>;
  if (e.code === 'TC001') {
    return { message: e.message as string, detail: e.detail as string, hint: e.hint as string };
  }
  for (const k of ['cause', 'meta', 'originalError', 'error']) {
    const f = tc001Payload(e[k], depth + 1);
    if (f) return f;
  }
  return undefined;
}

/**
 * Prisma's driver-adapter path can surface a raised SQLSTATE only in the rendered
 * message. Detection is therefore STRUCTURE FIRST; the message fallback is used only
 * when the structural walk found nothing, and every row it decides is LABELLED
 * `detectedVia: message` in the evidence so it is never mistaken for a structural
 * read. Matching is on the SQLSTATE TOKEN, not on the sentence.
 */
function classifyError(err: unknown): { isTc001: boolean; via: 'structure' | 'message' | 'none'; sqlstate?: string } {
  const state = findSqlState(err);
  if (state === 'TC001') return { isTc001: true, via: 'structure', sqlstate: state };
  const msg = err instanceof Error ? err.message : String(err);
  if (/\bTC001\b/.test(msg)) return { isTc001: true, via: 'message', sqlstate: 'TC001' };
  return { isTc001: false, via: 'none', sqlstate: state };
}

// ---------------------------------------------------------------------------
// Mechanism classification — re-derived by grep in this script
// ---------------------------------------------------------------------------

function mechanismOf(file: string): string {
  const src = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const marks: string[] = [];
  if (/getTenantPrismaForOrg|getTenantPrisma\b/.test(src)) marks.push('getTenantPrisma*');
  if (/app\.bypass_rls|bypass_rls/.test(src)) marks.push('app.bypass_rls');
  if (/getAdminDb/.test(src)) marks.push('getAdminDb');
  if (marks.length === 0) marks.push(/\bprisma\b/.test(src) ? 'bare prisma' : 'no DB import');
  if (/\bafter\(/.test(src)) marks.push('after()');
  return marks.join(' + ');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  const assertions: string[] = [];
  const say = (s: string) => {
    assertions.push(s);
    console.log(s);
  };

  // 4a.2 assertion (recorded, not assumed)
  const stillSet = SILENCED.filter((k) => process.env[k]);
  say(`SAFETY: outbound email/push variables absent: ${stillSet.length === 0 ? 'YES' : 'NO -> ' + stillSet.join(',')}`);
  if (stillSet.length) refuse('an outbound-delivery variable survived neutralisation');

  // --- import the application, pointed at staging as app_user ---------------
  const { prisma } = await import('../../src/lib/db/prisma');
  const globalForPrisma = globalThis as unknown as { pool: import('pg').Pool };
  const pool = globalForPrisma.pool;
  if (!pool) refuse('lib/db/prisma.ts did not publish its pool on globalThis');

  // ARM THE TRIPWIRE on the application's own pool. `ALTER ROLE ... SET` is refused
  // on this instance for a placeholder GUC (evidence/06-tripwire-matrix.md), so a
  // per-connection session SET is the only arming mechanism there is.
  pool.on('connect', (client) => {
    client.query("SET app.tenant_context_tripwire = 'on'").catch((e) => {
      console.warn('[sweep] could not arm the tripwire on a new connection:', (e as Error).message);
    });
  });

  // 4b — dbTouched, INSTRUMENTED (not statically inferred). Both entry points the
  // pg adapter can use are wrapped, and both are restored at the end.
  let queryCount = 0;

  /**
   * DRIVER-LEVEL TC001 CAPTURE — and it is load-bearing.
   *
   * The first run of this sweep classified `trip-reminders` as COMPLETED because the
   * route CAUGHT its own TC001 and returned HTTP 500 with a generic body. A verdict
   * built only from what the handler throws therefore under-reports the signal
   * exactly on the population `guc-binding.md` singled out as silently swallowing
   * failures. Observing the driver's own promise rejections catches the raise
   * whatever the route does with it afterwards, and it is structural — `err.code`,
   * never message prose. Attaching a rejection handler does not consume the
   * rejection: the original promise is returned unchanged to the caller.
   */
  const tcRaises: Array<{ code: string; message: string; detail?: string; hint?: string }> = [];
  const observe = (p: unknown) => {
    if (p && typeof (p as Promise<unknown>).then === 'function') {
      (p as Promise<unknown>).then(undefined, (err: { code?: string; message: string; detail?: string; hint?: string }) => {
        if (err && err.code === 'TC001') {
          tcRaises.push({ code: err.code, message: err.message, detail: err.detail, hint: err.hint });
        }
      });
    }
    return p;
  };

  const origQuery = pool.query.bind(pool);
  const origConnect = pool.connect.bind(pool);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).query = (...args: unknown[]) => {
    queryCount += 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return observe((origQuery as any)(...args));
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).connect = async (...args: unknown[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = await (origConnect as any)(...args);
    if (client && !client.__sweepWrapped) {
      const cq = client.query.bind(client);
      client.query = (...a: unknown[]) => {
        queryCount += 1;
        return observe(cq(...a));
      };
      client.__sweepWrapped = true;
    }
    return client;
  };

  // 4a.1 — database identity, through the application's OWN client
  const who = await prisma.$queryRaw<Array<{ current_user: string; db: string; bypass: boolean }>>`
    SELECT current_user, current_database() AS db,
           (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass
  `;
  say(
    `SAFETY: application pool connected as ${who[0].current_user} / ${who[0].db} (rolbypassrls=${who[0].bypass})`,
  );
  if (who[0].current_user !== 'app_user' || who[0].bypass) {
    refuse('the application pool is not a non-bypassing app_user');
  }
  const flag = await prisma.$queryRaw<Array<{ f: string | null }>>`
    SELECT current_setting('app.tenant_context_tripwire', TRUE) AS f
  `;
  say(`SAFETY: tripwire flag on the application connection reads ${JSON.stringify(flag[0].f)}`);
  if (flag[0].f !== 'on') refuse('the tripwire is not armed on the application connection — the sweep would measure nothing');

  // 4a.3 — write surface snapshot, taken on a SEPARATE admin connection so the
  // sweep's own connection state cannot affect it.
  const snapshotTables = [
    'CarrierLoad', 'Trip', 'CarrierContract', 'CarrierClient', 'CarrierDriver', 'CarrierTruck',
    'Route', 'Load', 'Invoice', 'SupportTicket', 'SysAdminInvoice', 'Tenant', 'User',
    'in_app_notifications', 'audit_log', 'Tag',
  ];
  const pg = new Client({ connectionString: DIRECT_URL });
  await pg.connect();
  const snapshot = async () => {
    const out: Record<string, number> = {};
    for (const t of snapshotTables) {
      try {
        const r = await pg.query(`SELECT count(*)::int AS n FROM "${t}"`);
        out[t] = r.rows[0].n as number;
      } catch {
        out[t] = -1;
      }
    }
    return out;
  };
  const before = await snapshot();
  say(`SAFETY: row-count snapshot taken over ${snapshotTables.length} tables`);

  // --- POPULATION 1: all 14 /api/cron/* handlers, in-process ----------------
  const cronDirs = readdirSync(CRON_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  say(`ENUMERATION: ${cronDirs.length} directories under src/app/api/cron — equality assertion vs 14: ${cronDirs.length === 14 ? 'PASS' : 'FAIL'}`);
  if (cronDirs.length < 14) refuse(`only ${cronDirs.length} cron routes enumerated — a route escaped the sweep`);

  const { NextRequest } = await import('next/server');

  for (const dir of cronDirs) {
    const file = resolve(CRON_DIR, dir, 'route.ts');
    const name = `api/cron/${dir}/route.ts:GET`;
    const mechanism = existsSync(file) ? mechanismOf(file) : 'UNKNOWN';
    if (!existsSync(file)) {
      notInvoked.push({ name, population: 'cron', mechanism, verdict: 'NOT_INVOKED', reason: 'no route.ts in the directory' });
      continue;
    }
    const startCount = queryCount;
    const startRaises = tcRaises.length;
    try {
      const mod = await import(`../../src/app/api/cron/${dir}/route`);
      if (typeof mod.GET !== 'function') {
        notInvoked.push({ name, population: 'cron', mechanism, verdict: 'NOT_INVOKED', reason: 'module exports no GET' });
        continue;
      }
      const req = new NextRequest(`https://staging.invalid/api/cron/${dir}`, {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      });
      const res = await mod.GET(req);
      const status = typeof res?.status === 'number' ? res.status : -1;
      let body = '';
      try {
        body = (await res.text()).slice(0, 300);
      } catch {
        body = '(unreadable)';
      }
      if (status === 401) {
        refuse(`api/cron/${dir} returned 401 — that is a HARNESS FAILURE, not a result`);
      }
      const touched = queryCount - startCount;
      // A route that CATCHES its own TC001 and returns 500 must still be reported as
      // RAISED_TC001 — that is precisely the swallowed-failure population
      // `guc-binding.md` singled out, and a verdict built only from what the handler
      // rethrows under-reports the signal exactly there.
      const raised = tcRaises.slice(startRaises);
      rows.push({
        name,
        population: 'cron (in-process)',
        mechanism,
        verdict: raised.length ? 'RAISED_TC001' : 'COMPLETED',
        dbTouched: touched > 0,
        queries: touched,
        detail: `HTTP ${status} ${body.replace(/\s+/g, ' ')}${
          raised.length ? ' | TC001 SWALLOWED by the route (detectedVia: driver rejection)' : ''
        }`,
        ...(raised.length ? { tc001: raised[0] } : {}),
      });
      console.log(
        `  ${raised.length ? 'RAISED_TC001 ' : 'COMPLETED    '} ${name} (${mechanism}) queries=${touched} status=${status} raises=${raised.length}`,
      );
    } catch (e) {
      const cls = classifyError(e);
      const touched = queryCount - startCount;
      const observed = tcRaises.slice(startRaises);
      if (cls.isTc001 || observed.length) {
        rows.push({
          name,
          population: 'cron (in-process)',
          mechanism,
          verdict: 'RAISED_TC001',
          dbTouched: touched > 0,
          queries: touched,
          detail: `detectedVia: ${observed.length ? 'driver rejection' : cls.via}`,
          tc001: observed[0] ?? tc001Payload(e) ?? { message: (e as Error).message },
        });
        console.log(
          `  RAISED_TC001  ${name} (${mechanism}) queries=${touched} via=${observed.length ? 'driver' : cls.via}`,
        );
      } else {
        rows.push({
          name,
          population: 'cron (in-process)',
          mechanism,
          verdict: 'OTHER_FAILURE',
          dbTouched: touched > 0,
          queries: touched,
          error: { code: cls.sqlstate, message: (e as Error).message?.slice(0, 400) },
        });
        console.log(`  OTHER_FAILURE ${name} (${mechanism}) ${cls.sqlstate ?? ''} ${(e as Error).message?.slice(0, 120)}`);
      }
    }
  }

  // `after()`-deferred work is NOT measured. Named rather than omitted.
  notInvoked.push({
    name: 'api/cron/carrier-auto-dispatch/route.ts:GET — the after()-DEFERRED half',
    population: 'cron',
    mechanism: 'after()',
    verdict: 'NOT_INVOKED',
    reason:
      'called outside the Next request lifecycle, after() may throw or no-op; whatever it defers is not executed by an in-process call. The route row above covers its SYNCHRONOUS body only.',
  });

  // --- POPULATION 2: lib/ entry points, BOTH shapes -------------------------
  const fixtureTenant = await pg.query(`SELECT id FROM "Tenant" WHERE name LIKE 'RLS602%' ORDER BY name LIMIT 1`);
  const tenantId = fixtureTenant.rows[0]?.id as string | undefined;
  if (!tenantId) refuse('no RLS602 fixture tenant — run 602-tripwire-verify.ts --setup first');
  say(`FIXTURE: tenant ${tenantId}`);

  type Entry = { name: string; expect: 'must-not-raise' | 'expected-to-raise'; run: () => Promise<string> };
  const entries: Entry[] = [
    {
      name: 'lib/onboarding/onboarding-flags.ts:getOnboardingFlags(tenantId)',
      expect: 'must-not-raise',
      run: async () => {
        const m = await import('../../src/lib/onboarding/onboarding-flags');
        return JSON.stringify(await m.getOnboardingFlags(tenantId!)).slice(0, 200);
      },
    },
    {
      name: 'lib/onboarding/hydrate-tenant.ts:hydrateTenant(tenantId)',
      expect: 'must-not-raise',
      run: async () => {
        const m = await import('../../src/lib/onboarding/hydrate-tenant');
        await m.hydrateTenant(tenantId!);
        return 'ok';
      },
    },
    {
      name: 'lib/onboarding/confirm-tenant-email.ts:confirmTenantEmail(tenantId)',
      expect: 'must-not-raise',
      run: async () => {
        const m = await import('../../src/lib/onboarding/confirm-tenant-email');
        const r = await m.confirmTenantEmail(tenantId!);
        return `status=${r.status}`;
      },
    },
    {
      name: 'lib/context/tenant-context.ts:getTenantPrismaForOrg(tenantId) + a model read',
      expect: 'must-not-raise',
      run: async () => {
        const m = await import('../../src/lib/context/tenant-context');
        const db = await m.getTenantPrismaForOrg(tenantId!);
        const n = await db.tag.count();
        return `tag.count=${n}`;
      },
    },
    {
      name: 'lib/db/prisma.ts:prisma (bare client) — tag.count() with NO tenant context',
      expect: 'expected-to-raise',
      run: async () => {
        const n = await prisma.tag.count();
        return `tag.count=${n}`;
      },
    },
    {
      name: 'lib/db/prisma.ts:prisma (bare client) — appEvent.findMany() with NO tenant context',
      expect: 'expected-to-raise',
      run: async () => {
        const r = await prisma.appEvent.findMany({ take: 3 });
        return `rows=${r.length}`;
      },
    },
    {
      name: 'lib/auth/supabase.ts:getCurrentUser()',
      expect: 'expected-to-raise',
      run: async () => {
        const m = await import('../../src/lib/auth/supabase');
        const u = await m.getCurrentUser();
        return `user=${u ? 'present' : 'null'}`;
      },
    },
    {
      name: 'lib/notifications/dispatcher.ts:dispatchNotification(tenantId, …) — explicit tenantId, BARE client',
      expect: 'expected-to-raise',
      run: async () => {
        const m = await import('../../src/lib/notifications/dispatcher');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fn = (m as any).dispatchNotification;
        if (typeof fn !== 'function') throw new Error('NO_SUCH_EXPORT: dispatchNotification');
        const r = await fn({ tenantId, triggerKey: 'trip.assigned', variables: {} });
        return JSON.stringify(r).slice(0, 200);
      },
    },
    {
      name: 'lib/automations/evaluator.ts:runEvaluator()',
      expect: 'expected-to-raise',
      run: async () => {
        const m = await import('../../src/lib/automations/evaluator');
        const names = Object.keys(m);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fn = (m as any).runEvaluator ?? (m as any).evaluateAutomations ?? (m as any).runAutomations;
        if (typeof fn !== 'function') throw new Error(`NO_CALLABLE_ENTRY: exports = ${names.join(',')}`);
        const r = await fn();
        return JSON.stringify(r).slice(0, 200);
      },
    },
    {
      name: 'app/api/auth/login/route.ts:POST',
      expect: 'expected-to-raise',
      run: async () => {
        const m = await import('../../src/app/api/auth/login/route');
        const req = new Request('https://staging.invalid/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'rls602@example.test', password: 'not-a-real-password' }),
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await (m as any).POST(req as any);
        const body = (await res.text()).slice(0, 200);
        return `HTTP ${res.status} ${body.replace(/\s+/g, ' ')}`;
      },
    },
  ];

  // ORDER IS LOAD-BEARING. `getTenantPrismaForOrg` writes the GUC with
  // `set_config(..., false)` — SESSION scope, not transaction scope — and the pool
  // holds max: 1, so a later bare-client query INHERITS the tenant context of an
  // earlier scoped one and does not raise (measured on the first run of this sweep:
  // `prisma.tag.count()` returned 1 instead of raising). That is quick-413's pool
  // leak, and it is reported as a finding. Here it is also controlled for: every
  // `expected-to-raise` probe runs BEFORE any `must-not-raise` probe.
  entries.sort((a, b) => (a.expect === b.expect ? 0 : a.expect === 'expected-to-raise' ? -1 : 1));

  for (const e of entries) {
    const startCount = queryCount;
    const startRaises = tcRaises.length;
    try {
      const detail = await e.run();
      const touched = queryCount - startCount;
      const observed = tcRaises.slice(startRaises);
      if (observed.length) {
        rows.push({
          name: e.name,
          population: `lib/ (${e.expect})`,
          mechanism: e.expect === 'must-not-raise' ? 'acquires a tenant client' : 'bare client / no tenant context',
          verdict: 'RAISED_TC001',
          dbTouched: touched > 0,
          queries: touched,
          detail: `returned ${detail.slice(0, 80)} BUT a TC001 was raised and SWALLOWED (detectedVia: driver rejection)`,
          tc001: observed[0],
        });
        console.log(`  RAISED_TC001  ${e.name} queries=${touched} (swallowed)`);
        continue;
      }
      rows.push({
        name: e.name,
        population: `lib/ (${e.expect})`,
        mechanism: e.expect === 'must-not-raise' ? 'acquires a tenant client' : 'bare client / no tenant context',
        verdict: 'COMPLETED',
        dbTouched: touched > 0,
        queries: touched,
        detail,
      });
      console.log(`  COMPLETED     ${e.name} queries=${touched} -> ${detail.slice(0, 100)}`);
    } catch (err) {
      const cls = classifyError(err);
      const touched = queryCount - startCount;
      const observed = tcRaises.slice(startRaises);
      if (cls.isTc001 || observed.length) {
        rows.push({
          name: e.name,
          population: `lib/ (${e.expect})`,
          mechanism: e.expect === 'must-not-raise' ? 'acquires a tenant client' : 'bare client / no tenant context',
          verdict: 'RAISED_TC001',
          dbTouched: touched > 0,
          queries: touched,
          detail: `detectedVia: ${observed.length ? 'driver rejection' : cls.via}`,
          tc001: observed[0] ?? tc001Payload(err) ?? { message: (err as Error).message },
        });
        console.log(
          `  RAISED_TC001  ${e.name} queries=${touched} via=${observed.length ? 'driver' : cls.via}`,
        );
      } else {
        rows.push({
          name: e.name,
          population: `lib/ (${e.expect})`,
          mechanism: e.expect === 'must-not-raise' ? 'acquires a tenant client' : 'bare client / no tenant context',
          verdict: 'OTHER_FAILURE',
          dbTouched: touched > 0,
          queries: touched,
          error: { code: cls.sqlstate, message: (err as Error).message?.slice(0, 400) },
        });
        console.log(`  OTHER_FAILURE ${e.name} ${cls.sqlstate ?? ''} ${(err as Error).message?.slice(0, 120)}`);
      }
    }
  }

  // --- close out ------------------------------------------------------------
  const after = await snapshot();
  const changed = Object.keys(before).filter((t) => before[t] !== after[t]);
  say(
    `SAFETY: row-count changes across the sweep: ${
      changed.length === 0 ? 'NONE' : changed.map((t) => `${t} ${before[t]}->${after[t]}`).join(', ')
    }`,
  );

  // restore the pool
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).query = origQuery;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).connect = origConnect;
  await prisma.$disconnect().catch(() => {});

  // leave nothing armed
  const check = new Client({ connectionString: APP_USER_URL });
  await check.connect();
  const left = await check.query(`SELECT current_setting('app.tenant_context_tripwire', TRUE) AS f`);
  say(`SAFETY: after the sweep, a fresh app_user connection reads the tripwire flag as ${JSON.stringify(left.rows[0].f)}`);
  await check.end();
  await pg.end();

  const counts = {
    RAISED_TC001: rows.filter((r) => r.verdict === 'RAISED_TC001').length,
    COMPLETED: rows.filter((r) => r.verdict === 'COMPLETED').length,
    OTHER_FAILURE: rows.filter((r) => r.verdict === 'OTHER_FAILURE').length,
    invokedTotal: rows.length,
    NOT_INVOKED: notInvoked.length,
  };

  if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    resolve(EVIDENCE_DIR, '10-execution-sweep.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), projectRef: STAGING_REF, assertions, counts, rows, notInvoked, rowCounts: { before, after } }, null, 2) + '\n',
    'utf8',
  );

  const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const md = [
    '# quick-602 — step 4: EXECUTION sweep',
    '',
    `Generated ${new Date().toISOString()} against staging (\`${STAGING_REF}\`) as \`app_user\`, tripwire ON.`,
    '',
    '## 1. Safety-rail assertions',
    '',
    '```',
    ...assertions,
    '```',
    '',
    '## 2. Entry points INVOKED — by name',
    '',
    '| entry point | population | mechanism | verdict | dbTouched | queries | detail |',
    '|---|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| \`${esc(r.name)}\` | ${r.population} | ${esc(r.mechanism)} | **${r.verdict}** | ${
          r.dbTouched === undefined ? '—' : r.dbTouched
        } | ${r.queries ?? '—'} | ${esc(r.detail ?? (r.error ? `${r.error.code ?? ''} ${r.error.message}` : ''))} |`,
    ),
    '',
    '### TC001 payloads, quoted',
    '',
    ...rows
      .filter((r) => r.verdict === 'RAISED_TC001')
      .flatMap((r) => [
        `**${r.name}**`,
        '',
        '```json',
        JSON.stringify(r.tc001, null, 2),
        '```',
        '',
      ]),
    '## 3. Entry points NOT INVOKED — by name, with the reason',
    '',
    '| entry point | mechanism | reason |',
    '|---|---|---|',
    ...notInvoked.map((r) => `| \`${esc(r.name)}\` | ${esc(r.mechanism)} | ${esc(r.reason ?? '')} |`),
    '',
    '## 4. Counts',
    '',
    `Counts below are counts **of what was invoked** (${counts.invokedTotal}). The not-invoked total sits`,
    'beside them and is never summed into them.',
    '',
    '| verdict | count |',
    '|---|---|',
    `| RAISED_TC001 | ${counts.RAISED_TC001} |`,
    `| COMPLETED | ${counts.COMPLETED} |`,
    `| OTHER_FAILURE | ${counts.OTHER_FAILURE} |`,
    `| **invoked total** | **${counts.invokedTotal}** |`,
    `| NOT_INVOKED (separate) | ${counts.NOT_INVOKED} |`,
    '',
    '## 5. Row-count snapshot',
    '',
    '```json',
    JSON.stringify({ before, after, changed }, null, 2),
    '```',
    '',
  ].join('\n');
  writeFileSync(resolve(EVIDENCE_DIR, '10-execution-sweep.md'), md, 'utf8');
  console.log('\nWrote evidence/10-execution-sweep.md');
  console.log(JSON.stringify(counts));
  process.exit(0);
})().catch((e) => {
  console.error('602-execution-sweep: UNCAUGHT', e);
  process.exit(1);
});
