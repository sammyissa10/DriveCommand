/**
 * quick-624 — CAUSAL PROOF, independent of any staging drift: a failing statement on the app's pool evicts the
 * physical connection that holds the session-scoped tenant GUC, and the NEXT statement on the SAME, correctly
 * acquired tenant client runs on a fresh connection whose GUC the pool initialiser set to ''.
 *
 *   npx tsx scripts/audit/624-eviction-probe.ts --run            (spawns one COLD process per variant)
 *   npx tsx scripts/audit/624-eviction-probe.ts --cell <name>    (internal)
 *
 * Each cell imports the REAL `src/lib/db/prisma.ts` (max: 1 pool, `pool.on('connect')` initialiser, tripwire
 * arming) and the REAL `getTenantPrismaForOrg`, pointed at staging as app_user. Reads only: the failing
 * statement is `SELECT 1/0` (22012) or a SELECT of a column that does not exist (42703), so nothing is written.
 * The count target is "Truck", on which staging tenant A owns rows (a vacuous 0 would prove nothing).
 * A cold process per cell, because the GUC is session scope on a max:1 pool (quick-610).
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';
const TENANT_A = 'b5623cdd-dc19-4900-b75d-0ecfcaf191b8';
const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE = resolve(REPO_ROOT, '.planning/quick/624-explain-the-home-tc001-raise-on-a-scoped/evidence');

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });
const raw = process.env.STAGING_DATABASE_URL_APP_USER ?? '';
if (!raw.includes(STAGING_REF) || raw.includes(PRODUCTION_REF)) {
  console.error('624-eviction-probe: REFUSING — STAGING_DATABASE_URL_APP_USER does not name staging');
  process.exit(1);
}
const APP_USER_URL = raw.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');

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

// ── connection + raise observation inside the cell ──
const obs = { connects: 0, ends: 0, tc001: 0, gucSets: [] as string[] };
function installObservers() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pg = require('pg');
  const oc = pg.Client.prototype.connect;
  pg.Client.prototype.connect = function (...a: unknown[]) {
    obs.connects++;
    return oc.apply(this, a);
  };
  const oe = pg.Client.prototype.end;
  pg.Client.prototype.end = function (...a: unknown[]) {
    obs.ends++;
    return oe.apply(this, a);
  };
  const oq = pg.Client.prototype.query;
  pg.Client.prototype.query = function (...args: unknown[]) {
    const q = args[0];
    const text = typeof q === 'string' ? q : ((q as { text?: string })?.text ?? '');
    const m = /set_config\('app\.current_tenant_id',\s*('([^']*)'|\$1)/.exec(text);
    if (m) {
      const vals = (q as { values?: unknown[] })?.values ?? (Array.isArray(args[1]) ? args[1] : undefined);
      obs.gucSets.push(m[2] !== undefined ? `'${m[2]}'` : JSON.stringify(vals?.[0]));
    }
    const note = (e: unknown) => {
      if (sqlstateOf(e) === 'TC001') obs.tc001++;
    };
    const last = args[args.length - 1];
    if (typeof last === 'function') {
      args[args.length - 1] = function (this: unknown, err: unknown, ...rest: unknown[]) {
        if (err) note(err);
        return (last as (...x: unknown[]) => unknown).call(this, err, ...rest);
      };
    }
    const r = oq.apply(this, args);
    if (r && typeof (r as Promise<unknown>).then === 'function') (r as Promise<unknown>).then(undefined, note);
    return r;
  };
}

type Step = { step: string; ok: boolean; value?: unknown; sqlstate?: string };
async function attempt(step: string, fn: () => Promise<unknown>): Promise<Step> {
  try {
    return { step, ok: true, value: await fn() };
  } catch (e) {
    return { step, ok: false, sqlstate: sqlstateOf(e) };
  }
}
const settle = () => new Promise((r) => setTimeout(r, 300));

const CELLS: Record<string, () => Promise<Step[]>> = {
  /** No failing statement between the two counts: both must see tenant A's rows on ONE connection. */
  'control:no-error': async () => {
    const { getTenantPrismaForOrg } = await import('../../src/lib/context/tenant-context');
    const db = await getTenantPrismaForOrg(TENANT_A);
    return [await attempt('count#1', () => db.truck.count()), await attempt('count#2', () => db.truck.count())];
  },
  /** 22012 between the counts. Nothing about RLS, drift or tenants — just an error. */
  'evict:division-by-zero': async () => {
    const { getTenantPrismaForOrg } = await import('../../src/lib/context/tenant-context');
    const db = await getTenantPrismaForOrg(TENANT_A);
    return [
      await attempt('count#1', () => db.truck.count()),
      await attempt('SELECT 1/0 (caught)', () => db.$queryRawUnsafe('SELECT 1/0')),
      await attempt('count#2 on the SAME tenant client', () => db.truck.count()),
    ];
  },
  /** 42703 between the counts — the /home shape (staging's FleetMessage lacks isBroadcast). */
  'evict:undefined-column': async () => {
    const { getTenantPrismaForOrg } = await import('../../src/lib/context/tenant-context');
    const db = await getTenantPrismaForOrg(TENANT_A);
    return [
      await attempt('count#1', () => db.truck.count()),
      await attempt('SELECT a missing column (caught)', () => db.$queryRawUnsafe('SELECT "noSuchColumn624" FROM "Truck" LIMIT 1')),
      await attempt('count#2 on the SAME tenant client', () => db.truck.count()),
    ];
  },
  /** The error inside an interactive transaction, rolled back and caught, then an autocommit count. */
  'evict:error-inside-transaction': async () => {
    const { getTenantPrismaForOrg } = await import('../../src/lib/context/tenant-context');
    const db = await getTenantPrismaForOrg(TENANT_A);
    return [
      await attempt('count#1', () => db.truck.count()),
      await attempt('$transaction(SELECT 1/0) (caught)', () => db.$transaction(async (tx) => tx.$queryRawUnsafe('SELECT 1/0'))),
      await attempt('count#2 on the SAME tenant client', () => db.truck.count()),
    ];
  },
  /** An autocommit error, then a TRANSACTION on the same tenant client that does not set the GUC itself. */
  'evict:then-transaction': async () => {
    const { getTenantPrismaForOrg } = await import('../../src/lib/context/tenant-context');
    const db = await getTenantPrismaForOrg(TENANT_A);
    return [
      await attempt('count#1', () => db.truck.count()),
      await attempt('SELECT 1/0 (caught)', () => db.$queryRawUnsafe('SELECT 1/0')),
      await attempt('$transaction(count) on the SAME tenant client', () => db.$transaction(async (tx) => tx.truck.count())),
    ];
  },
  /** Re-acquiring after the error re-issues set_config on the new connection: the count recovers. */
  'recover:reacquire-after-error': async () => {
    const { getTenantPrismaForOrg } = await import('../../src/lib/context/tenant-context');
    const db = await getTenantPrismaForOrg(TENANT_A);
    const steps = [
      await attempt('count#1', () => db.truck.count()),
      await attempt('SELECT 1/0 (caught)', () => db.$queryRawUnsafe('SELECT 1/0')),
    ];
    const db2 = await getTenantPrismaForOrg(TENANT_A);
    steps.push(await attempt('count#2 on a RE-ACQUIRED tenant client', () => db2.truck.count()));
    return steps;
  },
};

async function runCell(name: string, tripwire: string) {
  process.env.DATABASE_URL = APP_USER_URL;
  process.env.TENANT_CONTEXT_TRIPWIRE = tripwire;
  installObservers();
  let steps: Step[];
  try {
    steps = await CELLS[name]();
  } catch (e) {
    steps = [{ step: 'cell threw', ok: false, sqlstate: sqlstateOf(e) }];
  }
  await settle();
  process.stdout.write('\n__CELL__' + JSON.stringify({ cell: name, tripwire, steps, obs }) + '\n');
  process.exit(0);
}

function spawnCell(name: string, tripwire: 'on' | 'off') {
  const env = { ...process.env } as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries(env)) if (typeof v === 'string' && v.includes(PRODUCTION_REF)) delete env[k];
  const out = execFileSync(
    process.execPath,
    [resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs'), __filename, '--cell', name, '--tripwire', tripwire],
    { cwd: APP_ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 120_000 },
  );
  const m = /__CELL__(.*)/.exec(out);
  return m ? JSON.parse(m[1]) : { cell: name, tripwire, error: 'no payload', raw: out.slice(-300) };
}

async function run() {
  const u = new URL(APP_USER_URL);
  console.error(`[db-target] project : ${STAGING_REF} (staging)  host : ${u.host}  role : ${u.username}  (credential MASKED)`);
  const plan: [string, 'on' | 'off'][] = [
    ['control:no-error', 'on'],
    ['evict:division-by-zero', 'on'],
    ['evict:undefined-column', 'on'],
    ['evict:error-inside-transaction', 'on'],
    ['evict:then-transaction', 'on'],
    ['recover:reacquire-after-error', 'on'],
    ['control:no-error', 'off'],
    ['evict:division-by-zero', 'off'],
  ];
  const results = [];
  for (const [name, tw] of plan) {
    const r = spawnCell(name, tw);
    results.push(r);
    console.log(`${name} [tripwire ${tw}]  connects=${r.obs?.connects} ends=${r.obs?.ends} tc001=${r.obs?.tc001} gucSets=${JSON.stringify(r.obs?.gucSets)}`);
    for (const s of r.steps ?? []) console.log(`    ${s.step}: ${s.ok ? 'ok ' + JSON.stringify(s.value) : 'ERROR ' + s.sqlstate}`);
  }
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(resolve(EVIDENCE, '03-eviction-probe.json'), JSON.stringify({ generated: new Date().toISOString(), results }, null, 2) + '\n');
}

const a = process.argv.slice(2);
if (a.includes('--cell')) runCell(a[a.indexOf('--cell') + 1], a[a.indexOf('--tripwire') + 1] ?? 'on');
else if (a.includes('--run')) run();
else {
  console.error('usage: 624-eviction-probe.ts --run');
  process.exit(1);
}
