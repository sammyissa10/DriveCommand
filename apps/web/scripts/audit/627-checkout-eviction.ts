/**
 * quick-627 — steps 1 and 2. Derived from 625-checkout-eviction.ts (observers, sqlstate walk, probe and the cell
 * shapes are 625's), re-pointed at the ADOPTION CANDIDATE (627-checkout-candidate.ts: onNoContext 'leave', cache on
 * with writes-only invalidation, unbatch on) and at the REAL on-disk modules (`real`: shipped before step 4, adopted
 * after).
 *
 *   npx tsx scripts/audit/627-checkout-eviction.ts --run --group cache|error [--stacks cand,real] [--out f.json]
 *
 * --group cache  (step 1) the cache's own behaviour: invalidation on WRITES only, a foreign session writer, RESET ALL,
 *                a TRUE-scoped transaction set, a tenant switch, socket loss DURING an assertion (which needs a cache
 *                MISS to exist at all), bare-after-tenant and bare-on-a-cold-connection under 'leave', the same-tick
 *                findUnique batch.
 * --group error  (step 2) quick-624's reproduction over every error shape quick-625 used: 22012, 42703, a bare-client
 *                error, another tenant's error, an error inside a transaction, then interactive / batch transactions,
 *                re-acquire, socket loss on a statement, and 22012 / 42703 with the tripwire OFF (where shipped read a
 *                silent 0).
 *
 * One COLD process per cell (quick-610). Staging only, app_user, reads only. Tenants A (1 truck, 3 drivers) and
 * B (1 truck, 2 drivers); carrierDriver is exempt from injection, so a wrong-tenant GUC is a wrong NUMBER.
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';
const TENANT_A = 'b5623cdd-dc19-4900-b75d-0ecfcaf191b8';
const TENANT_B = '8c6136c4-eb7b-4a89-a524-d1d0e2c8d045';
const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE = resolve(REPO_ROOT, '.planning/quick/627-adopt-checkout-guc-re-assertion-leave-mo/evidence');

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });
const raw = process.env.STAGING_DATABASE_URL_APP_USER ?? '';
if (!raw.includes(STAGING_REF) || raw.includes(PRODUCTION_REF)) {
  console.error('627-checkout-eviction: REFUSING — STAGING_DATABASE_URL_APP_USER does not name staging');
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


type Kind = 'cand' | 'real';

/** `real` imports whatever src holds; `cand` is the candidate, built the way prisma.ts builds its pool. */
async function stack(kind: Kind) {
  if (kind === 'cand') {
    const p = await import('./627-checkout-candidate');
    const { shouldArmTripwire } = await import('../../src/lib/db/tripwire-arm');
    const pool = p.createCandidatePool(
      { connectionString: APP_USER_URL, max: 1, idleTimeoutMillis: 10000, connectionTimeoutMillis: 20000 },
      { noContext: 'leave', armTripwire: shouldArmTripwire(process.env.DATABASE_URL, process.env.TENANT_CONTEXT_TRIPWIRE) },
    );
    const base = p.createCandidateBaseClient(pool);
    return { bare: base as Db, pool: pool as Db, tenant: async (t: string) => p.createCandidateTenantClient(base, t, null) as Db };
  }
  const { prisma } = await import('../../src/lib/db/prisma');
  const { getTenantPrismaForOrg } = await import('../../src/lib/context/tenant-context');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { bare: prisma as Db, pool: (globalThis as any).pool as Db, tenant: (t: string) => getTenantPrismaForOrg(t) as Promise<Db> };
}

type CellDef = { group: 'cache' | 'error'; tripwire?: 'on' | 'off'; fn: (kind: Kind) => Promise<Step[]> };
const DEFS: Record<string, CellDef> = {};
const truckA = (db: Db, label = 'truck.count (A owns 1)') => attempt(label, () => db.truck.count());

type Found = { id: string } | null;
const showFound = (r: PromiseSettledResult<unknown>, id: string) =>
  r.status === 'fulfilled'
    ? { ok: true, value: r.value === null ? 'NULL (row exists)' : (r.value as Found)!.id === id ? 'own row' : 'OTHER ROW' }
    : { ok: false, sqlstate: sqlstateOf(r.reason) };

/**
 * Destroy the socket of the pool's (single) connection on its NEXT WRITE, whatever issues it.
 *
 * 625's trigger patched `pg.Client.prototype.query`. The candidate's cache tracker binds each client's `query` at its
 * first checkout, so a later prototype patch never sees that client's statements, and the first run of this cell
 * therefore never destroyed anything (connects=1). Hooking the socket's `write` sees the candidate's own set_config,
 * the statement, and shipped's statements alike. At max:1 there is exactly one connection to arm.
 */
function destroyOnNextWrite(pool: Db) {
  const client = pool._idle?.[0]?.client ?? pool._clients?.[0];
  const stream = client?.connection?.stream;
  if (!stream) throw new Error('no pooled connection to arm');
  const write = stream.write.bind(stream);
  let armed = true;
  stream.write = (...args: unknown[]) => {
    if (armed) {
      armed = false;
      setImmediate(() => stream.destroy(new Error('q627 forced socket loss')));
    }
    return write(...args);
  };
}

// ───────────────────────────── group: error (step 2) ─────────────────────────────
DEFS['error:control:no-error'] = {
  group: 'error',
  fn: async (k) => {
    const s = await stack(k);
    const db = await s.tenant(TENANT_A);
    return [await truckA(db, 'truck.count#1'), await truckA(db, 'truck.count#2'), await attempt('probe', () => probe(db))];
  },
};
for (const [name, label, sql] of [
  ['division-by-zero', 'SELECT 1/0 (22012, caught)', 'SELECT 1/0'],
  ['undefined-column', 'missing column (42703, caught: the /home shape)', 'SELECT "noSuchColumn627" FROM "Truck" LIMIT 1'],
] as const) {
  for (const tw of ['on', 'off'] as const) {
    DEFS[`error:evict:${name}${tw === 'off' ? ':tripwire-off' : ''}`] = {
      group: 'error',
      tripwire: tw,
      fn: async (k) => {
        const s = await stack(k);
        const db = await s.tenant(TENANT_A);
        return [
          await truckA(db, 'truck.count#1'),
          await attempt(label, () => db.$queryRawUnsafe(sql)),
          await truckA(db, 'truck.count#2 on the SAME tenant client (A=1)'),
          await attempt('carrierDriver.count (RLS only; A=3)', () => db.carrierDriver.count()),
          await attempt('probe', () => probe(db)),
        ];
      },
    };
  }
}
DEFS['error:evict:bare-client-error'] = {
  group: 'error',
  fn: async (k) => {
    const s = await stack(k);
    const db = await s.tenant(TENANT_A);
    return [
      await truckA(db, 'truck.count#1'),
      await attempt('BARE SELECT 1/0 (caught)', () => s.bare.$queryRawUnsafe('SELECT 1/0')),
      await truckA(db, 'truck.count#2 on the SAME tenant client (A=1)'),
      await attempt('probe', () => probe(db)),
    ];
  },
};
DEFS['error:evict:other-tenant-error-then-A'] = {
  group: 'error',
  fn: async (k) => {
    const s = await stack(k);
    const a = await s.tenant(TENANT_A);
    const b = await s.tenant(TENANT_B);
    return [
      await attempt('A carrierDriver.count#1 (A=3)', () => a.carrierDriver.count()),
      await attempt('B SELECT 1/0 (caught)', () => b.$queryRawUnsafe('SELECT 1/0')),
      await attempt('A carrierDriver.count#2 (A=3)', () => a.carrierDriver.count()),
      await attempt('A probe', () => probe(a)),
    ];
  },
};
DEFS['error:evict:error-inside-transaction'] = {
  group: 'error',
  fn: async (k) => {
    const s = await stack(k);
    const db = await s.tenant(TENANT_A);
    return [
      await truckA(db, 'truck.count#1'),
      await attempt('$transaction(SELECT 1/0) (caught)', () => db.$transaction(async (tx: Db) => tx.$queryRawUnsafe('SELECT 1/0'))),
      await truckA(db, 'truck.count#2 on the SAME tenant client (A=1)'),
      await attempt('probe', () => probe(db)),
    ];
  },
};
DEFS['error:evict:then-interactive-transaction'] = {
  group: 'error',
  fn: async (k) => {
    const s = await stack(k);
    const db = await s.tenant(TENANT_A);
    return [
      await truckA(db, 'truck.count#1'),
      await attempt('SELECT 1/0 (caught)', () => db.$queryRawUnsafe('SELECT 1/0')),
      await attempt('$transaction(async tx => [truck.count, carrierDriver.count, probe])', () =>
        db.$transaction(async (tx: Db) => [await tx.truck.count(), await tx.carrierDriver.count(), await probe(tx)]),
      ),
    ];
  },
};
DEFS['error:evict:then-batch-transaction'] = {
  group: 'error',
  fn: async (k) => {
    const s = await stack(k);
    const db = await s.tenant(TENANT_A);
    return [
      await truckA(db, 'truck.count#1'),
      await attempt('SELECT 1/0 (caught)', () => db.$queryRawUnsafe('SELECT 1/0')),
      await attempt('$transaction([truck.count, carrierDriver.count])', () => db.$transaction([db.truck.count(), db.carrierDriver.count()])),
    ];
  },
};
DEFS['error:recover:reacquire-after-error'] = {
  group: 'error',
  fn: async (k) => {
    const s = await stack(k);
    const db = await s.tenant(TENANT_A);
    const steps = [await truckA(db, 'truck.count#1'), await attempt('SELECT 1/0 (caught)', () => db.$queryRawUnsafe('SELECT 1/0'))];
    const db2 = await s.tenant(TENANT_A);
    steps.push(await truckA(db2, 'truck.count on a RE-ACQUIRED tenant client (A=1)'));
    return steps;
  },
};
DEFS['error:socket-dies-on-statement'] = {
  group: 'error',
  fn: async (k) => {
    // Same tenant twice, so for the candidate the second checkout is a cache HIT: the socket dies under the statement.
    const s = await stack(k);
    const db = await s.tenant(TENANT_A);
    const steps = [await truckA(db, 'truck.count#1')];
    destroyOnNextWrite(s.pool);
    steps.push(await truckA(db, 'truck.count#2 (socket destroyed)'));
    steps.push(await truckA(db, 'truck.count#3 (A=1)'), await attempt('probe', () => probe(db)));
    return steps;
  },
};

// ───────────────────────────── group: cache (step 1) ─────────────────────────────
DEFS['cache:control:repeat-same-tenant'] = {
  group: 'cache',
  fn: async (k) => {
    const s = await stack(k);
    const db = await s.tenant(TENANT_A);
    return [await truckA(db, 'truck.count#1'), await truckA(db, 'truck.count#2'), await truckA(db, 'truck.count#3'), await attempt('probe', () => probe(db))];
  },
};
DEFS['cache:guc-read-does-not-forget'] = {
  group: 'cache',
  fn: async (k) => {
    // quick-626 §4: the prototype forgot on ANY statement naming the GUC. A literal READ must not force a re-assertion.
    const s = await stack(k);
    const db = await s.tenant(TENANT_A);
    return [
      await truckA(db, 'truck.count#1'),
      await attempt('literal current_setting read', () => probe(db)),
      await truckA(db, 'truck.count#2'),
      await attempt('probe', () => probe(db)),
    ];
  },
};
DEFS['cache:tenant-switch-A-B-A'] = {
  group: 'cache',
  fn: async (k) => {
    const s = await stack(k);
    const a = await s.tenant(TENANT_A);
    const b = await s.tenant(TENANT_B);
    return [
      await attempt('A carrierDriver.count (3)', () => a.carrierDriver.count()),
      await attempt('B carrierDriver.count (2)', () => b.carrierDriver.count()),
      await attempt('A carrierDriver.count (3)', () => a.carrierDriver.count()),
      await attempt('B probe', () => probe(b)),
      await attempt('A probe', () => probe(a)),
    ];
  },
};
DEFS['cache:foreign-session-set-between'] = {
  group: 'cache',
  fn: async (k) => {
    const s = await stack(k);
    const db = await s.tenant(TENANT_A);
    return [
      await attempt('A carrierDriver.count#1 (3)', () => db.carrierDriver.count()),
      await attempt('BARE set_config(B, false)', () => s.bare.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', $1, false)`, TENANT_B)),
      await attempt('A carrierDriver.count#2 (3)', () => db.carrierDriver.count()),
      await attempt('A probe', () => probe(db)),
    ];
  },
};
DEFS['cache:reset-all-between'] = {
  group: 'cache',
  fn: async (k) => {
    const s = await stack(k);
    const db = await s.tenant(TENANT_A);
    return [
      await attempt('A carrierDriver.count#1 (3)', () => db.carrierDriver.count()),
      await attempt('BARE RESET ALL', () => s.bare.$executeRawUnsafe('RESET ALL')),
      await attempt('A carrierDriver.count#2 (3)', () => db.carrierDriver.count()),
      await attempt('A probe', () => probe(db)),
    ];
  },
};
DEFS['cache:tx-local-set-between'] = {
  group: 'cache',
  fn: async (k) => {
    // A bare transaction sets B TRUE-scoped (tenantRawQuery / login shape); after COMMIT the session value is A again.
    const s = await stack(k);
    const db = await s.tenant(TENANT_A);
    return [
      await attempt('A carrierDriver.count#1 (3)', () => db.carrierDriver.count()),
      await attempt('BARE $transaction(set_config(B, true); carrierDriver.count; probe)', () =>
        s.bare.$transaction(async (tx: Db) => {
          await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', $1, true)`, TENANT_B);
          return [await tx.carrierDriver.count(), await probe(tx)];
        }),
      ),
      await attempt('A carrierDriver.count#2 (3)', () => db.carrierDriver.count()),
      await attempt('A probe', () => probe(db)),
    ];
  },
};
DEFS['cache:bare-after-tenant'] = {
  group: 'cache',
  fn: async (k) => {
    // 'leave': a BARE statement inherits the connection's tenant. The accepted give-up, measured rather than assumed.
    const s = await stack(k);
    const db = await s.tenant(TENANT_A);
    return [
      await truckA(db, 'tenant truck.count'),
      await attempt('BARE carrierDriver.count (inherits A=3 under leave)', () => s.bare.carrierDriver.count()),
      await attempt('BARE probe', () => probe(s.bare)),
    ];
  },
};
DEFS['cache:bare-first-cold'] = {
  group: 'cache',
  fn: async (k) => {
    // 'leave' on a fresh connection: nothing ever set a tenant, so the bare read sees the '' initialiser.
    const s = await stack(k);
    return [await attempt('BARE carrierDriver.count on a cold connection', () => s.bare.carrierDriver.count())];
  },
};
DEFS['cache:socket-dies-during-assertion'] = {
  group: 'cache',
  fn: async (k) => {
    // A switch to B forces a MISS, so B's set_config is in flight when the socket dies (quick-625 §3.3's crash window).
    const s = await stack(k);
    const a = await s.tenant(TENANT_A);
    const b = await s.tenant(TENANT_B);
    const steps = [await attempt('A carrierDriver.count (3)', () => a.carrierDriver.count())];
    destroyOnNextWrite(s.pool);
    steps.push(await attempt('B carrierDriver.count (socket destroyed on the next write: the candidate B assertion)', () => b.carrierDriver.count()));
    steps.push(
      await attempt('B carrierDriver.count (2)', () => b.carrierDriver.count()),
      await attempt('A carrierDriver.count (3)', () => a.carrierDriver.count()),
      await attempt('A probe', () => probe(a)),
    );
    return steps;
  },
};
DEFS['cache:same-tick-findUnique-two-tenants'] = {
  group: 'cache',
  fn: async (k) => {
    const s = await stack(k);
    const ida = ((await (await s.tenant(TENANT_A)).carrierDriver.findFirst({ select: { id: true } })) as Found)?.id;
    const idb = ((await (await s.tenant(TENANT_B)).carrierDriver.findFirst({ select: { id: true } })) as Found)?.id;
    const a = await s.tenant(TENANT_A);
    const b = await s.tenant(TENANT_B);
    const [ra, rb] = await Promise.allSettled([
      a.carrierDriver.findUnique({ where: { id: ida }, select: { id: true } }),
      b.carrierDriver.findUnique({ where: { id: idb }, select: { id: true } }),
    ]);
    return [
      { step: 'setup ids', ok: !!ida && !!idb && ida !== idb },
      { step: 'A findUnique (same tick)', ...showFound(ra, ida!) },
      { step: 'B findUnique (same tick)', ...showFound(rb, idb!) },
    ];
  },
};
DEFS['cache:same-tick-findUnique-no-rewrite-control'] = {
  group: 'cache',
  fn: async (k) => {
    // The control for the rewrite: the same two findUnique calls, each run under its own tenant in the store but on the
    // BARE client (no rewrite). They batch into one statement; one tenant must come back NULL for a row that exists.
    if (k !== 'cand') return [{ step: 'candidate-only control', ok: true, value: 'skipped' }];
    const p = await import('./627-checkout-candidate');
    const s = await stack(k);
    const ida = ((await (await s.tenant(TENANT_A)).carrierDriver.findFirst({ select: { id: true } })) as Found)?.id;
    const idb = ((await (await s.tenant(TENANT_B)).carrierDriver.findFirst({ select: { id: true } })) as Found)?.id;
    const [ra, rb] = await Promise.allSettled([
      p.candidateStore.run({ tenantId: TENANT_A }, () => s.bare.carrierDriver.findUnique({ where: { id: ida }, select: { id: true } })),
      p.candidateStore.run({ tenantId: TENANT_B }, () => s.bare.carrierDriver.findUnique({ where: { id: idb }, select: { id: true } })),
    ]);
    return [
      { step: 'setup ids', ok: !!ida && !!idb && ida !== idb },
      { step: 'A findUnique (same tick, NO rewrite)', ...showFound(ra, ida!) },
      { step: 'B findUnique (same tick, NO rewrite)', ...showFound(rb, idb!) },
    ];
  },
};

async function runCell(name: string, kind: Kind) {
  const def = DEFS[name];
  process.env.DATABASE_URL = APP_USER_URL;
  process.env.TENANT_CONTEXT_TRIPWIRE = def.tripwire ?? 'on';
  process.env.PG_CONNECT_TIMEOUT_MS = '20000';
  installObservers();
  let steps: Step[];
  try {
    steps = await def.fn(kind);
  } catch (e) {
    steps = [{ step: 'cell threw', ok: false, sqlstate: sqlstateOf(e), value: String((e as Error)?.message).slice(0, 200) }];
  }
  await settle();
  process.stdout.write('\n__CELL__' + JSON.stringify({ cell: name, stack: kind, tripwire: def.tripwire ?? 'on', steps, obs }) + '\n');
  process.exit(0);
}

function spawnCell(name: string, kind: Kind) {
  const env = { ...process.env } as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries(env)) if (typeof v === 'string' && v.includes(PRODUCTION_REF)) delete env[k];
  let out: string;
  try {
    out = execFileSync(process.execPath, [resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs'), __filename, '--cell', name, '--stack', kind], {
      cwd: APP_ROOT,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180_000,
    });
  } catch (e) {
    const x = e as { status?: number; stderr?: string };
    return {
      cell: name,
      stack: kind,
      error: `PROCESS DIED exit=${x.status}`,
      stderr: String(x.stderr ?? '').split('\n').filter((l) => /Error|error|at /.test(l)).slice(0, 6),
    };
  }
  const m = /__CELL__(.*)/.exec(out);
  return m ? JSON.parse(m[1]) : { cell: name, stack: kind, error: 'no payload', raw: out.slice(-300) };
}

async function run() {
  const a = process.argv.slice(2);
  const u = new URL(APP_USER_URL);
  console.error(`[db-target] project : ${STAGING_REF} (staging)  host : ${u.host}  role : ${u.username}  (credential MASKED)`);
  const group = a[a.indexOf('--group') + 1] as 'cache' | 'error';
  if (group !== 'cache' && group !== 'error') throw new Error('--group cache|error is required');
  const stacks = (a.includes('--stacks') ? a[a.indexOf('--stacks') + 1].split(',') : ['cand', 'real']) as Kind[];
  const outName = a.includes('--out') ? a[a.indexOf('--out') + 1] : `0${group === 'cache' ? '1' : '2'}-checkout-eviction-${group}.json`;
  const only = a.includes('--only') ? a[a.indexOf('--only') + 1] : null;
  const results = [];
  for (const name of Object.keys(DEFS).filter((n) => DEFS[n].group === group && (!only || n.includes(only)))) {
    for (const kind of stacks) {
      const r = spawnCell(name, kind);
      results.push(r);
      console.log(
        `${name} [${kind} · tripwire ${DEFS[name].tripwire ?? 'on'}]  connects=${r.obs?.connects} ends=${r.obs?.ends} tc001=${r.obs?.tc001} gucSets=${JSON.stringify(r.obs?.gucSets)}`,
      );
      for (const st of r.steps ?? []) console.log(`    ${st.step}: ${st.ok ? 'ok ' + JSON.stringify(st.value) : 'ERROR ' + st.sqlstate + (st.value ? ' ' + JSON.stringify(st.value) : '')}`);
      if (r.error) console.log('    ' + JSON.stringify(r));
    }
  }
  mkdirSync(EVIDENCE, { recursive: true });
  if (!only) writeFileSync(resolve(EVIDENCE, outName), JSON.stringify({ generated: new Date().toISOString(), group, results }, null, 2) + '\n');
}

const argv = process.argv.slice(2);
if (argv.includes('--cell')) runCell(argv[argv.indexOf('--cell') + 1], argv[argv.indexOf('--stack') + 1] as Kind);
else if (argv.includes('--run')) run();
else {
  console.error('usage: 627-checkout-eviction.ts --run --group cache|error [--stacks cand,real] [--out f.json] [--only substr]');
  process.exit(1);
}
