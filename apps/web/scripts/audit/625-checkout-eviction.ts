/**
 * quick-625 — step 3. The quick-624 eviction reproduction, run against the CHECKOUT RE-ASSERTION prototype
 * (`scripts/audit/625-tenant-checkout.prototype.ts`) and, for side-by-side, against the SHIPPED stack.
 *
 *   npx tsx scripts/audit/625-checkout-eviction.ts --run            (one COLD process per cell)
 *   npx tsx scripts/audit/625-checkout-eviction.ts --cell <name> --tripwire on|off   (internal)
 *
 * Staging only, app_user, reads only. The failing statements are `SELECT 1/0` (22012) and a missing column (42703).
 * Two tenants with DIFFERENT carrier_drivers counts (A=3, B=2), so a wrong-tenant GUC is visible as a wrong number
 * on an RLS-only model (CarrierDriver is exempt from injection), not merely as an empty result.
 * A cold process per cell, because the GUC is session scope on a max:1 pool (quick-610).
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';

const CACHE = process.argv.includes('--cache') ? 'on' : 'off';
const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';
const TENANT_A = 'b5623cdd-dc19-4900-b75d-0ecfcaf191b8';
const TENANT_B = '8c6136c4-eb7b-4a89-a524-d1d0e2c8d045';
const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE = resolve(REPO_ROOT, '.planning/quick/625-checkout-guc-reassertion-vs-per-unit-bin/evidence');

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });
const raw = process.env.STAGING_DATABASE_URL_APP_USER ?? '';
if (!raw.includes(STAGING_REF) || raw.includes(PRODUCTION_REF)) {
  console.error('625-checkout-eviction: REFUSING — STAGING_DATABASE_URL_APP_USER does not name staging');
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
      const v = m[2] !== undefined ? m[2] : String(vals?.[0] ?? '');
      obs.gucSets.push(v === TENANT_A ? 'A' : v === TENANT_B ? 'B' : v === '' ? "''" : v);
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
const tag = (g: unknown) => (g === TENANT_A ? 'A' : g === TENANT_B ? 'B' : g === '' ? "''" : g === null ? 'null' : String(g));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
/** A tenant-scoped read that reports the GUC it ran under AND an RLS-only count (A=3, B=2). */
const probe = async (db: Db) => {
  const r = await db.$queryRawUnsafe(
    `SELECT current_setting('app.current_tenant_id', true) AS g, (SELECT count(*)::int FROM carrier_drivers) AS drivers`,
  );
  return { guc: tag(r[0].g), drivers: r[0].drivers };
};

/** The two stacks, built the same way so the checkout re-assertion is the only variable. */
async function stack(kind: 'proto' | 'shipped') {
  if (kind === 'proto') {
    const p = await import('./625-tenant-checkout.prototype');
    const { shouldArmTripwire } = await import('../../src/lib/db/tripwire-arm');
    const pool = p.createCheckoutPool(
      { connectionString: APP_USER_URL, max: 1, idleTimeoutMillis: 10000, connectionTimeoutMillis: 20000 },
      { mode: 'connect-call', cacheAssertion: process.env.Q625_CACHE === 'on', armTripwire: shouldArmTripwire(process.env.DATABASE_URL, process.env.TENANT_CONTEXT_TRIPWIRE) },
    );
    const base = p.createCheckoutBaseClient(pool);
    const unbatchFindUnique = process.env.Q625_UNBATCH !== 'off';
    return { bare: base as Db, tenant: (t: string) => p.createCheckoutTenantClient(base, t, null, { unbatchFindUnique }) as Db };
  }
  const { prisma } = await import('../../src/lib/db/prisma');
  const { getTenantPrismaForOrg } = await import('../../src/lib/context/tenant-context');
  return { bare: prisma as Db, tenant: (t: string) => getTenantPrismaForOrg(t) as Promise<Db> };
}

const CELLS: Record<string, () => Promise<Step[]>> = {};
for (const kind of ['proto', 'shipped'] as const) {
  CELLS[`${kind}:control:no-error`] = async () => {
    const s = await stack(kind);
    const db = await s.tenant(TENANT_A);
    return [await attempt('truck.count#1', () => db.truck.count()), await attempt('truck.count#2', () => db.truck.count()), await attempt('probe', () => probe(db))];
  };
  CELLS[`${kind}:evict:division-by-zero`] = async () => {
    const s = await stack(kind);
    const db = await s.tenant(TENANT_A);
    return [
      await attempt('truck.count#1', () => db.truck.count()),
      await attempt('SELECT 1/0 (caught)', () => db.$queryRawUnsafe('SELECT 1/0')),
      await attempt('truck.count#2 on the SAME tenant client', () => db.truck.count()),
      await attempt('carrierDriver.count (RLS only; A=3)', () => db.carrierDriver.count()),
      await attempt('probe', () => probe(db)),
    ];
  };
  CELLS[`${kind}:evict:bare-client-error`] = async () => {
    // The trigger does not have to be on the tenant client: a bare-client error evicts the same connection.
    const s = await stack(kind);
    const db = await s.tenant(TENANT_A);
    return [
      await attempt('truck.count#1', () => db.truck.count()),
      await attempt('BARE SELECT 1/0 (caught)', () => s.bare.$queryRawUnsafe('SELECT 1/0')),
      await attempt('truck.count#2 on the SAME tenant client', () => db.truck.count()),
      await attempt('probe', () => probe(db)),
    ];
  };
  CELLS[`${kind}:evict:undefined-column`] = async () => {
    const s = await stack(kind);
    const db = await s.tenant(TENANT_A);
    return [
      await attempt('truck.count#1', () => db.truck.count()),
      await attempt('missing column (caught)', () => db.$queryRawUnsafe('SELECT "noSuchColumn625" FROM "Truck" LIMIT 1')),
      await attempt('truck.count#2 on the SAME tenant client', () => db.truck.count()),
      await attempt('probe', () => probe(db)),
    ];
  };
  CELLS[`${kind}:evict:then-interactive-transaction`] = async () => {
    const s = await stack(kind);
    const db = await s.tenant(TENANT_A);
    return [
      await attempt('truck.count#1', () => db.truck.count()),
      await attempt('SELECT 1/0 (caught)', () => db.$queryRawUnsafe('SELECT 1/0')),
      await attempt('$transaction(async tx => [truck.count, carrierDriver.count, probe])', () =>
        db.$transaction(async (tx: Db) => [await tx.truck.count(), await tx.carrierDriver.count(), await probe(tx)]),
      ),
    ];
  };
  CELLS[`${kind}:evict:then-batch-transaction`] = async () => {
    const s = await stack(kind);
    const db = await s.tenant(TENANT_A);
    return [
      await attempt('truck.count#1', () => db.truck.count()),
      await attempt('SELECT 1/0 (caught)', () => db.$queryRawUnsafe('SELECT 1/0')),
      await attempt('$transaction([truck.count, carrierDriver.count])', () => db.$transaction([db.truck.count(), db.carrierDriver.count()])),
    ];
  };
  CELLS[`${kind}:evict:other-tenant-error-then-A`] = async () => {
    // Tenant B's error evicts; tenant A's next statement must run as A, never as B, never as ''.
    const s = await stack(kind);
    const a = await s.tenant(TENANT_A);
    const b = await s.tenant(TENANT_B);
    return [
      await attempt('A carrierDriver.count#1', () => a.carrierDriver.count()),
      await attempt('B SELECT 1/0 (caught)', () => b.$queryRawUnsafe('SELECT 1/0')),
      await attempt('A carrierDriver.count#2 (A=3)', () => a.carrierDriver.count()),
      await attempt('A probe', () => probe(a)),
    ];
  };
  CELLS[`${kind}:socket-dies-at-checkout`] = async () => {
    // The connection's socket is destroyed as the checkout is handed out (proto: while set_config is in flight).
    // The statement must FAIL (never run unscoped) and the process must SURVIVE; the next statement must be correct.
    const s = await stack(kind);
    const db = await s.tenant(TENANT_A);
    const steps = [await attempt('truck.count#1', () => db.truck.count())];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pg = require('pg');
    const oq = pg.Client.prototype.query;
    let armed = true;
    pg.Client.prototype.query = function (this: { connection: { stream: { destroy: (e: Error) => void } } }, ...args: unknown[]) {
      if (armed) {
        armed = false;
        setImmediate(() => this.connection.stream.destroy(new Error('q625 forced socket loss')));
      }
      return oq.apply(this, args);
    };
    steps.push(await attempt('truck.count#2 (socket destroyed at checkout)', () => db.truck.count()));
    pg.Client.prototype.query = oq;
    steps.push(await attempt('truck.count#3', () => db.truck.count()));
    steps.push(await attempt('probe', () => probe(db)));
    return steps;
  };
  CELLS[`${kind}:bare-tx-sets-own-guc`] = async () => {
    // The 64 immune rows' shape (tenantRawQuery / login): a BARE transaction that sets the GUC TRUE-scoped itself.
    const s = await stack(kind);
    return [
      await attempt('BARE $transaction(set_config TRUE; carrierDriver.count; guc)', () =>
        s.bare.$transaction(async (tx: Db) => {
          await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', $1, true)`, TENANT_A);
          return [await tx.carrierDriver.count(), await probe(tx)];
        }),
      ),
    ];
  };
  CELLS[`${kind}:foreign-session-set-between`] = async () => {
    // A session-scope GUC write the checkout did not issue (the shape of getTenantPrisma*'s own set_config) lands
    // between two of tenant A's statements. With the cache on, the tracker must forget, or A's next statement runs as B.
    const s = await stack(kind);
    const db = await s.tenant(TENANT_A);
    return [
      await attempt('A carrierDriver.count#1', () => db.carrierDriver.count()),
      await attempt('BARE set_config(B, false)', () =>
        s.bare.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', $1, false)`, TENANT_B),
      ),
      await attempt('A carrierDriver.count#2 (A=3)', () => db.carrierDriver.count()),
      await attempt('A probe', () => probe(db)),
    ];
  };
  CELLS[`${kind}:bare-after-tenant`] = async () => {
    // Not an eviction: does a BARE statement inherit the previous checkout's tenant? (quick-610/621)
    const s = await stack(kind);
    const db = await s.tenant(TENANT_A);
    return [
      await attempt('tenant truck.count', () => db.truck.count()),
      await attempt('BARE carrierDriver.count', () => s.bare.carrierDriver.count()),
      await attempt('BARE probe', () => probe(s.bare)),
    ];
  };
  CELLS[`${kind}:same-tick-findUnique-two-tenants`] = async () => {
    // Prisma's DataLoader batches same-shape findUnique across callers in one tick and dispatches from the FIRST
    // requester's nextTick. One SQL statement cannot carry two GUCs — measured, not assumed.
    const s = await stack(kind);
    // ids read with a FRESH acquisition immediately before each read, so the shipped stack's last-writer-wins GUC
    // cannot contaminate the setup (it did in the first run: A's findFirst ran under B's GUC and read B's row).
    const ida = (await (await s.tenant(TENANT_A)).carrierDriver.findFirst({ select: { id: true } }))?.id;
    const idb = (await (await s.tenant(TENANT_B)).carrierDriver.findFirst({ select: { id: true } }))?.id;
    const a = await s.tenant(TENANT_A);
    const b = await s.tenant(TENANT_B);
    const [ra, rb] = await Promise.allSettled([
      a.carrierDriver.findUnique({ where: { id: ida }, select: { id: true } }),
      b.carrierDriver.findUnique({ where: { id: idb }, select: { id: true } }),
    ]);
    const show = (r: PromiseSettledResult<unknown>, id: string) =>
      r.status === 'fulfilled' ? { ok: true, value: r.value === null ? 'NULL (row exists)' : (r.value as { id: string }).id === id ? 'own row' : 'OTHER ROW' } : { ok: false, sqlstate: sqlstateOf(r.reason) };
    return [
      { step: 'setup ids', ok: !!ida && !!idb && ida !== idb, value: { ida: !!ida, idb: !!idb, distinct: ida !== idb } },
      { step: 'A findUnique (same tick)', ...show(ra, ida) },
      { step: 'B findUnique (same tick)', ...show(rb, idb) },
    ];
  };
}

async function runCell(name: string, tripwire: string) {
  process.env.DATABASE_URL = APP_USER_URL;
  process.env.TENANT_CONTEXT_TRIPWIRE = tripwire;
  process.env.PG_CONNECT_TIMEOUT_MS = '20000';
  installObservers();
  let steps: Step[];
  try {
    steps = await CELLS[name]();
  } catch (e) {
    steps = [{ step: 'cell threw', ok: false, sqlstate: sqlstateOf(e), value: String((e as Error)?.message).slice(0, 200) }];
  }
  await settle();
  process.stdout.write('\n__CELL__' + JSON.stringify({ cell: name, tripwire, steps, obs }) + '\n');
  process.exit(0);
}

function spawnCell(name: string, tripwire: 'on' | 'off', unbatch: 'on' | 'off' = 'on') {
  const env = { ...process.env, Q625_UNBATCH: unbatch, Q625_CACHE: CACHE } as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries(env)) if (typeof v === 'string' && v.includes(PRODUCTION_REF)) delete env[k];
  let out: string;
  try {
    out = execFileSync(
    process.execPath,
    [resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs'), __filename, '--cell', name, '--tripwire', tripwire],
    { cwd: APP_ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000 },
  );
  } catch (e) {
    const x = e as { status?: number; stderr?: string };
    return { cell: name, tripwire, error: `PROCESS DIED exit=${x.status}`, stderr: String(x.stderr ?? '').split('\n').filter((l) => /Error|error|at /.test(l)).slice(0, 6) };
  }
  const m = /__CELL__(.*)/.exec(out);
  return m ? JSON.parse(m[1]) : { cell: name, tripwire, error: 'no payload', raw: out.slice(-300) };
}

async function run() {
  const u = new URL(APP_USER_URL);
  console.error(`[db-target] project : ${STAGING_REF} (staging)  host : ${u.host}  role : ${u.username}  (credential MASKED)`);
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
  const names = Object.keys(CELLS).filter((n) => !only || n.includes(only));
  const plan: [string, 'on' | 'off'][] = [];
  for (const n of names) plan.push([n, 'on']);
  for (const k of ['proto', 'shipped']) plan.push([`${k}:evict:division-by-zero`, 'off']);
  const results = [];
  const planU: [string, 'on' | 'off', 'on' | 'off'][] = plan.map(([n, t]) => [n, t, 'on']);
  planU.push(['proto:same-tick-findUnique-two-tenants', 'on', 'off']);
  for (const [name, tw, ub] of planU) {
    if (!names.includes(name)) continue;
    const r = spawnCell(name, tw, ub);
    r.unbatchFindUnique = name.startsWith('proto') ? ub : 'n/a';
    r.cache = name.startsWith('proto') ? CACHE : 'n/a';
    results.push(r);
    console.log(`${name} [tripwire ${tw}${name.startsWith('proto') ? ' · unbatchFindUnique ' + ub + ' · cache ' + CACHE : ''}]  connects=${r.obs?.connects} ends=${r.obs?.ends} tc001=${r.obs?.tc001} gucSets=${JSON.stringify(r.obs?.gucSets)}`);
    for (const s of r.steps ?? []) console.log(`    ${s.step}: ${s.ok ? 'ok ' + JSON.stringify(s.value) : 'ERROR ' + s.sqlstate + (s.value ? ' ' + JSON.stringify(s.value) : '')}`);
    if (r.error) console.log('    ' + JSON.stringify(r));
  }
  mkdirSync(EVIDENCE, { recursive: true });
  if (!only) writeFileSync(resolve(EVIDENCE, CACHE === 'on' ? '03-checkout-eviction-cache.json' : '03-checkout-eviction.json'), JSON.stringify({ generated: new Date().toISOString(), results }, null, 2) + '\n');
}

const a = process.argv.slice(2);
if (a.includes('--cell')) runCell(a[a.indexOf('--cell') + 1], a[a.indexOf('--tripwire') + 1] ?? 'on');
else if (a.includes('--run')) run();
else {
  console.error('usage: 625-checkout-eviction.ts --run [--only <substr>]');
  process.exit(1);
}
