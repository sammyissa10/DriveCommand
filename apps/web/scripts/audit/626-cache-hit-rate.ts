/**
 * quick-626 — step 1. The LATENCY RISK of checkout re-assertion, measured BEFORE adoption.
 *
 *   npx tsx scripts/audit/626-cache-hit-rate.ts --run          (one COLD process per configuration)
 *   npx tsx scripts/audit/626-cache-hit-rate.ts --stack <s> --concurrency <c>   (internal)
 *
 * quick-625 §4.2 measured per-checkout cost in ONE LONG LOOP on one warm connection holding one tenant — the cache's
 * best case by construction. This measures the cache under REQUEST-SHAPED traffic instead: many short requests, five
 * tenants, and the bare statements a real request issues between its tenant statements.
 *
 * ─── THE REQUEST SHAPES (read off the code, not invented) ─────────────────────
 * Every request starts with the AUTH BOOTSTRAP, `lib/auth/supabase.ts:163`: a BARE batch `$transaction([set bypass
 * TRUE, user.findUnique])`. That is a checkout with NO tenant in context, so re-assertion asserts '' — and the tenant
 * statements that follow must assert the tenant again. So every request costs AT LEAST two cache misses on a
 * connection whose previous request left a tenant behind: T→'' at the bootstrap, ''→T at the first tenant statement.
 *   page   (50%)  AUTH · Promise.all[4 tenant reads] · 1 tenant read
 *   api    (30%)  AUTH · 1 tenant read · tenant interactive $transaction
 *   action (20%)  AUTH · 1 tenant read · BARE bypass $transaction (the ~211 bypass-flagged sites) · 1 tenant read
 * Mix is deterministic (request i → shape by i % 10), tenants round-robin over five: A (3 drivers), B (2), and three
 * uuids owning no rows (0) — so a wrong-tenant GUC is visible as a wrong driver count on every request.
 *
 * ─── CONCURRENCY ─────────────────────────────────────────────────────────────
 * c=1: one request at a time per process (classic lambda). c=4: four in flight on the max:1 pool (Fluid compute's
 * in-instance concurrency), so tenants and bare/tenant INTERLEAVE on the one connection — the cache's worst case.
 *
 * ─── STACKS ──────────────────────────────────────────────────────────────────
 * shipped     real prisma.ts + getTenantPrismaForOrg (one session set_config per acquisition — shipped already pays
 *             one GUC round trip per request, which is the fair baseline)
 * proto       quick-625 prototype, connect-call, no cache (one set_config per CHECKOUT)
 * protoCache  quick-625 prototype, connect-call, per-connection cache
 * protoCacheLeave  as protoCache, but a no-context (bare) checkout asserts NOTHING and inherits — the alternative
 *
 * Instrument: pg's Pool.prototype.connect (checkouts) and Client.prototype.query (tenant set_config statements) are
 * patched BEFORE any pool exists, so the prototype's bound raw query is counted too (quick-625's bench read 0 here
 * because its patch landed after the tracker bound `query`).
 * Staging only, app_user, tripwire armed, reads only.
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';
const TENANT_A = 'b5623cdd-dc19-4900-b75d-0ecfcaf191b8';
const TENANT_B = '8c6136c4-eb7b-4a89-a524-d1d0e2c8d045';
const EMPTY_TENANTS = ['00000000-0626-4000-8000-000000000001', '00000000-0626-4000-8000-000000000002', '00000000-0626-4000-8000-000000000003'];
const TENANTS = [TENANT_A, TENANT_B, ...EMPTY_TENANTS];
const EXPECTED: Record<string, number> = { [TENANT_A]: 3, [TENANT_B]: 2, ...Object.fromEntries(EMPTY_TENANTS.map((t) => [t, 0])) };
const TX = { maxWait: 15000, timeout: 30000 };
const REQUESTS = 120;
const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE = resolve(REPO_ROOT, '.planning/quick/626-adopt-checkout-time-guc-re-assertion/evidence');

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });
const raw = process.env.STAGING_DATABASE_URL_APP_USER ?? '';
if (!raw.includes(STAGING_REF) || raw.includes(PRODUCTION_REF)) {
  console.error('626-cache-hit-rate: REFUSING — STAGING_DATABASE_URL_APP_USER does not name staging');
  process.exit(1);
}
const APP_USER_URL = raw.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type StackKind = 'shipped' | 'proto' | 'protoCache' | 'protoCacheLeave' | 'adopted';

const counters = { checkouts: 0, tenantGucStatements: 0 };
function instrument() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pg = require('pg');
  const oc = pg.Pool.prototype.connect;
  pg.Pool.prototype.connect = function (...a: unknown[]) {
    counters.checkouts++;
    return oc.apply(this, a);
  };
  const oq = pg.Client.prototype.query;
  pg.Client.prototype.query = function (...a: unknown[]) {
    const q = a[0];
    const text = typeof q === 'string' ? q : ((q as { text?: string })?.text ?? '');
    // the parameterised write only: the pool initialiser's literal '' is not a per-checkout cost
    if (/set_config\('app\.current_tenant_id',\s*\$1,\s*false\)/.test(text)) counters.tenantGucStatements++;
    return oq.apply(this, a);
  };
}

async function buildStack(kind: StackKind) {
  process.env.DATABASE_URL = APP_USER_URL;
  process.env.TENANT_CONTEXT_TRIPWIRE = 'on';
  process.env.PG_CONNECT_TIMEOUT_MS = '20000';
  if (kind === 'shipped' || kind === 'adopted') {
    const { prisma } = await import('../../src/lib/db/prisma');
    const { getTenantPrismaForOrg } = await import('../../src/lib/context/tenant-context');
    return { bare: prisma as Db, tenant: (t: string) => getTenantPrismaForOrg(t) as Promise<Db> };
  }
  const p = await import('./625-tenant-checkout.prototype');
  const pool = p.createCheckoutPool(
    { connectionString: APP_USER_URL, max: 1, idleTimeoutMillis: 10000, connectionTimeoutMillis: 20000 },
    // protoCacheLeave: the ALTERNATIVE measured after the gate failed — a checkout with NO tenant in context asserts
    // nothing (onNoContext 'leave'), so a bare statement inherits whatever the connection holds, exactly as shipped does.
    { mode: 'connect-call', cacheAssertion: kind === 'protoCache' || kind === 'protoCacheLeave', onNoContext: kind === 'protoCacheLeave' ? 'leave' : 'clear', armTripwire: true },
  );
  const base = p.createCheckoutBaseClient(pool);
  return { bare: base as Db, tenant: async (t: string) => p.createCheckoutTenantClient(base, t) as Db };
}

type Stack = Awaited<ReturnType<typeof buildStack>>;
/**
 * The correctness read. `--blind-read` passes the GUC NAME as a bind value, so the statement TEXT never names it:
 * the quick-625 cache forgets on ANY statement text naming the GUC — reads included — so the literal form forces a
 * miss on the next checkout and inflates the miss rate with an artefact of this harness, not of the request shape.
 */
const BLIND_READ = process.argv.includes('--blind-read') || process.env.Q626_BLIND_READ === 'on';
const readGuc = (db: Db) =>
  BLIND_READ
    ? db.$queryRawUnsafe(`SELECT current_setting($1, true) AS g`, 'app.current' + '_tenant_id')
    : db.$queryRawUnsafe(`SELECT current_setting('app.current_tenant_id', true) AS g`);

async function authBootstrap(s: Stack) {
  // lib/auth/supabase.ts:163, verbatim shape
  await s.bare.$transaction([
    s.bare.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`,
    s.bare.user.findFirst({ select: { id: true } }),
  ]);
}

type ReqResult = { ms: number; shape: string; wrong: number; errors: string[] };

async function request(s: Stack, i: number): Promise<ReqResult> {
  const t = TENANTS[i % TENANTS.length];
  const shape = i % 10 < 5 ? 'page' : i % 10 < 8 ? 'api' : 'action';
  const errors: string[] = [];
  let wrong = 0;
  const judge = (n: number) => { if (n !== EXPECTED[t]) wrong++; };
  const judgeGuc = (g: string) => { if (g !== t) wrong++; };
  const t0 = performance.now();
  try {
    await authBootstrap(s);
    const db = await s.tenant(t);
    if (shape === 'page') {
      const [n, , g] = await Promise.all([
        db.carrierDriver.count(),
        db.truck.count(),
        readGuc(db),
        db.carrierDriver.findFirst({ select: { id: true } }),
      ]);
      judge(n);
      judgeGuc(g[0].g);
      judge(await db.carrierDriver.count());
    } else if (shape === 'api') {
      judge(await db.carrierDriver.count());
      const [g, n] = await db.$transaction(async (tx: Db) => [(await readGuc(tx))[0].g, await tx.carrierDriver.count()], TX);
      judgeGuc(g);
      judge(n);
    } else {
      judge(await db.carrierDriver.count());
      await s.bare.$transaction([
        s.bare.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`,
        s.bare.carrierDriver.count(),
      ]);
      judge(await db.carrierDriver.count());
    }
  } catch (e) {
    let cur: unknown = e;
    let code = 'UNKNOWN';
    for (let k = 0; k < 6 && cur; k++) {
      const c = (cur as { code?: unknown }).code;
      if (typeof c === 'string' && /^[0-9A-Z]{5}$/.test(c)) { code = c; break; }
      cur = (cur as { cause?: unknown }).cause;
    }
    errors.push(code);
  }
  return { ms: performance.now() - t0, shape, wrong, errors };
}

const pct = (x: number[], p: number) => {
  const s = [...x].sort((a, b) => a - b);
  return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(1);
};

async function runConfig(kind: StackKind, concurrency: number) {
  instrument();
  const s = await buildStack(kind);
  // warm: one connection, one of each shape, not counted
  for (let i = 0; i < 10; i++) await request(s, i);
  // RTT on the warm connection: bare SELECT 1 median (for the cross-region arithmetic)
  const rtt: number[] = [];
  for (let i = 0; i < 20; i++) { const t = performance.now(); await s.bare.$queryRawUnsafe('SELECT 1'); rtt.push(performance.now() - t); }
  counters.checkouts = 0;
  counters.tenantGucStatements = 0;

  const results: ReqResult[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < REQUESTS) {
        const i = next++;
        results.push(await request(s, i));
      }
    }),
  );
  const ms = results.map((r) => r.ms);
  const errorTally: Record<string, number> = {};
  for (const r of results) for (const e of r.errors) errorTally[e] = (errorTally[e] ?? 0) + 1;
  const out = {
    stack: kind,
    blindRead: BLIND_READ,
    concurrency,
    requests: results.length,
    checkouts: counters.checkouts,
    tenantGucStatements: counters.tenantGucStatements,
    checkoutsPerRequest: +(counters.checkouts / results.length).toFixed(2),
    gucStatementsPerRequest: +(counters.tenantGucStatements / results.length).toFixed(2),
    // meaningful for the re-assertion stacks only: every checkout that did NOT issue set_config was a cache hit
    cacheHitRate: kind === 'protoCache' || kind === 'protoCacheLeave' || kind === 'adopted' ? +(1 - counters.tenantGucStatements / counters.checkouts).toFixed(3) : null,
    medianMs: pct(ms, 50),
    p95Ms: pct(ms, 95),
    medianRttMs: pct(rtt, 50),
    wrongTenantReads: results.reduce((a, r) => a + r.wrong, 0),
    errors: errorTally,
  };
  process.stdout.write('\n__CONFIG__' + JSON.stringify(out) + '\n');
  process.exit(0);
}

function spawn(args: string[]) {
  const env = { ...process.env, Q626_BLIND_READ: BLIND_READ ? 'on' : 'off' } as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries(env)) if (typeof v === 'string' && v.includes(PRODUCTION_REF)) delete env[k];
  const out = execFileSync(process.execPath, [resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs'), __filename, ...args], {
    cwd: APP_ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 540_000,
  });
  const m = /__CONFIG__(.*)/.exec(out);
  return m ? JSON.parse(m[1]) : { args, error: 'no payload', raw: out.slice(-400) };
}

async function main() {
  const a = process.argv.slice(2);
  if (a.includes('--stack')) return runConfig(a[a.indexOf('--stack') + 1] as StackKind, Number(a[a.indexOf('--concurrency') + 1] ?? 1));
  const u = new URL(APP_USER_URL);
  console.error(`[db-target] project : ${STAGING_REF} (staging)  host : ${u.host}  role : ${u.username}  (credential MASKED)`);
  const stacks = (a.includes('--stacks') ? a[a.indexOf('--stacks') + 1].split(',') : ['shipped', 'proto', 'protoCache']) as StackKind[];
  const outName = a.includes('--out') ? a[a.indexOf('--out') + 1] : '01-cache-hit-rate.json';
  const results = [];
  for (const c of [1, 4]) for (const k of stacks) {
    const r = spawn(['--stack', k, '--concurrency', String(c)]);
    results.push(r);
    console.log(JSON.stringify(r));
  }
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(resolve(EVIDENCE, outName), JSON.stringify({ generated: new Date().toISOString(), requestsPerConfig: REQUESTS, results }, null, 2) + '\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
