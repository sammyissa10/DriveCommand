/**
 * quick-625 — step 4. quick-607's concurrency case against the checkout re-assertion prototype: 8-way concurrent
 * waves, two tenants alternating, 64 iterations per configuration, app_user, max:1 and max:5.
 *
 *   npx tsx scripts/audit/625-checkout-concurrency.ts --run      (one COLD process per configuration)
 *   npx tsx scripts/audit/625-checkout-concurrency.ts --bench    (per-checkout cost, one process per stack)
 *
 * Every iteration is one "request": obtain the tenant client, then three reads in sequence —
 *   R1  carrierDriver.count()                                  RLS-only model (A=3, B=2): wrong tenant is a wrong NUMBER
 *   R2  SELECT current_setting('app.current_tenant_id')        no RLS table, so an empty GUC READS as '' instead of raising
 *   R3  $transaction(async tx => [GUC read, carrierDriver.count]) the interactive-transaction shape, for P2028
 * `--errors` adds a caught `SELECT 1/0` (connection eviction, quick-624) at the start of every 4th iteration.
 *
 * Stacks: `proto` (connect-call re-assertion), `acquire` (the 'acquire' EVENT — the negative control),
 * `protoCache` (connect-call + the per-connection KNOWN-value cache),
 * `shipped` (the real prisma.ts + getTenantPrismaForOrg). Transactions use the shipped TX_OPTIONS for all three, so a
 * P2028 difference is attributable to the stack and not to this laptop's round trip to us-west-1.
 * Staging only; reads only.
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';
const TENANT_A = 'b5623cdd-dc19-4900-b75d-0ecfcaf191b8';
const TENANT_B = '8c6136c4-eb7b-4a89-a524-d1d0e2c8d045';
const EXPECTED_DRIVERS: Record<string, number> = { [TENANT_A]: 3, [TENANT_B]: 2 };
const TX = { maxWait: 15000, timeout: 30000 }; // = prisma.ts TX_OPTIONS
const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE = resolve(REPO_ROOT, '.planning/quick/625-checkout-guc-reassertion-vs-per-unit-bin/evidence');

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });
const raw = process.env.STAGING_DATABASE_URL_APP_USER ?? '';
if (!raw.includes(STAGING_REF) || raw.includes(PRODUCTION_REF)) {
  console.error('625-checkout-concurrency: REFUSING — STAGING_DATABASE_URL_APP_USER does not name staging');
  process.exit(1);
}
const APP_USER_URL = raw.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');

const unknownMessages: string[] = [];
function codeOf(e: unknown): string {
  const seen = new Set<unknown>();
  let cur: unknown = e;
  let prismaCode: string | null = null;
  while (cur && typeof cur === 'object' && !seen.has(cur)) {
    seen.add(cur);
    const code = (cur as { code?: unknown }).code;
    if (typeof code === 'string') {
      if (code === 'TC001') return 'TC001';
      if (/^P\d{4}$/.test(code)) prismaCode ??= code;
      else if (/^[0-9A-Z]{5}$/.test(code)) return prismaCode === 'P2028' ? 'P2028' : code;
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  const msg = String((e as Error)?.message ?? '');
  unknownMessages.push(msg.replace(/\s+/g, ' ').slice(0, 240));
  if (/TC001|tenant context is required/.test(msg)) return 'TC001';
  return prismaCode ?? 'UNKNOWN';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type Stack = 'proto' | 'protoCache' | 'acquire' | 'shipped';

async function buildStack(kind: Stack, max: number) {
  process.env.DATABASE_URL = APP_USER_URL;
  process.env.TENANT_CONTEXT_TRIPWIRE = 'on';
  process.env.PG_CONNECT_TIMEOUT_MS = '20000';
  if (kind === 'shipped') {
    // prisma.ts hardcodes max: 1. For max:5 the SAME module is used with the pool's option raised before first use,
    // which is exactly the quick-607 control (only `max` differs).
    const { prisma } = await import('../../src/lib/db/prisma');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = (globalThis as any).pool;
    pool.options.max = max;
    const { getTenantPrismaForOrg } = await import('../../src/lib/context/tenant-context');
    return { tenant: (t: string) => getTenantPrismaForOrg(t) as Promise<Db>, bare: prisma as Db, pool };
  }
  const p = await import('./625-tenant-checkout.prototype');
  const pool = p.createCheckoutPool(
    { connectionString: APP_USER_URL, max, idleTimeoutMillis: 10000, connectionTimeoutMillis: 20000 },
    { mode: kind === 'acquire' ? 'acquire-event' : 'connect-call', cacheAssertion: kind === 'protoCache', armTripwire: true },
  );
  const base = p.createCheckoutBaseClient(pool);
  return { tenant: async (t: string) => p.createCheckoutTenantClient(base, t) as Db, bare: base as Db, pool };
}

type Outcome = 'correct' | 'empty' | 'wrong-tenant' | string; // string = error code
const GUC = `SELECT current_setting('app.current_tenant_id', true) AS g`;

async function iteration(s: Awaited<ReturnType<typeof buildStack>>, t: string, inject: boolean) {
  const other = t === TENANT_A ? TENANT_B : TENANT_A;
  const out: Record<'R1' | 'R2' | 'R3guc' | 'R3count', Outcome> & { injected: boolean } = {
    R1: 'n/a', R2: 'n/a', R3guc: 'n/a', R3count: 'n/a', injected: inject,
  };
  const db = await s.tenant(t);
  if (inject) await db.$queryRawUnsafe('SELECT 1/0').catch(() => {});
  const judgeCount = (n: number) => (n === EXPECTED_DRIVERS[t] ? 'correct' : n === 0 ? 'empty' : n === EXPECTED_DRIVERS[other] ? 'wrong-tenant' : `count=${n}`);
  const judgeGuc = (g: string | null) => (g === t ? 'correct' : g === other ? 'wrong-tenant' : g === '' || g === null ? 'empty' : `guc=${g}`);
  try {
    out.R1 = judgeCount(await db.carrierDriver.count());
  } catch (e) {
    out.R1 = codeOf(e);
  }
  try {
    out.R2 = judgeGuc((await db.$queryRawUnsafe(GUC))[0].g);
  } catch (e) {
    out.R2 = codeOf(e);
  }
  try {
    const [g, n] = await db.$transaction(async (tx: Db) => [(await tx.$queryRawUnsafe(GUC))[0].g, await tx.carrierDriver.count()], TX);
    out.R3guc = judgeGuc(g);
    out.R3count = judgeCount(n);
  } catch (e) {
    out.R3guc = out.R3count = codeOf(e);
  }
  return out;
}

async function runConfig(kind: Stack, max: number, errors: boolean) {
  process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', (e as Error)?.stack ?? e));
  process.on('uncaughtException', (e) => { console.error('[uncaughtException]', e?.stack ?? e); process.exit(3); });
  let connects = 0;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pg = require('pg');
  const oc = pg.Client.prototype.connect;
  pg.Client.prototype.connect = function (...a: unknown[]) {
    connects++;
    return oc.apply(this, a);
  };
  const s = await buildStack(kind, max);
  const rows: Awaited<ReturnType<typeof iteration>>[] = [];
  const t0 = Date.now();
  for (let w = 0; w < 8; w++) {
    const wave = await Promise.all(
      Array.from({ length: 8 }, (_, k) => {
        const i = w * 8 + k;
        return iteration(s, i % 2 === 0 ? TENANT_A : TENANT_B, errors && i % 4 === 0).catch((e) => ({
          R1: codeOf(e), R2: codeOf(e), R3guc: codeOf(e), R3count: codeOf(e), injected: errors && i % 4 === 0,
        }));
      }),
    );
    rows.push(...wave);
  }
  const tally = (key: 'R1' | 'R2' | 'R3guc' | 'R3count') => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r[key]] = (c[r[key]] ?? 0) + 1;
    return c;
  };
  const result = {
    stack: kind, max, errors, iterations: rows.length, ms: Date.now() - t0, physicalConnects: connects,
    R1_carrierDriver_count: tally('R1'), R2_guc_read: tally('R2'), R3_tx_guc_read: tally('R3guc'), R3_tx_count: tally('R3count'),
    unknownMessages: [...new Set(unknownMessages)],
  };
  process.stdout.write('\n__CONFIG__' + JSON.stringify(result) + '\n');
  process.exit(0);
}

async function bench(kind: Stack) {
  const s = await buildStack(kind, 1);
  const N = 60;
  const db = await s.tenant(TENANT_A);
  await db.carrierDriver.count(); // warm the connection
  let statements = 0;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pg = require('pg');
  const oq = pg.Client.prototype.query;
  pg.Client.prototype.query = function (...a: unknown[]) {
    statements++;
    return oq.apply(this, a);
  };
  const lat: number[] = [];
  for (let i = 0; i < N; i++) {
    const t = performance.now();
    await db.carrierDriver.count();
    lat.push(performance.now() - t);
  }
  pg.Client.prototype.query = oq;
  const rt: number[] = [];
  for (let i = 0; i < N; i++) {
    const t = performance.now();
    await s.bare.$queryRawUnsafe('SELECT 1');
    rt.push(performance.now() - t);
  }
  const med = (x: number[]) => [...x].sort((p, q) => p - q)[Math.floor(x.length / 2)];
  process.stdout.write(
    '\n__BENCH__' +
      JSON.stringify({ stack: kind, n: N, wireStatementsPerModelOp: statements / N, medianModelOpMs: +med(lat).toFixed(1), medianBareSelect1Ms: +med(rt).toFixed(1) }) +
      '\n',
  );
  process.exit(0);
}

function spawn(args: string[], marker: string) {
  const env = { ...process.env } as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries(env)) if (typeof v === 'string' && v.includes(PRODUCTION_REF)) delete env[k];
  const out = execFileSync(process.execPath, [resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs'), __filename, ...args], {
    cwd: APP_ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 540_000,
  });
  const m = new RegExp(marker + '(.*)').exec(out);
  return m ? JSON.parse(m[1]) : { args, error: 'no payload', raw: out.slice(-400) };
}

async function main() {
  const a = process.argv.slice(2);
  if (a.includes('--config')) {
    return runConfig(a[a.indexOf('--config') + 1] as Stack, Number(a[a.indexOf('--max') + 1]), a.includes('--errors'));
  }
  if (a.includes('--bench-one')) return bench(a[a.indexOf('--bench-one') + 1] as Stack);

  const u = new URL(APP_USER_URL);
  console.error(`[db-target] project : ${STAGING_REF} (staging)  host : ${u.host}  role : ${u.username}  (credential MASKED)`);
  mkdirSync(EVIDENCE, { recursive: true });

  if (a.includes('--bench')) {
    const results = (['shipped', 'proto', 'protoCache'] as Stack[]).map((k) => spawn(['--bench-one', k], '__BENCH__'));
    for (const r of results) console.log(JSON.stringify(r));
    writeFileSync(resolve(EVIDENCE, '05-checkout-cost.json'), JSON.stringify({ generated: new Date().toISOString(), results }, null, 2) + '\n');
    return;
  }

  const only = a.includes('--only') ? a[a.indexOf('--only') + 1] : null;
  const plan: [Stack, number, boolean][] = [];
  for (const errors of [false, true]) for (const kind of ['proto', 'protoCache', 'acquire', 'shipped'] as Stack[]) for (const max of [1, 5]) plan.push([kind, max, errors]);
  const results = [];
  for (const [kind, max, errors] of plan) {
    if (only && kind !== only) continue;
    const r = spawn(['--config', kind, '--max', String(max), ...(errors ? ['--errors'] : [])], '__CONFIG__');
    results.push(r);
    console.log(JSON.stringify(r));
  }
  if (!only) writeFileSync(resolve(EVIDENCE, '04-checkout-concurrency.json'), JSON.stringify({ generated: new Date().toISOString(), results }, null, 2) + '\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
