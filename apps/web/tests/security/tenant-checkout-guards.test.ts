/**
 * quick-627 — the two guards on checkout-time tenant-GUC re-assertion.
 *
 * `src/lib/db/prisma.ts` re-asserts `app.current_tenant_id` when a connection is checked out, for the tenant carried
 * in an AsyncLocalStorage store that `createTenantClient` (`tenant-client.ts`) populates around every operation. That
 * design rests on two things Prisma does NOT promise, and a Prisma upgrade can take either away with no type error and
 * no failing statement. These tests are how an upgrade finds out. Both need NO database: pg-pool honours
 * `options.Client`, so a fake `pg.Client` records every statement together with the GUC value in effect on its
 * connection when it ran.
 *
 * ─── GUARD 1 — THE PRIVATE FIELD ─────────────────────────────────────────────
 * The `findUnique` → `findFirst` rewrite (Prisma's DataLoader batches same-shape `findUnique` calls from DIFFERENT
 * tenants in one tick into one statement, quick-625 §3.2) must run only OUTSIDE a transaction: rewriting inside one
 * re-issues the read on the base delegate, i.e. on another connection, outside the transaction. The only signal is the
 * private `__internalParams.transaction` Prisma hands to query extensions, read by `isInsideTransaction`. If Prisma
 * renames or reshapes it, `isInsideTransaction` silently answers "no" everywhere and every in-transaction `findUnique`
 * escapes its transaction. At `max: 1` that is a wait on the connection the transaction itself holds.
 *
 * ─── GUARD 2 — THE ASYNC CONTEXT (the more dangerous one) ────────────────────
 * The pool reads the store inside `connect()`, so it sees the right tenant only while Prisma keeps executing each
 * request in the CALLER'S async context. If a future Prisma dispatched requests from a shared queue (the DataLoader
 * already does it for one operation), a checkout would read ANOTHER request's tenant. That is not an empty result: it
 * is a WRONG-TENANT read, and under `onNoContext: 'leave'` nothing downstream fails. This test drives two tenants
 * concurrently through the real `getTenantPrismaForOrg` and asserts every statement ran under the GUC of the tenant
 * whose id `withTenantRLS` injected into its own bind values. A self-test proves the detector can see the failure: the
 * same traffic through a DataLoader-shaped dispatcher must produce mismatches, or the main assertion means nothing.
 *
 * Why `getTenantPrismaForOrg` and not `createTenantClient`: `tenant-mechanism-fence.test.ts` is a closed fence on the
 * `tenant-client` module (quick-626 §4). The fake pool is installed as the `globalThis.pool` singleton `prisma.ts`
 * already honours, then the module graph is re-evaluated over it, which is also why the store lives on `globalThis`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('@/lib/auth/supabase', () => ({ getSession: vi.fn(async () => null) }));

const A = 'aaaaaaaa-0627-4000-8000-00000000000a';
const B = 'bbbbbbbb-0627-4000-8000-00000000000b';
const TENANTS = [A, B];

type Logged = { client: number; text: string; values: unknown[]; guc: string };
const log: Logged[] = [];
let nextClientId = 0;
let delaySeed = 7;
/** Deterministic, uneven latency so concurrent statements genuinely interleave on the fake wire. */
const jitter = () => {
  delaySeed = (delaySeed * 1103515245 + 12345) % 2147483648;
  return delaySeed % 4;
};

class FakeClient extends EventEmitter {
  readonly id = nextClientId++;
  _queryable = true;
  _ending = false;
  private guc = '';
  connect(cb?: (err?: Error) => void) {
    setImmediate(() => cb?.());
    return cb ? undefined : Promise.resolve();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(config: any, maybeValues?: any, maybeCb?: any) {
    let cb = maybeCb;
    let values = maybeValues;
    if (typeof maybeValues === 'function') {
      cb = maybeValues;
      values = undefined;
    }
    const text: string = typeof config === 'string' ? config : config.text;
    const bound: unknown[] = (typeof config === 'object' && config.values) || values || [];
    const literal = /set_config\('app\.current_tenant_id',\s*'([^']*)',\s*false\)/.exec(text);
    if (literal) this.guc = literal[1];
    else if (/set_config\('app\.current_tenant_id',\s*\$1,\s*false\)/.test(text)) this.guc = String(bound[0]);
    log.push({ client: this.id, text, values: bound, guc: this.guc });
    const result = { command: 'SELECT', rowCount: 0, rows: [], fields: [] };
    const done = new Promise((resolve) => setTimeout(() => resolve(result), jitter()));
    if (cb) {
      done.then((r) => cb(undefined, r));
      return undefined;
    }
    return done;
  }
  end(cb?: () => void) {
    this._ending = true;
    setImmediate(() => cb?.());
    return cb ? undefined : Promise.resolve();
  }
}

const isControl = (t: string) => /set_config\('app\.current_tenant_id'|^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(t);
const tenantsIn = (values: unknown[]) => TENANTS.filter((t) => values.includes(t));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
let prismaModule: typeof import('../../src/lib/db/prisma');
let getTenantPrismaForOrg: (t: string) => Promise<Db>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fakePool: any;
const g = globalThis as unknown as { pool?: unknown; prisma?: unknown };
const saved = { pool: g.pool, prisma: g.prisma };

beforeAll(async () => {
  const first = await import('../../src/lib/db/prisma');
  fakePool = first.createTenantCheckoutPool({ Client: FakeClient, max: 1 } as never);
  g.pool = fakePool;
  delete g.prisma;
  vi.resetModules();
  prismaModule = await import('../../src/lib/db/prisma');
  ({ getTenantPrismaForOrg } = await import('../../src/lib/context/tenant-context'));
});

afterAll(() => {
  g.pool = saved.pool;
  g.prisma = saved.prisma;
});

/** Mixed two-tenant traffic: model reads, raw reads, interactive transactions and same-tick findUnique pairs. */
async function traffic() {
  const clients: Record<string, Db> = { [A]: await getTenantPrismaForOrg(A), [B]: await getTenantPrismaForOrg(B) };
  const work: Promise<unknown>[] = [];
  for (let i = 0; i < 24; i++) {
    const t = TENANTS[i % 2];
    const db = clients[t];
    switch (i % 4) {
      case 0:
        work.push(db.truck.findMany({ select: { id: true } }));
        break;
      case 1:
        work.push(db.$queryRawUnsafe('SELECT $1::text AS tenant', t));
        break;
      case 2:
        work.push(db.$transaction(async (tx: Db) => tx.truck.findMany({ select: { id: true } })));
        break;
      default:
        // the DataLoader shape: same-shape findUnique from both tenants in ONE tick
        work.push(clients[A].truck.findUnique({ where: { id: `t-${i}` }, select: { id: true } }));
        work.push(clients[B].truck.findUnique({ where: { id: `t-${i}` }, select: { id: true } }));
    }
  }
  await Promise.all(work);
}

describe('guard 1 — the private __internalParams.transaction field', () => {
  it('Prisma still hands it to query extensions, in the shape isInsideTransaction reads', async () => {
    const { PrismaClient } = await import('../../src/generated/prisma/client');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const { Pool } = await import('pg');
    const seen: { label: string; rest: Record<string, unknown> }[] = [];
    let label = '';
    const spy = new PrismaClient({ adapter: new PrismaPg(new Pool({ Client: FakeClient, max: 1 } as never)) }).$extends({
      query: {
        async $allOperations({ args, query, ...rest }) {
          seen.push({ label, rest: rest as Record<string, unknown> });
          return query(args);
        },
      },
    }) as Db;

    label = 'outside';
    await spy.truck.findMany({});
    label = 'interactive';
    await spy.$transaction(async (tx: Db) => tx.truck.findMany({}));
    label = 'batch';
    await spy.$transaction([spy.truck.findMany({})]);

    const at = (l: string) => seen.find((s) => s.label === l)?.rest;
    for (const l of ['outside', 'interactive', 'batch']) expect(at(l), `no extension call recorded for ${l}`).toBeDefined();

    // The raw shape, asserted directly, so a rename fails HERE with a message naming the field.
    for (const l of ['outside', 'interactive', 'batch']) {
      expect(Object.keys(at(l)!), `Prisma no longer passes __internalParams (${l})`).toContain('__internalParams');
    }
    const kind = (l: string) => ((at(l)!.__internalParams as { transaction?: { kind?: string } }).transaction ?? {}).kind;
    expect((at('outside')!.__internalParams as { transaction?: unknown }).transaction).toBeUndefined();
    expect(kind('interactive')).toBe('itx');
    expect(kind('batch')).toBe('batch');

    // And the function the rewrite actually calls.
    expect(prismaModule.isInsideTransaction(at('outside'))).toBe(false);
    expect(prismaModule.isInsideTransaction(at('interactive'))).toBe(true);
    expect(prismaModule.isInsideTransaction(at('batch'))).toBe(true);
  });

  it('a tenant findUnique inside an interactive transaction stays on the transaction connection', async () => {
    const db = await getTenantPrismaForOrg(A);
    const marker = 'guard1-inside-tx';
    log.length = 0;
    await db.$transaction(async (tx: Db) => tx.truck.findUnique({ where: { id: marker }, select: { id: true } }), { maxWait: 2000, timeout: 2000 });
    const begin = log.findIndex((l) => /^\s*BEGIN/i.test(l.text));
    const commit = log.findIndex((l) => /^\s*COMMIT/i.test(l.text));
    const read = log.findIndex((l) => l.values.includes(marker));
    expect(begin, 'no BEGIN recorded').toBeGreaterThanOrEqual(0);
    expect(read, 'the findUnique was never issued').toBeGreaterThanOrEqual(0);
    expect(read > begin && read < commit, 'the findUnique ran outside its transaction').toBe(true);
    expect(log[read].client).toBe(log[begin].client);
  }, 15_000);
});

describe('guard 2 — Prisma runs operations in the caller async context', () => {
  it('every tenant statement runs under the GUC of the tenant that issued it', async () => {
    log.length = 0;
    await traffic();
    const checked = log.filter((l) => !isControl(l.text));
    const mismatches = checked.filter((l) => {
      const named = tenantsIn(l.values);
      return named.length !== 1 || l.guc !== named[0];
    });
    // anti-vacuity: enough statements, both tenants, and the findUnique pairs went out as separate statements
    expect(checked.length).toBeGreaterThanOrEqual(30);
    for (const t of TENANTS) expect(checked.filter((l) => tenantsIn(l.values)[0] === t).length).toBeGreaterThanOrEqual(12);
    expect(
      mismatches.map((m) => ({ guc: m.guc, named: tenantsIn(m.values), sql: m.text.slice(0, 80) })),
      'a statement ran under a GUC other than its own tenant',
    ).toEqual([]);
  });

  it('self-test: the same traffic through a DataLoader-shaped dispatcher IS detected', async () => {
    // Queue every checkout and drain the queue from the FIRST caller's nextTick, so later callers' connects run in
    // the first caller's async context. This is the Prisma change the test above exists to catch.
    const original = fakePool.connect;
    let queue: (() => void)[] = [];
    const enqueue = (run: () => void) => {
      queue.push(run);
      if (queue.length === 1) {
        process.nextTick(() => {
          const q = queue;
          queue = [];
          for (const r of q) r();
        });
      }
    };
    // pg-pool's own query() uses the callback form; adapter-pg's startTransaction uses the promise form.
    fakePool.connect = function (cb?: unknown) {
      if (typeof cb === 'function') {
        enqueue(() => original.call(fakePool, cb));
        return undefined;
      }
      return new Promise((resolve, reject) => enqueue(() => original.call(fakePool).then(resolve, reject)));
    };
    try {
      log.length = 0;
      await traffic();
    } finally {
      delete fakePool.connect;
    }
    const mismatches = log.filter((l) => !isControl(l.text) && tenantsIn(l.values).length === 1 && l.guc !== tenantsIn(l.values)[0]);
    expect(mismatches.length, 'the detector could not see a context loss it was built to see').toBeGreaterThan(0);
  });
});
